// Final step in circular dependency (c.js)
// This file is imported by b.ts and imports a.hql

// Import from HQL to complete the circular dependency
// Using explicit .hql extension to avoid confusion with .ts
import { hqlFunction } from './a.hql';

// JavaScript function that uses the HQL function
export function processInJS(x) {
  console.log("JavaScript function processInJS called with:", x);
  // Call the HQL function - this creates the circular dependency
  return hqlFunction(x);
}

// Format a value with prefix
export function formatValue(prefix, value) {
  console.log("JavaScript formatValue called with:", prefix, value);
  return `${prefix} ${value} (formatted in JS)`;
}

// Export information about this module
export const JS_INFO = {
  name: "JavaScript Module C",
  supportsCircular: true,
  version: "1.2.0"
}; 