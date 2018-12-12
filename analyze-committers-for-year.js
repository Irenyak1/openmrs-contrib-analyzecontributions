var _ = require('lodash');
var elasticsearch = require('elasticsearch');
var HUGE_SIZE = 999999;
var csv = require("fast-csv");
var fs = require("fs");
var IGNORE_COMMITTERS = require("./ignore-committers");

var CUTOFF_FOR_BIG_COMMITTER = 12;
var RANGES = [1, 2, 5, 10, 20, 50, 100];
var CUTOFF_FOR_SIGNIFICANT_CONTRIBUTION = 24;

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
    host: 'http://localhost:9200',
    log: 'info'
});

function prettyName(repoName) {
    repoName = repoName.replace("openmrs-", "");
    repoName = repoName.replace("module-", "");
    return repoName;
}

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
        bool: {
            filter: [
                {term: {year: year}},
                {term: {repo: repo}}
            ],
            must_not: [
                {terms: {username: IGNORE_COMMITTERS}},
                {prefix: {username: 'bamboo'}}
            ]
        }
    }
} else {
    query = {
        bool: {
            filter: {term: {year: year}},
            must_not: [
                {terms: {username: IGNORE_COMMITTERS}},
                {prefix: {username: 'bamboo'}}
            ]
        }
    };
}
;

esClient.search({
    index: "commits",
    body: {
        query: query,
        aggs: {
            "group_by_committer": {
                "terms": {
                    "field": "username",
                    size: HUGE_SIZE
                }
            }
        }
    }
}, function (error, response) {
    var data = _.map(response.aggregations.group_by_committer.buckets, function (item) {
        console.log(item);
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


esClient.search({
    index: "commits",
    body: {
        query: query,
        aggs: {
            "group_by_committer": {
                "terms": {
                    "field": "username",
                    size: HUGE_SIZE
                },
                aggs: {
                    group_by_repo: {
                        terms: {
                            field: "repo",
                            size: HUGE_SIZE
                        }
                    }
                }
            }
        }
    }
}, function (error, response) {
    var significant = [];
    _.each(response.aggregations.group_by_committer.buckets, function (item) {
        var totalCommits = item.doc_count;
        if (totalCommits < CUTOFF_FOR_BIG_COMMITTER) {
            return;
        }
        var username = item.key;
        var forUser = {};
        _.each(_.filter(item.group_by_repo.buckets, function (repoBucket) {
            return repoBucket.doc_count >= CUTOFF_FOR_SIGNIFICANT_CONTRIBUTION;
        }), function (repoBucket) {
            var repo = repoBucket.key;
            var repoCommits = repoBucket.doc_count;
            forUser[repo] = repoCommits;
            //console.log(username + "\t" + repo + "\t" + repoCommits);
        });
        significant.push({
            username: username,
            totalCommits: totalCommits,
            significantRepos: forUser
        });
    });
    console.log("\nSignificant contributions (>= " + CUTOFF_FOR_SIGNIFICANT_CONTRIBUTION + " by big committers\n");
    _.each(significant, function (item) {
        var str = item.totalCommits + "\t" + item.username + "\t\t";
        str += _.map(item.significantRepos, function (repoCommits, repo) {
            return prettyName(repo) + "(" + repoCommits + ")";
        }).join(", ");
        console.log(str);
    })
});