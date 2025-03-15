// src/macro-expander.ts - Refactored for improved modularity and logging

import { HQLNode, ListNode, SymbolNode, LiteralNode, isMacroImport } from "./transpiler/hql_ast.ts";
import { initializeGlobalEnv, evaluateForMacro, MacroFunction } from "./bootstrap.ts";
import { dirname, resolve, readTextFile } from "./platform/platform.ts";
import { parse } from "./transpiler/parser.ts";
import { Logger } from "./logger.ts";
import { Env } from "./environment.ts"

/**
 * Registry for tracking imported modules and their sources
 */
export const moduleRegistry = new Map<string, string>();

/**
 * Configuration options for macro expansion
 */
export interface MacroExpanderOptions {
  verbose?: boolean;
}

/**
 * Process an import statement from any source
 * Handles HQL files and remote modules consistently
 * @param importNode Import node to process
 * @param env Environment to register imports in
 * @param currentDir Current directory for resolving relative paths
 * @param logger Logger instance
 */
export async function processImportNode(
  importNode: ListNode,
  env: Env,
  currentDir: string,
  logger: Logger = new Logger()
): Promise<void> {
  if (importNode.elements.length < 3) {
    throw new Error("Import requires a name and a path");
  }
  
  const nameNode = importNode.elements[1];
  const pathNode = importNode.elements[2];
  
  if (nameNode.type !== "symbol") {
    throw new Error("Import name must be a symbol");
  }
  const importName = (nameNode as SymbolNode).name;
  
  if (pathNode.type !== "literal") {
    throw new Error("Import path must be a string literal");
  }
  const importPath = String((pathNode as LiteralNode).value);
  
  logger.debug(`Processing import: ${importName} from ${importPath}`);
  
  // Register the import in our global registry
  moduleRegistry.set(importName, importPath);

  // Process HQL imports
  if (importPath.endsWith('.hql')) {
    try {
      await processHqlImport(importName, importPath, env, currentDir, new Set(), logger);
    } catch (error) {
      logger.error(`Critical error processing import ${importPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Process an HQL file import
 * @param moduleName Name to register the module as
 * @param modulePath Path to the HQL file
 * @param env Environment to register the module in
 * @param currentDir Current directory for resolving relative paths
 * @param processedPaths Set of already processed paths to avoid cycles
 * @param logger Logger instance
 */
export async function processHqlImport(
  moduleName: string,
  modulePath: string,
  env: Env,
  currentDir: string,
  processedPaths: Set<string> = new Set(),
  logger: Logger = new Logger()
): Promise<void> {
  try {
    // Resolve path relative to current directory
    const resolvedPath = resolve(currentDir, modulePath);
    logger.debug(`Resolved import path: ${resolvedPath}`);
    
    // Skip if already processed to avoid circular dependencies
    if (processedPaths.has(resolvedPath)) {
      logger.debug(`Skipping already processed: ${resolvedPath}`);
      return;
    }
    processedPaths.add(resolvedPath);
    
    // Read and parse the file
    let source: string;
    try {
      source = await readTextFile(resolvedPath);
    } catch (error) {
      logger.error(`Error reading file ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    
    const importedAst = parse(source);
    logger.debug(`Parsed imported file: ${importedAst.length} nodes`);
    
    // Create module object to store exports
    const moduleExports: Record<string, any> = {};
    
    // Process any nested imports first
    await processNestedImports(importedAst, env, dirname(resolvedPath), processedPaths, logger);
    
    // Register module definitions and exports
    processMacroDefinitions(importedAst, env, moduleName, moduleExports, logger);
    processDefinitions(importedAst, env, moduleName, moduleExports, logger);
    
    // Register the module itself
    env.define(moduleName, moduleExports);
    logger.debug(`Registered module ${moduleName} with exports: ${Object.keys(moduleExports).join(', ')}`);
  } catch (error) {
    logger.error(`Error processing HQL import ${modulePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Process nested imports in an AST
 * @param ast AST nodes to process
 * @param env Environment to register imports in
 * @param currentDir Current directory for resolving relative paths
 * @param processedPaths Set of already processed paths to avoid cycles
 * @param logger Logger instance
 */
async function processNestedImports(
  ast: HQLNode[],
  env: Env,
  currentDir: string,
  processedPaths: Set<string>,
  logger: Logger
): Promise<void> {
  for (const node of ast) {
    if (isMacroImport(node)) {
      const importDir = currentDir;
      await processImportNode(node as ListNode, env, importDir, logger);
    }
  }
}

/**
 * Process macro definitions in an AST
 * @param ast AST nodes to process
 * @param env Environment to register macros in
 * @param moduleName Name of the module being processed
 * @param moduleExports Object to store exported macros
 * @param logger Logger instance
 */
function processMacroDefinitions(
  ast: HQLNode[],
  env: Env,
  moduleName: string,
  moduleExports: Record<string, any>,
  logger: Logger
): void {
  for (const node of ast) {
    if (
      node.type === "list" &&
      (node as ListNode).elements.length > 0 &&
      (node as ListNode).elements[0].type === "symbol" &&
      ((node as ListNode).elements[0] as SymbolNode).name === "defmacro"
    ) {
      const macroList = node as ListNode;
      if (macroList.elements.length >= 3 && macroList.elements[1].type === "symbol") {
        const macroName = (macroList.elements[1] as SymbolNode).name;
        logger.debug(`Found macro definition: ${macroName}`);
        
        // Register the macro in the environment
        evaluateForMacro(node, env);
        
        // Get the registered macro function
        const macroFn = env.getMacro(macroName);
        if (macroFn) {
          // Store in module exports
          moduleExports[macroName] = macroFn;
          
          // CRITICAL: Register with fully qualified name
          const qualifiedName = `${moduleName}.${macroName}`;
          env.defineMacro(qualifiedName, macroFn);
          logger.debug(`Registered qualified macro: ${qualifiedName}`);
        }
      }
    }
  }
}

/**
 * Process definition forms in an AST
 * @param ast AST nodes to process
 * @param env Environment to register definitions in
 * @param moduleName Name of the module being processed
 * @param moduleExports Object to store exported definitions
 * @param logger Logger instance
 */
function processDefinitions(
  ast: HQLNode[],
  env: Env,
  moduleName: string,
  moduleExports: Record<string, any>,
  logger: Logger
): void {
  for (const node of ast) {
    if (
      node.type === "list" &&
      (node as ListNode).elements.length > 0 &&
      (node as ListNode).elements[0].type === "symbol" &&
      ((node as ListNode).elements[0] as SymbolNode).name === "def"
    ) {
      const defList = node as ListNode;
      if (defList.elements.length >= 3 && defList.elements[1].type === "symbol") {
        const defName = (defList.elements[1] as SymbolNode).name;
        logger.debug(`Found definition: ${defName}`);
        
        try {
          // Evaluate the definition in the environment
          const value = evaluateForMacro(node, env);
          
          // Store in module exports
          moduleExports[defName] = value;
          
          // Register with qualified name
          const qualifiedName = `${moduleName}.${defName}`;
          env.define(qualifiedName, value);
          logger.debug(`Registered qualified definition: ${qualifiedName}`);
        } catch (error) {
          logger.error(`Error evaluating definition ${defName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
}

/**
 * Enhanced preloadMacroImports that handles all import types
 * @param nodes AST nodes to process
 * @param env Environment to register imports in
 * @param basePath Base path for resolving relative imports
 * @param logger Logger instance
 */
async function preloadMacroImports(
  nodes: HQLNode[],
  env: Env,
  basePath: string = Deno.cwd(),
  logger: Logger = new Logger()
): Promise<void> {
  logger.debug(`Processing imports from ${basePath}`);
  
  // Process each import node
  for (const node of nodes) {
    if (isMacroImport(node)) {
      await processImportNode(node as ListNode, env, basePath, logger);
    }
  }
}

/**
 * Register a module and all its exports in the environment
 * @param moduleName Name to register the module as
 * @param mod Module object with exports
 * @param env Environment to register the module in
 * @param logger Logger instance
 */
export function registerModule(
  moduleName: string,
  mod: any,
  env: Env,
  logger: Logger = new Logger()
): void {
  logger.debug(`Registering module: ${moduleName}`);
  
  // Register the module itself
  env.define(moduleName, mod);
  
  // Register each export for qualified access
  for (const [key, value] of Object.entries(mod)) {
    if (key === "default") continue; // Skip default export as it's handled differently
    
    const qualifiedName = `${moduleName}.${key}`;
    logger.debug(`Registering qualified name: ${qualifiedName}`);
    
    // Define the exported value
    env.define(qualifiedName, value);

    if (typeof value === 'function') {
      const macroWrapper = createFunctionMacroWrapper(value);
      env.defineMacro(qualifiedName, macroWrapper);
    }
  }
}

/**
 * Create a macro wrapper around a JavaScript function
 * @param func Function to wrap
 * @returns Macro function wrapper
 */
function createFunctionMacroWrapper(func: Function): MacroFunction {
  return (args: HQLNode[], env: Env) => {
    // Convert HQL AST nodes to JavaScript values
    const jsArgs = convertArgsToJsValues(args, env);
    
    // Call the function with the converted arguments
    try {
      const result = func(...jsArgs);
      return convertResultToHqlNode(result);
    } catch (error) {
      console.error(`Error calling function as macro: ${error instanceof Error ? error.message : String(error)}`);
      // Return a meaningful error representation
      return { 
        type: "list", 
        elements: [
          { type: "symbol", name: "js-error" },
          { type: "literal", value: error instanceof Error ? error.message : String(error) }
        ]
      };
    }
  };
}

/**
 * Convert HQL AST nodes to JavaScript values
 * @param args AST nodes to convert
 * @param env Environment for evaluation
 * @returns Array of JavaScript values
 */
function convertArgsToJsValues(args: HQLNode[], env: Env): any[] {
  return args.map(arg => {
    // For literal nodes, extract their value
    if (arg.type === "literal") {
      return (arg as LiteralNode).value;
    }
    
    // For symbols, look them up in the environment
    if (arg.type === "symbol") {
      try {
        return env.lookup((arg as SymbolNode).name);
      } catch (e) {
        // If lookup fails, return the symbol name
        return (arg as SymbolNode).name;
      }
    }
    
    // For lists, evaluate them first, then extract value
    if (arg.type === "list") {
      const evaluated = evaluateForMacro(arg, env);
      // If the result is a primitive value, return it directly
      if (typeof evaluated === 'string' || 
          typeof evaluated === 'number' || 
          typeof evaluated === 'boolean' || 
          evaluated === null) {
        return evaluated;
      }
      // Otherwise return the evaluated expression
      return evaluated;
    }
    
    // Fall back to just returning the node
    return arg;
  });
}

/**
 * Convert a JavaScript value to an HQL node
 * @param result Value to convert
 * @returns HQL node representation
 */
function convertResultToHqlNode(result: any): HQLNode {
  // If the result is a primitive value, wrap it in a literal node
  if (typeof result === 'string' || 
      typeof result === 'number' || 
      typeof result === 'boolean' || 
      result === null) {
    return { type: "literal", value: result };
  }
  
  // For arrays, convert to list nodes
  if (Array.isArray(result)) {
    return {
      type: "list",
      elements: result.map(item => 
        typeof item === 'object' && item !== null ? 
          item as HQLNode : 
          { type: "literal", value: item }
      )
    };
  }
  
  // Last resort, stringify the result
  return { type: "literal", value: String(result) };
}

/**
 * Recursively expands macros in an HQL AST node
 * @param node AST node to expand
 * @param env Environment for expansion
 * @param depth Current recursion depth (for logging)
 * @param logger Logger instance
 * @returns Expanded AST node
 */
function expandNode(
  node: HQLNode,
  env: Env,
  depth = 0,
  logger: Logger = new Logger()
): HQLNode {
  logger.debug(`[${depth}] Processing node type: ${node.type}`);

  // Base case: Not a list
  if (node.type !== "list") {
    return node;
  }
  
  const listNode = node as ListNode;
  if (listNode.elements.length === 0) {
    return listNode;
  }
  
  const first = listNode.elements[0];
  
  // Handle js-call that might be a module.function reference
  if (isJsCallWithModuleFunction(listNode)) {
    return expandJsCallWithModule(listNode, env, depth, logger);
  }
  
  // Handle regular macros and dot notation
  if (first.type === "symbol") {
    const symbolName = (first as SymbolNode).name;
    
    // Handle regular macros
    if (env.hasMacro(symbolName)) {
      return expandRegularMacro(symbolName, listNode, env, depth, logger);
    }
    
    // Handle dot notation in the symbol name
    if (symbolName.includes('.')) {
      return expandDotNotation(symbolName, listNode, env, depth, logger);
    }
  }
  
  // Not a macro, expand all elements recursively
  logger.debug(`[${depth}] Not a macro, expanding all elements`);
  return {
    type: "list",
    elements: listNode.elements.map(element => expandNode(element, env, depth + 1, logger))
  } as ListNode;
}

/**
 * Check if a node is a js-call with a module.function reference
 * @param node Node to check
 * @returns True if node is a js-call with module.function
 */
function isJsCallWithModuleFunction(node: ListNode): boolean {
  return (
    node.elements[0].type === "symbol" && 
    (node.elements[0] as SymbolNode).name === "js-call" &&
    node.elements.length >= 3 &&
    node.elements[1].type === "symbol" &&
    node.elements[2].type === "literal"
  );
}

/**
 * Expand a js-call with a module.function reference
 * @param node Node to expand
 * @param env Environment for expansion
 * @param depth Current recursion depth
 * @param logger Logger instance
 * @returns Expanded node
 */
function expandJsCallWithModule(
  node: ListNode,
  env: Env,
  depth: number,
  logger: Logger
): HQLNode {
  const moduleName = (node.elements[1] as SymbolNode).name;
  const methodName = String((node.elements[2] as LiteralNode).value);
  const qualifiedName = `${moduleName}.${methodName}`;
  
  logger.debug(`[${depth}] Detected js-call for ${qualifiedName}`);
  
  // Check if this is a registered macro by qualified name
  if (env.hasMacro(qualifiedName)) {
    return expandQualifiedMacro(qualifiedName, node, env, depth, logger);
  }
  
  // Try to look up the module directly
  try {
    return expandModuleMethod(moduleName, methodName, node, env, depth, logger);
  } catch (err) {
    logger.debug(`[${depth}] Module lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  // If we get here, we couldn't process the js-call at compile time
  // Expand all elements and return a js-call for runtime evaluation
  return {
    type: "list",
    elements: [
      node.elements[0],
      node.elements[1],
      node.elements[2],
      ...node.elements.slice(3).map(el => expandNode(el, env, depth + 1, logger))
    ]
  };
}

/**
 * Expand a qualified macro (module.macro)
 * @param qualifiedName Qualified name (module.macro)
 * @param node Node to expand
 * @param env Environment for expansion
 * @param depth Current recursion depth
 * @param logger Logger instance
 * @returns Expanded node
 */
function expandQualifiedMacro(
  qualifiedName: string,
  node: ListNode, 
  env: Env, 
  depth: number,
  logger: Logger
): HQLNode {
  logger.debug(`[${depth}] Found module macro: ${qualifiedName}`);
  const macroFn = env.getMacro(qualifiedName)!;
  
  // Arguments start from element 3 in js-call
  const args = node.elements.slice(3).map(arg => expandNode(arg, env, depth + 1, logger));
  
  try {
    // Expand the macro
    const expanded = macroFn(args, env);
    logger.debug(`[${depth}] Successfully expanded module macro: ${qualifiedName}`);
    
    // Recursively expand the result
    return expandNode(expanded, env, depth + 1, logger);
  } catch (err) {
    logger.error(`[${depth}] Error expanding module macro: ${err instanceof Error ? err.message : String(err)}`);
    
    // Return a more graceful error representation
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "js-error" },
        { type: "literal", value: `Failed to call ${qualifiedName}: ${err instanceof Error ? err.message : String(err)}` }
      ]
    };
  }
}

/**
 * Expand a module method call
 * @param moduleName Module name
 * @param methodName Method name
 * @param node Node to expand
 * @param env Environment for expansion
 * @param depth Current recursion depth
 * @param logger Logger instance
 * @returns Expanded node
 */
function expandModuleMethod(
  moduleName: string,
  methodName: string,
  node: ListNode,
  env: Env,
  depth: number,
  logger: Logger
): HQLNode {
  logger.debug(`[${depth}] Looking up module: ${moduleName}`);
  if (env.bindings.has(moduleName)) {
    const module = env.lookup(moduleName);
    
    // If the module exists and has the method
    if (module && typeof module === 'object' && methodName in module) {
      logger.debug(`[${depth}] Found method: ${methodName} in module ${moduleName}`);
      const method = module[methodName];
      
      // If it's a function that can be called at compile-time
      if (typeof method === 'function') {
        return tryCompileTimeEvaluation(method, node, env, depth, logger);
      }
    }
  }
  
  // Return original node with expanded arguments
  return {
    type: "list",
    elements: [
      node.elements[0],
      node.elements[1],
      node.elements[2],
      ...node.elements.slice(3).map(el => expandNode(el, env, depth + 1, logger))
    ]
  };
}

/**
 * Try to evaluate a method call at compile time
 * @param method Method to call
 * @param node Node containing the call
 * @param env Environment for expansion
 * @param depth Current recursion depth
 * @param logger Logger instance
 * @returns Expanded node
 */
function tryCompileTimeEvaluation(
  method: Function,
  node: ListNode,
  env: Env,
  depth: number,
  logger: Logger
): HQLNode {
  // Expand the arguments
  const expandedArgs = node.elements.slice(3).map(arg => expandNode(arg, env, depth + 1, logger));
  
  try {
    // Extract JavaScript values from the expanded arguments
    const jsArgs = expandedArgs.map(arg => {
      if (arg.type === "literal") {
        return (arg as LiteralNode).value;
      }
      // For other node types, keep as is
      return arg;
    });
    
    // Try to call the function with the extracted values
    const result = method(...jsArgs);
    logger.debug(`[${depth}] Successfully called method at compile time`);
    
    // Convert the result to a literal node when possible
    if (
      typeof result === 'string' ||
      typeof result === 'number' ||
      typeof result === 'boolean' ||
      result === null
    ) {
      return { type: "literal", value: result };
    }
  } catch (e) {
    logger.debug(`[${depth}] Method call failed, preserving for runtime: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // Return original node with expanded arguments if compile-time evaluation fails
  return {
    type: "list",
    elements: [
      node.elements[0],
      node.elements[1],
      node.elements[2],
      ...expandedArgs
    ]
  };
}

/**
 * Expand a regular macro
 * @param symbolName Macro name
 * @param node Node to expand
 * @param env Environment for expansion
 * @param depth Current recursion depth
 * @param logger Logger instance
 * @returns Expanded node
 */
function expandRegularMacro(
  symbolName: string,
  node: ListNode,
  env: Env,
  depth: number,
  logger: Logger
): HQLNode {
  logger.debug(`[${depth}] Found regular macro: ${symbolName}`);
  const macroFn = env.getMacro(symbolName)!;
  
  // Expand arguments first
  const args = node.elements.slice(1).map(arg => expandNode(arg, env, depth + 1, logger));
  
  try {
    // Expand the macro
    const expanded = macroFn(args, env);
    logger.debug(`[${depth}] Successfully expanded macro: ${symbolName}`);
    
    // Recursively expand the result
    return expandNode(expanded, env, depth + 1, logger);
  } catch (err) {
    logger.error(`[${depth}] Error expanding macro: ${err instanceof Error ? err.message : String(err)}`);
    
    // Return a more graceful error representation
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "js-error" },
        { type: "literal", value: `Failed to expand macro ${symbolName}: ${err instanceof Error ? err.message : String(err)}` }
      ]
    };
  }
}

/**
 * Expand a symbol with dot notation (module.member)
 * @param symbolName Symbol name with dot
 * @param node Node to expand
 * @param env Environment for expansion
 * @param depth Current recursion depth
 * @param logger Logger instance
 * @returns Expanded node
 */
function expandDotNotation(
  symbolName: string,
  node: ListNode,
  env: Env,
  depth: number,
  logger: Logger
): HQLNode {
  const [moduleName, memberName] = symbolName.split('.');
  logger.debug(`[${depth}] Found dot notation: ${moduleName}.${memberName}`);
  
  // Check if this is a registered macro by qualified name
  if (env.hasMacro(symbolName)) {
    return expandQualifiedDotMacro(symbolName, node, env, depth, logger);
  }
  
  // If not a macro but the module exists, convert to js-call
  try {
    logger.debug(`[${depth}] Looking up module: ${moduleName}`);
    
    if (env.bindings.has(moduleName)) {
      const module = env.lookup(moduleName);
      
      if (module && typeof module === 'object' && memberName in module) {
        logger.debug(`[${depth}] Found module member: ${memberName}`);
        
        // Convert to js-call for runtime
        return {
          type: "list",
          elements: [
            { type: "symbol", name: "js-call" },
            { type: "symbol", name: moduleName },
            { type: "literal", value: memberName },
            ...node.elements.slice(1).map(el => expandNode(el, env, depth + 1, logger))
          ]
        };
      }
    }
    
    logger.debug(`[${depth}] Module or member not found, preserving original form`);
  } catch (err) {
    logger.debug(`[${depth}] Module lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  // Expand all elements for the fallback case
  return {
    type: "list",
    elements: node.elements.map(element => expandNode(element, env, depth + 1, logger))
  };
}

/**
 * Expand a qualified macro in dot notation
 * @param symbolName Qualified name (module.macro)
 * @param node Node to expand
 * @param env Environment for expansion
 * @param depth Current recursion depth
 * @param logger Logger instance
 * @returns Expanded node
 */
function expandQualifiedDotMacro(
  symbolName: string,
  node: ListNode,
  env: Env,
  depth: number,
  logger: Logger
): HQLNode {
  logger.debug(`[${depth}] Found module macro by qualified name: ${symbolName}`);
  const macroFn = env.getMacro(symbolName)!;
  
  // Expand arguments first
  const args = node.elements.slice(1).map(arg => expandNode(arg, env, depth + 1, logger));
  
  try {
    // Expand the macro
    const expanded = macroFn(args, env);
    logger.debug(`[${depth}] Successfully expanded module macro: ${symbolName}`);
    
    // Recursively expand the result
    return expandNode(expanded, env, depth + 1, logger);
  } catch (err) {
    logger.error(`[${depth}] Error expanding module macro: ${err instanceof Error ? err.message : String(err)}`);
    
    // Return a more graceful error representation
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "js-error" },
        { type: "literal", value: `Failed to call ${symbolName}: ${err instanceof Error ? err.message : String(err)}` }
      ]
    };
  }
}

/**
 * Collect all import nodes recursively from the AST
 * @param nodes AST nodes to search
 * @returns Array of import nodes
 */
function collectAllImports(nodes: HQLNode[]): HQLNode[] {
  const imports: HQLNode[] = [];
  
  function traverse(node: HQLNode) {
    if (node.type === "list") {
      const listNode = node as ListNode;
      
      // Check if this is an import
      if (
        listNode.elements.length > 0 &&
        listNode.elements[0].type === "symbol" &&
        (listNode.elements[0] as SymbolNode).name === "import"
      ) {
        imports.push(node);
      }
      
      // Traverse all elements
      listNode.elements.forEach(traverse);
    }
  }
  
  nodes.forEach(traverse);
  return imports;
}

/**
 * Main entry point for macro expansion.
 * Initializes environment, loads imports, and expands macros recursively.
 * @param nodes AST nodes to expand
 * @param env Optional environment to use
 * @param options Expansion options
 * @returns Expanded AST nodes
 */
export async function expandMacros(
  nodes: HQLNode[],
  env?: Env,
  options: MacroExpanderOptions = {}
): Promise<HQLNode[]> {
  const logger = new Logger(options.verbose);
  logger.debug("Starting full recursive expansion");
  
  try {
    if (!env) {
      env = await initializeGlobalEnv({ verbose: options.verbose });
    }

    logger.debug("Global environment initialized");
    
    // First collect all imports in the program
    const importNodes = collectAllImports(nodes);
    logger.debug(`Found ${importNodes.length} imports in the program`);
    
    // Process all imports before expansion
    if (importNodes.length > 0) {
      try {
        await preloadMacroImports(importNodes, env, Deno.cwd(), logger);
        logger.debug("All imports processed successfully");
      } catch (error) {
        logger.error(`Error during import processing: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Expand nodes with detailed logging
    logger.debug("Starting recursive node expansion");
    
    // Add non-null assertion operator to tell TypeScript that env is definitely defined here
    const expanded = nodes.map(node => expandNode(node, env!, 0, logger));
    
    logger.debug("Expansion complete");
    
    return expanded;
  } catch (error) {
    logger.error(`Critical error during macro expansion: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}