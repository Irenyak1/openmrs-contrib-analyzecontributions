var express = require('express');
var router = express.Router();

var _ = require('lodash');

var IGNORE_COMMITTERS = ["openmrs-bot", "root@bamboo.pih-emr.org"];

/* GET top committers for this month */
router.get('/top-committers-this-month', function (req, res) {
    req.elasticsearch.search({
        index: "commits",
        body: {
            query: {
                and: [
                    {range: {date: {gte: "now/M"}}},
                    {not: {terms: {username: IGNORE_COMMITTERS}}}
                ]
            },
            aggs: {
                by_user: {
                    terms: {
                        field: "username",
                        size: 20
                    }
                }
            }
        }
    }, function (error, response) {
        if (error) {
            res.status(500).send("Server Error: " + error);
        }
        else {
            res.send(_.map(response.aggregations.by_user.buckets, function (it) {
                return {
                    username: it.key,
                    numCommits: it.doc_count
                };
            }));
        }
    });
});

/* GET active repos this week */
router.get('/top-repos-this-week', function (req, res) {
    req.elasticsearch.search({
        index: "commits",
        body: {
            query: {
                and: [
                    {range: {date: {gte: "now-7d"}}},
                    {not: {terms: {username: IGNORE_COMMITTERS}}}
                ]
            },
            aggs: {
                by_repo: {
                    terms: {
                        field: "repo",
                        size: 10
                    }
                }
            }
        }
    }, function (error, response) {
        if (error) {
            res.status(500).send("Server Error: " + error);
        }
        else {
            res.send(_.map(response.aggregations.by_repo.buckets, function (it) {
                return {
                    repo: it.key,
                    numCommits: it.doc_count
                };
            }));
        }
    });
});

module.exports = router;
