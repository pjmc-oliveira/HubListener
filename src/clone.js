'use strict';

const tmp = require('tmp');
const Git = require('nodegit');

module.exports = class Clone {
    static async init(url) {
        // create tmp directory
        const path = tmp.dirSync().name;
        const repo = await Git.Clone(url, path);
        return new Clone(path, repo);
    }

    constructor(path, repo) {
        if (path === undefined || repo === undefined) {
            throw Error('Cannot be called directly!');
        }
        this.path = path;
        this.repo = repo;
    }

};