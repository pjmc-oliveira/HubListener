/**
utils.js contains utility functions
 */

// required for reading files
const fs = require('fs');
// required for joining paths
const path = require('path');

/**
 *  Parses a GitHub project URL
 *  @param {string} the URL
 *
 *  @return {{owner: string, name: string}}
 *      The owner and the name of the project
 */
function parseURL(url) {
    const url_parts = url.split('/');
    const index = url_parts.indexOf('github.com');
    if (index === -1) {
        throw 'Not a valid GitHub url (' + url + ')';
    }
    return {
        owner: url_parts[index + 1],
        name: url_parts[index + 2]
    };
}

/**
 *  Zip takes any number of arrays (e.g. xs = [x_0...x_n], ys = [y_0...y_m])
 *  and returns an array where each element is an array of the n^th elements of
 *  the input arrays (i.e. zip(xs, ys) = [[x_0, y_0] ... [x_k, y_k] | k = min(n, m)]).
 *  Similarly for larger number of input arrays.
 *
 *  @param {...Array<*>} arrays - The input arrays
 *
 *  @return {Array<*>} zipped - The zipped array
 */
function zip(...arrays) {
    let zipped = [];
    for (let index = 0 ;; index++) {
        let step = [];
        for (const array of arrays) {
            if (index < array.length) {
                const elem = array[index];
                step.push(elem);
            } else {
                return zipped;
            }
        }
        zipped.push(step);
    }
}

/**
 *  @callback stepperFunction
 *  @param {T} curr - The current value
 *  @return {T} next - The next value
 *  @template T
 */

 /**
 *  @callback stopperFunction
 *  @param {T} curr - The current value
 *  @return {boolean} stop - Whether to stop generation or not
 *  @template T
 */

/**
 *  Gen takes in a starting value, a stepper function and a stopper function,
 *  and generates an array:
 *  [stepper^0(start), ... stepper^n(start) | stop(stepper^n(start)) === true]
 *  In other words, an array starting at the starting value, applying the
 *  stepper function to create each subsequent value, until the stopper function
 *  for that value returns true.
 *
 *  @param {T} start - The starting value
 *  @param {stepperFunction<T>} step - The stepper funtion
 *  @param {stopperFunction<T>} stop - The stopper function
 *
 *  @return {Array<T>} The generated array
 *  @tempate T
 */
function gen(start, step, stop) {
    let curr = start;
    let result = [curr];
    while (!stop(curr)) {
        curr = step(curr);
        result.push(curr);
    }
    return result;
}

/**
 *  Pairs takes in an array and returns and array of consecutive pairs
 *  (i.e. pairs([x_0, x_1, ... x_n]) = [[x_0, x_1], [x_1, x_2], ... [x_(n-1), x_n]])
 *
 *  @param {Array<T>} array - The input array
 *
 *  @return {Array<Array<T>>} The resulting array of pairs
 *  @template T
 */
function pairs(array) {
    let result = [];
    for (let index = 0; (index + 1) < array.length; index++) {
        result.push([array[index], array[index + 1]]);
    }
    return result;
}

/**
 *  Parses an Array of strings (flags and values) into an object of flag keys,
 *  and value values.
 *  @param {Array} the Array of command line arguments to be parsed
 *
 *  @return {object} the parsed command line arguments. Where each flag
 *      (strings beginning with '-' or '--') is a key, and the following strings
 *      (until the next flag) are the values. If a flag has no associated value
 *      it is simply 'true' (boolean). If it has multiple associated values they
 *      will be stored in an Array. If it has only one, it is simply a string.
 */
function argParse(rawArgs) {
    var args = {};
    var parsingErrors = [];
    var currFlag = null;
    // any string starting with '-' and 1 character or '--' and multiple characters
    const validFlagPattern = /^((--([^\s]{2,}))|(-([^-\s])))$/;
    // any string not starting with '-'
    const validValuePattern = /^([^-\s][^\s]+)$/;
    for (const arg of rawArgs) {
        const matchedFlag = validFlagPattern.exec(arg);
        const matchedValue = validValuePattern.exec(arg);
        // the argument is a flag
        if (matchedFlag !== null) {
            currFlag = matchedFlag[3] || matchedFlag[5];
            args[currFlag] = true;

        // the argument is not a flag, the current flag is set
        // and the current argument is valid
        } else if (currFlag !== null && matchedValue !== null) {
            const value = matchedValue[0];
            const existingArg = args[currFlag];
            // If flag has no associated value, associate value
            if (existingArg === true) {
                args[currFlag] = value;
            // If flag has 1 associated value, make an Array with both values
            } else if (typeof existingArg === 'string') {
                args[currFlag] = [existingArg, value];
            // If flag has multiple associated values, append to Array
            } else if (Array.isArray(existingArg)) {
                args[currFlag].push(value)
            }

        // collect any parsing errors (invalid flags or values)
        } else if (currFlag !== null && matchedValue === null) {
            parsingErrors.push(arg);
        }
    }

    // if there were any parsing errors, throw exception
    if (parsingErrors.length > 0) {
        const errorsMsg = '[' + parsingErrors.join(', ') + ']';
        throw `${errorsMsg} is/are not valid flag(s) or value(s)`;
    }

    return args;
}

/**
 *  Write an object to a JSON File .
 *  @param {object} the object to be written to the file
 *  @param {string} the filename that will be written to
 *  @param {object} optional options for execution:
 *      dirname: the name of the directory of the output file,
 *               defaults to current directory
 *      append:  boolean to determine if should append (true) or overwrite (false)
 *               if file already exists. Defaults to false
 *
 *  @return {String} the confirmation string 
 */
function writeToJSONFile(obj, filename, {dirname = __dirname, append = false}){
    // stringify to a JSON object
    // TODO: pretty print JSON
    const JsonString = JSON.stringify(obj);
    // join path of directory and file
    const filepath = path.join(dirname, filename);

    // if file exists and append is set to true, append to file
    if (fs.existsSync(filepath) && append) {
        fs.appendFileSync(filepath, JsonString);
    // else create new file and write. 
    } else {
        fs.writeFileSync(filepath, JsonString);
    }
}

/**
 *  Unwrap takes in an object, and a leaf key and moves the values of
 *  the leaf keys up a level in the object tree
 *  (i.e. object.sub_level.leaf = object.leaf, for all 'leaf' in 'object')
 *  @param {object} obj - The object to unwrap
 *  @param {string} leaf - The leaf key
 *
 *  @return {object} The unwrapped object
 */
function unwrap(obj, leaf) {
    const unwrapped = {};
    for (const [key, node] of Object.entries(obj)) {
        unwrapped[key] = node[leaf];
    }
    return unwrapped;
}



module.exports = {
    parseURL: parseURL,
    zip: zip,
    gen: gen,
    pairs: pairs,
    argParse: argParse,
    writeToJSONFile: writeToJSONFile,
    unwrap: unwrap
};