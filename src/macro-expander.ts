// src/macro-expander.ts - Enhanced for full module support

import { HQLNode, ListNode, SymbolNode, LiteralNode } from "./transpiler/hql_ast.ts";
import { Env, initializeGlobalEnv, evaluateForMacro, MacroFunction } from "./bootstrap.ts";
import { dirname, resolve } from "./platform/platform.ts";
import { parse } from "./transpiler/parser.ts";
import { readTextFile } from "./platform/platform.ts";

/**
 * Detects if a node is an import statement
 */
export function isMacroImport(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    (node as ListNode).elements.length >= 3 &&
    (node as ListNode).elements[0].type === "symbol" &&
    ((node as ListNode).elements[0] as SymbolNode).name === "import"
  );
}

/**
 * Create a macro wrapper around a JavaScript function
 * This properly converts HQL AST nodes to JavaScript values
 */
function createFunctionMacroWrapper(func: Function): MacroFunction {
  return (args: HQLNode[], env: Env) => {
    // Convert HQL AST nodes to JavaScript values
    const jsArgs = args.map(arg => {
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
    
    // Call the function with the converted arguments
    try {
      const result = func(...jsArgs);
      
      // If the result is a primitive value, wrap it in a literal node
      if (typeof result === 'string' || 
          typeof result === 'number' || 
          typeof result === 'boolean' || 
          result === null) {
        return { type: "literal", value: result };
      }
      
      // For more complex results, try to convert them to HQL nodes
      if (Array.isArray(result)) {
        return {
          type: "list",
          elements: result.map(item => 
            typeof item === 'object' && item !== null ? 
              item : 
              { type: "literal", value: item }
          )
        };
      }
      
      // Last resort, stringify the result
      return { type: "literal", value: String(result) };
    } catch (error) {
      console.error(`Error calling function as macro: ${error.message}`);
      // Return a meaningful error representation
      return { 
        type: "list", 
        elements: [
          { type: "symbol", name: "js-error" },
          { type: "literal", value: error.message }
        ]
      };
    }
  };
}

/**
 * Enhanced preloadMacroImports that handles all import types
 */
export async function preloadMacroImports(
  nodes: HQLNode[],
  env: Env,
  basePath: string = Deno.cwd(),
  processedPaths: Set<string> = new Set()
): Promise<void> {
  console.log(`[preloadMacroImports] Processing imports from ${basePath}`);
  
  // Process each import node
  for (const node of nodes) {
    if (isMacroImport(node)) {
      const listNode = node as ListNode;
      const importNameNode = listNode.elements[1];
      const importPathNode = listNode.elements[2];

      if (importNameNode.type !== "symbol") {
        throw new Error("Macro import: import name must be a symbol");
      }
      const importName = (importNameNode as SymbolNode).name;

      if (importPathNode.type !== "literal") {
        throw new Error("Macro import: module path must be a literal string");
      }
      const importPath = String((importPathNode as LiteralNode).value);
      
      await processImportNode(node as ListNode, env, basePath);
    }
  }
}

/**
 * Register a module and all its exports in the environment
 */
export function registerModule(moduleName: string, mod: any, env: Env): void {
  console.log(`[registerModule] Registering module: ${moduleName}`);
  
  // Register the module itself
  env.define(moduleName, mod);
  
  // Register each export for qualified access
  for (const [key, value] of Object.entries(mod)) {
    if (key === "default") continue; // Skip default export as it's handled differently
    
    const qualifiedName = `${moduleName}.${key}`;
    console.log(`[registerModule] Registering qualified name: ${qualifiedName}`);
    
    // Define the exported value
    env.define(qualifiedName, value);
    
    // If it's a function, also register it as a macro with proper wrapping
    if (typeof value === 'function') {
      const macroWrapper = createFunctionMacroWrapper(value);
      env.defineMacro(qualifiedName, macroWrapper);
    }
  }
}

export const moduleRegistry = new Map<string, string>();

/**
 * Process an import statement from any source
 * Handles HQL files and remote modules consistently
 */
export async function processImportNode(

  importNode: ListNode,
  env: Env,
  currentDir: string
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
  
  console.log(`[processImportNode] Processing import: ${importName} from ${importPath}`);
  
  moduleRegistry.set(importName, importPath);

  console.log(`[processImportNode] Processing import: moduleRegistry : `, moduleRegistry);

  try {
    // HQL files need their own processing
    if (importPath.endsWith('.hql')) {
      await processHqlImport(importName, importPath, env, currentDir);
    }
    // All other imports - try to load dynamically
    else {
      try {
        let mod;
        if (importPath.startsWith("npm:")) {
          const dataUrl = `data:application/javascript,export * from "${importPath}";`;
          mod = await import(dataUrl);
        } else {
          mod = await import(importPath);
        }
        
        env.define(importName, mod);
        registerModule(importName, mod, env);
        console.log(`[processImportNode] Successfully registered module: ${importName}`);
      } catch (error) {
        console.error(`[processImportNode] Error importing module ${importPath}:`, error);
        
        // Create a placeholder module
        const placeholder = createModulePlaceholder(importName, importPath);
        env.define(importName, placeholder);
        
        // Register common methods as macro placeholders
        for (const [key, value] of Object.entries(placeholder)) {
          if (typeof value === 'function' && !key.startsWith('__')) {
            const qualifiedName = `${importName}.${key}`;
            console.log(`[processImportNode] Registering placeholder macro: ${qualifiedName}`);
            env.defineMacro(qualifiedName, createPlaceholderMacro(qualifiedName, key));
          }
        }
        
        console.log(`[processImportNode] Created placeholder for module: ${importName}`);
      }
    }
  } catch (error) {
    console.error(`[processImportNode] Critical error processing import ${importPath}:`, error);
    
    // Create a minimal placeholder to avoid breaking the entire expansion
    const errorPlaceholder = {
      __importError: true,
      __importPath: importPath,
      __errorMessage: error.message
    };
    
    env.define(importName, errorPlaceholder);
  }
}

/**
 * Create a placeholder module with appropriate methods
 */
function createModulePlaceholder(moduleName: string, importPath: string): any {
  const placeholder: any = {
    __isPlaceholder: true,
    __importPath: importPath,
    __message: `This is a placeholder for ${importPath} that will be replaced at runtime`,
    toString: () => `[Module placeholder for ${importPath}]`
  };
  
  // Path module placeholders
  if (moduleName === 'path' || importPath.includes('path')) {
    placeholder.join = createPlaceholderFunction('join');
    placeholder.resolve = createPlaceholderFunction('resolve');
    placeholder.dirname = createPlaceholderFunction('dirname');
    placeholder.basename = createPlaceholderFunction('basename');
    placeholder.extname = createPlaceholderFunction('extname');
  } 
  // FS module placeholders
  else if (moduleName === 'fs' || importPath.includes('fs')) {
    placeholder.existsSync = createPlaceholderFunction('existsSync');
    placeholder.readFileSync = createPlaceholderFunction('readFileSync');
    placeholder.writeFileSync = createPlaceholderFunction('writeFileSync');
  }
  // Lodash module placeholders
  else if (moduleName === 'lodash' || importPath.includes('lodash')) {
    placeholder.capitalize = createPlaceholderFunction('capitalize');
    placeholder.map = createPlaceholderFunction('map');
    placeholder.filter = createPlaceholderFunction('filter');
    placeholder.reduce = createPlaceholderFunction('reduce');
  }
  
  return placeholder;
}

/**
 * Create a placeholder function that returns a default value
 */
function createPlaceholderFunction(name: string): Function {
  return function(...args: any[]) {
    console.log(`Placeholder function ${name} called with args:`, args);
    
    // Return reasonable defaults based on function name
    if (name === 'join' || name === 'resolve' || name === 'dirname' || name === 'basename') {
      return String(args[0] || '');
    } else if (name === 'existsSync') {
      return false;
    } else if (name === 'capitalize' && typeof args[0] === 'string') {
      // Basic capitalize implementation for lodash
      return args[0].charAt(0).toUpperCase() + args[0].slice(1);
    } else {
      return null;
    }
  };
}

/**
 * Create a placeholder macro that converts to js-call for runtime
 */
function createPlaceholderMacro(qualifiedName: string, methodName: string): MacroFunction {
  return (args: HQLNode[], env: Env) => {
    const [moduleName] = qualifiedName.split('.');
    
    // Return a js-call node for runtime evaluation
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "js-call" },
        { type: "symbol", name: moduleName },
        { type: "literal", value: methodName },
        ...args
      ]
    };
  };
}

/**
 * Process an HQL file import
 */
export async function processHqlImport(
  moduleName: string,
  modulePath: string,
  env: Env,
  currentDir: string,
  processedPaths: Set<string> = new Set()
): Promise<void> {
  try {
    // Resolve path relative to current directory
    const resolvedPath = resolve(currentDir, modulePath);
    console.log(`[processHqlImport] Resolved import path: ${resolvedPath}`);
    
    // Skip if already processed to avoid circular dependencies
    if (processedPaths.has(resolvedPath)) {
      console.log(`[processHqlImport] Skipping already processed: ${resolvedPath}`);
      return;
    }
    processedPaths.add(resolvedPath);
    
    // Read and parse the file
    let source: string;
    try {
      source = await readTextFile(resolvedPath);
    } catch (error) {
      console.error(`[processHqlImport] Error reading file ${resolvedPath}:`, error);
      
      // Create a placeholder module with error information
      const placeholder = {
        __importError: true,
        __importPath: modulePath,
        __errorMessage: `Failed to read HQL file: ${error.message}`
      };
      
      env.define(moduleName, placeholder);
      return;
    }
    
    const importedAst = parse(source);
    console.log(`[processHqlImport] Parsed imported file: ${importedAst.length} nodes`);
    
    // Create module object to store exports
    const moduleExports: Record<string, any> = {};
    
    // Process any nested imports first
    for (const node of importedAst) {
      if (isMacroImport(node)) {
        const importDir = dirname(resolvedPath);
        await processImportNode(node as ListNode, env, importDir);
      }
    }
    
    // Register all macro definitions from the imported file
    for (const node of importedAst) {
      if (
        node.type === "list" &&
        (node as ListNode).elements.length > 0 &&
        (node as ListNode).elements[0].type === "symbol" &&
        ((node as ListNode).elements[0] as SymbolNode).name === "defmacro"
      ) {
        const macroList = node as ListNode;
        if (macroList.elements.length >= 3 && macroList.elements[1].type === "symbol") {
          const macroName = (macroList.elements[1] as SymbolNode).name;
          console.log(`[processHqlImport] Found macro definition: ${macroName}`);
          
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
            console.log(`[processHqlImport] Registered qualified macro: ${qualifiedName}`);
          }
        }
      }
    }
    
    // Also process definitions (def forms)
    for (const node of importedAst) {
      if (
        node.type === "list" &&
        (node as ListNode).elements.length > 0 &&
        (node as ListNode).elements[0].type === "symbol" &&
        ((node as ListNode).elements[0] as SymbolNode).name === "def"
      ) {
        const defList = node as ListNode;
        if (defList.elements.length >= 3 && defList.elements[1].type === "symbol") {
          const defName = (defList.elements[1] as SymbolNode).name;
          console.log(`[processHqlImport] Found definition: ${defName}`);
          
          try {
            // Evaluate the definition in the environment
            const value = evaluateForMacro(node, env);
            
            // Store in module exports
            moduleExports[defName] = value;
            
            // Register with qualified name
            const qualifiedName = `${moduleName}.${defName}`;
            env.define(qualifiedName, value);
            console.log(`[processHqlImport] Registered qualified definition: ${qualifiedName}`);
          } catch (error) {
            console.error(`[processHqlImport] Error evaluating definition ${defName}:`, error);
          }
        }
      }
    }
    
    // Register the module itself
    env.define(moduleName, moduleExports);
    console.log(`[processHqlImport] Registered module ${moduleName} with exports:`, Object.keys(moduleExports));
  } catch (error) {
    console.error(`[processHqlImport] Error processing HQL import ${modulePath}:`, error);
    
    // Create a placeholder module with error information
    const placeholder = {
      __importError: true,
      __importPath: modulePath,
      __errorMessage: error.message
    };
    
    env.define(moduleName, placeholder);
  }
}

/**
 * Recursively expands macros in an HQL AST node.
 */
function expandNode(node: HQLNode, env?: Env = undefined, depth = 0): HQLNode {
  const indent = " ".repeat(depth * 2);
  console.log(`${indent}[expandNode:${depth}] Processing node type: ${node.type}`);

  // Base case: Not a list
  if (node.type !== "list") {
    return node;
  }
  
  const listNode = node as ListNode;
  if (listNode.elements.length === 0) {
    return listNode;
  }
  
  const first = listNode.elements[0];
  
  // CASE 1: Special handling for js-call that might be a module.function reference
  if (
    first.type === "symbol" && 
    (first as SymbolNode).name === "js-call" &&
    listNode.elements.length >= 3 &&
    listNode.elements[1].type === "symbol" &&
    listNode.elements[2].type === "literal"
  ) {
    const moduleName = (listNode.elements[1] as SymbolNode).name;
    const methodName = String((listNode.elements[2] as LiteralNode).value);
    const qualifiedName = `${moduleName}.${methodName}`;
    
    console.log(`${indent}[expandNode:${depth}] Detected js-call for ${qualifiedName}`);
    
    // Check if this is a registered macro by qualified name
    if (env.hasMacro(qualifiedName)) {
      console.log(`${indent}[expandNode:${depth}] Found module macro: ${qualifiedName}`);
      const macroFn = env.getMacro(qualifiedName)!;
      
      // Arguments start from element 3 in js-call
      const args = listNode.elements.slice(3).map(arg => expandNode(arg, env, depth + 1));
      
      try {
        // Expand the macro
        const expanded = macroFn(args, env);
        console.log(`${indent}[expandNode:${depth}] Successfully expanded module macro: ${qualifiedName}`);
        
        // Recursively expand the result
        return expandNode(expanded, env, depth + 1);
      } catch (err) {
        console.error(`${indent}[expandNode:${depth}] Error expanding module macro: ${err}`);
        
        // Return a more graceful error representation
        return {
          type: "list",
          elements: [
            { type: "symbol", name: "js-error" },
            { type: "literal", value: `Failed to call ${qualifiedName}: ${err.message}` }
          ]
        };
      }
    }
    
    // Try to look up the module directly
    try {
      console.log(`${indent}[expandNode:${depth}] Looking up module: ${moduleName}`);
      if (env.bindings.has(moduleName)) {
        const module = env.lookup(moduleName);
        
        // If the module exists and has the method
        if (module && typeof module === 'object' && methodName in module) {
          console.log(`${indent}[expandNode:${depth}] Found method: ${methodName} in module ${moduleName}`);
          const method = module[methodName];
          
          // If it's a function that can be called at compile-time
          if (typeof method === 'function') {
            // Expand the arguments
            const expandedArgs = listNode.elements.slice(3).map(arg => expandNode(arg, env, depth + 1));
            
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
              console.log(`${indent}[expandNode:${depth}] Successfully called method at compile time`);
              
              // Convert the result to a literal node when possible
              if (
                typeof result === 'string' ||
                typeof result === 'number' ||
                typeof result === 'boolean' ||
                result === null
              ) {
                return { type: "literal", value: result };
              }
              
              // For complex results that can't be converted to literals,
              // keep the original js-call for runtime evaluation
            } catch (e) {
              console.log(`${indent}[expandNode:${depth}] Method call failed, preserving for runtime: ${e.message}`);
            }
          }
        }
      }
    } catch (err) {
      console.log(`${indent}[expandNode:${depth}] Module lookup failed: ${err.message}`);
    }
    
    // If we get here, we couldn't process the js-call at compile time
    // Expand all elements and return a js-call for runtime evaluation
    return {
      type: "list",
      elements: [
        first,
        listNode.elements[1],
        listNode.elements[2],
        ...listNode.elements.slice(3).map(el => expandNode(el, env, depth + 1))
      ]
    };
  }
  
  // CASE 2: Handle regular macros and dot notation
  if (first.type === "symbol") {
    const symbolName = (first as SymbolNode).name;
    
    // Handle regular macros
    if (env.hasMacro(symbolName)) {
      console.log(`${indent}[expandNode:${depth}] Found regular macro: ${symbolName}`);
      const macroFn = env.getMacro(symbolName)!;
      
      // Expand arguments first
      const args = listNode.elements.slice(1).map(arg => expandNode(arg, env, depth + 1));
      
      try {
        // Expand the macro
        const expanded = macroFn(args, env);
        console.log(`${indent}[expandNode:${depth}] Successfully expanded macro: ${symbolName}`);
        
        // Recursively expand the result
        return expandNode(expanded, env, depth + 1);
      } catch (err) {
        console.error(`${indent}[expandNode:${depth}] Error expanding macro: ${err}`);
        
        // Return a more graceful error representation
        return {
          type: "list",
          elements: [
            { type: "symbol", name: "js-error" },
            { type: "literal", value: `Failed to expand macro ${symbolName}: ${err.message}` }
          ]
        };
      }
    }
    
    // Check for dot notation in the symbol name
    if (symbolName.includes('.')) {
      const [moduleName, memberName] = symbolName.split('.');
      console.log(`${indent}[expandNode:${depth}] Found dot notation: ${moduleName}.${memberName}`);
      
      // Check if this is a registered macro by qualified name
      if (env.hasMacro(symbolName)) {
        console.log(`${indent}[expandNode:${depth}] Found module macro by qualified name: ${symbolName}`);
        const macroFn = env.getMacro(symbolName)!;
        
        // Expand arguments first
        const args = listNode.elements.slice(1).map(arg => expandNode(arg, env, depth + 1));
        
        try {
          // Expand the macro
          const expanded = macroFn(args, env);
          console.log(`${indent}[expandNode:${depth}] Successfully expanded module macro: ${symbolName}`);
          
          // Recursively expand the result
          return expandNode(expanded, env, depth + 1);
        } catch (err) {
          console.error(`${indent}[expandNode:${depth}] Error expanding module macro: ${err}`);
          
          // Return a more graceful error representation
          return {
            type: "list",
            elements: [
              { type: "symbol", name: "js-error" },
              { type: "literal", value: `Failed to call ${symbolName}: ${err.message}` }
            ]
          };
        }
      }
      
      // If not a macro but the module exists, convert to js-call
      try {
        console.log(`${indent}[expandNode:${depth}] Looking up module: ${moduleName}`);
        
        if (env.bindings.has(moduleName)) {
          const module = env.lookup(moduleName);
          
          if (module && typeof module === 'object' && memberName in module) {
            console.log(`${indent}[expandNode:${depth}] Found module member: ${memberName}`);
            
            // Convert to js-call for runtime
            return {
              type: "list",
              elements: [
                { type: "symbol", name: "js-call" },
                { type: "symbol", name: moduleName },
                { type: "literal", value: memberName },
                ...listNode.elements.slice(1).map(el => expandNode(el, env, depth + 1))
              ]
            };
          }
        }
        
        console.log(`${indent}[expandNode:${depth}] Module or member not found, preserving original form`);
      } catch (err) {
        console.log(`${indent}[expandNode:${depth}] Module lookup failed: ${err.message}`);
      }
    }
  }
  
  // CASE 3: Not a macro, expand all elements recursively
  console.log(`${indent}[expandNode:${depth}] Not a macro, expanding all elements`);
  return {
    type: "list",
    elements: listNode.elements.map(element => expandNode(element, env, depth + 1))
  } as ListNode;
}

/**
 * Main entry point for macro expansion.
 * Initializes environment, loads imports, and expands macros recursively.
 */
export async function expandMacros(nodes: HQLNode[], env?: Env): Promise<HQLNode[]> {
  console.log("[expandMacros] Starting full recursive expansion");
  
  try {
    if (!env) {
      env = await initializeGlobalEnv();
    }

    console.log("[expandMacros] Global environment initialized with nodes : ", nodes);
    
    // First collect all imports in the program
    const importNodes = collectAllImports(nodes);
    console.log(`[expandMacros] Found ${importNodes.length} imports in the program`);
    
    // Process all imports before expansion
    if (importNodes.length > 0) {
      try {
        await preloadMacroImports(importNodes, env);
        console.log("[expandMacros] All imports processed successfully");
      } catch (error) {
        console.error("[expandMacros] Error during import processing:", error);
        console.log("[expandMacros] Continuing with macro expansion despite import errors");
      }
    }
    
    // Expand nodes with detailed logging
    console.log("[expandMacros] Starting recursive node expansion");
    const expanded = nodes.map(node => expandNode(node, env));
    
    console.log("[expandMacros] Expansion complete");
    
    return expanded;
  } catch (error) {
    console.error("[expandMacros] Critical error during macro expansion:", error);
    throw error;
  }
}

/**
 * Collect all import nodes recursively from the AST
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