// TypeScript file importing from HQL
// This demonstrates TS -> HQL direct imports

// Import functions from HQL file
import { add, multiply, greet } from './math.hql';

// Test imported functions
console.log("TS importing HQL - Add function:", add(5, 10));
console.log("TS importing HQL - Multiply function:", multiply(4, 6));
console.log("TS importing HQL - Greeting:", greet("HQL from TypeScript"));

// Create a derived function using HQL imports
function combineOperations(a: number, b: number): number {
  return add(a, multiply(a, b));
}

console.log("Combined operations result:", combineOperations(5, 3));

// Export a function that uses HQL imports for testing circular references
export function operateAndGreet(name: string, a: number, b: number): string {
  return `${greet(name)}, result: ${add(a, b)}`;
} 