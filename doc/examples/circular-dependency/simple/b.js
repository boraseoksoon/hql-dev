// Simple circular dependency test - File B (JS)

// Import from file A, creating circular dependency
import { multiply_hql } from './a.hql';

// Define a simple function
function add_js(x, y) {
  return x + y;
}

// Export the function
export default add_js;

// Use the imported function
console.log("Result from JS file:", multiply_hql(5, 10));
