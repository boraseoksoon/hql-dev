// Simple JavaScript Module
// Standalone with no complex imports

// Import from NPM for testing
import lodash from "npm:lodash";

// Function that will be imported by HQL
export function jsLocalFunction(x) {
  console.log("JS function processing:", x);
  
  // Use lodash
  const doubled = lodash.multiply(x, 2);
  
  // Return a result
  return doubled + 5;
}

// Export a default object as well
export default {
  jsLocalFunction,
  version: '1.0.0'
}; 