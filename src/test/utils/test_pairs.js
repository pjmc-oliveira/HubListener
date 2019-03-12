const test = require('ava');

const { pairs } = require('../../utils.js');

test('pairs should return a list of pairs of consecutive elements', t => {
    const xs = [1, 2, 3, 4, 5];
    const actual = pairs(xs);
    const expected = [
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
    ];
    t.deepEqual(actual, expected);
});

test('pairs of an empty list should return an empty list', t => {
    const actual = pairs([]);
    const expected = [];
    t.deepEqual(actual, expected);
});