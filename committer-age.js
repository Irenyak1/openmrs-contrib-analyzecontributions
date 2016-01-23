var _ = require('lodash');
var moment = require('moment');
var elasticsearch = require('elasticsearch');
var csv = require("fast-csv");
var fs = require("fs");
var Promise = require("bluebird");
var IGNORE_COMMITTERS = require("./ignore-committers");

var esClient = new elasticsearch.Client({
    host: 'http://192.168.99.100:9200',
    log: 'info'
});

var periods = buildPeriods(moment("2006-01-01"));
function clonePlusPeriod(date) {
    //return date.clone().add(6, "months");
    return date.clone().add(1, "year");
}
function buildPeriods(earliest) {
    var ret = [];
    var now = moment();
    var start = earliest.clone();
    var end = clonePlusPeriod(start);
    while (end.isBefore(now)) {
        ret.push({
            start: start.clone(),
            end: end.clone()
        });
        start = clonePlusPeriod(start);
        end = clonePlusPeriod(start);
    }
    return ret;
}

// for each committer, we want to know how many commits they had in every 6-month period
var queryPromises = [];
function queryPeriod(period) {
    var promise = esClient.search({
        index: "commits",
        search_type: "count",
        body: {
            query: {
                and: [
                    {not: {terms: {username: IGNORE_COMMITTERS}}},
                    {not: {prefix: {username: 'bamboo'}}},
                    {
                        range: {
                            date: {
                                gte: period.start.toISOString(),
                                lt: period.end.toISOString()
                            }
                        }
                    }
                ]
            },
            aggs: {
                "group_by_committer": {
                    terms: {
                        field: "username",
                        size: 0
                    }
                }
            }
        }
    });
    queryPromises.push(promise);
    promise.then(function (response) {
        period.data = _.map(response.aggregations.group_by_committer.buckets, function (item) {
            return {
                username: item.key,
                commits: item.doc_count
            }
        });
    });
}

_.each(periods, queryPeriod);
Promise.all(queryPromises).then(function () {
    var activeNow = _.map(periods[periods.length - 1].data, "username");
    var startedInPastPeriods = [];

    function analyzePeriod(period, committersInPastPeriods) {
        period.firstTimeCommitters = [];
        _.each(period.data, function (it) {
            if (_.indexOf(committersInPastPeriods, it.username) < 0) {
                period.firstTimeCommitters.push(it.username);
            }
        });
        period.stillActive = _.intersection(period.firstTimeCommitters, activeNow);
    }

    _.each(periods, function (period) {
        analyzePeriod(period, startedInPastPeriods);
        startedInPastPeriods = _.union(startedInPastPeriods, period.firstTimeCommitters);
        console.log("[" + period.start.format("YYYY-MM-DD") + ", " + period.end.format("YYYY-MM-DD") + "): "
            + period.data.length + " committers, "
            + period.firstTimeCommitters.length + " first-time committers, "
            + period.stillActive.length + " still active");
        console.log("First Time: " + period.firstTimeCommitters.join(", ") + "\n");
        console.log("Still Active: " + period.stillActive.join(", ") + "\n");
        console.log();
    });

    var data = _.map(periods, function (period) {
        return {
            start: period.start.format("YYYY-MM-DD"),
            end: period.end.clone().subtract(1, "day").format("YYYY-MM-DD"),
            attracted: period.firstTimeCommitters.length,
            retained: period.stillActive.length,
            "still_active": period.stillActive.join(" ")
        };
    });

    var filename = "output/committer-ages.csv";
    var ws = fs.createWriteStream(filename);
    csv.write(data, {
        headers: true
    }).pipe(ws);
    console.log("Wrote: " + filename);
});