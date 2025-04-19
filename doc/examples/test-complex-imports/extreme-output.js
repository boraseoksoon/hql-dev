var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/ts-module.ts
var ts_module_exports = {};
__export(ts_module_exports, {
  default: () => ts_module_default,
  tsFunction: () => tsFunction
});
function tsFunction(x) {
  return x + 15;
}
var ts_module_default = {
  tsFunction,
  multiplyBy: (x, y) => x * y
};

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/circular/b.ts
function incrementCircular(x) {
  return myFunction(x) + 1;
}
console.log("Direct result from b.hql:", myFunction(20));

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/circular/a.ts
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj === "function" && (typeof key === "number" || typeof key === "string" && !isNaN(key) || typeof key === "boolean" || key === null || key === void 0 || Array.isArray(key) || typeof key === "object")) {
    return obj(key);
  }
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
function myFunction(x) {
  return x + 10;
}
function getValueFromFunction(x) {
  return myFunction(x);
}
console.log("Result of function call:", getValueFromFunction(5));
console.log("Result of circular import function:", get(incrementCircular, 10));
var myCollection = ["a", "b", "c"];
console.log("Element from collection:", get(myCollection, 1));

// ../doc/examples/test-complex-imports/extreme-test/js-helper.js
function helperFunction(x) {
  return x * 5;
}

// ../.hql-cache/doc/examples/test-complex-imports/extreme-test/entry-simpler.ts
var moduleTs = function() {
  const wrapper = ts_module_default !== void 0 ? ts_module_default : {};
  for (const [key, value] of Object.entries(ts_module_exports)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
function hqlFunction(x) {
  return x * 2 + 5;
}
function jsFunction(x) {
  return x * 3 + helperFunction(x);
}
function extremeFunction() {
  let hqlResult = hqlFunction(10);
  let jsResult = jsFunction(20);
  let tsResult = moduleTs.tsFunction(30);
  let circResult = myFunction;
  return hqlResult + jsResult + tsResult + circResult;
}
console.log("HQL result:", hqlFunction(5));
console.log("JS result:", jsFunction(10));
console.log("TS result:", moduleTs.tsFunction(15));
console.log("Circular result:", myFunction);
console.log("Combined result:", extremeFunction());
export {
  extremeFunction
};
