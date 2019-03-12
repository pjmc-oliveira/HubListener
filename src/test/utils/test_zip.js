const test = require('ava');

const { zip } = require('../../utils.js');

test('zip zips same length lists', t => {
    const xs = [1, 2, 3];
    const ys = ['a', 'b', 'c'];
    const expected = [
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
    ];
    const actual = zip(xs, ys);
    t.deepEqual(actual, expected);
});

test('zip zips lists up to the length of the shortest list', t => {
    const xs = [1, 2, 3, 4];
    const ys = ['a', 'b', 'c'];

    // test shortest list in second argument
    const expected1 = [
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
    ];
    const actual1 = zip(xs, ys);
    t.deepEqual(actual1, expected1);

    // test shortest list in first argument
    const expected2 = [
        ['a', 1],
        ['b', 2],
        ['c', 3],
    ];
    const actual2 = zip(ys, xs);
    t.deepEqual(actual2, expected2);
});

test('zip zips more than two lists', t => {
    const xs = [1, 2, 3];
    const ys = [4, 5, 6];
    const zs = [7, 8, 9];

    const expected = [
        [1, 4, 7],
        [2, 5, 8],
        [3, 6, 9],
    ];
    const actual = zip(xs, ys, zs);
    t.deepEqual(actual, expected);
});