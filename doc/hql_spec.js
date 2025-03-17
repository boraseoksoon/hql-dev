// doc/hql_spec.js
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
import * as fileModule from "https://deno.land/std@0.170.0/fs/mod.ts";
import * as expressModule from "npm:express";
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj === "function") {
    try {
      return obj(key);
    } catch (e) {
      return key in obj ? obj[key] : notFound;
    }
  }
  if (Array.isArray(obj)) {
    return typeof key === "number" && key >= 0 && key < obj.length ? obj[key] : notFound;
  }
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
function symbol_pred(value) {
  return typeof value === "string";
}
function list_pred(value) {
  return Array.isArray(value);
}
function map_pred(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Set);
}
function nil_pred(value) {
  return value === null || value === void 0;
}
function empty_pred(coll) {
  if (coll == null)
    return true;
  if (Array.isArray(coll))
    return coll.length === 0;
  if (coll instanceof Set)
    return coll.size === 0;
  if (typeof coll === "object")
    return Object.keys(coll).length === 0;
  return false;
}
function first(coll) {
  if (coll == null)
    return null;
  if (Array.isArray(coll) && coll.length > 0)
    return coll[0];
  return null;
}
function rest(coll) {
  if (coll == null)
    return [];
  if (Array.isArray(coll))
    return coll.slice(1);
  return [];
}
function next(coll) {
  if (coll == null)
    return null;
  if (Array.isArray(coll) && coll.length > 1)
    return coll.slice(1);
  return null;
}
function seq(coll) {
  if (coll == null)
    return null;
  if (Array.isArray(coll))
    return coll.length > 0 ? coll : null;
  if (coll instanceof Set)
    return coll.size > 0 ? Array.from(coll) : null;
  if (typeof coll === "object") {
    const entries = Object.entries(coll);
    return entries.length > 0 ? entries : null;
  }
  return null;
}
function conj(coll, ...items2) {
  if (coll == null)
    return items2;
  if (Array.isArray(coll))
    return [...coll, ...items2];
  if (coll instanceof Set) {
    const newSet = new Set(coll);
    items2.forEach((item) => newSet.add(item));
    return newSet;
  }
  if (typeof coll === "object") {
    return { ...coll, ...Object.fromEntries(items2) };
  }
  return coll;
}
function concat(...colls) {
  return [].concat(...colls.map(
    (coll) => coll == null ? [] : Array.isArray(coll) ? coll : [coll]
  ));
}
function list(...items2) {
  return items2;
}
var numbers = new Array();
numbers.push(1);
numbers.push(2);
numbers.push(3);
numbers.push(4);
numbers.push(5);
numbers.push(6);
numbers.push(7);
var json = {
  items: [1, 2, 3, 4, 5]
};
json.items;
var data = {
  items: [5, 10, 15, 20, 25, 30, 35, 40],
  factor: 2,
  prefix: "Value: "
};
data.items;
var user = {
  name: "John",
  age: 30
};
var vec_item = get(numbers, 2);
var map_value = get(user, "name");
var first_item = get(numbers, 0);
var second_item = get(numbers, 1);
var my_vector = [1, 2, 3, 4, 5];
var element2 = get(my_vector, 2);
var element3 = get(my_vector, 2);
var element4 = get(my_vector, 2);
var user2 = {
  name: "Alice",
  status: "active"
};
console.log(get(user2, "name"));
console.log(user2.name);
console.log(get(user2, ["name"]));
var my_list = list("a", "b", "c");
get(my_list, 1);
console.log(get(my_list, 1));
var my_vector2 = [10, 20, 30];
get(my_vector2, 2);
console.log(get(my_vector2, 2));
var my_set = /* @__PURE__ */ new Set([1, 2, 3]);
console.log(get(my_set, 2));
console.log(my_set.has(2));
console.log(my_set.has(2));
var square = function(x) {
  return x * x;
};
console.log("square : ", get(square, 10));
var classify_number = function(x) {
  return x < 0 ? "negative" : x === 0 ? "zero" : x < 10 ? "small positive" : x < 100 ? "medium positive" : true ? "large positive" : null;
};
console.log(get(classify_number, 10));
console.log(get(classify_number, 100));
var log_all = function(...items2) {
  return console.log(items2);
};
var with_prefix = function(prefix, ...rest2) {
  return console.log(prefix, rest2);
};
log_all(1, 2, 3, 4, 5);
with_prefix("Numbers:", 1, 2, 3);
numbers.push(8);
console.log(numbers);
var max_int_value = Number.MAX_SAFE_INTEGER;
var current_timestamp = Date.now;
console.log("Hello from HQL!");
console.warn("This is a warning");
var date = /* @__PURE__ */ new Date();
var current_year = date.getFullYear;
var month = date.getMonth;
var formatted_date = date.toLocaleDateString;
var abs_value = Math.abs(-42);
var rounded = Math.round(3.7);
var max_value = Math.max(1, 2, 3, 4, 5);
var path = function() {
  const wrapper = pathModule.default !== void 0 ? pathModule.default : {};
  for (const [key, value] of Object.entries(pathModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var joined_path = path.join("folder", "file.txt");
var file = function() {
  const wrapper = fileModule.default !== void 0 ? fileModule.default : {};
  for (const [key, value] of Object.entries(fileModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var exists = file.existsSync("example-dir");
var express = function() {
  const wrapper = expressModule.default !== void 0 ? expressModule.default : {};
  for (const [key, value] of Object.entries(expressModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var app = express();
var router = express.Router;
app.use(express.json);
var message = "Hello, World!";
var upper_message = message.toUpperCase;
var message_parts = message.split(" ");
var array = [1, 2, 3];
array.push(4);
array.push(5);
console.log(array);
var year = date.getFullYear;
var date_string = date.toISOString;
var nums = [1, 2, 3, 4, 5];
var filtered = nums.filter(function(x) {
  return x > 2;
});
var doubled = filtered.map(function(x) {
  return x * 2;
});
var sum = nums.reduce(function(a, b) {
  return a + b;
}, 0);
var max_sum = Math.max(sum, 10);
var config = {
  db: {
    user: {
      name: "admin"
    }
  }
};
var db_part = config.db;
var user_part = db_part.user;
var admin_name = user_part.name;
var get_user = function() {
  return {
    id: 1,
    name: "John"
  };
};
var user_obj = get_user();
var user_name = user_obj.name;
var window_width = window.innerWidth;
var array_length = array.length;
var string_upper = message.toUpperCase;
var substring = message.substring(0, 5);
var replaced = message.replace("Hello", "Hi");
var even_numbers = numbers.filter(function(n) {
  return n % 2 === 0;
});
var doubled_evens = even_numbers.map(function(n) {
  return n * 2;
});
console.log("Doubled evens (step by step):", doubled_evens);
[1, 2, 3, 4, 5, 6, 7, 8].filter(function(n) {
  return n > 5;
}).length;
var chained_result = function() {
  const filtered2 = numbers.filter(function(n) {
    return n > 5;
  });
  const mapped = filtered2.map(function(n) {
    return n * 2;
  });
  return mapped.reduce(function(acc, n) {
    return acc + n;
  }, 0);
};
console.log("Sum of doubled numbers > 5:", chained_result);
var direct_chain = numbers.filter(function(n) {
  return n % 2 === 0;
}).map(function(n) {
  return n * 2;
});
console.log("Direct chain result:", direct_chain);
console.log("\\n----- Test 5: Complex Method Chaining -----");
var complex_chain = numbers.filter(function(n) {
  return n > 3;
}).map(function(n) {
  return n * 3;
}).slice(0, 3);
console.log("Complex chain result:", complex_chain);
var sum_chain = numbers.filter(function(n) {
  return n > 5;
}).map(function(n) {
  return n * 2;
}).filter(function(n) {
  return n % 4 === 0;
}).reduce(function(acc, n) {
  return acc + n;
}, 0);
console.log("Sum from complex chain:", sum_chain);
var macro_x = 10;
macro_x > 5 ? console.log("macro_x is greater than 5") : null;
macro_x < 5 ? null : console.log("macro_x is not less than 5");
var x_plus_one = macro_x + 1;
var x_minus_one = macro_x - 1;
console.log(x_plus_one);
console.log(x_minus_one);
var symb = "hello";
var lst = [1, 2, 3];
var mp = {
  name: "John"
};
symbol_pred(symb);
list_pred(lst);
map_pred(mp);
nil_pred(null);
var list_numbers = [1, 2, 3, 4, 5];
first(list_numbers);
rest(list_numbers);
next(list_numbers);
seq(list_numbers);
empty_pred([]);
empty_pred(list_numbers);
var xs = [1, 2, 3];
var ys = [4, 5, 6];
conj(xs, 4);
concat(xs, ys);
concat(xs, [], ys);
var xs2 = [1, 2, 3];
var ys2 = [4, 5, 6];
conj(xs2, 4);
concat(xs2, ys2);
concat(xs2, [], ys2);
var first_name = "John";
var last_name = "Doe";
var full_name = first_name + " " + last_name;
console.log(full_name);
var age = 30;
var bio = full_name + " is " + age + " years old";
console.log(bio);
var score = 95;
var max_score = 100;
var percentage = score / max_score * 100;
var result_message = "Score: " + score + "/" + max_score + " (" + percentage + "%)";
console.log(result_message);
var items = ["apple", "banana", "orange"];
var item_count = items.length;
var summary = "Found " + item_count + " items: " + get(items, 0) + ", " + get(items, 1) + ", " + get(items, 2);
console.log(summary);
(function(x) {
  return function(y) {
    return function(z) {
      return x + y + z;
    }(30);
  }(20);
})(10);
(function(x) {
  return console.log(x + 5);
})(10);
(function(x) {
  return function(y) {
    return x + y;
  }(20);
})(10);
(function(outer) {
  return function(inner) {
    return outer * inner;
  }(outer + 2);
})(5);
(function(sum2) {
  return function(product) {
    return list(sum2, product);
  }(4 * 5);
})(2 + 3);
var calculate = function(base) {
  return function(squared) {
    return function(cubed) {
      return squared + cubed;
    }(squared * base);
  }(base * base);
};
get(calculate, 3);
var get_number = function() {
  return 42;
};
var get_nothing = function() {
  return null;
};
var get_zero = function() {
  return 0;
};
var get_string = function() {
  return "Hello";
};
var test_if_let_truthy_number = function() {
  return function(x) {
    return x ? "Got number: " + x : "No number";
  }(get_number());
};
var test_if_let_nil = function() {
  return function(x) {
    return x ? "Got something: " + x : "Got nothing";
  }(get_nothing());
};
var test_if_let_zero = function() {
  return function(x) {
    return x ? "Got zero: " + x : "Zero is considered falsy";
  }(get_zero());
};
var test_if_let_string = function() {
  return function(x) {
    return x ? "Got string: " + x : "No string";
  }(get_string());
};
var test_if_let_nested = function() {
  return function(x) {
    return x ? function(y) {
      return y ? "Nested test: x = " + x + ", y = " + y : "Nested test: x = " + x + ", no y";
    }(x > 40 ? get_string() : null) : "No number";
  }(get_number());
};
console.log(test_if_let_truthy_number());
console.log(test_if_let_nil());
console.log(test_if_let_zero());
console.log(test_if_let_string());
console.log(test_if_let_nested());
//# sourceMappingURL=hql_spec.js.map
