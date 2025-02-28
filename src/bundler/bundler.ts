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
  isExternal: boolean;              // Whether this is an external module
  isProcessed: boolean;             // Whether this module has been processed
  type: 'hql' | 'js';               // Type of module
  externalImports: Map<string, string>; // ImportStatement -> ModuleName
  jsImports: Map<string, string>; // LocalId -> JS module path
}

/**
 * Map of file paths to their import statements
 */
interface ImportMap {
  [filePath: string]: string; // path -> import statement
}

/**
 * Dependency graph to properly handle dependencies
 */
class DependencyGraph {
  modules = new Map<string, Module>();
  
  /**
   * Add a module to the graph
   */
  addModule(path: string, type: 'hql' | 'js'): Module {
    const isExternal = isExternalModule(path);
    
    if (!this.modules.has(path)) {
      // Generate a unique module ID based on the path
      const baseId = basename(path, path.endsWith('.hql') ? '.hql' : '.js');
      const moduleId = baseId.replace(/[^a-zA-Z0-9_]/g, '_');
      
      this.modules.set(path, {
        id: moduleId,
        path,
        dependencies: new Map(),
        code: "",
        isExternal,
        isProcessed: false,
        type,
        externalImports: new Map(),
        jsImports: new Map()
      });
    }
    
    return this.modules.get(path)!;
  }
  
  /**
   * Add a dependency relationship between modules
   */
  addDependency(from: string, to: string, importId: string): void {
    const fromModule = this.modules.get(from);
    if (fromModule) {
      fromModule.dependencies.set(importId, to);
    }
  }
  
  /**
   * Add an external import to a module
   */
  addExternalImport(modulePath: string, importStatement: string, moduleName: string): void {
    const module = this.modules.get(modulePath);
    if (module) {
      module.externalImports.set(importStatement, moduleName);
    }
  }
  
  /**
   * Add a JS import to an HQL module
   */
  addJSImport(hqlPath: string, localId: string, jsPath: string): void {
    const module = this.modules.get(hqlPath);
    if (module) {
      module.jsImports.set(localId, jsPath);
    }
  }
  
  /**
   * Get modules in topological order
   */
  getSortedModules(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();
    
    const visit = (path: string) => {
      if (temp.has(path)) {
        // Log but don't throw for circular dependencies
        console.warn(`Circular dependency detected: ${path} (proceeding with bundling)`);
        return;
      }
      
      if (visited.has(path)) return;
      
      temp.add(path);
      
      const module = this.modules.get(path);
      if (module) {
        for (const depPath of module.dependencies.values()) {
          if (this.modules.has(depPath)) {
            visit(depPath);
          }
        }
      }
      
      temp.delete(path);
      visited.add(path);
      result.push(path);
    };
    
    for (const path of this.modules.keys()) {
      if (!visited.has(path)) {
        visit(path);
      }
    }
    
    return result;
  }
  
  /**
   * Get all external imports from all modules
   */
  getAllExternalImports(): Map<string, string> {
    const allImports = new Map<string, string>();
    
    for (const module of this.modules.values()) {
      for (const [importStmt, moduleName] of module.externalImports.entries()) {
        allImports.set(importStmt, moduleName);
      }
    }
    
    return allImports;
  }
  
  /**
   * Get all JS imports needed for the entry module and its dependencies
   */
  getAllJSImports(): ImportMap {
    const result: ImportMap = {};
    
    // For all HQL modules in the graph
    for (const module of this.modules.values()) {
      if (module.type === 'hql') {
        // Add all JS imports
        for (const [localId, jsPath] of module.jsImports.entries()) {
          const jsModule = this.modules.get(jsPath);
          if (jsModule && jsModule.type === 'js') {
            const importId = `${localId}_module`;
            result[jsPath] = `import * as ${importId} from "${jsPath}";`;
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * Get all module variables needed for all HQL modules
   */
  getAllModuleVariables(): Map<string, string> {
    const moduleVars = new Map<string, string>();
    
    // Process external imports
    for (const module of this.modules.values()) {
      // Add external module variables
      for (const [_, moduleName] of module.externalImports.entries()) {
        const varName = moduleName.replace('_module', '');
        if (!moduleVars.has(varName)) {
          moduleVars.set(varName, `const ${varName} = ${moduleName}.default !== undefined ? ${moduleName}.default : ${moduleName};`);
        }
      }
      
      // Add JS import variables for HQL modules
      if (module.type === 'hql') {
        for (const [localId, jsPath] of module.jsImports.entries()) {
          const moduleName = `${localId}_module`;
          if (!moduleVars.has(localId)) {
            moduleVars.set(localId, `const ${localId} = ${moduleName}.default !== undefined ? ${moduleName}.default : ${moduleName};`);
          }
        }
      }
    }
    
    return moduleVars;
  }
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
 * Extract imports from a JS file using regex
 */
function extractJSImports(source: string): Map<string, { importStatement: string, importPath: string, isHQL: boolean }> {
  const imports = new Map<string, { importStatement: string, importPath: string, isHQL: boolean }>();
  
  // Match all import statements
  const importRegex = /^(import\s+(?:\*\s+as\s+(\w+)|\w+|\{[^}]*\})\s+from\s+["']([^"']+)["'];)/gm;
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const importStatement = match[1];
    const moduleName = match[2] || ""; // Module name if using "* as name" syntax
    const importPath = match[3];
    const isHQL = importPath.endsWith('.hql');
    
    const key = importPath; // Use the path as the key
    imports.set(key, { importStatement, importPath, isHQL });
  }
  
  return imports;
}

/**
 * Extract module variable declarations from code
 */
function extractModuleVariables(source: string): Map<string, string> {
  const variables = new Map<string, string>();
  
  // Match the pattern "const name = name_module.default !== undefined ? name_module.default : name_module;"
  const varRegex = /const\s+(\w+)\s+=\s+(\w+)\.default\s+!==\s+undefined\s+\?\s+\2\.default\s+:\s+\2;/g;
  let match;
  while ((match = varRegex.exec(source)) !== null) {
    const varName = match[1];
    const moduleName = match[2];
    variables.set(moduleName, varName);
  }
  
  return variables;
}

/**
 * Process module code to extract imports and variables
 */
function processModuleImportsAndVars(module: Module): void {
  if (!module.code) return;
  
  // Extract module variables
  const moduleVars = extractModuleVariables(module.code);
  
  // Process import statements
  const importRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];/g;
  let match;
  
  while ((match = importRegex.exec(module.code)) !== null) {
    const moduleName = match[1]; // e.g., "strUtil_module"
    const importPath = match[2]; // e.g., "https://esm.sh/lodash"
    const importStatement = match[0];
    
    if (isExternalModule(importPath)) {
      // This is an external import
      module.externalImports.set(importStatement, moduleName);
    }
  }
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
 * Build a complete dependency graph starting from the entry file
 */
async function buildDependencyGraph(
  entryPath: string,
  currentDependencyChain = new Set<string>()
): Promise<DependencyGraph> {
  const graph = new DependencyGraph();
  await buildDependencyGraphImpl(entryPath, graph, currentDependencyChain);
  return graph;
}

/**
 * Implementation of dependency graph building with cycle detection
 */
async function buildDependencyGraphImpl(
  filePath: string,
  graph: DependencyGraph,
  currentDependencyChain = new Set<string>()
): Promise<void> {
  // Resolve to absolute path for local files
  const absPath = isExternalModule(filePath) ? filePath : resolve(filePath);
  
  // Check for circular dependency in the current chain
  if (currentDependencyChain.has(absPath)) {
    console.warn(`Circular dependency detected in chain: ${absPath}`);
    return;
  }
  
  // Add to current dependency chain
  const newChain = new Set(currentDependencyChain);
  newChain.add(absPath);
  
  // Skip if module already exists in graph
  if (graph.modules.has(absPath)) {
    return;
  }
  
  console.log(`Building dependency graph for: ${absPath}`);
  
  // Determine file type and add module to graph
  let type: 'hql' | 'js';
  if (absPath.endsWith('.hql')) {
    type = 'hql';
  } else if (absPath.endsWith('.js')) {
    type = 'js';
  } else {
    console.warn(`Skipping unsupported file type: ${absPath}`);
    return;
  }
  
  const module = graph.addModule(absPath, type);
  
  // Skip external modules for dependency processing
  if (isExternalModule(absPath)) {
    return;
  }
  
  try {
    if (type === 'hql') {
      // Process HQL file
      const source = await Deno.readTextFile(absPath);
      const ast = parse(source);
      const expanded = expandMacros(ast);
      const imports = extractImports(expanded);
      
      // Process each import
      for (const [importId, importPath] of imports.entries()) {
        let fullPath = importPath;
        
        // Resolve relative imports
        if (!isExternalModule(importPath) && (importPath.startsWith('./') || importPath.startsWith('../'))) {
          fullPath = resolve(join(dirname(absPath), importPath));
        }
        
        // Add dependency to graph
        graph.addDependency(absPath, fullPath, importId);
        
        // Track JS imports specially
        if (fullPath.endsWith('.js') && !isExternalModule(fullPath)) {
          graph.addJSImport(absPath, importId, fullPath);
        }
        
        // If this is an external module, track it separately
        if (isExternalModule(fullPath)) {
          const importModuleName = `${importId}_module`;
          const importStatement = `import * as ${importModuleName} from "${fullPath}";`;
          graph.addExternalImport(absPath, importStatement, importModuleName);
        } else {
          // Process this dependency recursively
          await buildDependencyGraphImpl(fullPath, graph, newChain);
        }
      }
    } else if (type === 'js') {
      // Process JS file
      const source = await Deno.readTextFile(absPath);
      const imports = extractJSImports(source);
      
      // Process each import
      for (const [importKey, { importStatement, importPath, isHQL }] of imports.entries()) {
        let fullPath = importPath;
        
        // Resolve relative imports
        if (!isExternalModule(importPath) && (importPath.startsWith('./') || importPath.startsWith('../'))) {
          fullPath = resolve(join(dirname(absPath), importPath));
        }
        
        // Add dependency to graph
        const importId = isHQL ? 
          `import_${graph.modules.size}_${Math.floor(Math.random() * 10000)}` : 
          importPath.replace(/[^a-z0-9_]/gi, '_');
        
        graph.addDependency(absPath, fullPath, importId);
        
        // If this is an external module, track it
        if (isExternalModule(fullPath)) {
          // Extract the module name if possible
          const moduleNameMatch = importStatement.match(/\*\s+as\s+(\w+)/);
          const moduleName = moduleNameMatch ? moduleNameMatch[1] : importId + "_module";
          graph.addExternalImport(absPath, importStatement, moduleName);
        } else {
          // Process this dependency recursively
          await buildDependencyGraphImpl(fullPath, graph, newChain);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing ${absPath}:`, error);
  }
}

/**
 * Process all HQL modules in the graph
 */
async function processHQLModules(graph: DependencyGraph): Promise<void> {
  const sortedPaths = graph.getSortedModules();
  
  // Process all HQL modules first
  for (const path of sortedPaths) {
    const module = graph.modules.get(path);
    if (!module || module.isProcessed || module.isExternal || module.type !== 'hql') {
      continue;
    }
    
    try {
      console.log(`Processing HQL module: ${path}`);
      
      // Read and parse the file
      const source = await Deno.readTextFile(path);
      const ast = parse(source);
      const expanded = expandMacros(ast);
      
      // Transform to JavaScript
      const currentDir = dirname(path);
      const transformed = await transformAST(expanded, currentDir, new Set(), {
        module: 'esm'
      }, true);
      
      // Fix any special syntax
      const fixedCode = fixSpecialSyntax(transformed);
      
      // Process the module to extract imports and variables
      module.code = fixedCode;
      processModuleImportsAndVars(module);
      
      module.isProcessed = true;
      
      // Always write the JS file for HQL modules to support JS imports
      const jsPath = path.replace(/\.hql$/, '.js');
      await Deno.writeTextFile(jsPath, fixedCode);
      console.log(`Generated JS file: ${jsPath}`);
    } catch (error) {
      console.error(`Error processing HQL module ${path}:`, error);
    }
  }
}

/**
 * Process all JS modules in the graph
 */
async function processJSModules(graph: DependencyGraph): Promise<void> {
  const sortedPaths = graph.getSortedModules();
  
  // Then process all JS modules
  for (const path of sortedPaths) {
    const module = graph.modules.get(path);
    if (!module || module.isProcessed || module.isExternal || module.type !== 'js') {
      continue;
    }
    
    try {
      console.log(`Processing JS module: ${path}`);
      
      // Read the file
      let source = await Deno.readTextFile(path);
      
      // Extract and process imports
      processModuleImportsAndVars(module);
      
      // Rewrite HQL imports to JS
      const imports = extractJSImports(source);
      let modified = false;
      
      for (const [importKey, { importStatement, importPath, isHQL }] of imports.entries()) {
        if (isHQL) {
          // Generate JS path
          const jsImportPath = importPath.replace(/\.hql$/, '.js');
          
          // Replace HQL import with JS import
          const newImportStatement = importStatement.replace(importPath, jsImportPath);
          source = source.replace(importStatement, newImportStatement);
          modified = true;
          
          // Verify that the HQL module has been processed
          let fullHqlPath = importPath;
          if (!isExternalModule(importPath) && (importPath.startsWith('./') || importPath.startsWith('../'))) {
            fullHqlPath = resolve(join(dirname(path), importPath));
          }
          
          const hqlModule = graph.modules.get(fullHqlPath);
          if (hqlModule && !hqlModule.isProcessed) {
            console.warn(`Warning: HQL module ${fullHqlPath} referenced but not processed`);
          }
        }
      }
      
      // Update the module code
      module.code = source;
      module.isProcessed = true;
      
      // Write modified JS file if needed
      if (modified) {
        await Deno.writeTextFile(path, source);
        console.log(`Updated JS imports in: ${path}`);
      }
    } catch (error) {
      console.error(`Error processing JS module ${path}:`, error);
    }
  }
}

/**
 * Remove module variable declarations to prevent duplicates
 */
function removeModuleVarDeclarations(code: string): string {
  // Match variable declarations like: const varName = moduleName.default !== undefined ? moduleName.default : moduleName;
  const moduleVarRegex = /^\s*const\s+(\w+)\s+=\s+\w+(?:_module)?\.default\s+!==\s+undefined.*?;$/gm;
  return code.replace(moduleVarRegex, '');
}

/**
 * Generate bundled code from the entry module and its dependencies
 */
function generateBundle(entryPath: string, graph: DependencyGraph): string {
  const absEntryPath = isExternalModule(entryPath) ? entryPath : resolve(entryPath);
  const entryModule = graph.modules.get(absEntryPath);
  
  if (!entryModule) {
    throw new Error(`Entry module not found: ${entryPath}`);
  }
  
  // Get modules in dependency order
  const sortedPaths = graph.getSortedModules();
  
  // Collect all external imports
  const externalImports = graph.getAllExternalImports();
  
  // Collect all JS imports needed for HQL modules
  const jsImports = graph.getAllJSImports();
  
  // Start building the bundle with all imports at the top
  let bundled = '';
  
  // 1. Add external imports first
  bundled += Array.from(externalImports.keys()).join('\n');
  
  // 2. Add JS imports for HQL files
  if (Object.keys(jsImports).length > 0) {
    bundled += bundled ? '\n' : '';
    bundled += Object.values(jsImports).join('\n');
  }
  
  bundled += bundled ? '\n\n' : '';
  
  // Map for tracking bundled modules
  const moduleMap = new Map<string, string>();
  
  // Process all HQL modules except the entry
  for (const path of sortedPaths) {
    // Skip entry module, we'll add it at the end
    if (path === absEntryPath) continue;
    
    const module = graph.modules.get(path)!;
    
    // Skip external modules and JS files
    if (module.isExternal || module.type !== 'hql') continue;
    
    // Use a unique name for the module
    const uniqueId = `__module_${module.id}_${Math.floor(Math.random() * 10000)}`;
    moduleMap.set(path, uniqueId);
    
    // Generate the module code
    bundled += `// Module: ${module.path}\n`;
    bundled += `const ${uniqueId} = (function() {\n`;
    bundled += `  const exports = {};\n`;
    
    // Process the module code to remove import statements and module variable declarations
    let moduleCode = module.code;
    
    // Remove import statements (they've been moved to the top)
    moduleCode = moduleCode.replace(/^import.*?from\s+["']([^"']+)["'];/gm, '');
    
    // Remove module variable declarations to prevent duplicates
    moduleCode = removeModuleVarDeclarations(moduleCode);
    
    // Fix imports in the module code for bundled HQL modules
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
      .map(line => line.trim() ? `  ${line}` : '')
      .join('\n');
    
    bundled += `\n  return exports;\n`;
    bundled += `})();\n\n`;
  }
  
  // Now process the entry module
  let entryCode = entryModule.code;
  
  // Remove import statements (they've been moved to the top)
  entryCode = entryCode.replace(/^import.*?from\s+["']([^"']+)["'];/gm, '');
  
  // Remove module variable declarations to prevent duplicates
  entryCode = removeModuleVarDeclarations(entryCode);
  
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
  
  // Get all needed module variables
  const moduleVars = graph.getAllModuleVariables();
  
  // Add all module variables in a single block
  if (moduleVars.size > 0) {
    bundled += Array.from(moduleVars.values()).join('\n') + '\n\n';
  }
  
  // Convert CommonJS exports to ESM exports in entry module
  entryCode = convertExportsToESM(entryCode);
  
  // CRITICAL FIX: Remove any standalone file paths that would cause syntax errors
  // This handles cases like "test/interop2/main.hql" appearing as raw text
  entryCode = entryCode.replace(/^[a-zA-Z0-9_\-\.\/]+\.(hql|js)$/gm, '');
  
  // Remove any file path comments that might be causing issues
  entryCode = entryCode.replace(/^\/\/\s*File:.*$/gm, '');
  
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
  
  if (importRegex.test(code)) {
    return code.replace(importRegex, `const ${localId} = ${moduleId};`);
  }
  
  // Alternative: match the import statement using a more general approach
  const altImportRegex = new RegExp(`(const|let|var)\\s+${localId}\\s+=.*?;`, 'g');
  
  if (altImportRegex.test(code)) {
    return code.replace(altImportRegex, `const ${localId} = ${moduleId};`);
  }
  
  // If no match found, keep the code as is
  return code;
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
 * Bundle an HQL file and all its dependencies
 */
export async function bundleFile(
  filePath: string, 
  visited = new Set<string>(),
  inModule = false
): Promise<string> {
  try {
    console.log(`Bundling file: ${filePath}`);
    
    // Build the dependency graph
    const graph = await buildDependencyGraph(filePath);
    
    // Process all HQL modules
    await processHQLModules(graph);
    
    // Process all JS modules 
    await processJSModules(graph);
    
    // Generate the bundled code
    return generateBundle(filePath, graph);
  } catch (error) {
    console.error(`Error bundling file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Bundle a JavaScript file that may import HQL modules
 */
export async function bundleJSModule(filePath: string, visited = new Set<string>()): Promise<string> {
  console.log(`Bundling JS module: ${filePath}`);
  
  try {
    // Build dependency graph starting from the JS file
    const graph = await buildDependencyGraph(filePath);
    
    // Process HQL modules
    await processHQLModules(graph);
    
    // Process JS modules
    await processJSModules(graph);
    
    // For JS entry files, just return the updated source
    const jsModule = graph.modules.get(resolve(filePath));
    return jsModule?.code || "";
  } catch (error) {
    console.error(`Error bundling JS module ${filePath}:`, error);
    throw error;
  }
}

/**
 * Process ESM imports by preserving the ESM structure and generating JS files for HQL imports
 */
export async function processESMImports(source: string, filePath: string, visited = new Set<string>()): Promise<string> {
  // Extract all imports
  const imports = extractJSImports(source);
  let processedSource = source;
  
  // Process each import
  for (const [importKey, { importStatement, importPath, isHQL }] of imports.entries()) {
    if (isHQL) {
      try {
        // Resolve the full path
        let fullPath = importPath;
        if (!isExternalModule(importPath) && (importPath.startsWith('./') || importPath.startsWith('../'))) {
          fullPath = resolve(join(dirname(filePath), importPath));
        }
        
        // Skip if already visited
        if (visited.has(fullPath)) continue;
        visited.add(fullPath);
        
        // Generate JS file for HQL import
        const jsPath = fullPath.replace(/\.hql$/, '.js');
        await bundleFile(fullPath, new Set([...visited]), true);
        
        // Update the import in the source
        const jsImportPath = importPath.replace(/\.hql$/, '.js');
        processedSource = processedSource.replace(importPath, jsImportPath);
      } catch (error) {
        console.error(`Error processing HQL import ${importPath}:`, error);
      }
    }
  }
  
  return processedSource;
}

/**
 * Detect if a JavaScript file contains ESM syntax
 */
export function detectESMSyntax(code: string): boolean {
  // Look for import/export statements at the top level
  const esmSyntaxRegex = /^(?:\s*(?:\/\/.*|\/\*[\s\S]*?\*\/))*\s*(?:import\s+|export\s+|import\s*\()/m;
  return esmSyntaxRegex.test(code);
}