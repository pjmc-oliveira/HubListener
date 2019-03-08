const test = require('ava');

const { parseURL } = require('../../utils.js');

test('Owner is parsed correctly', t => {
    const  url1 = "https://github.com/pjmc-oliveira/HubListener"; 
    const actual = parseURL(url1).owner;
    const expected = "pjmc-oliveira";
    t.deepEqual(actual, expected);
});

test('name is parsed correctly', t => {
    const  url1 = "https://github.com/pjmc-oliveira/HubListener"; 
    const actual = parseURL(url1).name;
    const expected = "HubListener";
    t.deepEqual(actual, expected);
});