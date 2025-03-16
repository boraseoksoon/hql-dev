
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

// ==== Type Predicates ====

/**
 * Check if value is a symbol (string in JS representation)
 * In HQL: (symbol? value)
 */
function symbol_pred(value) {
  return typeof value === 'string';
}

/**
 * Check if value is a list (array in JS representation)
 * In HQL: (list? value)
 */
function list_pred(value) {
  return Array.isArray(value);
}

/**
 * Check if value is a map (object in JS representation)
 * In HQL: (map? value)
 */
function map_pred(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Set);
}

/**
 * Check if value is null
 * In HQL: (nil? value)
 */
function nil_pred(value) {
  return value === null || value === undefined;
}

/**
 * Check if collection is empty
 * In HQL: (empty? coll)
 */
function empty_pred(coll) {
  if (coll == null) return true;
  if (Array.isArray(coll)) return coll.length === 0;
  if (coll instanceof Set) return coll.size === 0;
  if (typeof coll === 'object') return Object.keys(coll).length === 0;
  return false;
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
import * as other3Module from "/Users/seoksoonjang/Desktop/hql/examples/other3.js";
const other3 = (function () {
    const wrapper = other3Module.default !== undefined ? other3Module.default : {};
    for (const [key, value] of Object.entries(other3Module)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
const path = (function () {
    const wrapper = pathModule.default !== undefined ? pathModule.default : {};
    for (const [key, value] of Object.entries(pathModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
import * as chalkModule from "jsr:@nothing628/chalk";
const chalk = (function () {
    const wrapper = chalkModule.default !== undefined ? chalkModule.default : {};
    for (const [key, value] of Object.entries(chalkModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
console.log(chalk.red("chalk!"));
const joined_path = path.join("folder", "file.txt");
console.log(joined_path);
import * as lodashModule from "npm:lodash";
const lodash = (function () {
    const wrapper = lodashModule.default !== undefined ? lodashModule.default : {};
    for (const [key, value] of Object.entries(lodashModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
console.log(lodash.capitalize("is it working?"));
console.log(10 * 10 + 1);
console.log("js-adder : ", other3.js_add(10, 20));