var ES = require('elasticsearch');

var elasticsearch = new ES.Client({
    host: 'http://localhost:9200',
    log: 'debug'
});

function testElasticSearchConnection() {
    return elasticsearch.ping({});
}

function setupElasticSearchMappings() {
    return elasticsearch.indices.create({
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
                                        });
}

testElasticSearchConnection().then(function () {
    console.log("Connected.");
    setupElasticSearchMappings()
}, function (error) {
    console.log("### ERROR ###");
    console.log(error);
});
