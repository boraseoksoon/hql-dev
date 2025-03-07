// src/interop.ts

/**
 * jsImport performs a dynamic import of a module at runtime.
 * In macro expansion, however, we use it only as a marker.
 * For our transpiler, its behavior is not invoked—the IR transformation
 * handles import statements and generates static ESM imports.
 */
export async function jsImport(source: string): Promise<any> {
    // At runtime, you might want to dynamically import:
    return await import(source);
  }
  
  /**
   * jsExport is a no-op at runtime (export markers are handled by the transpiler).
   */
  export function jsExport(name: string, value: any): any {
    // This function is not used at runtime; it’s only for marking exports.
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
  