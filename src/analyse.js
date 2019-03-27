const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const escomplex = require('typhonjs-escomplex');

const {isText} = require('istextorbinary');
const mkLogger = require('./log.js');

const logger = mkLogger({label: __filename});

/**
 *  A namespace containing analyser functions.
 *  @namespace
 */
const analyse = {
    /**
     *  Summary for a generic file extension
     *  @typedef {object} GenericAnalysisReport
     *  @property {number} numberOfFiles - The number of files with the extension
     *  @property {number} numberOfLines
     *      The total number of physical lines with the extension
     */

    /**
     *  Analyses a generic text files.
     *  @param {Array<string>} paths - An array of absolute file paths
     *
     *  @return {GenericAnalysisReport} A report of all analyses performed on the given extension
     */
    generic: function(paths) {

        const readFile = path => fs.readFileSync(path, 'utf8');
        const countLines = contents => contents.split('\n').length;
        const getLinesFromFile = path => {
            let contents = readFile(path);
            if (isText(path, contents)) {
                return countLines(contents);
            } else {
                return 0;
            }
        };
        const totalLines = paths
            .map(getLinesFromFile)
            .reduce((a, b) => a + b, 0);

        return Promise.resolve({
            numberOfFiles: paths.length,
            numberOfLines: totalLines
        });
    },

    /**
     *  Static Analysis report for Javascript code
     *  @typedef {object} JsAnalysisReport
     *  @property {number} numberOfFiles
     *  @property {number} cyclomatic
     *  @property {number} maintainability
     *  @property {number} numberOfComments
     *  @property {number} numberOfLines
     *  @property {number} numberOfLogicalLines
     *  @property {number} effort
     *  @property {number} changeCost
     *  @property {number} avgDependencies
     */

    /**
     *  Performs static code analysis on a set of javascript files
     *  @param {Array<string>} paths - An array of absolute file paths
     *
     *  @return {JsAnalysisReport} A report of static analysis performed on javascript code
     */
    javascript: function(paths) {
        return new Promise((resolve, reject) => {
            let source = [];
            let totalComments = 0;

            for (let path of paths) {
                let code = fs.readFileSync(path, 'utf8');

                // Add file and contents to source object for later digestion by escomplex
                source.push({
                    code: code,
                    srcPath: path,
                    filePath: path
                });

                // Count comments in each file
                let commentPattern = /(?:(?<!\\)("|'|`)[\s\S]*?(?<!\\)\1)|(?:\/(?!\*)[^\r\n\f]+(?<!\\)\/)|(\/\*[\s\S]*?\*\/)|(\/\/[^\r\n\f]*)/g;
                let commentLines = 0;
                let match;

                while(match = commentPattern.exec(code)) {
                    // Group 2 = block comments
                    if (match[2]) {
                        commentLines += match[2].split('\n').length;
                    }
                    // Group 3 = line comments
                    if (match[3]) {
                        commentLines++;
                    }
                }

                totalComments += commentLines;
            }

            let escomplexReport;

            try {
                escomplexReport = escomplex.analyzeProject(source, {});
            } catch (e) {
                // Parse failure, skip and return basic analysis
                logger.warn(e);
                resolve(analyse.generic(paths));
            }

            // Total physical lines of code
            let sloc = 0;

            // Total logical lines of code
            let lsloc = 0;

            // Non unique dependencies
            let dependencies = 0;

            for (let report of escomplexReport.modules) {
                sloc += report.aggregate.sloc.physical;
                lsloc += report.aggregate.sloc.logical;
                dependencies += report.dependencies.length;
            }

            let finalReport = {
                numberOfFiles: paths.length,
                cyclomatic: escomplexReport.moduleAverage.methodAverage.cyclomatic,
                maintainability: escomplexReport.moduleAverage.maintainability,
                numberOfComments: totalComments,
                numberOfLines: sloc,
                numberOfLogicalLines: lsloc,
                effort: escomplexReport.moduleAverage.methodAverage.halstead.effort,
                changeCost: escomplexReport.changeCost,
                avgDependencies: dependencies / escomplexReport.modules.length
            };

            resolve(finalReport);
        });
    },

    python: function(paths) {
        return new Promise((resolve, reject) => {
            try {
                // By default macOS `python` is v2.*
                // call user aliased `python3`
                const pythonExe = os.platform() === 'darwin' ? 'python3' : 'python';
                const scriptName = 'external/analyse.py';

                // spawn separate process to analyse python
                const program = spawn(pythonExe, [scriptName, ...paths]);

                // store partialy complete JSON strings
                let buffer = '';

                // on every output, add chunk to buffer and try to parse buffer
                // if JSON incomplete, wait for nexxt chunk
                // otherwise resolve buffer
                program.stdout.on('data', chunk => {
                    buffer += chunk.toString('utf-8');
                    try {
                        const parsed = JSON.parse(buffer);
                        resolve(parsed);
                    } catch (err) {
                        if (!(err instanceof SyntaxError)) {
                            throw err;
                        }
                    }
                });

                // on error, reject
                program.stderr.on('data', reject);

            } catch (e) {
                logger.warn("Python analysis failed.  Falling back to default.  Details:");
                logger.warn(e);
                resolve(analyse.generic(paths));
            }
        });
    }
};

module.exports = analyse;