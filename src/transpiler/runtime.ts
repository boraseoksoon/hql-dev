export const RUNTIME_FUNCTIONS = `
// Enhanced runtime functions for HQL transpilation

/**
 * Helper for property access
 */
function getProperty(obj, prop) {
  const member = obj[prop];
  return typeof member === "function" ? member.bind(obj) : member;
}

/**
 * Collection access function - get an element from a collection
 */
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

// ==== Sequence Operations ====

/**
 * Get the first item in a collection
 * In HQL: (first coll)
 */
function first(coll) {
  if (coll == null) return null;
  if (Array.isArray(coll) && coll.length > 0) return coll[0];
  return null;
}

/**
 * Get all items except the first
 * In HQL: (rest coll)
 */
function rest(coll) {
  if (coll == null) return [];
  if (Array.isArray(coll)) return coll.slice(1);
  return [];
}

/**
 * Get all items except the first, or null if collection has less than 2 items
 * In HQL: (next coll)
 */
function next(coll) {
  if (coll == null) return null;
  if (Array.isArray(coll) && coll.length > 1) return coll.slice(1);
  return null;
}

/**
 * Convert to a sequence or null if empty
 * In HQL: (seq coll)
 */
function seq(coll) {
  if (coll == null) return null;
  if (Array.isArray(coll)) return coll.length > 0 ? coll : null;
  if (coll instanceof Set) return coll.size > 0 ? Array.from(coll) : null;
  if (typeof coll === 'object') {
    const entries = Object.entries(coll);
    return entries.length > 0 ? entries : null;
  }
  return null;
}

/**
 * Add items to a collection
 * In HQL: (conj coll & items)
 */
function conj(coll, ...items) {
  if (coll == null) return items;
  if (Array.isArray(coll)) return [...coll, ...items];
  if (coll instanceof Set) {
    const newSet = new Set(coll);
    items.forEach(item => newSet.add(item));
    return newSet;
  }
  if (typeof coll === 'object') {
    return { ...coll, ...Object.fromEntries(items) };
  }
  return coll;
}

/**
 * Combine collections
 * In HQL: (concat & colls)
 */
function concat(...colls) {
  return [].concat(...colls.map(coll => 
    coll == null ? [] : Array.isArray(coll) ? coll : [coll]
  ));
}

/**
 * Create a list from arguments
 * In HQL: (list & items)
 */
function list(...items) {
  return items;
}
`;