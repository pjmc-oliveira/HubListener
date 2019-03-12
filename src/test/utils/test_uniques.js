const test = require('ava');

const { uniques } = require('../../utils.js');

test('uniques should return an Array of unique elements', t => {
    const xs = [1, 1, 2, 3, 3, 4];
    const actual = uniques(xs);
    const expected = [1, 2, 3, 4];
    t.deepEqual(actual, expected);
    t.true(actual instanceof Array);
});