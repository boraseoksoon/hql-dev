// src/interop.ts - Fixed to support both new and old import patterns

import { Env } from "./bootstrap.ts";

/**
 * jsImport performs a dynamic import of a module at runtime with Deno compatibility.
 * Supports both the original single-parameter and new multi-parameter patterns.
 */
export async function jsImport(nameOrSource: string, source?: string, env?: Env): Promise<any> {
  try {
    // Handle original single-parameter pattern
    if (source === undefined) {
      return await import(nameOrSource);
    }
    
    // Handle new multi-parameter pattern
    // With native npm support, we can use the source directly
    const module = await import(source);
    
    // If an environment is provided, register the module in it
    if (env) {
      // Define module in the environment instead of using registerModule
      // This is compatible with the Env type
      env.define(nameOrSource, module);
    }
    
    return module;
  } catch (error) {
    const errorSource = source || nameOrSource;
    console.error(`Import error for ${errorSource}:`, error);
    throw new Error(`Failed to import ${errorSource}: ${error.message}`);
  }
}

/**
 * jsExport marks a value for export and returns that same value.
 * This maintains the expression-oriented nature by ensuring exports
 * are expressions that yield their value.
 */
export function jsExport(name: string, value: any): any {
  // Return the value, maintaining expression-oriented nature
  return value;
}

/**
 * jsGet returns the property of an object.
 */
export function jsGet(obj: any, prop: string): any {
  return obj[prop];
}

/**
 * jsCall invokes a method on an object.
 */
export function jsCall(obj: any, method: string, ...args: any[]): any {
  if (typeof obj[method] !== "function") {
    throw new Error(`${method} is not a function`);
  }
  return obj[method](...args);
}