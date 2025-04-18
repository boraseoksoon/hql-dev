// Deep JS module
// This demonstrates cross-branch dependencies

// Import from a different branch in TypeScript
import { tsFunction } from '../ts-module.ts';

// Define a function that properly uses the TypeScript import
export function deepJsFunction(x) {
  return tsFunction(x) * 2;
} 