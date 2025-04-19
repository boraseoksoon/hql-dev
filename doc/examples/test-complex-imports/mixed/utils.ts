// TypeScript utility file imported by both HQL and JS

// Import from HQL to test TS -> HQL interop (this creates a circular import path)
import { mixedFunction } from './entry.hql';

// Helper function that will be used by JS
export function tsMultiply(a: number, b: number): number {
  return a * b;
}

// Function that will be imported by HQL
export function tsFunction(num: number): number {
  // Call a helper function to process the input
  return tsMultiply(num, 3);
}

// Function that demonstrates the circular import
export function testCircularImport(): number {
  console.log("Testing circular import from TypeScript");
  // This would call the HQL-defined function
  return mixedFunction ? mixedFunction() : 0;
}

// Also export a type for completeness
export interface DataType {
  id: number;
  value: string;
} 