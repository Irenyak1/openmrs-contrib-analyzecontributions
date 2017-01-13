var GitHubApi = require("github");
var ES = require('elasticsearch');
var Q = require("q");
var _ = require('lodash');
var moment = require('moment');
var prompt = require("prompt");

var SKIP_REPOS = ['openmrs-module-radiology-legacyui'];

var github = new GitHubApi({
    version: "3.0.0",
    protocol: "https"
});

var username;
var password;

var elasticsearch = new ES.Client({
    // host: 'http://192.168.99.100:9200',
    host: 'http://localhost:9200',
    log: 'info'
});

function testElasticSearchConnection(client) {
    console.log("Checking ElasticSearch connection...");
    var deferred = Q.defer();
    client.ping({}, function (error) {
        if (error) {
            console.log("Error connecting to ElasticSearch.");
            console.log(error);
            deferred.reject(error);
        } else {
            console.log("Connected to ElasticSearch.");
            deferred.resolve();
        }
    });
    return deferred.promise;
}

var esPromise = testElasticSearchConnection(elasticsearch);

function handleAllPages(thisPage, deferred, resolveWith, doForEachPage) {
    doForEachPage(thisPage);
    if (github.hasNextPage(thisPage)) {
        //console.log("TRACE> fetching another page: " + github.hasNextPage(thisPage));
        github.authenticate({
            type: "basic",
            username: username,
            password: password
        });
        github.getNextPage(thisPage, function (err, nextPage) {
            if (err) {
                if (deferred) {
                    deferred.reject(err);
                }
                else {
                    console.log("Github Error getting next page!");
                    console.log(err);
                }
            }
            handleAllPages(nextPage, deferred, resolveWith, doForEachPage);
        });
    }
    else {
        if (deferred) {
            deferred.resolve(resolveWith);
        }
    }
}

function getAllRepos() {
    var allRepos = [];
    var deferred = Q.defer();

    github.authenticate({
        type: "basic",
        username: username,
        password: password
    });
    github.repos.getFromOrg({
        org: "openmrs",
        type: "public",
        per_page: 100
    }, function (err, firstPage) {
        if (err) {
            deferred.reject(err);
        }
        handleAllPages(firstPage, deferred, allRepos, function (page) {
            _.each(page, function (repo) {
                allRepos.push(repo);
                elasticsearch.index({
                    index: "repos",
                    type: "repos",
                    id: repo.id,
                    body: repo
                });
            });
        });
    });
    return deferred.promise;
}

function setupElasticSearchMappings() {
    var deferred = Q.defer();
    elasticsearch.indices.create({
        index: "commits",
        body: {
            mappings: {
                commits: {
                    properties: {
                        "sha": {
                            "type": "keyword",
                            "index": false
                        },
                        "username": {
                            "type": "keyword"
                        },
                        "repo": {
                            "type": "keyword"
                        }
                    }
                }
            }
        }
    }, function () {
        deferred.resolve();
    });
    return deferred.promise;
}

function getCommitsForRepo(repo) {
    if ((repo.name.indexOf("openmrs-") != 0) || (SKIP_REPOS.indexOf(repo.name) >= 0)) {
        console.log("\n\n***************\nSkipping repo: " + repo.name + "\n***************");
        return Q({skipped: repo.name});
    }
    console.log("\n\n***************\nGetting commits for " + repo.name + "\n***************");
    var deferred = Q.defer();
    github.repos.getCommits({
        user: "openmrs",
        repo: repo.name,
        per_page: 100
    }, function (err, response) {
        if (err) {
            console.log("Github error!");
            console.log(err);
        } else {
            handleAllPages(response, deferred, null, function (page) {
                _.each(page, function (item) {
                    var toStore = {
                        repo: repo.name,
                        sha: item.sha,
                        username: item.author ? item.author.login : item.commit.author.email,
                        date: item.commit.author.date,
                        year: moment(item.commit.author.date).year(),
                        message: item.commit.message,
                        raw: item
                    };
                    elasticsearch.index({
                        index: 'commits',
                        type: 'commits',
                        id: item.sha,
                        body: toStore
                    }, function (err, response) {
                        if (err) {
                            console.log("ElasticSearch error!");
                            console.log(err);
                        }
                    });
                });
                if (page && page.length) {
                    console.log("trace> " + page[0].commit.author.date);
                    console.log("trace> " + page[0].commit.message);
                }
            });
        }
    });
    return deferred.promise;
}

function getCommitsForReposOneAtATime(allRepos) {
    getCommitsForRepo(allRepos.pop()).then(function () {
        getCommitsForReposOneAtATime(allRepos);
    });
}

esPromise.then(function () {
    setupElasticSearchMappings();

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


        getAllRepos().then(function (allRepos) {
            console.log("There are " + allRepos.length + " repos...");
            return allRepos;
        }, function (err) {
            console.log("Failed to get all repos");
            console.log(err);
        }).then(getCommitsForReposOneAtATime);
    });
});