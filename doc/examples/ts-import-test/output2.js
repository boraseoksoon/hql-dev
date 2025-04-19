// ../doc/examples/ts-import-test/ts-module.ts
function tsFunction(x) {
  return x * 3;
}

// ../.hql-cache/doc/examples/ts-import-test/entry2.ts
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
console.log("TS function result:", get(tsFunction, 10));
export {
  tsFunction
};
