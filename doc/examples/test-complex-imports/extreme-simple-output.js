var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../doc/examples/test-complex-imports/extreme-test-simple/ts-module.ts
var ts_module_exports = {};
__export(ts_module_exports, {
  default: () => ts_module_default,
  tsFunction: () => tsFunction
});
function tsFunction(x) {
  return x * 3;
}
var ts_module_default = {
  tsFunction,
  multiplyBy: (x, y) => x * y
};

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test-simple/circular/a.ts
var baseValue = 10;
function add5(value) {
  return value + 5;
}
function circularFunction() {
  let result = add5(baseValue);
  console.log("Calculation result:", result);
  return result;
}
circularFunction();

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test-simple/entry.ts
var moduleTs = function() {
  const wrapper = ts_module_default !== void 0 ? ts_module_default : {};
  for (const [key, value] of Object.entries(ts_module_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
function extremeFunction() {
  let tsResult = moduleTs.tsFunction(30);
  let circResult = circularFunction();
  return tsResult + circResult;
}
console.log("TS module result:", moduleTs.tsFunction(15));
console.log("Circular result:", circularFunction());
console.log("Combined result:", extremeFunction());
export {
  extremeFunction
};
