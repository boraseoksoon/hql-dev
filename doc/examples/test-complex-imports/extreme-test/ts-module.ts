// TypeScript module
// Demonstrates TS integration with HQL

// Define a function with TypeScript types
export function tsFunction(x: number): number {
  return x + 15;
}

// This is a stub that would normally use hqlFunction
export function tsUsingHqlFunction(x: number): number {
  // We would normally import and use hqlFunction here,
  // but to avoid circular dependencies, we implement directly
  return (x * 2) + 5; // Same logic as hqlFunction for testing
}

// Export as default
export default {
  tsFunction,
  tsUsingHqlFunction,
  multiplyBy: (x: number, y: number): number => x * y
}; 