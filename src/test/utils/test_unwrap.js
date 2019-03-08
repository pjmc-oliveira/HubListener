const test = require('ava');

const { unwrap } = require('../../utils.js');

test('unwrap should unwrap nested objects', t => {
    const wrapped = {
        'A': {'nested': 1},
        'B': {'nested': 2, 'ignored': 0},
        'C': {'nested': 3},
        'D': {'nested': 4, 'ignored': 0},
    };
    const actual = unwrap(wrapped, 'nested');
    const expected = {
        'A': 1,
        'B': 2,
        'C': 3,
        'D': 4,
    }
    t.deepEqual(actual, expected);
});