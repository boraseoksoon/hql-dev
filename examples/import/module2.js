// hql:/Users/seoksoonjang/Desktop/hql/examples/import/module1.hql
var add = function(x, y) {
  return x + y;
};
var multiply = function(x, y) {
  return x * y;
};
var divide = function(x, y) {
  return x / y;
};

// examples/import/module2.js
console.log("2 + 3 =", add(2, 3));
console.log("4 * 5 =", multiply(4, 5));
console.log("10 / 2 =", divide(10, 2));
