var ES = require('elasticsearch');
var _ = require('lodash');
var csv = require("fast-csv");
var fs = require("fs");
var Promise = require("bluebird");

var searchFor = process.argv[2];

if (!process.argv[2]) {
    console.log("Usage: search-committers.js searchterm [anothersearchterm...]");
    process.exit(1);
}

var esClient = new ES.Client({
    host: 'http://192.168.99.100:9200',
    log: 'info'
});

esClient.search({
    index: "committers",
    body: {
        // empty search gets all documents
        from: 0,
        size: 10000
    }
}, function (error, response) {
    var allCommitters = _.map(response.hits.hits, "_source");
    console.log(allCommitters.length + " total committers");
    var matches = {};

    function searchFor(term) {
        return new Promise(function (resolve, reject) {
            esClient.search({
                index: "committers",
                body: {
                    query: {
                        match: {
                            "_all": term
                        }
                    },
                    from: 0,
                    size: 10000
                }
            }, function (error, response) {
                console.log(term + " -> " + response.hits.total + " hits");
                matches[term] = _.map(response.hits.hits, "_id");
                resolve(matches[term]);
            });
        });
    }

    var promises = [];
    for (var i = 2; i < process.argv.length; ++i) {
        promises.push(searchFor(process.argv[i]));
    }
    ;
    Promise.all(promises).then(function () {
        var data = [];
        _.each(allCommitters, function (committer) {
            var row = {
                login: committer.login,
                name: committer.name,
                email: committer.email,
                company: committer.company,
                location: committer.location,
                orgs: _.map(committer.orgs, "login")
            };
            _.each(matches, function (val, key) {
                row[key] = _.includes(val, committer.login);
            });
            data.push(row);
        });

        try {
            fs.mkdirSync("output");
        } catch (err) {
            // directory already exists; not a problem
        }
        var filename = "output/committers-search.csv";
        var ws = fs.createWriteStream(filename);
        csv.write(data, {
            headers: true
        }).pipe(ws);
        console.log("Wrote: " + filename);
    });
});