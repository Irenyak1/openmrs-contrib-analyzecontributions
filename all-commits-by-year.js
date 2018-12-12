var _ = require('lodash');
var elasticsearch = require('elasticsearch');
var HUGE_SIZE = 10000;
var csv = require("fast-csv");
var fs = require("fs");

var year = process.argv[2];

if (!(/\d{4}/.test(year))) {
    console.log("Usage: all-commits-by-year.js 2015 [repo]");
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

var query;
if (repo) {
    query = {
        bool: {
            filter: [
                {term: {year: year}},
                {term: {repo: repo}}
            ]
        }
    }
} else {
    query = {
        term: {year: year}
    };
}

esClient.search({
                    index: "commits",
                    body: {
                        query: query,
                        size: HUGE_SIZE
                    }
                }, function (error, response) {
    if (error) {
        console.log("ERROR!!!!");
        console.log(error);
    }
    if (response.hits.total >= HUGE_SIZE) {
        console.log("!!!!! TOO MANY RESULTS !!!!! NEED TO REWRITE TO USE SCROLL API !!!!!");
    }
    else {
        console.log("Got " + response.hits.total + " hits");
    }
    var data = _.map(response.hits.hits, function (item) {
        let src = item['_source'];
        return {
            repo: src.repo,
            sha: src.sha,
            date: src.date,
            username: src.key,
            name: src.raw.commit.author.name,
            email: src.raw.commit.author.email,
            message: src.raw.commit.message
        }
    });

    try {
        fs.mkdirSync("output");
    } catch (err) {
        // directory already exists; not a problem
    }
    var filename = "output/commits-" + year + "-" + (repo ? repo : "all-repos") + ".csv";
    var ws = fs.createWriteStream(filename);
    csv.write(data, {
        headers: true
    }).pipe(ws);
    console.log("Wrote: " + filename);
});