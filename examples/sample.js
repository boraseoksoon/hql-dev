
// Helper for property access
function getProperty(obj, prop) {
  const member = obj[prop];
  return typeof member === "function" ? member.bind(obj) : member;
}

// Collection access function
function get(obj, key, notFound = null) {
  if (obj == null) return notFound;
  
  // Handle arrays (vectors)
  if (Array.isArray(obj)) {
    return (typeof key === 'number' && key >= 0 && key < obj.length) 
      ? obj[key] 
      : notFound;
  }
  
  // Handle Sets
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  
  // Handle objects (maps)
  return (key in obj) ? obj[key] : notFound;
}
[1, 2, 3, 4, 5];
new Set([1, 2, 3, 4, 5]);
({
    key: "value"
});
[1, 2, 3, 4, 5];
const json = {
    items: [1, 2, 3, 4, 5]
};
(function () {
    const _obj = json;
    const _member = _obj["items"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
})();
const data = {
    items: [5, 10, 15, 20, 25, 30, 35, 40],
    factor: 2,
    prefix: "Value: "
};
(function () {
    const _obj = data;
    const _member = _obj["items"];
    return typeof _member === "function" ? _member.call(_obj) : _member;
})();
