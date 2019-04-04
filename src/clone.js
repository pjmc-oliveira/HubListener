'use strict';

// node and npm modules
const Git = require('nodegit');
const fs = require('fs-extra');
const path = require('path');
const dir = require('node-dir');

const utils = require('./utils.js');
const analyse = require('./analyse.js');
const mkLogger = require('./log.js');
const logger = mkLogger({label: __filename});


// Returns true if the file path is in an excluded directory,
// otherwise false
function isInExcludedDir(relativePath, excludedDirs) {
    for (const excludedDir of excludedDirs) {
        if (relativePath.startsWith(excludedDir)) {
            return true;
        }
    }
    return false;
}

// Returns true if the file name has an excluded extension,
// otherwise false
function hasExcludedExt(relativePath, excludedExts) {
    for (const excludedExt of excludedExts) {
        if (relativePath.endsWith(excludedExt)) {
            return true;
        }
    }
    return false;
}

/**
 *  @class The Clone class to clone and manage the Git repository
 */
class Clone {
    /**
     *  Repository Cloning options
     *  @typedef {object} CloneOptions
     *  @property {string} [root=path.join(__dirname, 'repos')]
     *      the root of the path to clone to
     *  @property {string} [clonePath='']
     *      the relative path to clone the repository to
     */
    /**
     *  Initialize and return an instance of the {@link Clone} class.
     *  @param {string} url - A valid URL to a Git repository.
     *  @param {CloneOptions} [options] - cloning options
     *
     *  @return {Promise<Clone>} A promise to a {@link Clone} instance.
     */
    static async init(url, {
            root = path.join(__dirname, 'repos', '0'),
            clonePath = '',
        } = {}) {
        logger.debug(`Initializing repository Clone from: '${url}'`);

        // if clone path is not set, create a new path from URL
        if (!clonePath) {
            logger.debug('clonePath not passed, creating from URL')
            const { owner, name } = utils.parseURL(url);
            clonePath = path.join(root, owner, name);
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

    static async fromPath(path) {
        const repo = await Git.Repository.open(path);
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

    async commitsAfter(date) {
        // get all commits
        const allCommits = (await this.headCommitHistory());

        // if no date provided, return all
        if (!date) {
            return allCommits;
        }
        // function to determine if commit is new
        const isNew = commit => commit.date() > date;

        // only keep new commits
        const commits = allCommits.filter(isNew).reverse();
        
        return commits;
    }

    async analyseCommits({commits = [], commit_ids = []} = {}) {
        if (commits.length === 0) {
            let promises = commit_ids.map(id => Git.Commit.lookup(this.repo, id));
            commits = await Promise.all(promises);
        }

        const analyser = async (commit, index) => {
            return {
                commit_id: commit.id().tostrS(),
                commit_date: commit.date(),
                // have to wait for analysis to finish before
                // checking out next commit
                valuesByExt: await this.staticAnalysis(),
            };
        };

        const catcher = (commit, error, index) => {
            console.log(error);
            return {
                commit_id: commit.id().tostrS(),
                commit_date: commit.date(),
                valuesByExt: {},
            }
        };

        return this.foreachCommit(commits, analyser, catcher);
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

    /**
     *  A summary of a file extension
     *  @typedef {object} ExtensionSummary
     *  @property {number} numberOfFiles - The number of files with that extension
     *  @property {number} numberOfLines - The lines of code with that extension
     */

    /**
     *  Performs static analysis of code on disk and returns a report of the results.
     *  @param {Object} [options] - The options
     *  @param {Array<string>} [options.excludedDirs=['.git']]
     *      A list of directories to be excluded. Only '.git' by default.
     *  @param {Array<string>} [options.excludedExts=[]]
     *      A list of extensions to be excluded.
     *
     *  @return {Object<string, ExtensionSummary>}
     *      An object with file extensions as keys and an object with
     *      all static analyses results as the value.
     */
    async staticAnalysis({
        excludedDirs = ['.git'],
        excludedExts = []} = {}) {

    // get all files in directory
    let filepaths = await dir.promiseFiles(this.path);

    // TODO: cycle through files only ONCE if both are provided
    // filter unwanted files
    if (excludedDirs.length) {
        filepaths = filepaths.filter(f => !isInExcludedDir(f.slice(this.path.length + 1), excludedDirs));
    }
    
    if (excludedExts.length) {
        filepaths = filepaths.filter(f => !hasExcludedExt(f.slice(this.path.length + 1), excludedExts));
    }

    // group files by extension
    let fileByExt = {};
    for (const filepath of filepaths) {
        const ext = path.extname(filepath);

        fileByExt[ext] = fileByExt[ext] || [];
        fileByExt[ext].push(filepath);
    }

    // analyse files by extension
    let promises = {};
    for (const [ext, files] of Object.entries(fileByExt)) {
        switch (ext) {
            case '.js':
                promises[ext] = analyse.javascript(files);
                break;
            case '.py':
                promises[ext] = analyse.python(files);
                break;
            default:
                promises[ext] = analyse.generic(files);
                break;
        }
    }

    // wait for all extension analyses to complete
    let output = {};
    for (const [ext, promise] of Object.entries(promises)) {
        output[ext] = await promise;
    }

    return output;
}

}

module.exports = {
    Clone: Clone
};