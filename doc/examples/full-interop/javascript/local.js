// JavaScript Local Module
// Demonstrates JS importing from TS and HQL

// Import from TypeScript
import { tsProcessFunction } from '../typescript/local.ts';

// Import from HQL
import { hqlLocalFunction } from '../hql/local.hql';

// Import from remote source
import { deferred } from 'https://deno.land/std@0.224.0/async/deferred.ts';

// Import from NPM
import _ from 'npm:lodash@4.17.21';

// Function using TypeScript imported function
export function jsLocalFunction(x) {
  // Process with TypeScript function
  const tsResult = tsProcessFunction(x, { multiplier: 3 });
  
  // Process with HQL function
  const hqlResult = hqlLocalFunction(x / 2);
  
  // Use lodash
  const combined = _.sum([tsResult, hqlResult]);
  
  // Use Deno std lib
  const promise = deferred();
  promise.resolve(combined);
  
  console.log("JS processing complete:", combined);
  
  return combined;
}

// Function for the JS -> HQL -> TS circular reference
export function jsCircularFunction(input) {
  // Deliberately invoke circular reference
  return `JS circular: ${input * 2}`;
}

// This will be used by the process.js file
export function jsProcessData(data) {
  return data * 5;
}

// Export a default object as well
export default {
  jsLocalFunction,
  jsCircularFunction,
  version: '1.0.0'
}; 