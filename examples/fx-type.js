
function get(obj, key, notFound = null) {
  // Handle null/undefined case
  if (obj == null) return notFound;
  
  // Handle function case: call the function with key as argument
  if (typeof obj === 'function') {
    try {
      return obj(key);
    } catch (e) {
      // If function call fails, fall back to property access
      return (key in obj) ? obj[key] : notFound;
    }
  }
  
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
  
  // Handle objects (maps) - includes handling of numeric keys
  const propKey = typeof key === 'number' ? String(key) : key;
  return (propKey in obj) ? obj[propKey] : notFound;
}


function _add_impl(x: number = 100, y: number = 200): number {
    if (typeof x !== "number")
        throw new Error("Parameter 'x' must be a number (Int)");
    x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
    if (typeof y !== "number")
        throw new Error("Parameter 'y' must be a number (Int)");
    y = typeof y === "object" && y !== null ? JSON.parse(JSON.stringify(y)) : y;
    x = typeof(x) === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
    y = typeof(y) === "object" && y !== null ? JSON.parse(JSON.stringify(y)) : y;
    return x + y;
}
function add(...args): number {
    if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0]) && args[0].constructor === Object) {
        const opts = args[0];
        return _add_impl(opts.x !== undefined ? opts.x : 100, opts.y !== undefined ? opts.y : 200);
    }
    else {
        return _add_impl(args[0] !== undefined ? args[0] : 100, args[1] !== undefined ? args[1] : 200);
    }
}
add(100, 200);
add({
    x: 99
});
add({
    y: 99
});
add({
    x: 1,
    y: 2
});
console["log"](add(1, 2));
