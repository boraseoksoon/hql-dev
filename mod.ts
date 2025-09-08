// HQL - ESM module for JSR
// Minimal API for transpiling HQL to JavaScript

import { transpileToJavascript } from "./core/src/transpiler/hql-transpiler.ts";
import * as path from "jsr:@std/path@1";
import { transpileCLI } from "./core/src/bundler.ts";

export interface HQLModule {
  isHQL: (code: string) => boolean;
  transpile: (source: string, options?: any) => Promise<string>;
  run: (source: string, options?: { adapter?: (js: string) => any }) => Promise<any>;
  runFile?: (filePath: string, options?: { adapter?: (js: string) => any }) => Promise<any>;
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
 * @param source - HQL source code
 * @param options - Options including baseDir for resolving imports
 */
export async function transpile(
  source: string, 
  options: { baseDir?: string; currentFile?: string; [key: string]: any } = {}
): Promise<string> {
  // Default baseDir to current working directory if not provided
  const transpileOptions = {
    baseDir: options.baseDir || Deno.cwd(),
    currentFile: options.currentFile,
    ...options
  };
  const result = await transpileToJavascript(source, transpileOptions);
  return result.code;
}

/**
 * Run HQL code by transpiling and evaluating
 * @param source - HQL source code
 * @param options - Options including baseDir and optional adapter
 */
export async function run(
  source: string, 
  options: { baseDir?: string; currentFile?: string; adapter?: (js: string) => any; [key: string]: any } = {}
): Promise<any> {
  const js = await transpile(source, options);
  
  if (options.adapter) {
    // Use provided adapter (e.g., HLVM's eval context)
    return await options.adapter(js);
  }
  
  // Check if code has ESM imports/exports - if so, write the JS next to the source baseDir for correct relative resolution
  if ((js.includes('import ') && js.match(/^import\s+/m)) || (js.includes('export ') && js.match(/^export\s+/m))) {
    const baseDir = options.baseDir || Deno.cwd();
    const rtDir = path.resolve(baseDir, ".hql-cache/rt");
    try { await Deno.mkdir(rtDir, { recursive: true }); } catch { /* ignore */ }
    const fileName = `rt-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`;
    const outPath = path.resolve(rtDir, fileName);
    await Deno.writeTextFile(outPath, js);
    const fileUrl = new URL(`file://${outPath}`).href;
    const module = await import(fileUrl);
    return module.default || module;
  }
  
  // Default: eval in isolated scope (for code without imports)
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction(js);
  return await fn();
}

/**
 * Convenience: Run an HQL file from disk with proper baseDir/currentFile
 */
export async function runFile(filePath: string, options: { adapter?: (js: string) => any; [key: string]: any } = {}): Promise<any> {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(Deno.cwd(), filePath);
  const code = await Deno.readTextFile(absPath);
  const baseDir = path.dirname(absPath);
  // First try the simple transpile + dynamic import path, which supports HTTP/JSR/npm imports at runtime
  try {
    return await run(code, { ...options, baseDir, currentFile: absPath });
  } catch (_simpleErr) {
    // If that fails (e.g., complex graphs needing bundling), fall back to bundler-based compile+run
    try {
      const outPath = await transpileCLI(absPath, undefined, { verbose: false, showTiming: false });
      const modUrl = "file://" + outPath;
      const m = await import(modUrl);
      return m?.default ?? m;
    } catch (e) {
      throw e;
    }
  }
}

export const version = "7.8.11";

const hql: HQLModule = { isHQL, transpile, run, runFile, version } as HQLModule;
export default hql;
