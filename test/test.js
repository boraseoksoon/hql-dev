function getProp(obj, prop) {
  return Reflect.get("obj", prop);
}
function setProp_(obj, prop, val) {
  return Reflect.set(obj, prop, val);
}
function hasProp_p(obj, prop) {
  return Object.prototype.hasOwnProperty.call("obj", prop);
}
function first(coll) {
  return (count(coll) === 0) ? null : Array.prototype.at.call("coll", 0);
}
function second(coll) {
  return (count(coll) < 2) ? null : Array.prototype.at.call("coll", 1);
}
function third(coll) {
  return (count(coll) < 3) ? null : Array.prototype.at.call("coll", 2);
}
function rest(coll) {
  return Array.prototype.slice.call("coll", 1);
}
function contains_p(coll, item) {
  return (Array.prototype.indexOf.call("coll", item) >= 0);
}
function map(f, coll) {
  return Array.prototype.map.call("coll", f);
}
function filter(pred, coll) {
  return Array.prototype.filter.call("coll", pred);
}
function forEach(f, coll) {
  return Array.prototype.forEach.call("coll", f);
}
function slice(coll, start, _rest, end) {
  return empty_p(end) ? Array.prototype.slice.call("coll", start) : Array.prototype.slice.call(coll, start, first(end));
}
function nth(coll, idx) {
  return (idx >= count(coll)) ? null : Array.prototype.at.call("coll", idx);
}
function position(item, coll) {
  return Array.prototype.indexOf.call("coll", item);
}
const print = console.log;
const print = print;
function hasDefaultValue_p(param) {
  if (list_p(param)) if ((count(param) > 2)) {
  const eqSymbol = symbol("=");
  const eqPos = position("eqSymbol", param);
  return (eqPos >= 0);
} else false else false
}
function hasTypeAnnotation_p(param) {
  return and(list_p(param), (count(param) > 2), (nth("param", 1) === '));
}
function paramName(param) {
  return list_p(param) ? nth("param", 0) : param;
}
function paramType(param) {
  return and(list_p(param), hasTypeAnnotation_p(param)) ? nth("param", 2) : null;
}
function hasDefaultValue_p(param) {
  return and(list_p(param), (count(param) > 2), {
  const eqPos = position("'=", param);
  return not((eqPos === -1));
});
}
function paramDefaultValue(param) {
  if (and(list_p(param), hasDefaultValue_p(param))) {
  const eqPos = position("'=", param);
  return nth("param", (eqPos + 1));
} else null
}
function isNamedParam_p(param) {
  return symbol_p(param) ? endsWith_p(`${param}`, ":") : and(list_p(param), symbol_p(first(param)), endsWith_p(first(param), ":"));
}
function normalizeParamName(name) {
  return endsWith_p(`${name}`, ":") ? substring(`${name}`, 0, (count(`${name}`) - 1)) : `${name}`;
}
function reduce(coll, f, init) {
  return Array.prototype.reduce.call(coll, f, init);
}
function map(f, coll) {
  return Array.prototype.map.call("coll", f);
}
function filter(pred, coll) {
  return Array.prototype.filter.call("coll", pred);
}
const print = console.log;
const print = print;
function average(nums) {
  {
  const sum = reduce(nums, function(acc, val) {
  return (acc + val);
}, 0);
  const count = nums.length;
  return (sum / count);
}
}
print([1, 2, 3, 4, 5])
print(average([1, 2, 3, 4, 5]))
