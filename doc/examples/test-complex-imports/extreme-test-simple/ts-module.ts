// TypeScript module for extreme test
// Demonstrates TS integration with HQL

// Export a function with TypeScript typing
export function tsFunction(x: number): number {
  return x * 3;
}

// Export as default
export default {
  tsFunction,
  multiplyBy: (x: number, y: number): number => x * y
}; 