/**
utils.js contains utility functions
 */


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


module.exports = {
    parseURL: parseURL,
    zip: zip,
    addKeyValueToObject: addKeyValueToObject
};