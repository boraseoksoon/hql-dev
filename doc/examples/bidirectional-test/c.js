// JavaScript module that imports from TypeScript (c.js)

// Import from TypeScript module
import { tsTransform, tsFormat, TS_VERSION, HQL_VERSION } from './b.ts';

// JavaScript function that uses TypeScript and indirectly HQL
export function jsProcess(value) {
  console.log("JavaScript jsProcess called with:", value);
  
  // Use the TypeScript function (which uses HQL functions)
  const result = tsTransform(value);
  console.log("TypeScript transform result:", result);
  
  // Use TypeScript formatting
  const formatted = tsFormat(`Processed value: ${result}`);
  console.log("TypeScript formatted string:", formatted);
  
  return {
    original: value,
    result: result,
    formatted: formatted
  };
}

// JavaScript-specific utilities
export function jsFormatJson(obj) {
  return JSON.stringify(obj, null, 2);
}

// Version info with both TypeScript and HQL versions
export const JS_VERSION_INFO = {
  jsVersion: "3.0.0",
  tsVersion: TS_VERSION,
  hqlVersion: HQL_VERSION,
  timestamp: new Date().toISOString()
}; 