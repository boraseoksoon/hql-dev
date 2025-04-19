// TypeScript transformer module (b.ts)
// This file only imports HQL modules, but isn't imported by HQL files

// Import from HQL
import { hqlFunction } from './a.hql';

// TypeScript function that uses the HQL function
export function transformWithTs(x: number): number {
  console.log("TypeScript transformWithTs called with:", x);
  // Use the HQL function
  const hqlResult = hqlFunction(x);
  console.log("HQL result in TS:", hqlResult);
  
  // Do additional processing in TypeScript
  return hqlResult * 2;
}

// Format values
export function formatInTs(value: any): string {
  console.log("TypeScript formatInTs called with:", value);
  return `[TS] ${value}`;
}

// Export some constants
export const TS_VERSION = "1.0.0";
export const TS_NAME = "TypeScript Module B"; 