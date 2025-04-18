// TypeScript module
// Demonstrates TS integration with HQL

// Import from HQL 
import { hqlFunction } from './hql-module.hql';

// Define a function with TypeScript types
export function tsFunction(x: number): number {
  return x + 15;
}

// Export as default
export default {
  tsFunction,
  multiplyBy: (x: number, y: number): number => x * y
}; 