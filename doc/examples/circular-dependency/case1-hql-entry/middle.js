// Middle JS file in Case 1
// This demonstrates circular dependency where HQL → JS → TS → HQL

// Import the TypeScript file that will complete the cycle
import { multiply_ts } from './final.ts';

// Import the HQL module to create the circular dependency
import { add_hql } from './entry.hql';

// Define a simple function that uses the imported functions
export default function middle_js(x, y) {
  // Use the TypeScript function (will create circular dependency)
  const product = multiply_ts(x, y);
  
  // Use the HQL function (circular dependency back to entry)
  const sum = add_hql(x, y);
  
  // Return a simple result
  return `JS middle result: sum=${sum}, product=${product}`;
}
