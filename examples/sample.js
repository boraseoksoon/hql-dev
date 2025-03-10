
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
const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
console.log("Vector:", numbers);
const doubled = numbers.map(function (n) {
    return n * 2;
});
console.log("Doubled:", doubled);
const evens = numbers.filter(function (n) {
    return n % 2 === 0;
});
console.log("Even numbers:", evens);
const sum = numbers.reduce(function (acc, n) {
    return acc + n;
}, 0);
console.log("Sum of numbers:", sum);
const processed = numbers.filter(function (n) {
    return n > 3;
})(_map, function (n) {
    return n * 3;
})(_slice, 0, 3);
console.log("Processed:", processed);
