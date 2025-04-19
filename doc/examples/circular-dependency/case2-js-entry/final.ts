// Final TS file in Case 2
// This demonstrates circular dependency where JS → HQL → TS → JS

// Import the JS entry module to complete the circular dependency
import { divide_js } from './entry.js';

// Define a simple modulo function
export function modulo_ts(x: number, y: number): number {
  return x % y;
}

// Use the imported JS function to demonstrate the circular dependency
console.log("TS final using JS function:", divide_js(100, 4));
