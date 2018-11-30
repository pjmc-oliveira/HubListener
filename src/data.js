'use strict';

const {Client} = require('./client.js');
const {Clone} = require('./clone.js');
const utils = require('./utils.js');

module.exports.Data = class Data {
    constructor(url, options = {}) {
        const {owner, name} = utils.parseURL(url);
        this.client = new Client(options.auth_token);
        this.clonePromise = Clone.init(url);
        this.owner = owner;
        this.name = name;
    }

    // add methods...
};