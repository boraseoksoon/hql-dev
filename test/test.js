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
function average(nums) {
  {
  const sum = reduce(nums, function(acc, val) {
  return (acc + val);
}, 0);
  const count = nums.length;
  return (sum / count);
}
}
log([1, 2, 3, 4, 5])
log(average([1, 2, 3, 4, 5]))
