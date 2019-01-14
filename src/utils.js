/**
utils.js contains utility functions
 */

// required for reading files
var fs = require('fs');
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
 *  Zips two arrays
 *  @param {Array} the first array
 *  @param {Array} the sedond array
 *
 *  @return {Array} the zipped array
 */
function zip(a, b) {
    var output = [];
    for (const key in a) {
        output.push([a[key], b[key]]);
    }
    return output;
}

/**
 *  Adds a value to a key in a given object, and returns the new object
 *  @param {object} the object to add the key-value to
 *  @param {Array} the array where the first element is the key, and the second the value
 *
 *  @return {object} the modified object
 */
function addKeyValueToObject(obj, keyValue) {
    const [key, value] = keyValue;
    obj[key] = value;
    return obj;
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
    var currFlag = null;
    // any string starting with '-' or '--' and without any whitespace
    const flagPattern = /^(--|-)([^\s]+)$/;
    for (const arg of rawArgs) {
        const match = flagPattern.exec(arg)
        // the argument is a flag
        if (match !== null) {
            currFlag = match[2];
            args[currFlag] = true;

        // the argument is not a flag, and the current flag is set
        } else if (currFlag !== null) {
            const existingArg = args[currFlag];
            // If flag has no associated value, associate value
            if (existingArg === true) {
                args[currFlag] = arg;
            // If flag has 1 associated value, make an Array with both values
            } else if (typeof existingArg === 'string') {
                args[currFlag] = [existingArg, arg];
            // If flag has multiple associated values, append to Array
            } else if (Array.isArray(existingArg)) {
                args[currFlag].push(arg)
            }
        }
    }
    return args;
}

/**
 *  write to a JSONFile 
 *  @param {object} the js object 
 *
 *  @return {String} the confirmation string 
 */
function writeToJSONFile(metrics){
    //stringify to a JSON object
    var metricsToJSON =JSON.stringify(metrics);
    //if file exists, append to results.json 
    if (fs.existsSync('./results.json')){
        fs.appendFile('./results.json',metricsToJSON );
        var succResponse = "Results were appended to JSON Fie results.json in the directory " + __dirname;
        return succResponse;
    }
    //else create new file and write. 
    else{
        fs.writeFileSync('./results.json',metricsToJSON)
        var succResponse = "Results were added to a new JSON Fie, results.json,  in the directory " + __dirname;
        return succResponse;
    }

}

module.exports = {
    parseURL: parseURL,
    zip: zip,
    addKeyValueToObject: addKeyValueToObject,
    argParse: argParse,
    writeToJSONFile: writeToJSONFile
};