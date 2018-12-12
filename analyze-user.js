var _ = require('lodash');
var moment = require('moment');
var elasticsearch = require('elasticsearch');
var HUGE_SIZE = 999999;
var username = process.argv[2];
var year = process.argv[3];

if (!username) {
    console.log("Usage: analyze-user.js <username> [<year>]");
    process.exit(1);
}

var esClient = new elasticsearch.Client({
    host: 'http://localhost:9200',
    log: 'info'
});

function level(numCommits) {
    if (numCommits >= 50) {
        return 50;
    } else if (numCommits >= 20) {
        return 20;
    } else if (numCommits >= 10) {
        return 10;
    } else if (numCommits >= 5) {
        return 5;
    } else if (numCommits >= 2) {
        return 2;
    } else {
        return 1;
    }
    if (numCommits == 1) {
        return "1";
    } else if (numCommits < 10) {
        return "2+";
    } else if (numCommits < 50) {
        return "10+";
    } else {
        return "50+";
    }
}

esClient.search({
    index: "commits",
    body: {
        query: {
            term: {username: username}
        },
        aggs: {
            "group_by_year": {
                "terms": {
                    "field": "year",
                    "order": {"_term": "desc"},
                    "size": HUGE_SIZE
                }
            }
        }
    }
}, function (error, response) {
    console.log("Total Commits");
    console.log("=============");
    var data = _.map(response.aggregations.group_by_year.buckets, function (item) {
        console.log(item.key + ", " + item.doc_count);
    });
});

esClient.search({
    index: "commits",
    body: {
        query: {
            term: {username: username}
        },
        aggs: {
            "group_by_repo": {
                "terms": {
                    "field": "repo",
                    "size": HUGE_SIZE
                }
            }
        }
    }
}, function (error, response) {
    console.log("\nCommits By Repo (all-time)");
    console.log("==========================");
    var data = _.map(response.aggregations.group_by_repo.buckets, function (item) {
        console.log(item.key + ", " + item.doc_count);
    });
});

var checkYear = year ? year : moment().year();
esClient.search({
    index: "commits",
    body: {
        query: {
            bool: {
                filter: [
                    {term: {username: username}},
                    {term: {year: checkYear }}
                ]
            }
        },
        aggs: {
            "group_by_repo": {
                "terms": {
                    "field": "repo",
                    "size": HUGE_SIZE
                }
            }
        }
    }
}, function (error, response) {
    console.log("\nCommits By Repo (" + checkYear + ")");
    console.log("===========================");
    var data = _.map(response.aggregations.group_by_repo.buckets, function (item) {
        console.log(item.key + ", " + item.doc_count);
    });
});