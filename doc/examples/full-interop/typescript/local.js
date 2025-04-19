// TypeScript Local Module (converted to JavaScript)
// Demonstrates JavaScript importing HQL and JS

// Import from HQL file (showing JS -> HQL interop)
import { hqlRemoteFunction } from '../hql/remote.hql';

// Import from JS file (showing JS -> JS interop)
import { processData } from '../javascript/process.js';

// Define TypeScript interface as regular JavaScript object
export const tsInterfaceData = {
  name: "TypeScript User",
  age: 30,
  roles: ["developer", "tester"]
};

// Function that uses imports from HQL and JS
export function tsLocalFunction(x) {
  // Use the HQL imported function
  const hqlResult = hqlRemoteFunction(x);
  
  // Use the JS imported function
  const jsResult = processData(x, 'multiply');
  
  // Use plain string encoding instead of the imported one
  console.log("Processing in JS:", `Processing ${x}`);
  
  // Return combined result
  return hqlResult + jsResult;
}

// Function that will be imported by JS
export function tsProcessFunction(data, options) {
  const multiplier = options?.multiplier || 2;
  return data * multiplier;
}

// Export default for namespace imports
export default {
  tsLocalFunction,
  tsProcessFunction,
  version: "1.0.0"
}; 