// stdlib.js - Core implementations in JavaScript

export function _take(n, coll) {
    return coll.slice(0, n);
}

// Map a function over a collection
export function _map(f, coll) {
  if (!coll) return [];
  return coll.map(f);
}

// Filter a collection with a predicate function
export function _filter(pred, coll) {
  if (!coll) return [];
  return coll.filter(pred);
}

// Reduce a collection with a function and initial value
export function _reduce(f, init, coll) {
  if (!coll) return init;
  return coll.reduce(f, init);
}

// Create a non-lazy range of numbers
export function _range(start, end, step = 1) {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  
  const result = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) {
      result.push(i);
    }
  } else {
    for (let i = start; i > end; i += step) {
      result.push(i);
    }
  }
  return result;
}

// Create a lazy range using JavaScript generators
export function* _rangeGenerator(start, end, step = 1) {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  
  if (step > 0) {
    for (let i = start; i < end; i += step) {
      yield i;
    }
  } else {
    for (let i = start; i > end; i += step) {
      yield i;
    }
  }
}

// Group collection elements by function results
export function _groupBy(f, coll) {
  if (!coll) return {};
  const result = {};
  for (const item of coll) {
    const key = String(f(item));
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

// Get keys from an object - a fundamental operation for working with maps
export function _keys(obj) {
  if (!obj) return [];
  return Object.keys(obj);
}