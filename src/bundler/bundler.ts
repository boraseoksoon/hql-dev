// src/bundler/bundler.ts
import { parse } from "../transpiler/parser.ts";
import { expandMacros } from "../macro.ts";
import { transformAST } from "../transpiler/transformer.ts";
import { 
  isExternalModule,
  resolveImportPath,
  hqlToJsPath,
  getDirectory,
  ensureAbsolutePath,
  normalizePath
} from "../transpiler/path-utils.ts";
import { dirname, basename, join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { HQLNode, ListNode, SymbolNode, LiteralNode } from "../transpiler/hql_ast.ts";
import { exists } from "jsr:@std/fs@1.0.13";

/**
 * Enhanced module type that better represents dependencies and module nature
 */
interface Module {
  id: string;                       // Unique module identifier
  path: string;                     // Absolute path
  type: 'hql' | 'js' | 'external';  // Module type
  
  // Dependencies
  imports: ModuleImport[];          // What this module imports
  exports: ModuleExport[];          // What this module exports
  
  // Source code and processing state
  code: string;                     // Generated/source code
  isProcessed: boolean;             // Whether module has been processed
  
  // Imported as
  importedAs: Map<string, string>;  // Module ID -> Local name used in importing modules
}

/**
 * Represents an import from another module
 */
interface ModuleImport {
  sourcePath: string;               // Path to source module
  localName: string;                // Local variable name
  importedName?: string;            // Name in source (null for default/namespace)
  isDefault: boolean;               // Whether it's a default import
  isNamespace: boolean;             // Whether it's a namespace import
  isExternal: boolean;              // Whether it's an external module
}

/**
 * Represents an export from a module
 */
interface ModuleExport {
  localName: string;                // Name in this module
  exportedName: string;             // Name exported as
  isDefault: boolean;               // Whether it's a default export
}

/**
 * Enhanced dependency graph for better import tracking
 */
class DependencyGraph {
  modules = new Map<string, Module>();
  entryPath: string | null = null;
  
  /**
   * Initialize the graph with an entry point
   */
  constructor(entryPath?: string) {
    if (entryPath) {
      this.entryPath = normalizePath(ensureAbsolutePath(entryPath));
    }
  }
  
  /**
   * Add or retrieve a module from the graph
   */
  getOrAddModule(path: string, type: 'hql' | 'js' | 'external'): Module {
    const normalizedPath = normalizePath(path);
    
    if (!this.modules.has(normalizedPath)) {
      // Generate a unique module ID based on path
      let baseId = basename(normalizedPath);
      if (baseId.endsWith('.hql')) baseId = baseId.slice(0, -4);
      if (baseId.endsWith('.js')) baseId = baseId.slice(0, -3);
      
      // Generate a unique, valid JS identifier
      const moduleId = baseId.replace(/[^a-zA-Z0-9_]/g, '_') + 
                       '_' + Math.floor(Math.random() * 10000);
      
      this.modules.set(normalizedPath, {
        id: moduleId,
        path: normalizedPath,
        type,
        imports: [],
        exports: [],
        code: "",
        isProcessed: false,
        importedAs: new Map()
      });
    }
    
    return this.modules.get(normalizedPath)!;
  }
  
  /**
   * Add an import to a module
   */
  addImport(modulePath: string, importInfo: ModuleImport): void {
    const normalizedPath = normalizePath(modulePath);
    const module = this.modules.get(normalizedPath);
    if (module) {
      // Avoid duplicate imports
      const exists = module.imports.some(imp => 
        imp.sourcePath === importInfo.sourcePath && 
        imp.localName === importInfo.localName
      );
      
      if (!exists) {
        module.imports.push(importInfo);
        
        // Update the imported-as relationship for easier code generation
        const sourceModule = this.modules.get(normalizePath(importInfo.sourcePath));
        if (sourceModule) {
          sourceModule.importedAs.set(module.id, importInfo.localName);
        }
      }
    }
  }
  
  /**
   * Add an export to a module
   */
  addExport(modulePath: string, exportInfo: ModuleExport): void {
    const normalizedPath = normalizePath(modulePath);
    const module = this.modules.get(normalizedPath);
    if (module) {
      // Avoid duplicate exports
      const exists = module.exports.some(exp => 
        exp.localName === exportInfo.localName && 
        exp.exportedName === exportInfo.exportedName
      );
      
      if (!exists) {
        module.exports.push(exportInfo);
      }
    }
  }
  
  /**
   * Get all modules in dependency order (topological sort)
   */
  getSortedModules(): Module[] {
    const result: Module[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();
    
    const visit = (path: string) => {
      if (temp.has(path)) {
        // Circular dependency - we'll handle this
        console.warn(`Circular dependency detected: ${path} (handled gracefully)`);
        return;
      }
      
      if (visited.has(path)) return;
      
      temp.add(path);
      
      const module = this.modules.get(path);
      if (module) {
        for (const imp of module.imports) {
          const sourcePath = normalizePath(imp.sourcePath);
          if (this.modules.has(sourcePath)) {
            visit(sourcePath);
          }
        }
      }
      
      temp.delete(path);
      visited.add(path);
      const mod = this.modules.get(path);
      if (mod) result.push(mod);
    };
    
    // Start with entry path if available
    if (this.entryPath && this.modules.has(this.entryPath)) {
      visit(this.entryPath);
    }
    
    // Then visit any remaining modules
    for (const path of this.modules.keys()) {
      if (!visited.has(path)) {
        visit(path);
      }
    }
    
    return result;
  }
  
  /**
   * Get all external module imports in the graph
   */
  getAllExternalImports(): Map<string, Set<ModuleImport>> {
    const result = new Map<string, Set<ModuleImport>>();
    
    for (const module of this.modules.values()) {
      for (const imp of module.imports) {
        if (imp.isExternal) {
          if (!result.has(imp.sourcePath)) {
            result.set(imp.sourcePath, new Set());
          }
          result.get(imp.sourcePath)!.add(imp);
        }
      }
    }
    
    return result;
  }
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
 * Extract exports from HQL AST
 */
function extractExports(ast: HQLNode[]): ModuleExport[] {
  const exports: ModuleExport[] = [];
  
  for (const node of ast) {
    if (node.type === "list") {
      const list = node as ListNode;
      
      // Check for (export "exportName" localSym)
      if (isExportDeclaration(list)) {
        const exportName = getExportName(list);
        const localName = getExportLocalName(list);
        
        exports.push({
          localName,
          exportedName: exportName,
          isDefault: exportName === "default"
        });
      }
    }
  }
  
  return exports;
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
 * Check if a list node is an export declaration
 */
function isExportDeclaration(list: ListNode): boolean {
  return list.elements.length >= 3 && 
      list.elements[0]?.type === "symbol" && 
      list.elements[0].name === "export" &&
      list.elements[1]?.type === "literal" &&
      typeof (list.elements[1] as LiteralNode).value === "string" &&
      list.elements[2]?.type === "symbol";
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
 * Get the export name from an export declaration
 */
function getExportName(list: ListNode): string {
  return (list.elements[1] as LiteralNode).value as string;
}

/**
 * Get the local name being exported
 */
function getExportLocalName(list: ListNode): string {
  return (list.elements[2] as SymbolNode).name;
}

/**
 * Extract imports from a JavaScript file
 */
function extractJsImports(source: string): Map<string, {
  importStatement: string;
  importPath: string;
  isNamespace: boolean;
  localName: string;
  isDefault: boolean;
  isHQL: boolean;
}> {
  const imports = new Map<string, {
    importStatement: string;
    importPath: string;
    isNamespace: boolean;
    localName: string;
    isDefault: boolean;
    isHQL: boolean;
  }>();
  
  // Match different types of import statements
  const defaultImportRegex = /import\s+(\w+)\s+from\s+["']([^"']+)["'];/g;
  const namedImportRegex = /import\s+\{\s*([^}]+)\s*\}\s+from\s+["']([^"']+)["'];/g;
  const namespaceImportRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];/g;
  
  // Process default imports (import name from 'path')
  let match;
  while ((match = defaultImportRegex.exec(source)) !== null) {
    const localName = match[1];
    const importPath = match[2];
    imports.set(localName, {
      importStatement: match[0],
      importPath,
      isNamespace: false,
      localName,
      isDefault: true,
      isHQL: importPath.endsWith('.hql')
    });
  }
  
  // Process named imports (import { name } from 'path')
  while ((match = namedImportRegex.exec(source)) !== null) {
    const importPath = match[2];
    const importItems = match[1].split(',').map(s => s.trim());
    
    for (const item of importItems) {
      // Handle potential "as" renaming
      const [original, renamed] = item.split(/\s+as\s+/).map(s => s.trim());
      const localName = renamed || original;
      
      imports.set(localName, {
        importStatement: match[0],
        importPath,
        isNamespace: false,
        localName,
        isDefault: false,
        isHQL: importPath.endsWith('.hql')
      });
    }
  }
  
  // Process namespace imports (import * as name from 'path')
  while ((match = namespaceImportRegex.exec(source)) !== null) {
    const localName = match[1];
    const importPath = match[2];
    imports.set(localName, {
      importStatement: match[0],
      importPath,
      isNamespace: true,
      localName,
      isDefault: false,
      isHQL: importPath.endsWith('.hql')
    });
  }
  
  return imports;
}

/**
 * Extract exports from a JavaScript file
 */
function extractJsExports(source: string): ModuleExport[] {
  const exports: ModuleExport[] = [];
  
  // Match different types of export statements
  const defaultExportRegex = /export\s+default\s+(\w+);/g;
  const namedExportRegex = /export\s+\{\s*([^}]+)\s*\};/g;
  const declaredExportRegex = /export\s+(const|let|var|function|class)\s+(\w+)/g;
  
  // Process default exports
  let match;
  while ((match = defaultExportRegex.exec(source)) !== null) {
    const localName = match[1];
    exports.push({
      localName,
      exportedName: 'default',
      isDefault: true
    });
  }
  
  // Process named exports (export { name })
  while ((match = namedExportRegex.exec(source)) !== null) {
    const exportItems = match[1].split(',').map(s => s.trim());
    
    for (const item of exportItems) {
      // Handle potential "as" renaming
      const [original, renamed] = item.split(/\s+as\s+/).map(s => s.trim());
      exports.push({
        localName: original,
        exportedName: renamed || original,
        isDefault: false
      });
    }
  }
  
  // Process declared exports (export function name())
  while ((match = declaredExportRegex.exec(source)) !== null) {
    const localName = match[2];
    exports.push({
      localName,
      exportedName: localName,
      isDefault: false
    });
  }
  
  return exports;
}

/**
 * Build the dependency graph by traversing imports
 */
async function buildDependencyGraph(
  entryPath: string,
  visited = new Set<string>()
): Promise<DependencyGraph> {
  const graph = new DependencyGraph(entryPath);
  await buildDependencyGraphImpl(entryPath, graph, visited);
  return graph;
}

/**
 * Implementation of dependency graph construction
 */
async function buildDependencyGraphImpl(
  filePath: string,
  graph: DependencyGraph,
  visited = new Set<string>()
): Promise<void> {
  const absPath = ensureAbsolutePath(filePath);
  const normalizedPath = normalizePath(absPath);
  
  // Prevent circular dependency issues
  if (visited.has(normalizedPath)) {
    return;
  }
  
  visited.add(normalizedPath);
  
  // Determine module type
  let moduleType: 'hql' | 'js' | 'external';
  if (isExternalModule(normalizedPath)) {
    moduleType = 'external';
  } else if (normalizedPath.endsWith('.hql')) {
    moduleType = 'hql';
  } else if (normalizedPath.endsWith('.js')) {
    moduleType = 'js';
  } else {
    console.warn(`Unsupported file type: ${normalizedPath}`);
    return;
  }
  
  // Add or get the module
  const module = graph.getOrAddModule(normalizedPath, moduleType);
  
  // Skip external modules for dependency processing
  if (moduleType === 'external') {
    return;
  }
  
  try {
    const sourceDir = dirname(normalizedPath);
    
    if (moduleType === 'hql') {
      // Process HQL file
      const source = await Deno.readTextFile(normalizedPath);
      const ast = parse(source);
      const expanded = expandMacros(ast);
      
      // Extract imports
      const imports = extractImports(expanded);
      for (const [importId, importPath] of imports.entries()) {
        let fullPath = importPath;
        
        // Resolve relative imports
        if (!isExternalModule(importPath) && (importPath.startsWith('./') || importPath.startsWith('../'))) {
          fullPath = resolveImportPath(importPath, sourceDir);
        }
        
        const isExt = isExternalModule(fullPath);
        
        // Add to the dependency graph
        graph.addImport(normalizedPath, {
          sourcePath: fullPath,
          localName: importId,
          isDefault: false,
          isNamespace: true,
          isExternal: isExt
        });
        
        // Recursively process dependencies
        if (!isExt) {
          await buildDependencyGraphImpl(fullPath, graph, new Set([...visited]));
        }
      }
      
      // Extract exports
      const exports = extractExports(expanded);
      for (const exp of exports) {
        graph.addExport(normalizedPath, exp);
      }
      
    } else if (moduleType === 'js') {
      // Process JS file
      const source = await Deno.readTextFile(normalizedPath);
      
      // Extract imports
      const imports = extractJsImports(source);
      for (const [localName, importInfo] of imports.entries()) {
        let fullPath = importInfo.importPath;
        
        // Resolve relative imports
        if (!isExternalModule(fullPath) && (fullPath.startsWith('./') || fullPath.startsWith('../'))) {
          fullPath = resolveImportPath(fullPath, sourceDir);
        }
        
        const isExt = isExternalModule(fullPath);
        
        // Add to the dependency graph
        graph.addImport(normalizedPath, {
          sourcePath: fullPath,
          localName,
          isDefault: importInfo.isDefault,
          isNamespace: importInfo.isNamespace,
          isExternal: isExt
        });
        
        // Recursively process dependencies
        if (!isExt) {
          await buildDependencyGraphImpl(fullPath, graph, new Set([...visited]));
        }
      }
      
      // Extract exports
      const exports = extractJsExports(source);
      for (const exp of exports) {
        graph.addExport(normalizedPath, exp);
      }
    }
  } catch (error) {
    console.error(`Error processing ${normalizedPath}:`, error);
  }
}

/**
 * Process all HQL modules in the graph
 */
async function processHQLModules(graph: DependencyGraph): Promise<void> {
  const modules = graph.getSortedModules();
  
  // Process HQL modules first
  for (const module of modules) {
    if (module.isProcessed || module.type !== 'hql') {
      continue;
    }
    
    try {
      console.log(`Processing HQL module: ${module.path}`);
      
      // Read and parse the file
      const source = await Deno.readTextFile(module.path);
      const ast = parse(source);
      const expanded = expandMacros(ast);
      
      // Transform to JavaScript
      const currentDir = dirname(module.path);
      const transformed = await transformAST(expanded, currentDir, new Set(), {
        module: 'esm'
      });
      
      // Store the code
      module.code = transformed;
      module.isProcessed = true;
      
      // Always write the JS file for HQL modules to support JS imports
      const jsPath = hqlToJsPath(module.path);
      await Deno.writeTextFile(jsPath, transformed);
      console.log(`Generated JS file: ${jsPath}`);
    } catch (error) {
      console.error(`Error processing HQL module ${module.path}:`, error);
    }
  }
}

/**
 * Process all JS modules in the graph
 */
async function processJSModules(graph: DependencyGraph): Promise<void> {
  const modules = graph.getSortedModules();
  
  // Then process all JS modules
  for (const module of modules) {
    if (module.isProcessed || module.type !== 'js') {
      continue;
    }
    
    try {
      console.log(`Processing JS module: ${module.path}`);
      
      // Read the file
      let source = await Deno.readTextFile(module.path);
      
      // Rewrite HQL imports to JS imports
      const imports = extractJsImports(source);
      let modified = false;
      
      for (const [localName, importInfo] of imports.entries()) {
        if (importInfo.isHQL) {
          // Generate JS path
          const jsImportPath = hqlToJsPath(importInfo.importPath);
          
          // Replace HQL import with JS import
          const newImportStatement = importInfo.importStatement.replace(
            importInfo.importPath, 
            jsImportPath
          );
          
          source = source.replace(importInfo.importStatement, newImportStatement);
          modified = true;
          
          // Verify that the HQL module has been processed
          const fullHqlPath = resolveImportPath(
            importInfo.importPath, 
            dirname(module.path)
          );
          
          const hqlModule = graph.modules.get(normalizePath(fullHqlPath));
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
        await Deno.writeTextFile(module.path, source);
        console.log(`Updated JS imports in: ${module.path}`);
      }
    } catch (error) {
      console.error(`Error processing JS module ${module.path}:`, error);
    }
  }
}

/**
 * Generate bundled code from the processed modules
 */

// Fix the entry module issue in the generateBundle function, around line 700:
function generateBundle(entryPath: string, graph: DependencyGraph): string {
  // Make sure we're using the string path, not an object
  if (typeof entryPath !== 'string') {
    console.error(`Invalid entry path type: ${typeof entryPath}`, entryPath);
    throw new Error(`Entry path must be a string, received: ${typeof entryPath}`);
  }
  
  const absEntryPath = ensureAbsolutePath(entryPath);
  const normalizedEntryPath = normalizePath(absEntryPath);
  const entryModule = graph.modules.get(normalizedEntryPath);
  
  if (!entryModule) {
    // Fallback: Try to find the entry module by matching against the path
    for (const [path, module] of graph.modules.entries()) {
      if (path.endsWith(entryPath) || normalizedEntryPath.endsWith(path) || 
          path.includes(entryPath) || normalizedEntryPath.includes(path)) {
        console.log(`Found entry module with alternative path matching: ${path}`);
        return generateBundleWithModule(path, module, graph);
      }
    }
    
    console.error(`Entry module not found: ${entryPath}`);
    console.error(`Available modules: ${Array.from(graph.modules.keys()).join(', ')}`);
    throw new Error(`Entry module not found: ${entryPath}`);
  }
  
  return generateBundleWithModule(normalizedEntryPath, entryModule, graph);
}


// Refactored bundle generation logic to avoid duplication
function generateBundleWithModule(
  entryPath: string,
  entryModule: Module, 
  graph: DependencyGraph
): string {
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
    if (path === entryPath) continue;
    
    const module = graph.modules.get(path);
    if (!module) continue;
    
    // Skip external modules and JS files
    if (module.isExternal || module.type !== 'hql') continue;
    
    // Generate a unique module identifier
    const uniqueId = `__module_${module.id}_${Math.floor(Math.random() * 10000)}`;
    moduleMap.set(path, uniqueId);
    
    // Generate the module code
    bundled += `// Module: ${module.path}\n`;
    bundled += `const ${uniqueId} = (function() {\n`;
    bundled += `  const exports = {};\n`;
    
    // Process the module code
    let moduleCode = processModuleCode(module, moduleMap);
    
    // Add the fixed code with indentation
    bundled += moduleCode
      .split('\n')
      .map(line => line.trim() ? `  ${line}` : '')
      .join('\n');
    
    bundled += `\n  return exports;\n`;
    bundled += `})();\n\n`;
  }
  
  // Now process the entry module
  let entryCode = processEntryModuleCode(entryModule, moduleMap);
  
  // Get all needed module variables
  const moduleVars = graph.getAllModuleVariables();
  
  // Add all module variables in a single block
  if (moduleVars.size > 0) {
    bundled += Array.from(moduleVars.values()).join('\n') + '\n\n';
  }
  
  // Add the entry code
  bundled += entryCode;
  
  return bundled;
}


/**
 * Process module code to prepare for bundling
 */
function processModuleCode(code: string): string {
  // Remove import statements
  let processed = code.replace(/^import.*?from\s+["']([^"']+)["'];/gm, '');
  
  // Fix any redundant export statements
  return processed;
}

/**
 * Process JS module code
 */
function processJsModule(code: string): string {
  // Replace ESM exports with CommonJS exports
  let processed = code.replace(
    /export\s+(?:default\s+)?(\w+);/g, 
    'exports.$1 = $1;'
  );
  
  // Replace named export blocks
  processed = processed.replace(
    /export\s+\{\s*([^}]+)\s*\};/g,
    (match, exportList) => {
      const exports = exportList.split(',').map(e => {
        const [name, alias] = e.trim().split(/\s+as\s+/).map(s => s.trim());
        if (alias) {
          return `exports.${alias} = ${name};`;
        }
        return `exports.${name} = ${name};`;
      });
      return exports.join('\n');
    }
  );
  
  // Remove import statements
  processed = processed.replace(/^import.*?from\s+["']([^"']+)["'];/gm, '');
  
  return processed;
}

/**
 * Process the entry module code
 */
function processEntryModule(code: string, graph: DependencyGraph): string {
  // Remove import statements
  let processed = code.replace(/^import.*?from\s+["']([^"']+)["'];/gm, '');
  
  // Fix references to imported modules
  for (const module of graph.modules.values()) {
    for (const [moduleId, importedAs] of module.importedAs.entries()) {
      // Replace references to the imported module
      const importedModule = Array.from(graph.modules.values())
        .find(m => m.id === moduleId);
      
      if (importedModule && importedModule.type !== 'external') {
        const regex = new RegExp(`const\\s+${importedAs}\\s+=.*?;`, 'g');
        processed = processed.replace(regex, `const ${importedAs} = ${importedModule.id};`);
      }
    }
  }
  
  // Keep export statements for the entry module
  return processed;
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
    const graph = await buildDependencyGraph(filePath, visited);
    
    // Process all HQL modules
    await processHQLModules(graph);
    
    // Process all JS modules 
    await processJSModules(graph);
    
    // Generate the bundled code
    // IMPORTANT FIX: Pass the filePath string, not the graph object
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
    const graph = await buildDependencyGraph(filePath, visited);
    
    // Process HQL modules
    await processHQLModules(graph);
    
    // Process JS modules
    await processJSModules(graph);
    
    // Generate bundle
    return generateBundle(graph);
  } catch (error) {
    console.error(`Error bundling JS module ${filePath}:`, error);
    throw error;
  }
}