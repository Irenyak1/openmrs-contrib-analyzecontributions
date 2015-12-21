Analyze Contributions
=====================

Analyzes commits to the OpenMRS repositories, e.g for use in an annual report


Requirements
======
docker
nodejs
npm


How To
======

1. Run the elasticsearch docker container:

    // this container will not persist data across restarts; see the docs on dockerhub if you want this
    // OSX requires "-Des.network.bindHost=0.0.0.0" (not sure if other OSs do)
    docker run -d -p 9200:9200 -p 9300:9300 elasticsearch -Des.network.bindHost=0.0.0.0

2. Download dependencies from npm

    npm install

3. Fetch the data from github and load it into elasticsearch (use your GitHub username and password to
avoid being rate-limited by the GitHub REST API)

    node fetch-from-github.js

4. To see one committer's work over time

    node analyze-user.js username

5. To analyze who committed how much, in a given year

    node analyze-committers-for-year.js year [repo]

6. The real analysis we want

    node analyze-committers.js [repo]
