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
 * Synchronous transpile for simple HQL expressions (no imports)
 * Used for REPL integration where async is not available
 */
export function transpileSync(source: string): string {
  // Import the synchronous parts we need
  const { parse } = transpileToJavascriptSync.parse;
  const { transformSyntax } = transpileToJavascriptSync.transformSyntax;
  
  try {
    // Parse HQL to S-expressions
    const sexp = parse(source);
    if (!sexp || sexp.length === 0) {
      return source;
    }
    
    // Transform S-expressions to JavaScript AST
    const jsAst = transformSyntax(sexp[0]);
    
    // Generate JavaScript code
    return generateCode(jsAst);
  } catch (e) {
    // Fallback to simple transformation for basic expressions
    return simpleTranspile(source);
  }
}

// Helper for simple transpilation when full parser isn't available
function simpleTranspile(source: string): string {
  try {
    let js = source
      .replace(/^\(/, '')  
      .replace(/\)$/, '')  
      .trim();
    
    const parts = js.split(/\s+/);
    if (parts.length >= 2) {
      const [op, ...args] = parts;
      
      // Handle basic operators
      if (['+', '-', '*', '/', '=', '!=', '<', '>', '<=', '>='].includes(op)) {
        const jsOp = op === '=' ? '===' : op === '!=' ? '!==' : op;
        return args.join(` ${jsOp} `) + ';';
      }
      
      // Handle function calls
      return `${op}(${args.join(', ')});`;
    }
    
    return js + ';';
  } catch {
    return source;
  }
}

// Sync imports needed for transpileSync
const transpileToJavascriptSync = {
  parse: (() => {
    // Simplified sync parser for basic S-expressions
    return function parse(source: string) {
      // Very basic S-expression parser
      if (!source.startsWith('(')) return null;
      // This would need the actual parser logic
      return [{ type: 'list', value: source }];
    };
  })(),
  transformSyntax: (sexp: any) => {
    // Simplified transform
    return { type: 'Program', body: [] };
  }
};

function generateCode(ast: any): string {
  // Simplified code generator
  return '// Generated JS';
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
  
  // Add runtime get function for HQL
  const getFunction = `
// Runtime get function for HQL
function get(obj, key) {
  // If obj is a function, call it with the key as argument
  if (typeof obj === 'function') {
    return obj(key);
  }
  // Otherwise, treat it as property access
  return obj[key];
}
`;
  
  return getFunction + result.code;
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

export const version = "7.8.20";

const hql: HQLModule = { isHQL, transpile, run, runFile, version } as HQLModule;
export default hql;
