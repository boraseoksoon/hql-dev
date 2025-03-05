import * as jsMod_module from "./js-module.js";
const jsMod = jsMod_module.default !== undefined ? jsMod_module.default : jsMod_module;
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
console.log(jsMod.jsHello("yo interop"))
