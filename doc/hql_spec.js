
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
const numbers = new(Array);
numbers.push(1);
numbers.push(2);
numbers.push(3);
numbers.push(4);
numbers.push(5);
numbers.push(6);
numbers.push(7);
const pi = 3.14159;
const greeting = "Hello, HQL World!";
const is_awesome = true;
const symbol_x = "x";
const quoted_list = [1, 2, 3];
const quoted_expression = ["+", 1, ["*", 2, 3]];
[1, 2, 3, 4, 5];
new Set([1, 2, 3, 4, 5]);
({
    key: "value"
});
[1, 2, 3, 4, 5];
const json = {
    items: [1, 2, 3, 4, 5]
};
(function () {
    const _obj = json;
    const _member = _obj["items"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
})();
const data = {
    items: [5, 10, 15, 20, 25, 30, 35, 40],
    factor: 2,
    prefix: "Value: "
};
(function () {
    const _obj = data;
    const _member = _obj["items"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
})();
const empty_vector = [];
const mixed_types = ["string", 42, true, null];
const nested_vectors = [[1, 2], [3, 4]];
const empty_map = {};
const user = {
    name: "John",
    age: 30
};
const nested_map = {
    profile: {
        id: 1,
        settings: {
            theme: "dark"
        }
    }
};
const empty_set = new Set();
const unique_numbers = new Set([1, 2, 3, 4, 5]);
const unique_strings = new Set(["apple", "banana", "cherry"]);
const empty_list = [];
const simple_list = [1, 2, 3, 4, 5];
const mixed_list = ["hello", 42, true];
const vec_item = get(numbers, 2);
const map_value = get(user, "name");
const first_item = function () {
    const _obj = numbers;
    const _member = _obj["0"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const second_item = function () {
    const _obj = numbers;
    const _member = _obj["1"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
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
numbers.push(8);
console.log(numbers);
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
const random_number = function () {
    const _obj = Math;
    const _member = _obj["random"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const current_timestamp = function () {
    const _obj = Date;
    const _member = _obj["now"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
console.log("Hello from HQL!");
console.warn("This is a warning");
const date = new(Date);
const current_year = function () {
    const _obj = date;
    const _member = _obj["getFullYear"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const month = function () {
    const _obj = date;
    const _member = _obj["getMonth"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const formatted_date = function () {
    const _obj = date;
    const _member = _obj["toLocaleDateString"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
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
const router = function () {
    const _obj = express;
    const _member = _obj["Router"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
app.use(function () {
    const _obj = express;
    const _member = _obj["json"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}());
const message = "Hello, World!";
const upper_message = function () {
    const _obj = message;
    const _member = _obj["toUpperCase"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const message_parts = message.split(" ");
const array = [1, 2, 3];
array.push(4);
array.push(5);
console.log(array);
const year = function () {
    const _obj = date;
    const _member = _obj["getFullYear"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const date_string = function () {
    const _obj = date;
    const _member = _obj["toISOString"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const nums = [1, 2, 3, 4, 5];
const filtered = nums.filter(function (x) {
    return x > 2;
});
const doubled = filtered.map(function (x) {
    return x * 2;
});
const sum = nums.reduce(function (a, b) {
    return a + b;
}, 0);
const max_sum = Math.max(sum, 10);
const config = {
    db: {
        user: {
            name: "admin"
        }
    }
};
const db_part = function () {
    const _obj = config;
    const _member = _obj["db"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const user_part = function () {
    const _obj = db_part;
    const _member = _obj["user"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const admin_name = function () {
    const _obj = user_part;
    const _member = _obj["name"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const get_user = function () {
    return {
        id: 1,
        name: "John"
    };
};
const user_obj = get_user();
const user_name = function () {
    const _obj = user_obj;
    const _member = _obj["name"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const window_width = function () {
    const _obj = window;
    const _member = _obj["innerWidth"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const array_length = function () {
    const _obj = array;
    const _member = _obj["length"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const string_upper = function () {
    const _obj = message;
    const _member = _obj["toUpperCase"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
}();
const substring = message.substring(0, 5);
const replaced = message.replace("Hello", "Hi");
const even_numbers = numbers.filter(function (n) {
    return n % 2 === 0;
});
const doubled_evens = even_numbers.map(function (n) {
    return n * 2;
});
console.log("Doubled evens (step by step):", doubled_evens);
const chained_result = function () {
    const filtered = numbers.filter(function (n) {
        return n > 5;
    });
    const mapped = filtered.map(function (n) {
        return n * 2;
    });
    return mapped.reduce(function (acc, n) {
        return acc + n;
    }, 0);
}([]);
console.log("Sum of doubled numbers > 5:", chained_result);
const direct_chain = numbers.filter(function (n) {
    return n % 2 === 0;
}).map(function (n) {
    return n * 2;
});
console.log("Direct chain result:", direct_chain);
console.log("\\n----- Test 5: Complex Method Chaining -----");
const complex_chain = numbers.filter(function (n) {
    return n > 3;
}).map(function (n) {
    return n * 3;
}).slice(0, 3);
console.log("Complex chain result:", complex_chain);
const sum_chain = numbers.filter(function (n) {
    return n > 5;
}).map(function (n) {
    return n * 2;
}).filter(function (n) {
    return n % 4 === 0;
}).reduce(function (acc, n) {
    return acc + n;
}, 0);
console.log("Sum from complex chain:", sum_chain);
