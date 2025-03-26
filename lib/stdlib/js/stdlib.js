// stdlib.js - Core implementations in JavaScript

/**
 * LazySeq - A class representing a lazy sequence
 */
export class LazySeq {
    constructor(producer) {
      this._producer = producer;  // Function that generates values
      this._realized = [];        // Cache of realized values
      this._exhausted = false;    // Track if we've reached the end
      this._iterating = false;    // Track if we're currently realizing values
    }
  
    // Get a specific index, realizing values up to that point
    get(index) {
      this._realize(index + 1);
      return index < this._realized.length ? this._realized[index] : null;
    }
  
    // Convert to array up to a certain size (or all if realized)
    toArray(maxSize = Infinity) {
      if (maxSize === Infinity && this._exhausted) {
        return [...this._realized];
      }
      this._realize(maxSize);
      return this._realized.slice(0, maxSize);
    }
  
    // Internal method to realize values up to a certain count
    _realize(count) {
      if (this._exhausted || this._realized.length >= count || this._iterating) {
        return;
      }
      this._iterating = true;
      try {
        const iterator = this._producer();
        while (this._realized.length < count && !this._exhausted) {
          const { value, done } = iterator.next();
          if (done) {
            this._exhausted = true;
            break;
          }
          this._realized.push(value);
        }
      } finally {
        this._iterating = false;
      }
    }
  
    // Make the sequence iterable
    [Symbol.iterator]() {
      let index = 0;
      const seq = this;
      return {
        next() {
          const value = seq.get(index);
          if (index < seq._realized.length) {
            index++;
            return { value, done: false };
          }
          return { done: true };
        }
      };
    }
  
    // Add slice compatibility with normal arrays
    slice(start, end) {
      if (end !== undefined) {
        this._realize(end);
      } else {
        this._realize(start || 0);
      }
      return this._realized.slice(start, end);
    }
  }
  
  /**
   * Create a lazy sequence from a generator function
   */
  export function lazySeq(generatorFn) {
    return new LazySeq(generatorFn);
  }
  
  /**
   * Take n elements from a collection.
   * Enhanced to handle both arrays and lazy sequences.
   */
  export function _take(n, coll) {
    if (!coll) return [];
    
    // Check if it's a LazySeq
    if (coll instanceof LazySeq) {
      return coll.toArray(n);
    }
    
    // Handle regular arrays
    return coll.slice(0, n);
  }
  
  /**
   * Create a non-lazy range of numbers (existing implementation)
   */
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
  
  /**
   * Create a lazy range using JavaScript generators
   * This is an enhanced version of the existing _rangeGenerator
   */
  export function _rangeGenerator(start, end, step = 1) {
    if (end === undefined) {
      end = start;
      start = 0;
    }
  
    return lazySeq(function* () {
      if (step > 0) {
        for (let i = start; i < end; i += step) {
          yield i;
        }
      } else {
        for (let i = start; i > end; i += step) {
          yield i;
        }
      }
    });
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