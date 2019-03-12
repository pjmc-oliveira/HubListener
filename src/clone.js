'use strict';

// node and npm modules
const Git = require('nodegit');
const fs = require('fs-extra');
const utils = require('./utils.js');
const path = require('path');

const mkLogger = require('./log.js');
const logger = mkLogger({label: __filename});

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
    static async init(url, {
            clonePath = ''
        } = {}) {
        logger.debug(`Initializing repository Clone from: '${url}'`);

        // if clone path is not set, create a new path from URL
        if (!clonePath) {
            logger.debug('clonePath not passed, creating from URL')
            const { owner, name } = utils.parseURL(url);
            clonePath = path.join( __dirname, 'repos', owner, name);
        }

        // check if repository was already cloned,
        // if so pull changes
        if (fs.existsSync(clonePath)) {
            logger.debug(`Clone directory found at: '${clonePath}'`);
            // See: https://github.com/nodegit/nodegit/blob/master/examples/pull.js
            let repo;
            logger.debug('Pulling latest changes...');
            await Git.Repository.open(clonePath)
            .then(r => {
                repo = r;
                repo.fetchAll({
                    callbacks: {
                        credentials: (url, user) => Git.Cred.sshKeyFromAgent(user),
                        certificateCheck: () => 0
                    }
                })
            })
            .then(() => repo.mergeBranches('master', 'origin/master'))
            logger.debug('Changes successfuly pulled!');
            return new Clone(clonePath, repo);
        } else {
            // if repository not found, create directory and clone repository
            logger.debug(`Clone directory not found, creating new directory: '${clonePath}'`);
            fs.ensureDirSync(clonePath);
            logger.debug('Cloning git repository...');
            const repo = await Git.Clone(url, clonePath);
            logger.debug('Successfully cloned!');
            return new Clone(clonePath, repo);
        }
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

    /**
     *    Gets the commit history from the HEAD commit
     *
     *    @return {Promise<Array<Commit>>}
     *        The commit history. See [Commit]{@link https://www.nodegit.org/api/commit/}.
     */
    async headCommitHistory() {
        const walker = this.repo.createRevWalk();
        const head = await this.repo.getHeadCommit();
        const sleep = ms => new Promise(res => {setTimeout(res, ms)});
        let done = false;
        let commits = [];
        walker.walk(head.id(), (error, commit) => {
            if (error && error.errno == Git.Error.CODE.ITEROVER) {
                done = true;
            } else {
                commits.push(commit);
            }
        });
        while (!done) {
            await sleep(1000);
        }
        return commits;
    }

    /**
     *    @callback commitActionFunction
     *    @param {Commit} commit - The commit it's applied to.
     *    @param {number} index - The index of the commit, 1-based.
     *
     *    @return T - The return value.
     *    @template T
     */

    /**
     *    @callback commitCatcherFunction
     *    @param {Commit} commit - The commit it was applied to.
     *    @param {Error} error - The error thrown.
     *    @param {number} index
     *        The index of the commit it was applied to, 1 - based.
     *
     *    @return T - The return value.
     *    @template T
     */

    /**
     *    Maps an action function to all the commits provided. If the action
     *    function throws an error, applies the catcher funtion to that commit.
     *    Then returns the results in the order given.
     *    @param {Array<Commit>} commits
     *        The list of [Commit]{@link https://www.nodegit.org/api/commit/}.
     *    @param {commitActionFunction<T>} action
     *        The function to apply to each commit
     *    @param {commitCatcherFunction<S>} catcher
     *        The function to catch errors if the action function throws.
     *
     *    @return {Array<T|S>} - The results
     *    @template T
     *    @template S
     */
    async foreachCommit(commits, action, catcher) {
        let results = [];
        let i = 1;
        for (const commit of commits) {
            await Git.Reset.reset(
                this.repo, commit, Git.Reset.TYPE.HARD);
            const result = await action(commit, i)
                .catch(e => catcher(commit, e, i));
            results.push(result);
            i++;
        }
        return results;
    }

}

module.exports = {
    Clone: Clone
};