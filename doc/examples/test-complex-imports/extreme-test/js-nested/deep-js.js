// Deep JS module
// This demonstrates cross-branch dependencies

// Import from a different branch
import { tsFunction } from '../ts-module.ts';

// Define a function that uses the import
export function deepJsFunction(x) {
  return tsFunction(x) * 2;
} 