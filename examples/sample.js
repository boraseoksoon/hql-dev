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
function list(...items) {
  return items;
}
(function(x) {
  return function(y) {
    return function(z) {
      return console.log(x + y + z);
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
(function(sum) {
  return function(product) {
    return list(sum, product);
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
