'use strict';

const {Client} = require('./client.js');
const {Clone} = require('./clone.js');

module.exports = class Data {
    // simple function to get the repository name and owner from the URL
    static parseURL(url) {
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

    constructor(url) {
        const {owner, name} = Data.parseURL(url);
        this.client = new Client;
        this.clonePromise = Clone.init(url);
        this.owner = owner;
        this.name = name;
    }

    // add methods...
}