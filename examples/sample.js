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
