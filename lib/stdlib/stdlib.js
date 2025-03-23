// stdlib.js - Core implementations in JavaScript

export function _take(n, coll) {
    return coll.slice(0, n);
}
  
export function _drop(n, coll) {
    return coll.slice(n);
}