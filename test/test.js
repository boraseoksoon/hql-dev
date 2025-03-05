function first(coll) {
  return (Array.prototype.length.call(coll) === 0) ? null : Array.prototype.at.call("coll", 0);
}
function second(coll) {
  return (Array.prototype.length.call(coll) < 2) ? null : Array.prototype.at.call("coll", 1);
}
function third(coll) {
  return (Array.prototype.length.call(coll) < 3) ? null : Array.prototype.at.call("coll", 2);
}
function rest(coll) {
  return Array.prototype.slice.call("coll", 1);
}
function count(coll) {
  return or((coll === null), (coll === undefined)) ? 0 : Array.prototype.length.call(coll);
}
function empty?(coll) {
  return (count(coll) === 0);
}
function contains?(coll, item) {
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
function reduce(coll, f, init) {
  return Array.prototype.reduce.call(coll, f, init);
}
function concat(&, colls) {
  return Array.prototype.concat.apply([], colls);
}
function append(coll, &, items) {
  return concat("coll", items);
}
function slice(coll, start, &, end) {
  return empty?(end) ? Array.prototype.slice.call("coll", start) : Array.prototype.slice.call(coll, start, first(end));
}
function nth(coll, idx) {
  return (idx >= count(coll)) ? null : Array.prototype.at.call("coll", idx);
}
function position(item, coll) {
  return Array.prototype.indexOf.call("coll", item);
}
function mapcat(f, coll) {
  return reduce(map("f", coll), function(acc, items) {
  return concat("acc", items);
}, []);
}
function range(n) {
  {
  const result = [];
  map(function(var) {
  return result = append("result", i);
}, coll)
  return result;
}
}
function any?(pred, coll) {
  return Array.prototype.some.call("coll", pred);
}
function all?(pred, coll) {
  return Array.prototype.every.call("coll", pred);
}
function nil?(x) {
  return or((x === null), (x === undefined));
}
function symbol?(x) {
  return and(not(nil?(x)), Object.prototype.hasOwnProperty.call("x", "type"), (Object.prototype.get.call("x", "type") === "symbol"));
}
function list?(x) {
  return and(not(nil?(x)), Object.prototype.hasOwnProperty.call("x", "type"), (Object.prototype.get.call("x", "type") === "list"));
}
function string?(x) {
  return (typeof(x) === "string");
}
function number?(x) {
  return (typeof(x) === "number");
}
function boolean?(x) {
  return (typeof(x) === "boolean");
}
function function?(x) {
  return (typeof(x) === "function");
}
function str(&, args) {
  return reduce(args, function(acc, x) {
  return (acc + String(x));
}, "");
}
function substring(s, start, end) {
  return String.prototype.substring.call(s, start, end);
}
function endsWith?(s, suffix) {
  return String.prototype.endsWith.call("s", suffix);
}
function startsWith?(s, prefix) {
  return String.prototype.startsWith.call("s", prefix);
}
function toString(x) {
  return String(x);
}
function split(s, separator) {
  return String.prototype.split.call("s", separator);
}
function join(arr, separator) {
  return Array.prototype.join.call("arr", separator);
}
function getProp(obj, prop) {
  return Object.prototype.get.call("obj", prop);
}
function setProp!(obj, prop, val) {
  return Object.prototype.get.call("obj", prop) = val;
}
function hasProp?(obj, prop) {
  return Object.prototype.hasOwnProperty.call("obj", prop);
}
function keys(obj) {
  return Object.keys.call("Object", obj);
}
function abs(x) {
  return Math.abs(x);
}
function max(&, args) {
  return Math.max.apply("Math", args);
}
function min(&, args) {
  return Math.min.apply("Math", args);
}
function round(x) {
  return Math.round(x);
}
function identity(x) {
  return x;
}
function constantly(x) {
  return function() {
  return x;
};
}
function comp(f, g) {
  return function(&, args) {
  return f(apply("g", args));
};
}
function partial(f, &, args1) {
  return function(&, args2) {
  return apply("f", concat("args1", args2));
};
}
function not(x) {
  return x ? false : true;
}
function alwaysTrue(&, _) {
  return true;
}
function alwaysFalse(&, _) {
  return false;
}
function symbol(name) {
  return {type: "symbol", name: name};
}
function keyword(name) {
  return {type: "keyword", value: name};
}
function literal(value) {
  return {type: "literal", value: value};
}
function makeList(&, elements) {
  return {type: "list", elements: elements};
}
function hasTypeAnnotation?(param) {
  return and(list?(param), (count(param) > 2), (nth("param", 1) === '));
}
function paramName(param) {
  return list?(param) ? nth("param", 0) : param;
}
function paramType(param) {
  return and(list?(param), hasTypeAnnotation?(param)) ? nth("param", 2) : null;
}
function hasDefaultValue?(param) {
  return and(list?(param), (count(param) > 2), {
  const eqPos = position("'=", param);
  return not((eqPos === -1));
});
}
function paramDefaultValue(param) {
  if (and(list?(param), hasDefaultValue?(param))) {
  const eqPos = position("'=", param);
  return nth("param", (eqPos + 1));
} else null
}
function isNamedParam?(param) {
  return symbol?(param) ? endsWith?(`${param}`, ":") : and(list?(param), symbol?(first(param)), endsWith?(first(param), ":"));
}
function normalizeParamName(name) {
  return endsWith?(`${name}`, ":") ? substring(`${name}`, 0, (count(`${name}`) - 1)) : `${name}`;
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
