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