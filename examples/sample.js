
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
const x = 10;
x > 5 ? function () {
    return console.log("x is greater than 5");
}([]) : null;
x < 5 ? null : function () {
    return console.log("x is not less than 5");
}([]);
const x_plus_one = x + 1;
const x_minus_one = x - 1;
console.log(x_plus_one);
console.log(x_minus_one);
const x_plus_one2 = function (x) {
    return x + 1;
};
console.log(get(x_plus_one2, 1));
