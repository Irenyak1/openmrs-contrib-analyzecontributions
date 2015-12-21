/*
 * My apologies to anyone reading for the ugliness of this code. Really I should figure out how to
 * do various things inside promises, and use Q to combine promises from the different libraries.
 */

var _ = require('lodash');
var moment = require('moment');
var request = require('request');
var elasticsearch = require('elasticsearch');
var csv = require("fast-csv");
var fs = require("fs");
var prompt = require("prompt");

var PAGE_SIZE = 100;

var esClient = new elasticsearch.Client({
    host: 'http://192.168.99.100:9200',
    log: 'info'
});

function fetchRepoByPage(repo, pageNum) {
    console.log("Querying for page number " + pageNum + " from " + repo.repo);
    var params = {
        page: pageNum,
        per_page: PAGE_SIZE
    };
    if (repo.since) {
        params.since = repo.since.toISOString();
    }
    var queryString = "";
    _.each(params, function (val, key) {
        queryString += key + "=" + val + "&";
    });
    var url = "https://api.github.com/repos/openmrs/" + repo.repo + "/commits?" + queryString;
    //console.log(url);

    var auth = username ? {user: username, password: password} : null;
    request({
        url: url,
        auth: auth,
        headers: {
            'User-Agent': 'request',
            'Accept': 'application/vnd.github.v3+json'
        }
    }, function (error, response, body) {
        if (error) {
            console.log("!!! Error");
            console.log(error);
            process.exit(1);
        }

        var data = JSON.parse(body);

        if (data.length) {
            console.log("trace> " + data[0].commit.author.date);
            console.log("trace> " + data[0].commit.message);
        }

        _.each(data, function (item) {
            var toStore = {
                repo: repo.repo,
                sha: item.sha,
                username: item.author ? item.author.login : item.commit.author.email,
                date: item.commit.author.date,
                year: moment(item.commit.author.date).year(),
                message: item.commit.message
            }
            esClient.index({
                index: 'commits',
                type: repo.repo,
                id: item.sha,
                body: toStore
            }, function (error, response) {
                if (error) {
                    console.log("!!! Error");
                    console.log(error);
                }
                //console.log(response);
            });
        });

        if (response.headers.link && response.headers.link.indexOf('rel="next"') > 0) {
            fetchRepoByPage(repo, pageNum + 1);
        }
        else {
            console.log("Fetched last page: " + pageNum);
            fetchNextRepo();
        }
    });
}

function fetchNextRepo() {
    console.log("fetchNextRepo()");
    if (repos.length) {
        var repo = repos.pop();
        console.log("Handling " + repo.repo + " (" + repos.length + " left)");
        fetchRepoByPage(repo, 1);
    }
}

// first we set up our ElasticSearch mappings (so that sha, username, and repo are exact-value)
function setupElasticSearchMappings(repos, callback) {
    var body = {
        mappings: {}
    };
    _.each(repos, function (repo) {
        body.mappings[repo.repo] = {
            properties: {
                "sha": {
                    "type": "string",
                    "index": "not_analyzed"
                },
                "username": {
                    "type": "string",
                    "index": "not_analyzed"
                },
                "repo": {
                    "type": "string",
                    "index": "not_analyzed"
                }
            }
        };
    });

    esClient.indices.create({
        index: "commits",
        body: body
    }, callback);
}

var repos = []; // will be read from CSV

function doWork() {
    var reposCsv = fs.readFileSync("repos.csv", "utf8");
    csv.fromString(reposCsv, {headers: true})
        .on("data", function (data) {
            if (data.since) {
                data.since = moment(data.since);
            }
            if (data.until) {
                data.until = moment(data.until);
            }
            repos.push(data);
        })
        .on("end", function () {
            setupElasticSearchMappings(repos, fetchNextRepo);
        });
}

var username;
var password;
console.log("The github API rate-limits anonymous usage. Optionally enter your github username and password here");
console.log("to avoid this.");
prompt.start();
prompt.get({
    properties: {
        username: {
            description: "GitHub username"
        },
        password: {
            description: "GitHub password",
            hidden: true
        }
    }
}, function (err, result) {
    username = result.username;
    password = result.password;
    doWork();
});
