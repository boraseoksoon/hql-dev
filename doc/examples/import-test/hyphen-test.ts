// .hql-cache/doc/examples/import-test/hyphen-functions.ts
function multiply_by_five(x) {
  return x * 5;
}
function add_ten(x) {
  return x + 10;
}
console.log("hyphen-functions.hql loaded");

// .hql-cache/doc/examples/import-test/hyphen-test.ts
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
console.log("Underscore identifiers test");
var result1 = get(multiply_by_five, 6);
var result2 = get(add_ten, 7);
console.log("multiply_by_five(6):", result1);
console.log("add_ten(7):", result2);
