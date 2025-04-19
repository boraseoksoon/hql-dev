// TypeScript Circular Reference Entry
// This is imported by main.hql and demonstrates circular dependencies

// Import from JavaScript
import { jsCircularFunction } from '../javascript/local.js';

// Import from HQL
import { hqlCircularFunction } from './hql-circular.hql';

// Function with circular reference
export function circularResult(): string {
  // Call JavaScript function
  const jsResult = jsCircularFunction(100);
  
  // Call HQL function (which will call back to TypeScript)
  const hqlResult = hqlCircularFunction(200);
  
  return `TS circular result: JS=${jsResult}, HQL=${hqlResult}`;
}

// Function that will be called from HQL
export function tsCircularFunction(input: number): string {
  console.log("TS circular function called with:", input);
  return `TS circular: ${input * 3}`;
}

// Default export
export default {
  circularResult,
  tsCircularFunction
}; 