
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

// HQL Module: /Users/seoksoonjang/Desktop/hql/lib/lazy_seq.hql
const seq = (function() {
  const add = function(x, y) {
  return x + y;
};

  
  // Return module exports
  return {
    "add": add
  };
})();

undefined.log(undefined);
undefined.log(undefined);
