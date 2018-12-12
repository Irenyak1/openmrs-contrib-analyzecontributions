var _ = require('lodash');
var elasticsearch = require('elasticsearch');
var HUGE_SIZE = 999999;
var SHOW_BY_WEEK_AND_MONTH = false;

var IGNORE_COMMITTERS = require("./ignore-committers");

var HIGHLIGHT_REPOS = [
    "openmrs-core",
    "openmrs-module-coreapps",
    "openmrs-module-sync2",
    "openmrs-contrib-android-client",
    "openmrs-owa-cohortbuilder",
    "openmrs-contrib-addonindex"
    //["openmrs-book-developer-manual", "openmrs-book-guide"]
];

var esClient = new elasticsearch.Client({
                                            host: 'http://localhost:9200',
                                            // host: 'http://192.168.99.100:9200',
                                            log: 'info'
                                        });

var data = {};

function handleError(error, response) {
    if (error) {
        console.log("##### ERROR #####");
        console.log(error);
        console.log("##### /ERROR #####");
    }
}

// ========== COMMITS ==========

// total commits
esClient.search({
                    index: "commits",
                    body: {
                        "query": {
                            "term": {"year": "2017"}
                        }
                    }
                }).then(function (response) {
    data.totalCommits = response.hits.total;
    console.log("\nTotal commits\t" + response.hits.total);
}, handleError);

// total commits excluding IGNORED committers
var commitsByHumans = esClient.search({
                                          index: "commits",
                                          body: {
                                              "query": {
                                                  "bool": {
                                                      "filter": {"term": {"year": "2017"}},
                                                      "must_not": {"terms": {"username": IGNORE_COMMITTERS}}
                                                  }
                                              }
                                          }
                                      }).then(function (response) {
    data.totalCommitsByHumans = response.hits.total;
    console.log("\nTotal commits excluding " + IGNORE_COMMITTERS + "\t" + response.hits.total);
}, handleError);

// number of repos with commits
// repos with the most commits
esClient.search({
                    index: "commits",
                    body: {
                        "query": {
                            "term": {"year": "2017"}
                        },
                        "aggs": {
                            "group_by_repo": {
                                "terms": {
                                    "field": "repo",
                                    "size": HUGE_SIZE
                                }
                            }
                        }
                    }
                }, function (error, response) {
    handleError(error, response);
    console.log("\nRepos with commits this year\t" + response.aggregations.group_by_repo.buckets.length);
    console.log("Top 10 Repos");
    _.each(_.take(response.aggregations.group_by_repo.buckets, 10), function (it) {
        console.log(it.key + "\t" + it.doc_count);
    });
    var byType = _.groupBy(response.aggregations.group_by_repo.buckets, function (it) {
        if (it.key.startsWith("openmrs-module-")) {
            return "module";
        }
        else if (it.key.startsWith("openmrs-owa-")) {
            return "owa";
        }
        else if (it.key.startsWith("openmrs-web-")) {
            return "web";
        }
        else if (it.key.startsWith("openmrs-core")) {
            return "core";
        }
        else if (it.key.startsWith("openmrs-contrib-")) {
            return "contrib";
        }
        else if (it.key.startsWith("openmrs-test-")) {
            return "test";
        }
        else if (it.key.startsWith("openmrs-distro-")) {
            return "distro";
        }
        else if (it.key.startsWith("openmrs-book-")) {
            return "book";
        }
        else {
            return it.key;
        }
    });
    console.log("\nRepos broken down by type:");
    console.log(_.map(byType, function (val, key) {
        return key + ": " + val.length
    }).join("\n"));
});

// commits and committers to highlighted repos
_.each(HIGHLIGHT_REPOS, function (repo) {
    var repoClause = "";
    if (typeof repo === "string") {
        repoClause = {"term": {"repo": repo}};
    } else {
        repoClause = {"terms": {"repo": repo}};
    }
    esClient.search({
                        index: "commits",
                        body: {
                            "query": {
                                "bool": {
                                    "filter": [
                                        {"term": {"year": "2017"}},
                                        repoClause
                                    ],
                                    "must_not": {
                                        "terms": {"username": IGNORE_COMMITTERS}
                                    }
                                }
                            },
                            "aggs": {
                                "by_committer": {
                                    "terms": {
                                        "field": "username",
                                        "size": HUGE_SIZE
                                    }
                                }
                            }
                        }
                    }, function (error, response) {
        handleError(error, response);
        console.log("\nCommits to " + repo + "\t" + response.hits.total);
        console.log("Committers to " + repo + "\t" + response.aggregations.by_committer.buckets.length);
    })
});


// ========== COMMITTERS ==========

// who committed in prior years
var priorYears = esClient.search({
                                     index: "commits",
                                     body: {
                                         "query": {
                                             "range": {"year": {"lt": "2017"}}
                                         },
                                         "aggs": {
                                             "by_committer": {
                                                 "terms": {
                                                     "field": "username",
                                                     "size": HUGE_SIZE
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
                        body: {
                            "query": {
                                "bool": {
                                    "filter": {
                                        "term": {"year": "2017"}
                                    },
                                    "must_not": {
                                        "terms": {"username": IGNORE_COMMITTERS}
                                    }
                                }
                            },
                            "aggs": {
                                "by_committer": {
                                    "terms": {
                                        "field": "username",
                                        "size": HUGE_SIZE
                                    }
                                }
                            }
                        }
                    }, function (error, response) {
        handleError(error, response);
        console.log("\nCommitters\t" + response.aggregations.by_committer.buckets.length);
        var committersThisYear = _.map(response.aggregations.by_committer.buckets, function (it) {
            return it.key;
        });
        console.log("    First commit in 2017\t" + _.difference(committersThisYear, data.commitersInPriorYears).length);
        console.log("    Returning committers\t" + _.intersection(committersThisYear, data.commitersInPriorYears).length);
        console.log("Top 20 Committers");
        _.each(_.take(response.aggregations.by_committer.buckets, 20), function (it) {
            console.log(it.key + "\t" + it.doc_count);
        })
    });
});

if (SHOW_BY_WEEK_AND_MONTH) {
    // commits by month
    esClient.search({
                        index: "commits",
                        body: {
                            "query": {
                                "term": {"year": "2017"}
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
        handleError(error, response);
        console.log("\nCommits by month");
        _.each(response.aggregations.by_month.buckets, function (it) {
            console.log(it.key_as_string.substring(0, 7) + "\t" + it.doc_count);
        })
    });

    // commits by week
    esClient.search({
                        index: "commits",
                        body: {
                            "query": {
                                "term": {"year": "2017"}
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
        handleError(error, response);
        console.log("\nCommits by week");
        _.each(response.aggregations.by_week.buckets, function (it) {
            console.log(it.key_as_string.substring(0, 10) + "\t" + it.doc_count);
        })
    })
}

commitsByHumans.then(function () {
    esClient.search({
                        index: "commits",
                        body: {
                            "query": {
                                "bool": {
                                    "filter": {
                                        "term": {"year": "2017"}
                                    },
                                    "must_not": {
                                        "terms": {"username": IGNORE_COMMITTERS}
                                    }
                                }
                            },
                            "aggs": {
                                "by_committer": {
                                    "terms": {
                                        "field": "username",
                                        "size": HUGE_SIZE
                                    }
                                }
                            }
                        }
                    }, function (error, response) {
        handleError(error, response);
        var i = 0;
        var soFar = 0;
        while (soFar / data.totalCommitsByHumans < 0.5) {
            i += 1;
            soFar += response.aggregations.by_committer.buckets[i - 1].doc_count;
        }
        console.log("\nTop committers with 50% of commits by humans\t" + i);
        console.log("Precisely: " + soFar + " of " + data.totalCommitsByHumans + ", which is " + (soFar / data.totalCommitsByHumans * 100) + "%");
        console.log("They are:");
        for (var j = 0; j < i; ++j) {
            var bucket = response.aggregations.by_committer.buckets[j];
            console.log(bucket.key + "\t" + bucket.doc_count);
        }
    });
});
