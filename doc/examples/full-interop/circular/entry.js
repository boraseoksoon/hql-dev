// TypeScript Circular Reference Entry (converted to JavaScript)
// This is imported by main.hql and demonstrates circular dependencies

// Import from JavaScript
import { jsCircularFunction } from '../javascript/local.js';

// Import from HQL
import { hqlCircularFunction } from './hql-circular.hql';

// Function with circular reference
export function circularResult() {
  // Call JavaScript function
  const jsResult = jsCircularFunction(100);
  
  // Call HQL function (which will call back to JavaScript)
  const hqlResult = hqlCircularFunction(200);
  
  return `JS circular result: JS=${jsResult}, HQL=${hqlResult}`;
}

// Function that will be called from HQL
export function tsCircularFunction(input) {
  console.log("JS circular function called with:", input);
  return `JS circular: ${input * 3}`;
}

// Default export
export default {
  circularResult,
  tsCircularFunction
}; 