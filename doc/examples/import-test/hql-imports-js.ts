// .hql-cache/doc/examples/import-test/base.js
console.log("base.hql loaded");

// .hql-cache/doc/examples/import-test/hql-imports-js.ts
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
console.log("HQL importing JS test");
var result = get(void 0, 10);
console.log("Result:", result);
