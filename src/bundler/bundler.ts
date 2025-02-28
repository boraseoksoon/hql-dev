// src/bundler.ts
import { parse } from "../transpiler/parser.ts";
import { expandMacros } from "../macro.ts";
import { transformAST } from "../transpiler/transformer.ts";
import { dirname, join, resolve, basename } from "https://deno.land/std@0.170.0/path/mod.ts";
import { HQLNode, ListNode, SymbolNode, LiteralNode } from "../transpiler/hql_ast.ts";

/**
 * A module with its dependencies
 */
interface Module {
  id: string;              // Module identifier
  path: string;            // Absolute path
  dependencies: Map<string, string>; // LocalImportId -> DependencyPath
  code: string;            // Transpiled code
}

/**
 * Extract HQL imports from an AST
 */
function extractImports(ast: HQLNode[]): Map<string, string> {
  const imports = new Map<string, string>();
  
  for (const node of ast) {
    if (node.type === "list") {
      const list = node as ListNode;
      
      // Check for (def moduleId (import "./path.hql"))
      if (list.elements.length >= 3 && 
          list.elements[0]?.type === "symbol" && 
          list.elements[0].name === "def" &&
          list.elements[1]?.type === "symbol" &&
          list.elements[2]?.type === "list" &&
          list.elements[2].elements.length >= 2 &&
          list.elements[2].elements[0]?.type === "symbol" &&
          list.elements[2].elements[0].name === "import" &&
          list.elements[2].elements[1]?.type === "literal") {
        
        const moduleId = (list.elements[1] as SymbolNode).name;
        const importPath = (list.elements[2].elements[1] as LiteralNode).value as string;
        
        if (importPath && importPath.endsWith('.hql')) {
          imports.set(moduleId, importPath);
        }
      }
    }
  }
  
  return imports;
}

/**
 * Fix higher-order function syntax in code
 */
function fixSpecialSyntax(code: string): string {
  // Fix $RETURN_FUNCTION placeholder
  const fixed = code.replace(/\$RETURN_FUNCTION\s*\(\s*(function\s*\([^)]*\))/g, 'return $1');
  
  return fixed;
}

/**
 * Process an HQL file and its dependencies
 */
async function processModule(
  filePath: string,
  allModules = new Map<string, Module>(),
  visited = new Set<string>()
): Promise<Module> {
  // Resolve to absolute path
  const absPath = resolve(filePath);
  
  // Return if already processed
  if (allModules.has(absPath)) {
    return allModules.get(absPath)!;
  }
  
  // Check for circular dependencies
  if (visited.has(absPath)) {
    throw new Error(`Circular dependency detected: ${absPath}`);
  }
  
  // Mark as visited for this processing chain
  visited.add(absPath);
  
  console.log(`Processing module: ${absPath}`);
  
  // Read the file
  const source = await Deno.readTextFile(absPath);
  
  // Parse the file
  const ast = parse(source);
  const expanded = expandMacros(ast);
  
  // Extract imports
  const imports = extractImports(expanded);
  const dependencies = new Map<string, string>();
  
  // Create a placeholder first to avoid infinite recursion
  const moduleId = basename(absPath, '.hql').replace(/[^a-zA-Z0-9_]/g, '_');
  allModules.set(absPath, {
    id: moduleId,
    path: absPath,
    dependencies,
    code: ""
  });
  
  // Process dependencies
  for (const [importId, importPath] of imports.entries()) {
    const fullPath = resolve(join(dirname(absPath), importPath));
    dependencies.set(importId, fullPath);
    
    // Process this dependency
    await processModule(fullPath, allModules, new Set([...visited]));
  }
  
  // Transform to JavaScript
  const currentDir = dirname(absPath);
  const transformed = await transformAST(expanded, currentDir, visited, {
    module: 'commonjs'  // Always use commonjs for modules
  }, true);
  
  // Fix any special syntax
  const fixedCode = fixSpecialSyntax(transformed);
  
  // Update the module with the real code
  allModules.get(absPath)!.code = fixedCode;
  
  return allModules.get(absPath)!;
}

/**
 * Perform topological sort on modules
 */
function sortModules(modules: Map<string, Module>): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();
  
  function visit(path: string) {
    if (temp.has(path)) {
      throw new Error(`Circular dependency detected: ${path}`);
    }
    
    if (visited.has(path)) return;
    
    temp.add(path);
    
    const module = modules.get(path);
    if (module) {
      for (const depPath of module.dependencies.values()) {
        visit(depPath);
      }
    }
    
    temp.delete(path);
    visited.add(path);
    result.push(path);
  }
  
  for (const path of modules.keys()) {
    if (!visited.has(path)) {
      visit(path);
    }
  }
  
  return result;
}

/**
 * Generate bundled code from processed modules
 */
function generateBundle(entryPath: string, modules: Map<string, Module>): string {
  const absEntryPath = resolve(entryPath);
  const entryModule = modules.get(absEntryPath);
  
  if (!entryModule) {
    throw new Error(`Entry module not found: ${entryPath}`);
  }
  
  // Get modules in dependency order
  const sortedPaths = sortModules(modules);
  
  // Generate code for each module
  let bundled = "";
  const moduleMap = new Map<string, string>(); // Maps path -> local variable name
  
  // Process all modules except the entry
  for (const path of sortedPaths) {
    // Skip entry module, we'll add it at the end
    if (path === absEntryPath) continue;
    
    const module = modules.get(path)!;
    
    // Use a unique name for the module
    const uniqueId = `__module_${basename(path, '.hql').replace(/[^a-zA-Z0-9_]/g, '_')}_${Math.floor(Math.random() * 10000)}`;
    moduleMap.set(path, uniqueId);
    
    // Generate the module code
    bundled += `const ${uniqueId} = (function() {\n`;
    bundled += `  const exports = {};\n`;
    
    // Replace references to other modules in the code
    let moduleCode = module.code;
    
    // Fix imports in the module code
    for (const [localId, depPath] of module.dependencies.entries()) {
      // Get the module ID for this dependency
      const depModuleId = moduleMap.get(depPath);
      if (depModuleId) {
        // Replace the import statement
        const importRegex = new RegExp(`const\\s+${localId}\\s+=\\s+\\(function\\(\\)\\s*\\{[\\s\\S]*?return exports;\\s*\\}\\)\\(\\);`, 'g');
        moduleCode = moduleCode.replace(importRegex, `const ${localId} = ${depModuleId};`);
      }
    }
    
    // Add the fixed code with indentation
    bundled += moduleCode
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n');
    
    bundled += `\n  return exports;\n`;
    bundled += `})();\n\n`;
  }
  
  // Now process the entry module
  let entryCode = entryModule.code;
  
  // Fix imports in the entry code
  for (const [localId, depPath] of entryModule.dependencies.entries()) {
    // Get the module ID for this dependency
    const depModuleId = moduleMap.get(depPath);
    if (depModuleId) {
      // Replace the import statement
      const importRegex = new RegExp(`const\\s+${localId}\\s+=\\s+\\(function\\(\\)\\s*\\{[\\s\\S]*?return exports;\\s*\\}\\)\\(\\);`, 'g');
      entryCode = entryCode.replace(importRegex, `const ${localId} = ${depModuleId};`);
    }
  }
  
  // Fix CommonJS exports to ESM exports in entry module
  entryCode = entryCode.replace(/exports\.(\w+)\s*=\s*(\w+)\s*;/g, 'export { $2 as $1 };');
  
  // Add the entry code
  bundled += entryCode;
  
  return bundled;
}

/**
 * Bundle an HQL file with all its dependencies
 */
export async function bundleFile(
  filePath: string, 
  visited = new Set<string>(),
  inModule = false
): Promise<string> {
  // Process all modules
  const allModules = new Map<string, Module>();
  await processModule(filePath, allModules, visited);
  
  // Generate the bundled code
  return generateBundle(filePath, allModules);
}

/**
 * Bundle a JavaScript file that may import HQL modules
 */
export async function bundleJSModule(filePath: string, visited = new Set<string>()): Promise<string> {
  const source = await Deno.readTextFile(filePath);
  
  // Find HQL imports
  const hqlImportRegex = /import\s+(\w+)\s+from\s+["']([^"']+\.hql)["'];/g;
  let processedSource = source;
  let match;
  
  while ((match = hqlImportRegex.exec(source)) !== null) {
    const [fullMatch, importName, importPath] = match;
    const fullPath = join(dirname(filePath), importPath);
    
    try {
      // Bundle the HQL file
      const bundled = await bundleFile(fullPath, new Set([...visited]), true);
      
      // Replace with IIFE
      const iife = `
// HQL module bundled from ${importPath}
const ${importName} = (function() {
  const exports = {};
${bundled.split('\n').map(line => `  ${line}`).join('\n')}
  return exports;
})();`;
      
      processedSource = processedSource.replace(fullMatch, iife);
    } catch (error) {
      console.error(`Error bundling HQL import ${importPath}:`, error);
    }
  }
  
  return processedSource;
}