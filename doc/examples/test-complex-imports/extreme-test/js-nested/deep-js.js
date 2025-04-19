// Deep JS module
// This demonstrates cross-branch dependencies

// Instead of importing from ts-module which creates a circular dependency
// implement the function directly
// import { tsFunction } from '../ts-module.ts';

// Define a function that works independently
export function deepJsFunction(x) {
  // Emulate the behavior of tsFunction without importing it
  // Original tsFunction adds 15 to the input
  return (x + 15) * 2; // Equivalent to tsFunction(x) * 2
} 