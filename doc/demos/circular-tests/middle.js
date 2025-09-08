// middle.js - Bridge file for circular dependency test
// This creates a circular dependency: HQL → JS → TS → HQL

// Import from JavaScript
import { processValue } from './end.js';

// Function that uses the TypeScript import
export function middle_js(a, b) {
  const sum = a + b;
  return processValue(sum);
}