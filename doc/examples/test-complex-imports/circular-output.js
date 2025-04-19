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
export {
  myFunction
};
