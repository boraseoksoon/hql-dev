// src/bundler/bundler.ts
import { parse } from "../transpiler/parser.ts";
import { expandMacros } from "../macro.ts";
import { transformAST } from "../transpiler/transformer.ts";
import { dirname, join, resolve, basename } from "https://deno.land/std@0.170.0/path/mod.ts";
import { HQLNode, ListNode, SymbolNode, LiteralNode } from "../transpiler/hql_ast.ts";

/**
 * A module with its dependencies
 */
interface Module {
  id: string;                       // Module identifier
  path: string;                     // Absolute path
  dependencies: Map<string, string>; // LocalImportId -> DependencyPath
  code: string;                     // Transpiled code
}

/**
 * Check if a path refers to an external module
 */
function isExternalModule(path: string): boolean {
  return path.startsWith('http://') ||
         path.startsWith('https://') ||
         path.startsWith('npm:') ||
         path.startsWith('jsr:');
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
      if (isImportDeclaration(list)) {
        const moduleId = getImportModuleId(list);
        const importPath = getImportPath(list);
        
        imports.set(moduleId, importPath);
      }
    }
  }
  
  return imports;
}

/**
 * Check if a list node is an import declaration
 */
function isImportDeclaration(list: ListNode): boolean {
  return list.elements.length >= 3 && 
      list.elements[0]?.type === "symbol" && 
      list.elements[0].name === "def" &&
      list.elements[1]?.type === "symbol" &&
      list.elements[2]?.type === "list" &&
      list.elements[2].elements.length >= 2 &&
      list.elements[2].elements[0]?.type === "symbol" &&
      list.elements[2].elements[0].name === "import" &&
      list.elements[2].elements[1]?.type === "literal";
}

/**
 * Get the module ID from an import declaration
 */
function getImportModuleId(list: ListNode): string {
  return (list.elements[1] as SymbolNode).name;
}

/**
 * Get the import path from an import declaration
 */
function getImportPath(list: ListNode): string {
  return (list.elements[2].elements[1] as LiteralNode).value as string;
}

/**
 * Fix higher-order function syntax in code
 */
function fixSpecialSyntax(code: string): string {
  // Fix $RETURN_FUNCTION placeholder for higher-order functions
  return code.replace(/\$RETURN_FUNCTION\s*\(\s*(function\s*\([^)]*\))/g, 'return $1');
}

/**
 * Process an HQL file and its dependencies
 */
async function processModule(
  filePath: string,
  allModules = new Map<string, Module>(),
  visited = new Set<string>()
): Promise<Module> {
  // Resolve to absolute path for local files
  const absPath = isExternalModule(filePath) ? filePath : resolve(filePath);
  
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
  
  // Create a placeholder first to avoid infinite recursion
  const moduleId = basename(absPath, '.hql').replace(/[^a-zA-Z0-9_]/g, '_');
  allModules.set(absPath, {
    id: moduleId,
    path: absPath,
    dependencies: new Map(),
    code: ""
  });
  
  // Only process HQL files; for external modules or non-HQL files, just keep the reference
  if (!absPath.endsWith('.hql') || isExternalModule(absPath)) {
    return allModules.get(absPath)!; 
  }
  
  // Read the file
  const source = await Deno.readTextFile(absPath);
  
  // Parse the file
  const ast = parse(source);
  const expanded = expandMacros(ast);
  
  // Extract imports
  const imports = extractImports(expanded);
  const dependencies = new Map<string, string>();
  
  // Process dependencies
  for (const [importId, importPath] of imports.entries()) {
    let fullPath = importPath;
    
    // For relative imports, resolve relative to the current file
    if (!isExternalModule(importPath) && (importPath.startsWith('./') || importPath.startsWith('../'))) {
      fullPath = resolve(join(dirname(absPath), importPath));
    }
    
    dependencies.set(importId, fullPath);
    
    // Only process HQL dependencies; external ones are left as is
    if (fullPath.endsWith('.hql') && !isExternalModule(fullPath)) {
      // Process this dependency with a new visited set
      await processModule(fullPath, allModules, new Set([...visited]));
    }
  }
  
  // Update the module with dependencies
  allModules.get(absPath)!.dependencies = dependencies;
  
  // Transform to JavaScript
  const currentDir = dirname(absPath);
  const transformed = await transformAST(expanded, currentDir, visited, {
    module: 'esm'  // Always use ESM for modules
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
        // Only visit HQL dependencies; external ones are just referenced
        if (modules.has(depPath) && depPath.endsWith('.hql') && !isExternalModule(depPath)) {
          visit(depPath);
        }
      }
    }
    
    temp.delete(path);
    visited.add(path);
    result.push(path);
  }
  
  for (const path of modules.keys()) {
    if (!visited.has(path) && path.endsWith('.hql') && !isExternalModule(path)) {
      visit(path);
    }
  }
  
  return result;
}

/**
 * Generate bundled code from processed modules
 */
function generateBundle(entryPath: string, modules: Map<string, Module>): string {
  const absEntryPath = isExternalModule(entryPath) ? entryPath : resolve(entryPath);
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
    bundled += `// Module: ${module.path}\n`;
    bundled += `const ${uniqueId} = (function() {\n`;
    bundled += `  const exports = {};\n`;
    
    // Replace references to other modules in the code
    let moduleCode = module.code;
    
    // Fix imports in the module code
    for (const [localId, depPath] of module.dependencies.entries()) {
      // Handle HQL dependencies
      if (moduleMap.has(depPath)) {
        // Get the module ID for this dependency
        const depModuleId = moduleMap.get(depPath);
        
        // Replace the import statement with a reference to the already-processed module
        moduleCode = replaceImportStatement(moduleCode, localId, depModuleId!);
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
    // Handle HQL dependencies
    if (moduleMap.has(depPath)) {
      // Get the module ID for this dependency
      const depModuleId = moduleMap.get(depPath);
      
      // Replace the import statement
      entryCode = replaceImportStatement(entryCode, localId, depModuleId!);
    }
  }
  
  // Convert CommonJS exports to ESM exports in entry module
  entryCode = convertExportsToESM(entryCode);
  
  // Add the entry code
  bundled += entryCode;
  
  return bundled;
}

/**
 * Replace import statements with module references
 */
function replaceImportStatement(code: string, localId: string, moduleId: string): string {
  // Create a regex that matches the entire import statement for this local ID
  const importRegex = new RegExp(
    `const\\s+${localId}\\s+=\\s+\\(function\\(\\)\\s*\\{[\\s\\S]*?return exports;\\s*\\}\\)\\(\\);`, 
    'g'
  );
  
  // Replace with a reference to the already processed module
  return code.replace(importRegex, `const ${localId} = ${moduleId};`);
}

/**
 * Convert CommonJS exports to ESM exports
 */
function convertExportsToESM(code: string): string {
  // Find all exports.x = y statements
  const exportRegex = /exports\.(\w+)\s*=\s*(\w+)\s*;/g;
  
  // Collect all exports
  const exports = new Map<string, string>();
  let match;
  while ((match = exportRegex.exec(code)) !== null) {
    const exportName = match[1];
    const localName = match[2];
    exports.set(exportName, localName);
  }
  
  // Replace CommonJS exports with nothing (we'll add ESM exports at the end)
  let result = code.replace(exportRegex, '');
  
  // If we have exports, add an ESM export statement at the end
  if (exports.size > 0) {
    const exportsList = Array.from(exports.entries())
      .map(([exportName, localName]) => {
        if (exportName === localName) {
          return localName;
        } else {
          return `${localName} as ${exportName}`;
        }
      })
      .join(', ');
    
    result += `\nexport { ${exportsList} };\n`;
  }
  
  return result;
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
/**
 * Bundle a JavaScript file that may import HQL modules
 */
export async function bundleJSModule(filePath: string, visited = new Set<string>()): Promise<string> {
  const source = await Deno.readTextFile(filePath);
  
  // Check if this is an ESM file
  if (detectESMSyntax(source)) {
    // For ESM files, don't process them with IIFE, just replace HQL imports
    return processESMImports(source, filePath, visited);
  }
  
  // For non-ESM files, continue with the regular process
  const hqlImportRegex = /import\s+(\w+)\s+from\s+["']([^"']+\.hql)["'];/g;
  let processedSource = source;
  let match;
  
  // Process each HQL import
  while ((match = hqlImportRegex.exec(source)) !== null) {
    const [fullMatch, importName, importPath] = match;
    const fullPath = join(dirname(filePath), importPath);
    
    try {
      // Bundle the HQL file, avoiding circular dependencies
      if (!visited.has(fullPath)) {
        visited.add(fullPath);
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
      } else {
        console.warn(`Circular dependency detected: ${fullPath}`);
      }
    } catch (error) {
      console.error(`Error bundling HQL import ${importPath}:`, error);
    }
  }
  
  return processedSource;
}

/**
 * Process ESM imports by preserving the ESM structure
 */
async function processESMImports(source: string, filePath: string, visited = new Set<string>()): Promise<string> {
  // For ESM JS files, we keep the import/export statements
  // But we need to modify imports for HQL files
  const hqlImportRegex = /import\s+(?:{[^}]+}|[^;]+)\s+from\s+["']([^"']+\.hql)["'];/g;
  let processedSource = source;
  let match;
  
  // For each HQL import, we need to modify the path to point to the JS output
  while ((match = hqlImportRegex.exec(source)) !== null) {
    const [fullMatch, importPath] = match;
    
    // Convert .hql extension to .js
    const jsImportPath = importPath.replace(/\.hql$/, '.js');
    
    // Replace the import path
    processedSource = processedSource.replace(
      importPath, 
      jsImportPath
    );
  }
  
  return processedSource;
}

/**
 * Detect if a JavaScript file contains ESM syntax
 */
function detectESMSyntax(code: string): boolean {
  // Look for import/export statements at the top level
  const esmSyntaxRegex = /^(?:\s*(?:\/\/.*|\/\*[\s\S]*?\*\/))*\s*(?:import\s+|export\s+|import\s*\()/m;
  return esmSyntaxRegex.test(code);
}