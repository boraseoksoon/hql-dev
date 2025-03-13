// examples/sample.js
function get(obj, key, notFound = null) {
  if (obj == null)
    return notFound;
  if (typeof obj === "function") {
    try {
      return obj(key);
    } catch (e) {
      return key in obj ? obj[key] : notFound;
    }
  }
  if (Array.isArray(obj)) {
    return typeof key === "number" && key >= 0 && key < obj.length ? obj[key] : notFound;
  }
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
get(big_double, 20);
