// ../doc/examples/test-complex-imports/mixed/utils.ts
function tsMultiply(a, b) {
  return a * b;
}
function tsFunction(num) {
  return tsMultiply(num, 3);
}

// ../.hql-cache/doc/examples/test-complex-imports/mixed/helper.js
function jsFunction(num) {
  return tsMultiply(num, 2);
}

// ../.hql-cache/doc/examples/test-complex-imports/mixed/entry.ts
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
function mixedFunction() {
  let jsResult = get(jsFunction, 10);
  let tsResult = get(tsFunction, 20);
  return jsResult + tsResult;
}
console.log("Result of mixed function:", mixedFunction());
export {
  mixedFunction
};
