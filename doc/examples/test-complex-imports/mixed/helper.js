// JavaScript helper file imported by HQL

// Import from TS file to test JS -> TS interop
import { tsMultiply } from './utils.ts';

// Function that will be imported by HQL
export function jsFunction(num) {
  // Use the TS function to do some work
  return tsMultiply(num, 2);
} 