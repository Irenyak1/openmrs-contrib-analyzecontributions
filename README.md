Analyze Contributions
=====================

Analyzes commits to the OpenMRS repositories, e.g for use in an annual report


Requirements
======

* docker
* nodejs
* npm


How To
======

1. Run the elasticsearch docker container:

```
// maybe you've done this before...
docker start es-ac

// make sure you have the latest
docker pull elasticsearch:latest

// this container will not persist data across restarts; see the docs on dockerhub if you want this
// (this doesn't work against newer versions of elasticsearch; I haven't looked into why) 
docker run -d --name es-ac -p 9200:9200 -p 9300:9300 elasticsearch:1
 
mkdir esdata
docker run --name es-ac -v "$PWD/esdata":/usr/share/elasticsearch/data -d -p 9200:9200 -p 9300:9300 -e ES_JAVA_OPTS="-Xms1g -Xmx1g" elasticsearch:latest
```

2. Download dependencies from npm

```
npm install
```

3. Fetch the data from github and load it into elasticsearch (use your GitHub username and password to
avoid being rate-limited by the GitHub REST API)

```
node fetch-from-github.js
```

If you want more details about committers

```
node fetch-committers-from-github.js
node search-committers.js bahmni    // full-text search for "bahmni" on anyone who committed to OpenMRS
```

4. To see one committer's work over time

```
node analyze-user.js username
```

5. To analyze who committed how much, in a given year

```
node analyze-committers-for-year.js year [repo]
```

6. The real analysis we want

```
node analyze-committers.js [repo]
```

Analytics with Kibana
=====================

Kibana makes is trivial to do ad-hoc analysis on the commit data.

```
docker run --name k-ac --link es-ac:es-ac -e ELASTICSEARCH_URL=http://es-ac:9200 -p 5601:5601 -d kibana:latest
// it should be running on http://localhost:5601
// in the UI you have to do Settings, then set index name to "commits", choose the "date" field, and click Create
// then click Discover and change the time frame from the top right
```

Dashboard webapp
================

There's a toy webapp for viewing this data as a dashboard. (I wanted to see what writing a node.js webapp
using Express was like.)

```
cd webapp
// only need to do this once
npm install
// if elasticsearch is running on http://192.168.99.100:9200 for you like it is for me:
npm start
// otherwise specify the elasticsearch host, like
npm start http://localhost:9200 
// the webapp will start on http://localhost:3000/
```
