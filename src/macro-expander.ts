// src/macro-expander.ts - Updated to ensure imports work with macros

import { parse } from "./transpiler/parser.ts";
import { Env, initializeGlobalEnv, evaluateForMacro } from "./bootstrap.ts";
import { HQLNode, ListNode, SymbolNode } from "./transpiler/hql_ast.ts";

// Global macro environment
let globalEnv: Env | null = null;

// Module import registry to track imports used by macros
export const moduleRegistry = new Set<string>();

/**
 * Initialize the macro environment by creating a minimal environment
 * and loading core macros.
 */
async function initMacroEnvironment(): Promise<Env> {
  if (!globalEnv) {
    globalEnv = await initializeGlobalEnv();
    await loadCoreMacros(globalEnv);
    await loadExtensions(globalEnv);
  }
  return globalEnv;
}

/**
 * Load core macros from lib/core.hql into the provided environment.
 * These are the foundational macros built on top of the minimal kernel.
 */
async function loadCoreMacros(env: Env): Promise<void> {
  try {
    const coreSource = await Deno.readTextFile("./lib/core.hql");
    const coreAST = parse(coreSource);
    
    // Process core macros sequentially to respect definitions
    for (const node of coreAST) {
      try {
        // Special handling for import statements to make them work during macro expansion
        if (node.type === "list" && 
            node.elements[0]?.type === "symbol" && 
            (node.elements[0] as SymbolNode).name === "import") {
          
          if (node.elements.length !== 3) {
            throw new Error("import requires exactly 2 arguments: name and path");
          }
          
          const nameNode = node.elements[1];
          const pathNode = node.elements[2];
          
          if (nameNode.type !== "symbol") {
            throw new Error("import name must be a symbol");
          }
          
          if (pathNode.type !== "literal" || typeof pathNode.value !== "string") {
            throw new Error("import path must be a string literal");
          }
          
          const moduleName = (nameNode as SymbolNode).name;
          const modulePath = pathNode.value as string;
          
          // Track the import in the registry
          if (modulePath.startsWith("npm:")) {
            moduleRegistry.add(modulePath.substring(4));
          }
          
          // Use the js-import function defined in the environment
          const jsImportFn = env.lookup("js-import");
          await jsImportFn(moduleName, modulePath, env);
          
        } else {
          // Process other forms normally
          await evaluateForMacro(node, env);
        }
      } catch (e) {
        console.error(`Error processing core macro:`, e);
        throw new Error(`Error loading core macro ${JSON.stringify(node)}: ${e.message}`);
      }
    }
    
    // Always ensure lodash is available if registered (important for macros)
    if (moduleRegistry.has("lodash")) {
      try {
        const jsImportFn = env.lookup("js-import");
        await jsImportFn("lodash", "npm:lodash", env);
      } catch (e) {
        console.error("Failed to ensure lodash is available:", e);
      }
    }
    
  } catch (e) {
    console.error(`Failed to load core macros:`, e);
    throw new Error(`Failed to load core macros: ${e.message}`);
  }
}

/**
 * Load extensions from lib/extensions.hql after core macros are loaded.
 */
async function loadExtensions(env: Env): Promise<void> {
  try {
    // First check if the file exists
    try {
      await Deno.stat("./lib/extensions.hql");
    } catch (e) {
      console.log("No extensions.hql file found, skipping");
      return;
    }
    
    // Load and parse extensions file
    const extSource = await Deno.readTextFile("./lib/extensions.hql");
    const extAST = parse(extSource);
    
    // Process extensions sequentially
    for (const node of extAST) {
      try {
        // Special handling for import statements
        if (node.type === "list" && 
            node.elements[0]?.type === "symbol" && 
            (node.elements[0] as SymbolNode).name === "import") {
          
          if (node.elements.length !== 3) {
            throw new Error("import requires exactly 2 arguments: name and path");
          }
          
          const nameNode = node.elements[1];
          const pathNode = node.elements[2];
          
          if (nameNode.type !== "symbol") {
            throw new Error("import name must be a symbol");
          }
          
          if (pathNode.type !== "literal" || typeof pathNode.value !== "string") {
            throw new Error("import path must be a string literal");
          }
          
          const moduleName = (nameNode as SymbolNode).name;
          const modulePath = pathNode.value as string;
          
          // Track the import in the registry
          if (modulePath.startsWith("npm:")) {
            moduleRegistry.add(modulePath.substring(4));
          }
          
          // Use the js-import function defined in the environment
          const jsImportFn = env.lookup("js-import");
          await jsImportFn(moduleName, modulePath, env);
          
        } else {
          // Process other forms normally
          await evaluateForMacro(node, env);
        }
      } catch (e) {
        console.error(`Error processing extension:`, e);
        throw new Error(`Error loading extension ${JSON.stringify(node)}: ${e.message}`);
      }
    }
    
    console.log("Extensions loaded successfully");
  } catch (e) {
    // Don't fail if extensions file doesn't exist
    if (e instanceof Deno.errors.NotFound) {
      console.log("No extensions.hql file found, skipping");
      return;
    }
    
    console.error(`Failed to load extensions:`, e);
    throw new Error(`Failed to load extensions: ${e.message}`);
  }
}

/**
 * Public function to expand macros in an array of HQL AST nodes.
 * This is the main entry point for macro expansion in the pipeline.
 */
export async function expandMacros(nodes: HQLNode[]): Promise<HQLNode[]> {
  const env = await initMacroEnvironment();
  
  // Process nodes sequentially, so macros defined earlier can be used later
  const result: HQLNode[] = [];
  
  for (const node of nodes) {
    // Special handling for import forms at the top level
    if (node.type === "list" && 
        node.elements[0]?.type === "symbol" && 
        (node.elements[0] as SymbolNode).name === "import") {
          
      if (node.elements.length !== 3) {
        throw new Error("import requires exactly 2 arguments: name and path");
      }
      
      const nameNode = node.elements[1];
      const pathNode = node.elements[2];
      
      if (nameNode.type !== "symbol") {
        throw new Error("import name must be a symbol");
      }
      
      if (pathNode.type !== "literal" || typeof pathNode.value !== "string") {
        throw new Error("import path must be a string literal");
      }
      
      const moduleName = (nameNode as SymbolNode).name;
      const modulePath = pathNode.value;
      
      // Track the import in the registry
      if (typeof modulePath === 'string' && modulePath.startsWith("npm:")) {
        moduleRegistry.add(modulePath.substring(4));
      }
      
      // Use the js-import function from the environment
      const jsImportFn = env.lookup("js-import");
      await jsImportFn(moduleName, modulePath, env);
      
      // Keep the import node in the result for the transpiler
      result.push(node);
    } else {
      // Expand other nodes normally
      result.push(await expandNode(node, env));
    }
  }
  
  return result;
}

/**
 * Process a quasiquoted expression, expanding unquotes and unquote-splicing.
 * This is crucial for expressive macro definitions.
 */
async function processQuasiquote(node: HQLNode, env: Env): Promise<HQLNode> {
  // Handle non-list nodes directly
  if (node.type !== "list") {
    return node;
  }
  
  const list = node as ListNode;
  if (list.elements.length === 0) return list;
  
  const first = list.elements[0];
  if (first.type === "symbol") {
    const symbolName = (first as SymbolNode).name;
    
    // Handle unquote
    if (symbolName === "unquote") {
      if (list.elements.length !== 2) {
        throw new Error("unquote requires exactly 1 argument");
      }
      // Expand the unquoted expression
      return await expandNode(list.elements[1], env);
    }
    
    // Handle unquote-splicing (should be caught by processListQuasiquote)
    if (symbolName === "unquote-splicing") {
      throw new Error("unquote-splicing not allowed in this context");
    }
  }
  
  return await processListQuasiquote(list, env);
}

/**
 * Helper function to process quasiquote for list nodes.
 */
async function processListQuasiquote(list: ListNode, env: Env): Promise<ListNode> {
  const processedElements: HQLNode[] = [];
  
  for (let i = 0; i < list.elements.length; i++) {
    const elem = list.elements[i];
    
    // Handle unquote-splicing
    if (isUnquoteSplicing(elem)) {
      // Ensure we have exactly 2 elements in the unquote-splicing expression
      if ((elem as ListNode).elements.length !== 2) {
        throw new Error("unquote-splicing requires exactly 1 argument");
      }
      
      // Expand the unquote-splicing expression
      const expanded = await expandNode((elem as ListNode).elements[1], env);
      if (expanded.type !== "list") {
        throw new Error("unquote-splicing requires a list result");
      }
      
      // Splice the result into the current list
      processedElements.push(...(expanded as ListNode).elements);
    } else {
      // Regular processing
      processedElements.push(await processQuasiquote(elem, env));
    }
  }
  
  return {
    type: "list",
    elements: processedElements
  } as ListNode;
}

/**
 * Helper function to check if a node is an unquote-splicing expression.
 */
function isUnquoteSplicing(node: HQLNode): boolean {
  return node.type === "list" && 
         (node as ListNode).elements.length > 0 && 
         (node as ListNode).elements[0].type === "symbol" && 
         ((node as ListNode).elements[0] as SymbolNode).name === "unquote-splicing";
}

/**
 * Recursively expand macros in a given HQL AST node.
 * This is the core function for macro expansion.
 */
async function expandNode(node: HQLNode, env: Env): Promise<HQLNode> {
  if (node.type !== "list") {
    // Literals and symbols pass through unchanged
    return node;
  }
  
  const list = node as ListNode;
  
  // Empty lists pass through unchanged
  if (list.elements.length === 0) return list;
  
  const first = list.elements[0];
  
  // Only lists that start with a symbol can be macro invocations
  if (first.type !== "symbol") {
    // Recursively expand each element in the list
    const expandedElements = await Promise.all(
      list.elements.map(child => expandNode(child, env))
    );
    
    return {
      type: "list",
      elements: expandedElements
    } as ListNode;
  }
  
  const symbolName = (first as SymbolNode).name;
  
  // Check if this is a macro invocation
  if (env.hasMacro(symbolName)) {
    return await expandMacroInvocation(list, symbolName, env);
  }
  
  // Handle special forms
  if (symbolName === "quote") {
    // Do not expand inside a quote
    return list;
  }
  
  if (symbolName === "quasiquote") {
    if (list.elements.length !== 2) {
      throw new Error("quasiquote requires exactly 1 argument");
    }
    // Process the quasiquoted expression
    return await processQuasiquote(list.elements[1], env);
  }
  
  // Special handling for def and defmacro to support sequential definition
  if (symbolName === "def" || symbolName === "defmacro") {
    // Expand the initialization expression if present
    if (list.elements.length === 3) {
      return {
        type: "list",
        elements: [
          first,
          list.elements[1],
          await expandNode(list.elements[2], env)
        ]
      } as ListNode;
    }
    return list;
  }
  
  // Recursively expand each element in the list for other forms
  const expandedElements = await Promise.all(
    list.elements.map(child => expandNode(child, env))
  );
  
  return {
    type: "list",
    elements: expandedElements
  } as ListNode;
}

/**
 * Expand a macro invocation by calling the macro function and expanding the result.
 */
async function expandMacroInvocation(list: ListNode, macroName: string, env: Env): Promise<HQLNode> {
  const macroFn = env.getMacro(macroName)!;
  const args = list.elements.slice(1);
  
  try {
    // The macro function is now async
    const expanded = await macroFn(args, env);
    
    // Recursively expand the result, in case it contains more macros
    return await expandNode(expanded, env);
  } catch (e) {
    throw new Error(
      `Error expanding macro '${macroName}' with args ${JSON.stringify(args)}: ${e.message}`
    );
  }
}