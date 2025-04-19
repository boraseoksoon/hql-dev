// TypeScript Local Module
// Demonstrates TypeScript importing HQL and JS

// Import from HQL file (showing TS -> HQL interop)
import { hqlRemoteFunction } from '../hql/remote.hql';

// Import from JS file (showing TS -> JS interop)
import { processData } from '../javascript/process.js';

// Import from remote source
import { encode } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

// Define TypeScript interface (to be imported in HQL)
export interface Person {
  name: string;
  age: number;
  roles: string[];
}

// Example implementation
export const tsInterface: Person = {
  name: "TypeScript User",
  age: 30,
  roles: ["developer", "tester"]
};

// Function that uses imports from HQL and JS
export function tsLocalFunction(x: number): number {
  // Use the HQL imported function
  const hqlResult = hqlRemoteFunction(x);
  
  // Use the JS imported function
  const jsResult = processData(x, 'multiply');
  
  // Use the remote import
  console.log("Encoded in TS:", encode(new TextEncoder().encode(`Processing ${x}`)));
  
  // Return combined result
  return hqlResult + jsResult;
}

// Function that will be imported by JS
export function tsProcessFunction(data: any, options?: { multiplier?: number }): any {
  const multiplier = options?.multiplier || 2;
  return data * multiplier;
}

// Export default for namespace imports
export default {
  tsLocalFunction,
  tsProcessFunction,
  version: "1.0.0"
}; 