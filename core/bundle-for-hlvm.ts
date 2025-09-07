#!/usr/bin/env -S deno run --allow-all

/**
 * Bundle HQL transpiler for embedding in HLVM
 * This creates a self-contained JavaScript module that can be embedded in the Go binary
 */

import { bundle } from "https://deno.land/x/emit@0.38.2/mod.ts";

// Create a wrapper module that exports the transpiler
const wrapperCode = `
// Re-export the main transpiler function
export { transpileToJavascript } from "./src/transpiler/hql-transpiler.ts";
export { parse } from "./src/transpiler/pipeline/parser.ts";
export { expandMacros } from "./src/s-exp/macro.ts";

// Export a simple interface for HLVM
export async function transpileHQL(source: string): Promise<string> {
  const { transpileToJavascript } = await import("./src/transpiler/hql-transpiler.ts");
  
  const result = await transpileToJavascript(source, {
    verbose: false,
    showTiming: false,
    baseDir: "/tmp/hql",
  });
  
  return result;
}

// Detection function
export function isHQL(code: string): boolean {
  const trimmed = code.trim();
  // HQL starts with parenthesis (S-expression)
  return trimmed.startsWith("(") || trimmed.startsWith("[");
}

// Version info
export const HQL_VERSION = "1.0.0";
`;

// Write the wrapper
await Deno.writeTextFile("./hlvm-wrapper.ts", wrapperCode);

console.log("Creating HLVM-compatible HQL bundle...");

// Bundle the wrapper with all dependencies
const result = await bundle("./hlvm-wrapper.ts", {
  type: "module",
  compilerOptions: {
    sourceMap: false,
    inlineSourceMap: false,
  },
});

// Add HLVM integration code
const hlvmBundle = `
// HQL Transpiler Bundle for HLVM
// Auto-generated - Do not edit

${result.code}

// Global registration for HLVM
if (typeof globalThis.hlvm === 'undefined') {
  globalThis.hlvm = globalThis.hlvm || {};
}

globalThis.hlvm.hql = {
  transpile: transpileHQL,
  isHQL: isHQL,
  version: HQL_VERSION,
  
  // Process input (auto-detect HQL vs JS)
  async processInput(code) {
    if (isHQL(code)) {
      // Transpile HQL to JavaScript
      return await transpileHQL(code);
    }
    // Return JS/TS as-is
    return code;
  }
};

console.log("HQL Transpiler loaded into HLVM (version " + HQL_VERSION + ")");

export { transpileHQL, isHQL, HQL_VERSION };
`;

// Write the bundled file
const outputPath = "../hql-transpiler-bundle.js";
await Deno.writeTextFile(outputPath, hlvmBundle);

// Get file size
const fileInfo = await Deno.stat(outputPath);
const sizeMB = (fileInfo.size / 1024 / 1024).toFixed(2);

console.log(`✅ Bundle created: ${outputPath}`);
console.log(`📦 Bundle size: ${sizeMB} MB`);
console.log(`
The bundle exports:
- transpileHQL(source: string): Promise<string>
- isHQL(code: string): boolean  
- HQL_VERSION: string

It also registers itself as globalThis.hlvm.hql for easy access.
`);

// Cleanup
await Deno.remove("./hlvm-wrapper.ts");