// HQL - ESM module for JSR
// Minimal API for transpiling HQL to JavaScript

import { transpileToJavascript } from "./core/src/transpiler/hql-transpiler.ts";

export interface HQLModule {
  isHQL: (code: string) => boolean;
  transpile: (source: string, options?: any) => Promise<string>;
  run: (source: string, options?: { adapter?: (js: string) => any }) => Promise<any>;
  version: string;
}

/**
 * Check if a string looks like HQL code
 */
export function isHQL(code: string): boolean {
  const trimmed = code.trim();
  return trimmed.startsWith("(") || trimmed.startsWith("[");
}

/**
 * Transpile HQL source to JavaScript
 */
export async function transpile(source: string, options = {}): Promise<string> {
  const result = await transpileToJavascript(source, options);
  return result.code;
}

/**
 * Run HQL code by transpiling and evaluating
 */
export async function run(
  source: string, 
  options: { adapter?: (js: string) => any } = {}
): Promise<any> {
  const js = await transpile(source);
  
  if (options.adapter) {
    // Use provided adapter (e.g., HLVM's eval context)
    return await options.adapter(js);
  }
  
  // Check if code has imports - if so, use temp file + dynamic import
  if (js.includes('import ') && js.match(/^import\s+/m)) {
    // Create temp file and dynamically import it
    const tempFile = await Deno.makeTempFile({ suffix: '.mjs' });
    await Deno.writeTextFile(tempFile, js);
    try {
      // Use file:// URL to prevent JSR from rewriting the path
      const fileUrl = new URL(`file://${tempFile}`).href;
      const module = await import(fileUrl);
      return module.default || module;
    } finally {
      await Deno.remove(tempFile).catch(() => {});
    }
  }
  
  // Default: eval in isolated scope (for code without imports)
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction(js);
  return await fn();
}

export const version = "7.7.9";

const hql: HQLModule = { isHQL, transpile, run, version };
export default hql;