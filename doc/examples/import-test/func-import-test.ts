// .hql-cache/doc/examples/import-test/func-import.ts
function triple(x) {
  return x * 3;
}
console.log("func-import.hql loaded");

// .hql-cache/doc/examples/import-test/func-import-test.ts
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
function compose_triple(x) {
  const tripled = triple(x);
  return tripled + 5;
}
var direct_result = get(triple, 7);
console.log("Direct result:", direct_result);
var composed_result = compose_triple(7);
console.log("Composed result:", composed_result);
