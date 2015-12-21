var _ = require('lodash');
var elasticsearch = require('elasticsearch');
var csv = require("fast-csv");
var fs = require("fs");

var IGNORE_COMMITTERS = ["openmrs-bot", "root@bamboo.pih-emr.org"];
var CUTOFF_FOR_BIG_COMMITTER = 12;
var RANGES = [1, 2, 5, 10, 20, 50, 100];
var VERBOSE = true;

var esClient = new elasticsearch.Client({
    host: 'http://192.168.99.100:9200',
    log: 'info'
});

var repo = process.argv[2];
if (repo) {
    console.log("Looking at repo: " + repo);
} else {
    console.log("Looking across all repos");
}

var dataByYear = {};

var body = {
    query: {
        not: {
            terms: {username: IGNORE_COMMITTERS}
        }
    },
    aggs: {
        "by_year": {
            "terms": {
                "field": "year",
                "order": {"_term": "desc"},
                size: 0
            },
            aggs: {
                "by_user": {
                    terms: {
                        field: "username",
                        size: 0
                    }
                }
            }
        }
    }
};
if (repo) {
    body.query = {
        and: [
            {term: {repo: repo}},
            body.query
        ]

    };
}
esClient.search({
    index: "commits",
    search_type: "count",
    body: body
}, function (error, response) {
    _.each(response.aggregations.by_year.buckets, function (item) {
        var year = item.key;
        dataByYear[year] = {
            year: year,
            committers: _.pluck(item.by_user.buckets, 'key'),
            commitCounts: _.map(item.by_user.buckets, function (it) {
                return {username: it.key, count: it.doc_count}
            })
        };

        var big = _.filter(item.by_user.buckets, function (item) {
            return item.doc_count >= CUTOFF_FOR_BIG_COMMITTER;
        });
        dataByYear[year].bigCommitters = _.pluck(big, 'key');
    });

    _.each(dataByYear, function (data) {
        var year = data.year;
        var lastYear = year - 1;
        var dataLastYear = dataByYear[lastYear];

        if (dataLastYear) {
            data.kept = _.intersection(dataLastYear.bigCommitters, data.bigCommitters);
            data.lost = _.difference(dataLastYear.bigCommitters, data.bigCommitters);
            data.gained = _.difference(data.bigCommitters, dataLastYear.bigCommitters);

            if (VERBOSE) {
                console.log("\n");
                console.log("In " + year + " we had " + data.bigCommitters.length + " big committers (with at least " + CUTOFF_FOR_BIG_COMMITTER + " commits)");
                console.log("From " + lastYear + " to " + year + " we...");
                console.log("  gained " + data.gained.length + " (" + data.gained.join(", ") + ")");
                console.log("  lost " + data.lost.length + " (" + data.lost.join(", ") + ")");
                console.log("  kept " + data.kept.length + " (" + data.kept.join(", ") + ")");
            }
        }
    });

    console.log("Year\t# Committers\t# Big Committers (>=" + CUTOFF_FOR_BIG_COMMITTER + ")\t# kept\t#gained\t# lost");
    _.each(dataByYear, function (data) {
        var row = [data.year, data.committers.length, data.bigCommitters.length];
        if (data.kept) {
            row.push(data.kept.length);
            row.push(data.gained.length);
            row.push(data.lost.length);
        }
        ;
        console.log(row.join("\t"));
    });

    var heading = "\nYear";
    _.each(RANGES, function (it) {
        heading += "\t" + it + "+";
    })
    console.log(heading);
    _.each(dataByYear, function (data) {
        var row = [data.year];
        for (var i = 0; i < RANGES.length; ++i) {
            var atLeast = RANGES[i];
            var lessThan = 999999;
            if (i + 1 < RANGES.length) {
                lessThan = RANGES[i + 1];
            }
            var inThisRange = _.filter(data.commitCounts, function (it) {
                return (it.count >= atLeast && it.count < lessThan);
            }).length;
            row.push(inThisRange);
        }
        console.log(row.join("\t"));
    });

});