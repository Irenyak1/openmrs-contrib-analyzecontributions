var config = {};

config.elasticsearch = {
    host: process.argv[2] || "http://192.168.99.100:9200"
};

module.exports = config;