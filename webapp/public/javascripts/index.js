angular.module("openmrs-community", ["ngResource"])
    .factory("Stats", ["$resource", function ($resource) {
        var topCommitters = $resource("stats/top-committers-this-month");
        var topRepos = $resource("stats/top-repos-this-week");
        return {
            topCommitters: function () {
                return topCommitters.query();
            },
            topRepos: function () {
                return topRepos.query();
            }
        };
    }])
    .controller("DashboardController", ["$scope", "Stats", function ($scope, Stats) {
        $scope.topCommitters = Stats.topCommitters();
        $scope.topRepos = Stats.topRepos();
    }]);