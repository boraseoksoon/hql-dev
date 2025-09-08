// deep-level2.js - Second level in the deep nesting test

// Import from JavaScript file (third level)
import { calculateValue } from './deep-level3.js';

// Also import directly from an HQL file (mixing import types)
import { multiplyByTwo } from './utility.hql';

// Define function that uses the imports
export function processNumber(x) {
  const calculated = calculateValue(x);
  const multiplied = multiplyByTwo(calculated);
  return multiplied * 2;
}

console.log("deep-level2.js loaded"); 