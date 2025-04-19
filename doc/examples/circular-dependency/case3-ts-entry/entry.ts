// Case 3: TS as entry point
// This demonstrates circular dependency where TS → HQL → JS → TS

// Import the HQL file that will be part of the cycle
import { power_hql } from "./middle.hql";

// Define a simple square root function
export function sqrt_ts(x: number): number {
  return Math.sqrt(x);
}

// Test the circular dependency
console.log("TS Entry result:", power_hql(2, 8));
