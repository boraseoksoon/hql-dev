// JS module with mixed imports
// Imports from both HQL and other JS files

// Import from HQL file
import { tsJsFunction } from './ts-js-bridge.hql';

// Import from another JS file
import { helperFunction } from './js-helper.js';

// Function that uses both imports
export function jsFunction(x) {
  const tsResult = tsJsFunction(x * 3);
  const helperResult = helperFunction(x);
  return tsResult + helperResult;
} 