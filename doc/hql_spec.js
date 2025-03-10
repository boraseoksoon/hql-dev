
// Helper for property access
function getProperty(obj, prop) {
  const member = obj[prop];
  return typeof member === "function" ? member.bind(obj) : member;
}

// Collection access function
function get(obj, key, notFound = null) {
  if (obj == null) return notFound;
  
  // Handle arrays (vectors)
  if (Array.isArray(obj)) {
    return (typeof key === 'number' && key >= 0 && key < obj.length) 
      ? obj[key] 
      : notFound;
  }
  
  // Handle Sets
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  
  // Handle objects (maps)
  return (key in obj) ? obj[key] : notFound;
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
const isLargerThan_pred = function (a, b) {
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
const symbol_x = "x";
const quoted_list = [1, 2, 3];
const quoted_expression = ["+", 1, ["*", 2, 3]];
const pi_value = function () {
    const _obj = Math;
    const _member = _obj["PI"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const max_int_value = function () {
    const _obj = Number;
    const _member = _obj["MAX_SAFE_INTEGER"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const random_number = Math.random();
const current_timestamp = Date.now();
console.log("Hello from HQL!");
console.warn("This is a warning");
const message = "hello world";
const upper_text = message.toUpperCase();
console.log(upper_text);
const numbers = new(Array);
numbers.push(1);
numbers.push(2);
numbers.push(3);
numbers.push(4);
numbers.push(5);
numbers.push(6);
numbers.push(7);
console.log(numbers);
const date = new(Date);
const current_year = date.getFullYear();
const month = date.getMonth();
const formatted_date = date.toLocaleDateString();
const abs_value = Math.abs(-42);
const rounded = Math.round(3.7);
const max_value = Math.max(1, 2, 3, 4, 5);
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
const path = (function () {
    const wrapper = pathModule.default !== undefined ? pathModule.default : {};
    for (const [key, value] of Object.entries(pathModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
const joined_path = path.join("folder", "file.txt");
import * as fileModule from "https://deno.land/std@0.170.0/fs/mod.ts";
const file = (function () {
    const wrapper = fileModule.default !== undefined ? fileModule.default : {};
    for (const [key, value] of Object.entries(fileModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
const exists = file.existsSync("example-dir");
import * as expressModule from "npm:express";
const express = (function () {
    const wrapper = expressModule.default !== undefined ? expressModule.default : {};
    for (const [key, value] of Object.entries(expressModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
const app = express();
const router = express.Router();
app.use(express.json());
const apply_twice = function (f, x) {
    return f(f(x));
};
const make_multiplier = function (n) {
    return function (x) {
        return x * n;
    };
};
const demonstration = function () {
    return function () {
        const double = make_multiplier(2);
        return double(10);
    }([]);
};
const log_all = function (...items) {
    return console.log(items);
};
const with_prefix = function (prefix, ...rest) {
    return console.log(prefix, rest);
};
log_all(1, 2, 3, 4, 5);
with_prefix("Numbers:", 1, 2, 3);
const showcase = function (n) {
    return function () {
        const result = n < 0 ? "Cannot compute for negative numbers" : "Identity element for factorial";
        return result ? result : function () {
            const fact = factorial(n);
            const msg = "Factorial of " + (n + " is " + fact);
            console.log(msg);
            return list(n, fact);
        }([]);
    }([]);
};
export { showcase };
