// TypeScript module that imports from HQL and exports to JS (b.ts)

// Import from HQL module
import { hqlAdd, hqlMultiply, HQL_VERSION } from './a.hql';

// TypeScript function that uses HQL functionality
export function tsTransform(x: number): number {
  console.log("TypeScript tsTransform called with:", x);
  
  // Use the HQL functions
  const addResult = hqlAdd(x);
  console.log("HQL add result:", addResult);
  
  // Use another HQL function
  const multiplyResult = hqlMultiply(addResult, 2);
  console.log("HQL multiply result:", multiplyResult);
  
  return multiplyResult;
}

// TypeScript string utilities
export function tsFormat(input: string): string {
  return `[TS]: ${input}`;
}

export function tsUppercase(input: string): string {
  return input.toUpperCase();
}

// Export HQL version and own version
export { HQL_VERSION };
export const TS_VERSION = "2.0.0"; 