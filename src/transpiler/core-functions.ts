// src/transpiler/core-functions.ts
/**
 * Core functions for HQL data structures.
 * These functions are available in the runtime to support
 * the data structure operations.
 */

/**
 * Creates a list (array) from the given items
 */
export function createList(...items: any[]): any[] {
    return Array.from(items);
  }
  
  /**
   * Creates a vector (array) from the given items
   */
  export function createVector(...items: any[]): any[] {
    return [...items];
  }
  
  /**
   * Creates a map (object) from key-value entries
   */
  export function createMap(entries: [any, any][]): object {
    return Object.fromEntries(entries);
  }
  
  /**
   * Creates a set from the given items
   */
  export function createSet(...items: any[]): Set<any> {
    return new Set(items);
  }
  
  /**
   * Generate JavaScript prelude code that includes these core functions
   */
  export function generatePrelude(): string {
    return `
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  `;
  }