var GitHubApi = require("github");
var ES = require('elasticsearch');
var Q = require("q");
var _ = require('lodash');
var moment = require('moment');
var prompt = require("prompt");
var IGNORE_COMMITTERS = require("./ignore-committers");

var github = new GitHubApi({
    version: "3.0.0",
    protocol: "https"
});

var username;
var password;

var elasticsearch = new ES.Client({
    host: 'http://192.168.99.100:9200',
    log: 'info'
});

function printError(err) {
    console.log("Error! " + err);
}

function setupElasticSearchMappings() {
    var deferred = Q.defer();
    elasticsearch.indices.create({
        index: "committers",
        body: {
            mappings: {
                committers: {
                    properties: {
                        "login": {
                            "type": "string",
                            "index": "not_analyzed"
                        }
                        // should also do orgs/login
                    }
                }
            }
        }
    }, function () {
        deferred.resolve();
    });
    return deferred.promise;
}

var allLogins = [];
function getAllLogins() {
    var deferred = Q.defer();
    elasticsearch.search({
        index: "commits",
        search_type: "count",
        body: {
            query: {
                and: [
                    {not: {terms: {username: IGNORE_COMMITTERS}}},
                    {not: {prefix: {username: 'bamboo'}}}
                ]
            },
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
        _.each(response.aggregations.group_by_committer.buckets, function (item) {
            allLogins.push(item.key);
        });
        console.log("There are " + allLogins.length + " github logins to look up: " + allLogins.join(", "));
        deferred.resolve();
    });
    return deferred.promise;
}

function fetchUserDetails() {
    var i = 0;
    _.each(allLogins, function (lookup) {
        i += 1;
        // only do one per second to avoid appearing like a spammer
        setTimeout(function () {
            console.log("Looking up " + lookup);
            if (username && password) {
                github.authenticate({
                    type: "basic",
                    username: username,
                    password: password
                });
            }
            github.user.getFrom({
                user: lookup
            }, function (err, response) {
                if (err) {
                    console.log("Problem fetching github user: " + lookup);
                    console.log(err);
                    return;
                }
                if (response.login != lookup) {
                    console.log("DEV ERROR");
                    console.log(response);
                }
                var userData = response;
                if (username && password) {
                    github.authenticate({
                        type: "basic",
                        username: username,
                        password: password
                    });
                }
                github.orgs.getFromUser({
                    user: lookup
                }, function (err, response) {
                    if (err) {
                        console.log("Problem fetching orgs for github user: " + lookup);
                        console.log(err);
                    }
                    userData.orgs = response;
                    console.log("Saving " + userData.login + " belonging to " + _.map(userData.orgs, "login").join(", "));
                    elasticsearch.index({
                        index: "committers",
                        type: "github",
                        id: lookup,
                        body: userData
                    });
                });
            });
        }, i * 1000);
    });
}

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

    setupElasticSearchMappings().
    then(getAllLogins).
    then(fetchUserDetails);
});