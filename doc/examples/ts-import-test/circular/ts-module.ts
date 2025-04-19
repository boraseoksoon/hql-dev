// TypeScript module with a dependency on an HQL file
// This demonstrates circular dependencies between TS and HQL

// Import from the HQL file
// This will be processed when the file is imported
import { hqlFunction } from './hql-module.hql';

// TypeScript function that uses the HQL import
export function tsFunction(x: number): number {
  console.log("TypeScript function called with:", x);
  // Use the HQL function inside the TypeScript function
  return hqlFunction(x) * 2;
}

// Export a constant
export const TS_CONSTANT = "Hello from TypeScript";

// Default export
export default {
  version: "1.0.0",
  name: "ts-hql-circular-test"
}; 