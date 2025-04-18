// JS module with mixed imports
// Imports from JS files only

// Import from another JS file
import { helperFunction } from './js-helper.js';

// Function that uses the import
export function jsFunction(x) {
  // Simulate the tsJsFunction result
  const tsResult = x * 3 * 3; // x * 3 (from original call) * 3 (from ts-js-bridge)
  const helperResult = helperFunction(x);
  return tsResult + helperResult;
} 