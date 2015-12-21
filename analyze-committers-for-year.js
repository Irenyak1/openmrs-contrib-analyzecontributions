var _ = require('lodash');
var elasticsearch = require('elasticsearch');
var csv = require("fast-csv");
var fs = require("fs");

var IGNORE_COMMITTERS = ["openmrs-bot", "root@bamboo.pih-emr.org"];
var CUTOFF_FOR_BIG_COMMITTER = 12;
var RANGES = [1, 2, 5, 10, 20, 50, 100];

var year = process.argv[2];

if (!(/\d{4}/.test(year))) {
    console.log("Usage: analyze-committers-for-year.js 2015 [repo]");
    process.exit(1);
}

var repo = process.argv[3];
if (repo) {
    console.log("Looking at repo: " + repo);
} else {
    console.log("Looking across all repos");
}

var esClient = new elasticsearch.Client({
    host: 'http://192.168.99.100:9200',
    log: 'info'
});

function level(numCommits) {
    for (var i = RANGES.length - 1; i >= 0; --i) {
        var atLeast = RANGES[i];
        if (numCommits >= atLeast) {
            if ((i == RANGES.length - 1) || (RANGES[i + 1] - RANGES[i] > 1)) {
                return atLeast + "+";
            }
            else {
                return atLeast;
            }
        }
    }
    return "";
}

var query;
if (repo) {
    query = {
        and: [
            {not: {terms: {username: IGNORE_COMMITTERS}}},
            {term: {year: year}},
            {term: {repo: repo}}
        ]
    }
} else {
    query = {
        and: [
            {not: {terms: {username: IGNORE_COMMITTERS}}},
            {term: {year: year}}
        ]
    };
}
;

esClient.search({
    index: "commits",
    search_type: "count",
    body: {
        query: query,
        aggs: {
            "group_by_committer": {
                "terms": {
                    "field": "username",
                    size: 0
                }
            }
        }
    }
}, function (error, response) {
    var data = _.map(response.aggregations.group_by_committer.buckets, function (item) {
        return {
            username: item.key,
            commits: item.doc_count,
            level: level(item.doc_count)
        }
    });

    console.log("Big committers (>=" + CUTOFF_FOR_BIG_COMMITTER + " commits):");
    _.each(_.filter(data, function (item) {
        return item.commits >= CUTOFF_FOR_BIG_COMMITTER;
    }), function (item) {
        console.log(" " + item.level + "\t" + item.username + "\t" + item.commits);
    });

    try {
        fs.mkdirSync("output");
    } catch (err) {
        // directory already exists; not a problem
    }
    var filename = "output/committers-" + year + "-" + (repo ? repo : "all-repos") + ".csv";
    var ws = fs.createWriteStream(filename);
    csv.write(data, {
        headers: true
    }).pipe(ws);
    console.log("Wrote: " + filename);
});