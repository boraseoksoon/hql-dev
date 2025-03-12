// examples/sample.js
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (Array.isArray(obj)) {
    return typeof key === "number" && key >= 0 && key < obj.length ? obj[key] : notFound;
  }
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  return key in obj ? obj[key] : notFound;
}
var symb = "hello";
var lst = [1, 2, 3];
var mp = {
  name: "John"
};
symbol_pred(symb);
list_pred(lst);
map_pred(mp);
nil_pred(null);
var numbers = [1, 2, 3, 4, 5];
first(numbers);
rest(numbers);
next(numbers);
seq(numbers);
empty_pred([]);
empty_pred(numbers);
var xs = [1, 2, 3];
var ys = [4, 5, 6];
conj(xs, 4);
concat(xs, ys);
concat(xs, [], ys);
var xs2 = [1, 2, 3];
var ys2 = [4, 5, 6];
conj(x2s, 4);
concat(xs2, ys2);
concat(xs2, [], ys2);
(function(x) {
  return x + 5;
})(10);
(function(x) {
  return x + y;
})(10);
(function(outer) {
  return function(inner) {
    return outer * inner;
  }(outer + 2);
})(5);
(function(sum) {
  return list(sum, product);
})(2 + 3);
var calculate = function(base) {
  return function(squared) {
    return squared + cubed;
  }(base * base);
};
get(calculate, 3);
