/*
 * grunt-concat-in-order
 * https://github.com/miensol/grunt-concat-in-order
 *
 * Copyright (c) 2013 Piotr Mionskowski
 * Licensed under the MIT license.
 */

'use strict';

var path = require('path'),
    EOL = require('os').EOL;

module.exports = function (grunt) {

    var defaultOptions = {
        getMatches: function (regex, string, index) {
            var matches = [], match;
            if(arguments.length < 3){
                index = 1;
            }
            while (match = regex.exec(string)) {
                matches.push(match[index]);
            }
            return matches;
        },
        extractRequired: function (filepath, filecontent) {
            return this.getMatches(/require\(([^\)]+)\)/g, filecontent);
        },
        extractDeclared: function (filepath, filecontent) {
            return this.getMatches(/declare\(([^\)]+)\)/g, filecontent);
        }
    }, getExistingFiles = function (files) {
        return files.src.filter(function (filepath) {
            // Warn on and remove invalid source files (if nonull was set).
            if (!grunt.file.exists(filepath)) {
                grunt.log.warn('Source file "' + filepath + '" not found.');
                return false;
            } else {
                return true;
            }
        });
    }, ensureNoCycleExists = function (depsTree) {
        var graph = {};
        depsTree.forEach(function (item) {
            graph[item.file] = item;
        });
        depsTree.forEach(function (item) {
            var visited = {};
            ensureNoCycleExistsDfs(item, visited, graph);
        });
    }, ensureNoCycleExistsDfs = function (item, visited, graph) {
        var graphKeys = Object.keys(graph),
            graphArray = graphKeys.map(function (key) {
                return graph[key];
            }),
            findItemsDeclaringIgnoreCase = function(declaration){
                return graphArray.filter(function (anyItem) {
                    return anyItem.declared.map(function(declared){
                        return declared.toLowerCase();
                    }).indexOf(declaration.toLowerCase()) !== -1;
                });
            },
            findItemsDeclaring = function (declaration) {
                return graphArray.filter(function (anyItem) {
                    return anyItem.declared.indexOf(declaration) !== -1;
                });
            },
            findItemDeclaring = function (declaration) {
                return findItemsDeclaring(declaration)[0];
            };
        visited[item.file] = item;
        item.required.forEach(function (requiredItem) {
            var message,
                declaringItem = findItemDeclaring(requiredItem);
            if (!declaringItem) {
                message = findItemsDeclaringIgnoreCase(requiredItem).join(', ');
                throw "Dependency required in " + item.file + " does not exist: " + requiredItem + ".\nMaybe " + message;
            }

            if (!visited[declaringItem.file]) {
                ensureNoCycleExistsDfs(declaringItem, visited, graph);
            } else {
                message = Object.keys(visited).join(', ');
                throw "Cycle found! Current item is " + item.file + '\nVisited nodes are ' + message;
            }
        });
        delete visited[item.file];
    };

    grunt.registerMultiTask('concat_in_order', 'Concatenates files in order', function () {

        var options = this.options(defaultOptions);

        this.files.forEach(function (fileSet) {
            grunt.log.writeln('Extracting dependencies from "' + fileSet.src + '".');
            var depsTree = getExistingFiles(fileSet).map(function (filepath) {
                    var content = grunt.file.read(filepath),
                        required = options.extractRequired(filepath, content),
                        declared = options.extractDeclared(filepath, content);
                    return {
                        content: content,
                        file: path.normalize(filepath),
                        required: required,
                        declared: declared
                    };
                }), ordered = [], current, countOfPreviouslySatisfiedDependencies,
                previouslyDeclared = [],
                previouslyDeclaredFilter = function (dep) {
                    return previouslyDeclared.filter(function (previous) {
                        return previous === dep;
                    }).length > 0;
                };

            ensureNoCycleExists(depsTree);

            while (depsTree.length) {
                current = depsTree.shift();
                countOfPreviouslySatisfiedDependencies = current.required.filter(previouslyDeclaredFilter).length;
                if (countOfPreviouslySatisfiedDependencies === current.required.length) {
                    previouslyDeclared.push.apply(previouslyDeclared, current.declared);
                    ordered.push(current);
                } else {
                    depsTree.push(current);
                }
            }

            grunt.file.write(fileSet.dest, ordered.map(function (item) {
                return item.content;
            }).join(EOL));

            grunt.log.writeln('File "' + fileSet.dest + '" created.');
        });
    });

};