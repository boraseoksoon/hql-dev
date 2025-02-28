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
  uniqueVarName: string;            // Unique variable name to avoid conflicts
  exports: Set<string>;             // Names of exported values
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
        
        if (importPath && importPath.endsWith('.hql')) {
          imports.set(moduleId, importPath);
        }
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
 * Create a unique variable name for a module to avoid conflicts
 * Uses path information to create more consistent and readable names
 */
function createUniqueModuleVarName(basePath: string): string {
  const baseName = basename(basePath, '.hql').replace(/[^a-zA-Z0-9_]/g, '_');
  const uniqueSuffix = Math.floor(Math.random() * 10000);
  return `__module_${baseName}_${uniqueSuffix}`;
}

/**
 * Extract exported symbols from code
 */
function extractExports(code: string): Set<string> {
  const exports = new Set<string>();
  
  // Match CommonJS style exports
  const commonJSExportRegex = /exports\.(\w+)\s*=\s*(\w+)\s*;/g;
  let match;
  while ((match = commonJSExportRegex.exec(code)) !== null) {
    exports.add(match[1]);
  }
  
  // Match ESM style exports
  const esmExportRegex = /export\s*{\s*([^}]+)\s*};/g;
  while ((match = esmExportRegex.exec(code)) !== null) {
    const exportList = match[1].split(',');
    for (const exp of exportList) {
      const trimmed = exp.trim();
      if (trimmed.includes(' as ')) {
        // Extract the 'as' name
        const asName = trimmed.split(' as ')[1].trim();
        exports.add(asName);
      } else {
        exports.add(trimmed);
      }
    }
  }
  
  return exports;
}

/**
 * Convert CommonJS exports to ESM exports
 */
function convertToESMExports(code: string): string {
  // Collect all exports
  const exportsMap = new Map<string, string>();
  
  // Find all CommonJS export statements
  const commonJSExportRegex = /exports\.(\w+)\s*=\s*(\w+)\s*;/g;
  let match;
  while ((match = commonJSExportRegex.exec(code)) !== null) {
    exportsMap.set(match[1], match[2]);
  }
  
  // Remove all CommonJS export statements
  let result = code.replace(commonJSExportRegex, '');
  
  // Add an ESM export statement at the end if needed
  if (exportsMap.size > 0) {
    const exportsList = Array.from(exportsMap.entries())
      .map(([exportName, localName]) => {
        if (exportName === localName) {
          return localName;
        }
        return `${localName} as ${exportName}`;
      })
      .join(', ');
    
    result += `\nexport { ${exportsList} };\n`;
  }
  
  return result;
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
  
  // Create a unique variable name for this module
  const uniqueVarName = createUniqueModuleVarName(absPath);
  
  // Create a placeholder first to avoid infinite recursion
  const moduleId = basename(absPath, '.hql').replace(/[^a-zA-Z0-9_]/g, '_');
  allModules.set(absPath, {
    id: moduleId,
    path: absPath,
    dependencies,
    code: "",
    uniqueVarName,
    exports: new Set()
  });
  
  // Process dependencies
  for (const [importId, importPath] of imports.entries()) {
    const fullPath = resolve(join(dirname(absPath), importPath));
    dependencies.set(importId, fullPath);
    
    // Process this dependency with a new visited set to avoid false positives
    await processModule(fullPath, allModules, new Set([...visited]));
  }
  
  // Transform to JavaScript
  const currentDir = dirname(absPath);
  const transformed = await transformAST(expanded, currentDir, visited, {
    module: 'esm'  // Always use ESM for modules
  }, true);
  
  // Fix any special syntax
  const fixedCode = fixSpecialSyntax(transformed);
  
  // Extract exports
  const exports = extractExports(fixedCode);
  
  // Update the module with the real code and exports
  const module = allModules.get(absPath)!;
  module.code = fixedCode;
  module.exports = exports;
  
  return module;
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
 * Generate bundled code from processed modules with proper ESM format
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
  
  // Process all modules except the entry
  for (const path of sortedPaths) {
    // Skip entry module, we'll add it at the end
    if (path === absEntryPath) continue;
    
    const module = modules.get(path)!;
    
    // Generate the module code with IIFE pattern for proper scoping
    bundled += `// Module: ${module.path}\n`;
    bundled += `const ${module.uniqueVarName} = (function() {\n`;
    bundled += `  const exports = {};\n`;
    
    // Replace references to other modules in the code
    let moduleCode = module.code;
    
    // Fix imports in the module code
    for (const [localId, depPath] of module.dependencies.entries()) {
      // Get the module for this dependency
      const depModule = modules.get(depPath);
      if (depModule) {
        // Replace the import statement with a reference to the already-processed module
        moduleCode = replaceModuleImport(moduleCode, localId, depModule.uniqueVarName);
      }
    }
    
    // Convert CommonJS exports to variable assignments
    moduleCode = moduleCode.replace(/exports\.(\w+)\s*=\s*(\w+)\s*;/g, 'exports.$1 = $2;');
    
    // Add the fixed code with indentation
    bundled += moduleCode
      .split('\n')
      .map(line => `  ${line}`)
      .join('\n') + '\n';
    
    bundled += `  return exports;\n`;
    bundled += `})();\n\n`;
  }
  
  // Now process the entry module
  let entryCode = entryModule.code;
  
  // Fix imports in the entry code
  for (const [localId, depPath] of entryModule.dependencies.entries()) {
    // Get the module for this dependency
    const depModule = modules.get(depPath);
    if (depModule) {
      // Replace the import statement
      entryCode = replaceModuleImport(entryCode, localId, depModule.uniqueVarName);
    }
  }
  
  // Convert any CommonJS exports to ESM syntax
  entryCode = convertToESMExports(entryCode);
  
  // Add the entry code
  bundled += entryCode;
  
  return bundled;
}

/**
 * Replace module imports with direct references
 */
function replaceModuleImport(code: string, localId: string, moduleId: string): string {
  // Match CommonJS-style imports
  const commonJSImportRegex = new RegExp(
    `const\\s+${localId}\\s+=\\s+\\(function\\(\\)\\s*\\{[\\s\\S]*?return exports;\\s*\\}\\)\\(\\);`, 
    'g'
  );
  
  // Match ESM-style imports
  const esmImportRegex = new RegExp(
    `import\\s+${localId}\\s+from\\s+["'][^"']+\\.hql["'];`, 
    'g'
  );
  
  // Replace with a reference to the already processed module
  let result = code;
  result = result.replace(commonJSImportRegex, `const ${localId} = ${moduleId};`);
  result = result.replace(esmImportRegex, `const ${localId} = ${moduleId};`);
  
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
export async function bundleJSModule(filePath: string, visited = new Set<string>()): Promise<string> {
  const source = await Deno.readTextFile(filePath);
  
  // Find HQL imports
  const hqlImportRegex = /import\s+(\w+)\s+from\s+["']([^"']+\.hql)["'];/g;
  let processedSource = source;
  let match;
  
  // Track processed modules to avoid duplicates
  const processedModules = new Map<string, string>();
  
  // Process each HQL import
  while ((match = hqlImportRegex.exec(source)) !== null) {
    const [fullMatch, importName, importPath] = match;
    const fullPath = join(dirname(filePath), importPath);
    
    try {
      // If we've already processed this module, reuse it
      if (processedModules.has(fullPath)) {
        const moduleVarName = processedModules.get(fullPath)!;
        processedSource = processedSource.replace(
          fullMatch, 
          `const ${importName} = ${moduleVarName};`
        );
        continue;
      }
      
      // Bundle the HQL file, avoiding circular dependencies
      if (!visited.has(fullPath)) {
        visited.add(fullPath);
        
        // Generate a unique module name
        const moduleVarName = createUniqueModuleVarName(fullPath);
        processedModules.set(fullPath, moduleVarName);
        
        // Bundle the module
        const bundled = await bundleFile(fullPath, new Set([...visited]), true);
        
        // Replace with IIFE
        const iife = `
// HQL module bundled from ${importPath}
const ${moduleVarName} = (function() {
  const exports = {};
${bundled.split('\n').map(line => `  ${line}`).join('\n')}
  return exports;
})();
const ${importName} = ${moduleVarName};`;
        
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