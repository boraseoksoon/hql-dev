// src/bundler.ts
import { parse } from "./parser.ts";
import { expandMacros } from "./macro.ts";
import { transformAST } from "./transformer.ts";
import { dirname, join } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Bundle an HQL file and its dependencies into JavaScript.
 * 
 * @param filePath Path to the HQL file
 * @param visited Set of already processed files to avoid circular dependencies
 * @param inModule Whether the HQL file is being imported as a module
 * @returns The bundled JavaScript code
 */
export async function bundleFile(
  filePath: string,
  visited = new Set<string>(),
  inModule = false
): Promise<string> {
  const realPath = await Deno.realPath(filePath);
  if (visited.has(realPath)) return "";
  visited.add(realPath);
  
  const source = await Deno.readTextFile(realPath);
  const ast = parse(source);
  const expanded = expandMacros(ast);
  const currentDir = dirname(realPath);
  
  // Transform the AST to JavaScript
  const transformed = await transformAST(expanded, currentDir, visited, {
    module: inModule ? 'commonjs' : 'esm' 
  }, inModule);
  
  return transformed;
}

/**
 * Bundle a JavaScript file that may import HQL modules.
 * 
 * @param filePath Path to the JavaScript file
 * @param visited Set of already processed files to avoid circular dependencies
 * @returns The bundled JavaScript code with HQL imports resolved
 */
export async function bundleJSModule(filePath: string, visited = new Set<string>()): Promise<string> {
  // Read the JavaScript file
  const source = await Deno.readTextFile(filePath);
  
  // Find all HQL imports
  const hqlImportRegex = /import\s+(\w+)\s+from\s+["']([^"']+\.hql)["'];/g;
  let processedSource = source;
  let match;
  
  while ((match = hqlImportRegex.exec(source)) !== null) {
    const [fullMatch, importName, importPath] = match;
    const fullPath = join(dirname(filePath), importPath);
    
    try {
      // Bundle the HQL file into a self-contained IIFE
      const hqlCode = await bundleFile(fullPath, visited, true);
      
      // Replace the import with an IIFE that simulates the module
      const iife = `
// HQL module bundled from ${importPath}
const ${importName} = (function() {
  const exports = {};
  ${hqlCode}
  return exports;
})();`;
      
      // Replace the import statement with the IIFE
      processedSource = processedSource.replace(fullMatch, iife);
    } catch (error) {
      console.error(`Error bundling HQL import ${importPath}:`, error);
      // Keep the original import if bundling fails
    }
  }
  
  return processedSource;
}