// Final JS file in Case 3
// This demonstrates circular dependency where TS → HQL → JS → TS

// Import the TS entry module to complete the circular dependency
import { sqrt_ts } from './entry.ts';

// Define a simple logarithm function
export function log_js(x) {
  return Math.log10(x);
}

// Use the imported TS function to demonstrate the circular dependency
console.log("JS final using TS function:", sqrt_ts(16));
