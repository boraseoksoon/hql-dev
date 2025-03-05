import * as advancedUtils_module from "./advanced-utils.js";
const advancedUtils = advancedUtils_module.default !== undefined ? advancedUtils_module.default : advancedUtils_module;
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
function main(name) {
  return "Main says: " + advancedUtils.process(name) + "\n" + "Version: " + advancedUtils.version;
}
console.log(main("World"))
export { main };
