
// HQL Runtime Functions
function list(...args) {
  return args;
}
const pi = 3.14159;
const greeting = "Hello, HQL World!";
const is_awesome = true;
const square = function (x) {
    return x * x;
};
const add_three = function (x, y, z) {
    return x + (y + z);
};
const abs = function (x) {
    return x < 0 ? 0 - x : x;
};
const factorial = function (n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
};
const calculate_area = function (radius) {
    return function () {
        const r_squared = square(radius);
        const area = pi * r_squared;
        return area;
    }([]);
};
const complex_calculation = function (x, y) {
    return function () {
        const sum = x + y;
        return function () {
            const product = x * y;
            const difference = x - y;
            return list(sum, product, difference);
        }([]);
    }([]);
};
const max_value = function (a, b) {
    return a > b ? a : b;
};
const classify_number = function (n) {
    return n < 0 ? "negative" : "zero";
};
const between = function (x, min, max) {
    return x >= min ? x <= max : x >= min;
};
const outside = function (x, min, max) {
    return x < min ? x < min : x > max;
};
const not_between = function (x, min, max) {
    return between(x, min, max) ? 0 : 1;
};
const validate_range = function (x) {
    return (x >= 0 ? x < 10 : x >= 0) ? "single digit" : "double digit";
};
const arithmetic_demo = function (a, b) {
    return list(a + b, a - b, a * b, a / b);
};
const comparison_demo = function (a, b) {
    return list(a === b, a !== b, a < b, a > b, a <= b, a >= b);
};
const log_message = function (msg) {
    return console.log(msg);
};
const current_time = function () {
    return new Date(list);
};
const random_number = function () {
    return Math["random"];
};
import * as modModule from "https://deno.land/std@0.170.0/path/mod.ts";
const mod = modModule.default !== undefined ? modModule.default : modModule;
const join_paths = function (a, b) {
    return mod.join(a, b);
};
export { join_paths as joinPaths };
export { pi as PI };
const apply_twice = function (f, x) {
    return f(f(x));
};
const make_adder = function (n) {
    return function (x) {
        return x + n;
    };
};
const demonstration = function () {
    return function () {
        const add_five = make_adder(5);
        return add_five(10);
    }([]);
};
const nested_expression_demo = function (x) {
    return 2 * square(x + 1) + (x > 0 ? factorial(x) : 0);
};
const showcase = function (n) {
    return function () {
        const result = n < 0 ? "Cannot compute for negative numbers" : "Identity element for factorial";
        return result ? result : function () {
            const fact = factorial(n);
            const msg = "Factorial of " + (n + " is " + fact);
            log_message(msg);
            return list(n, fact);
        }([]);
    }([]);
};
const log_all = function (...items) {
    return console.log(items);
};
const with_prefix = function (prefix, ...rest) {
    return console.log(prefix, rest);
};
const a = 10;
log_all(a, a + a);
const result6 = function () {
    const p = 100;
    const q = 200;
    const r = 300;
    const s = 400;
    return p + q + r + s;
}([]);
export { showcase };
