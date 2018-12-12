"use strict";

var _ = require('lodash');
var elasticsearch = require('elasticsearch');

var IGNORE_COMMITTERS = require("./ignore-committers");

var esClient = new elasticsearch.Client({
    host: 'http://localhost:9200',
    log: 'info'
});

var YEAR = 2018;

var quarters = [];
quarters.push(YEAR + "-01-01");
quarters.push(YEAR + "-04-01");
quarters.push(YEAR + "-07-01");
quarters.push(YEAR + "-10-01");
quarters.push((YEAR + 1) + "-01-01");

var data = {};

for (let i = 0; i < 4; ++i) {
    esClient.search({
                        index: "commits",
                        body: {
                            "query": {
                                "range": {"date": {"gte": quarters[i], "lt": quarters[i + 1]}}
                            }
                        }
                    }).then(function (response) {
        console.log("\n" + YEAR + " Q" + (i + 1) + " commits\t" + response.hits.total);
    }, function (err) {
        console.log(err);
    });
}

for (let i = 0; i < 4; ++i) {
    esClient.search({
                        index: "commits",
                        body: {
                            "query": {
                                "bool": {
                                    "must_not": {"terms": {"username": IGNORE_COMMITTERS}},
                                    "filter": {"range": {"date": {"gte": quarters[i], "lt": quarters[i + 1]}}}
                                }
                            },
                            "aggs": {
                                "by_committer": {
                                    "terms": {
                                        "field": "username",
                                        "size": 999999
                                    }
                                }
                            }
                        }
                    }).then(function (response) {
        console.log("\n" + YEAR + " Q" + (i + 1) + " human commits\t" + response.hits.total);
        console.log("Human committers in " + YEAR + " Q" + (i + 1) + "\t" + response.aggregations.by_committer.buckets.length);

        // pony count = min # committers to get to 50% of commits
        var halfCommits = response.hits.total / 2;
        var sumSoFar = 0;
        for (var pony = 0; sumSoFar < halfCommits; ++pony) {
            sumSoFar += response.aggregations.by_committer.buckets[pony].doc_count;
            console.log((pony + 1) + " " + response.aggregations.by_committer.buckets[pony].key + " has " + response.aggregations.by_committer.buckets[pony].doc_count + " taking us to " + sumSoFar + " of " + halfCommits);
            //console.log(pony + " => " + sumSoFar + " / "+ halfCommits);
        }
        console.log(YEAR + " Q" + (i + 1) + " pony factor: " + pony);
        //console.log(_.map(response.aggregations.by_committer.buckets, 'key'));
    }, function (err) {
        console.log(err);
    });
}