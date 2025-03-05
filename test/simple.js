function reduce(coll, f, init) {
  return Array.prototype.reduce.call(coll, f, init);
}
function map(f, coll) {
  return Array.prototype.map.call(coll, f);
}
function filter(pred, coll) {
  return Array.prototype.filter.call(coll, pred);
}
const log = console.log;
function calculateArea(width, height) {
  return (width * height);
}
console.log("Area of 5x10 rectangle (fx): ", calculateArea(5, 10))
function add(x, y) {
  return (x + y);
}
console.log("Sum of 3 and 4 (defn): ", add(3, 4))
function processData(data, options) {
  return (data * options.factor);
}
console.log("Processed data (fx): ", processData(100, {factor: 1.5}))
