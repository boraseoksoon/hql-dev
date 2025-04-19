// Case 2: JS as entry point
// This demonstrates circular dependency where JS → HQL → TS → JS

// Import the HQL file that will be part of the cycle
import { subtract_hql } from './middle.hql';

// Define a simple division function
export function divide_js(x, y) {
  return x / y;
}

// Test the circular dependency
console.log("JS Entry result:", subtract_hql(20, 5));
