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
function sum(nums) {
  return reduce(nums, function(acc, n) {
  return (acc + n);
}, 0);
}
log(sum(
  1,
  2,
  3,
  4,
  5
))
function greet(name, titles) {
  return log("Hello, " + (reduce(titles, function(acc, _) {
  return (acc + 1);
}, 0) === 0) ? name : reduce(titles, function(acc, title) {
  return `${acc} ${title}`;
}, "") + " " + name);
}
greet("Alice")
greet("Alice", "Dr.")
greet("Alice", "Dr.", "Professor")
