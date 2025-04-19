// JavaScript file that imports from both HQL and TypeScript
// This demonstrates JS -> HQL and JS -> TS imports

// Import from HQL
import { add, multiply, greet } from './math.hql';

// Import from TypeScript
import { operateAndGreet } from './main.ts';

// Test imported HQL functions
console.log("JS importing from HQL - Add:", add(30, 12));
console.log("JS importing from HQL - Multiply:", multiply(8, 7));
console.log("JS importing from HQL - Greet:", greet("JavaScript"));

// Test imported TS functions
console.log("JS importing from TS:", operateAndGreet("JS-TS-HQL Chain", 15, 25));

// Function that combines imports from both sources
function complexOperation(name, x, y) {
  const hqlResult = add(multiply(x, 2), multiply(y, 3));
  return operateAndGreet(name, x, hqlResult);
}

console.log("Complex operation result:", complexOperation("Complex JS Operation", 10, 20));

// Export for potential circular imports
export function jsFormatter(input) {
  return `[JS FORMAT] ${input}`;
} 