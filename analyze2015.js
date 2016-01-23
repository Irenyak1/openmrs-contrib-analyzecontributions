var _ = require('lodash');
var elasticsearch = require('elasticsearch');

var IGNORE_COMMITTERS = require("./ignore-committers");

var HIGHLIGHT_REPOS = ["openmrs-core", "openmrs-module-ebolaexample", "openmrs-module-fhir"];

var esClient = new elasticsearch.Client({
    host: 'http://192.168.99.100:9200',
    log: 'info'
});

var data = {};

// ========== COMMITS ==========

// total commits
esClient.search({
    index: "commits",
    search_type: "count",
    body: {
        "query": {
            "term": {"year": "2015"}
        }
    }
}).then(function (response) {
    data.totalCommits = response.hits.total;
    console.log("\nTotal commits\t" + response.hits.total);
});

// total commits excluding IGNORED committers
var commitsByHumans = esClient.search({
    index: "commits",
    search_type: "count",
    body: {
        "query": {
            "and": [
                {"not": {"terms": {"username": IGNORE_COMMITTERS}}},
                {"term": {"year": "2015"}}
            ]
        }
    }
}).then(function (response) {
    data.totalCommitsByHumans = response.hits.total;
    console.log("\nTotal commits excluding " + IGNORE_COMMITTERS + "\t" + response.hits.total);
});

// number of repos with commits
// repos with the most commits
esClient.search({
    index: "commits",
    search_type: "count",
    body: {
        "query": {
            "term": {"year": "2015"}
        },
        "aggs": {
            "group_by_repo": {
                "terms": {
                    "field": "repo",
                    "size": 0
                }
            }
        }
    }
}, function (error, response) {
    console.log("\nRepos with commits this year\t" + response.aggregations.group_by_repo.buckets.length);
    console.log("Top 10 Repos");
    _.each(_.take(response.aggregations.group_by_repo.buckets, 10), function (it) {
        console.log(it.key + "\t" + it.doc_count);
    })
});

// commits and committers to highlighted repos
_.each(HIGHLIGHT_REPOS, function (repo) {
    esClient.search({
        index: "commits",
        search_type: "count",
        body: {
            "query": {
                "and": [
                    {"not": {"terms": {"username": IGNORE_COMMITTERS}}},
                    {"term": {"year": "2015"}},
                    {"term": {"repo": repo}}
                ]
            },
            "aggs": {
                "by_committer": {
                    "terms": {
                        "field": "username",
                        "size": 0
                    }
                }
            }
        }
    }, function (error, response) {
        console.log("\nCommits to " + repo + "\t" + response.hits.total);
        console.log("Committers to " + repo + "\t" + response.aggregations.by_committer.buckets.length);
    })
});


// ========== COMMITTERS ==========

// who committed in prior years
var priorYears = esClient.search({
    index: "commits",
    search_type: "count",
    body: {
        "query": {
            "range": {"year": {"lt": "2015"}}
        },
        "aggs": {
            "by_committer": {
                "terms": {
                    "field": "username",
                    "size": 0
                }
            }
        }
    }
}).then(function (response) {
    data.commitersInPriorYears = _.map(response.aggregations.by_committer.buckets, function (it) {
        return it.key;
    });
    console.log("(there were " + data.commitersInPriorYears.length + " committers in prior years)");
    return data.commitersInPriorYears;
});

// number of committers
priorYears.then(function () {
    esClient.search({
        index: "commits",
        search_type: "count",
        body: {
            "query": {
                "and": [
                    {"not": {"terms": {"username": IGNORE_COMMITTERS}}},
                    {"term": {"year": "2015"}}
                ]
            },
            "aggs": {
                "by_committer": {
                    "terms": {
                        "field": "username",
                        "size": 0
                    }
                }
            }
        }
    }, function (error, response) {
        console.log("\nCommitters\t" + response.aggregations.by_committer.buckets.length);
        var committersThisYear = _.map(response.aggregations.by_committer.buckets, function (it) {
            return it.key;
        });
        console.log("First commit in 2015\t" + _.difference(committersThisYear, data.commitersInPriorYears).length);
        console.log("Returning committers\t" + _.intersection(committersThisYear, data.commitersInPriorYears).length);
        console.log("Top 20 Committers");
        _.each(_.take(response.aggregations.by_committer.buckets, 20), function (it) {
            console.log(it.key + "\t" + it.doc_count);
        })
    });
});

// commits by month
esClient.search({
    index: "commits",
    search_type: "count",
    body: {
        "query": {
            "and": [
                {"term": {"year": "2015"}}
            ]
        },
        "aggs": {
            "by_month": {
                "date_histogram": {
                    "field": "date",
                    "interval": "month"
                }
            }
        }
    }
}, function (error, response) {
    console.log("\nCommits by month");
    _.each(response.aggregations.by_month.buckets, function (it) {
        console.log(it.key_as_string.substring(0, 7) + "\t" + it.doc_count);
    })
});

// commits by week
esClient.search({
    index: "commits",
    search_type: "count",
    body: {
        "query": {
            "and": [
                {"term": {"year": "2015"}}
            ]
        },
        "aggs": {
            "by_week": {
                "date_histogram": {
                    "field": "date",
                    "interval": "week"
                }
            }
        }
    }
}, function (error, response) {
    console.log("\nCommits by week");
    _.each(response.aggregations.by_week.buckets, function (it) {
        console.log(it.key_as_string.substring(0, 10) + "\t" + it.doc_count);
    })
})

commitsByHumans.then(function () {
    esClient.search({
        index: "commits",
        search_type: "count",
        body: {
            "query": {
                "and": [
                    {"not": {"terms": {"username": IGNORE_COMMITTERS}}},
                    {"term": {"year": "2015"}}
                ]
            },
            "aggs": {
                "by_committer": {
                    "terms": {
                        "field": "username",
                        "size": 0
                    }
                }
            }
        }
    }, function (error, response) {
        var i = 0;
        var soFar = 0;
        while (soFar / data.totalCommitsByHumans < 0.8) {
            i += 1;
            soFar += response.aggregations.by_committer.buckets[i - 1].doc_count;
        }
        console.log("\nTop committers with 80% of commits by humans\t" + i);
        console.log("Precisely: " + soFar + " of " + data.totalCommitsByHumans + ", which is " + (soFar / data.totalCommitsByHumans * 100) + "%");
        console.log("They are:");
        for (var j = 0; j < i; ++j) {
            var bucket = response.aggregations.by_committer.buckets[j];
            console.log(bucket.key + "\t" + bucket.doc_count);
        }
    });
});