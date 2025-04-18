// deep-level3.ts - Third level in the deep nesting test

// Import directly from HQL file
import { addTen } from './deep-level4.hql';

// Define a function that uses the import
export function calculateValue(x: number): number {
  return addTen(x) + 15;
}

// Define another utility function
export function square(x: number): number {
  return x * x;
}

console.log("deep-level3.ts loaded"); 