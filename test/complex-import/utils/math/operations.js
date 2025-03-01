function add(a, b) {
  return (a + b);
}
function subtract(a, b) {
  return (a - b);
}
function multiply(a, b) {
  return (a * b);
}
function divide(a, b) {
  return (a / b);
}
function square(x) {
  return (x * x);
}
function cube(x) {
  return ((x * x) * x);
}
function average(nums) {
  {
  const sum = reduce(nums, function(acc, val) {
  return (acc + val);
}, 0);
  const count = Array(nums.length);
  return (sum / count);
}
}
function calculate(value, factor) {
  {
  const squared = square(value);
  const multiplied = multiply(squared, factor);
  const result = add(multiplied, 10);
  return {input: value, factor: factor, squared: squared, multiplied: multiplied, result: result};
}
}
function reduce(array, fn, initial) {
  {
  const result = initial;
  Array(array.forEach, function(item) {
  return result = function() {
  return item;
};
})
  return result;
}
}
export { add };
export { subtract };
export { multiply };
export { divide };
export { square };
export { cube };
export { average };
export { calculate };
