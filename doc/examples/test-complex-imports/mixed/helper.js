// JavaScript helper file imported by HQL

// Import from JS file
import { processData } from './utils.js';

// Function that will be imported by HQL
export function jsFunction(num) {
  // Process an array with the num
  return processData([num, num * 2, num * 3]);
} 