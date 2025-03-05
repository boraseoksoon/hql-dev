function reduce(coll, f, init) {
  return Array.prototype.reduce.call(coll, f, init);
}
function map(f, coll) {
  return Array.prototype.map.call(coll, f);
}
function filter(pred, coll) {
  return Array.prototype.filter.call(coll, pred);
}
function log(&, rest) {
  return console.log.apply(console, rest);
}
log(
  1,
  2,
  3,
  4,
  5
)
