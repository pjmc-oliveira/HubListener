const test = require('ava');

const { gen } = require('../../utils.js');

test('gen should generate a list, based on arguments', t => {
    const start = 1;
    const stepper = n => n + 1;
    const stopper = n => n >= 5;
    const actual = gen(start, stepper, stopper);
    const expected = [1, 2, 3, 4, 5];
    t.deepEqual(actual, expected);
});