// Final TS file in Case 1
// This demonstrates circular dependency where HQL → JS → TS → HQL

// Import the HQL entry module to complete the circular dependency
import { add_hql } from './entry.hql';

// Define a simple multiplication function
export function multiply_ts(x: number, y: number): number {
  return x * y;
}

// Use the imported HQL function to demonstrate the circular dependency
console.log("TS final using HQL function:", add_hql(3, 4));
