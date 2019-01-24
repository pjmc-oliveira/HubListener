'use strict';

// node and npm modules
const tmp = require('tmp');
const Git = require('nodegit');


/**
 *  @class The Clone class to clone and manage the Git repository
 */
class Clone {
    /**
     *  Initialize and return an instance of the {@link Clone} class.
     *  @param {string} url - A valid URL to a Git repository.
     *
     *  @return {Promise<Clone>} A promise to a {@link Clone} instance.
     */
    static async init(url) {
        // create tmp directory
        const path = tmp.dirSync().name;
        const repo = await Git.Clone(url, path);
        return new Clone(path, repo);
    }

    /**
     *  Constructs a {@link Clone} object.
     *  <br>WARNING: Not to be instantiated directly, see [init]{@link Clone.init}
     *  @param {string} path - Path to the repository location on drive
     *  @param {Git.Clone} repo
     *      A [Git.Clone]{@link https://www.nodegit.org/api/clone/} instance
     */
    constructor(path, repo) {
        if (path === undefined || repo === undefined) {
            throw Error('Cannot be called directly!');
        }
        this.path = path;
        this.repo = repo;
    }

}

module.exports = {
    Clone: Clone
};