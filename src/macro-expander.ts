// src/macro-expander.ts - Complete with fully recursive expansion

import { HQLNode, ListNode, SymbolNode, LiteralNode } from "./transpiler/hql_ast.ts";
import { Env, initializeGlobalEnv, evaluateForMacro } from "./bootstrap.ts";
import { parse } from "./transpiler/parser.ts";
import { dirname, resolve, readTextFile } from "./platform/platform.ts";

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
 * Preloads all macro imports, making them available during expansion
 */
export async function preloadMacroImports(nodes: HQLNode[], env: Env): Promise<void> {
  console.log("[preloadMacroImports] Starting import processing");
  
  // We don't need to do anything here since bootstrap.ts already handles imports
  console.log("[preloadMacroImports] Import processing completed (handled by bootstrap)");
}

/**
 * Process an HQL file import, extracting macros and definitions
 */
async function processHqlImport(
  moduleName: string,
  modulePath: string,
  env: Env
): Promise<void> {
  try {
    // Resolve the path relative to current directory
    const currentDir = Deno.cwd();
    const resolvedPath = resolve(currentDir, modulePath);
    console.log(`[processHql] Resolved import path: ${resolvedPath}`);
    
    // Read the file
    const fileContent = await readTextFile(resolvedPath);
    console.log(`[processHql] Read HQL file: ${modulePath}`);
    
    // Parse it
    const moduleAst = parse(fileContent);
    console.log(`[processHql] Parsed module with ${moduleAst.length} nodes`);
    
    // Create module object to store exports
    const moduleExports: Record<string, any> = {};
    
    // Process any nested imports first
    const importNodes = moduleAst.filter(node => isMacroImport(node));
    if (importNodes.length > 0) {
      console.log(`[processHql] Module has ${importNodes.length} imports, processing them first`);
      await preloadMacroImports(importNodes, env);
    }
    
    // Process macro definitions
    for (const node of moduleAst) {
      if (
        node.type === "list" &&
        (node as ListNode).elements.length > 0 &&
        (node as ListNode).elements[0].type === "symbol" &&
        ((node as ListNode).elements[0] as SymbolNode).name === "defmacro"
      ) {
        const macroList = node as ListNode;
        if (macroList.elements.length >= 3 && macroList.elements[1].type === "symbol") {
          const macroName = (macroList.elements[1] as SymbolNode).name;
          console.log(`[processHql] Found macro definition: ${macroName}`);
          
          // Evaluate the macro to register it
          evaluateForMacro(node, env);
          
          // Get the registered macro function
          const macroFn = env.getMacro(macroName);
          if (macroFn) {
            // Store in module exports
            moduleExports[macroName] = macroFn;
            
            // CRITICAL: Register with fully qualified name
            const qualifiedName = `${moduleName}.${macroName}`;
            env.defineMacro(qualifiedName, macroFn);
            console.log(`[processHql] Registered qualified macro: ${qualifiedName}`);
          }
        }
      }
    }
    
    // Process other definitions
    for (const node of moduleAst) {
      if (
        node.type === "list" &&
        (node as ListNode).elements.length > 0 &&
        (node as ListNode).elements[0].type === "symbol" &&
        ((node as ListNode).elements[0] as SymbolNode).name === "def"
      ) {
        const defList = node as ListNode;
        if (defList.elements.length >= 3 && defList.elements[1].type === "symbol") {
          const defName = (defList.elements[1] as SymbolNode).name;
          console.log(`[processHql] Found definition: ${defName}`);
          
          // Evaluate the definition
          const value = evaluateForMacro(node, env);
          
          // Store in module exports
          moduleExports[defName] = value;
          
          // Register with qualified name
          const qualifiedName = `${moduleName}.${defName}`;
          env.define(qualifiedName, value);
          console.log(`[processHql] Registered qualified definition: ${qualifiedName}`);
        }
      }
    }
    
    // Register the complete module
    env.define(moduleName, moduleExports);
    console.log(`[processHql] Registered module ${moduleName} with exports:`, Object.keys(moduleExports));
  } catch (error) {
    console.error(`[processHql] Error processing HQL import ${modulePath}:`, error);
    throw error;
  }
}

function expandDotNotation(listNode: ListNode, env: Env, depth = 0): HQLNode | null {
  // Check if we have a js-call with a module reference
  if (
    listNode.elements.length >= 4 &&
    listNode.elements[0].type === "symbol" &&
    (listNode.elements[0] as SymbolNode).name === "js-call" &&
    listNode.elements[1].type === "symbol" &&
    listNode.elements[2].type === "literal"
  ) {
    const moduleName = (listNode.elements[1] as SymbolNode).name;
    const memberName = String((listNode.elements[2] as LiteralNode).value);
    
    // Construct the qualified name
    const qualifiedName = `${moduleName}.${memberName}`;
    
    console.log(`[expandDotNotation] Detected possible module macro: ${qualifiedName}`);
    
    // Check if this is a registered macro
    if (env.hasMacro(qualifiedName)) {
      console.log(`[expandDotNotation] Found registered macro: ${qualifiedName}`);
      
      // Get the macro function
      const macroFn = env.getMacro(qualifiedName)!;
      
      // Get the arguments (skip the first 3 elements of js-call)
      const args = listNode.elements.slice(3).map(arg => expandNode(arg, env, depth + 1));
      
      try {
        // Expand the macro
        const expanded = macroFn(args, env);
        console.log(`[expandDotNotation] Successfully expanded module macro: ${qualifiedName}`);
        
        // Recursively expand the result
        return expandNode(expanded, env, depth + 1);
      } catch (err) {
        console.error(`[expandDotNotation] Error expanding module macro: ${err.message}`);
        throw err;
      }
    }
  }
  
  // Not a module macro reference
  return null;
}

/**
 * Recursively expands macros in an HQL AST node.
 * This version handles both direct macros and module.macro references,
 * ensuring everything is fully expanded down to primitive forms.
 */
function expandNode(node: HQLNode, env: Env, depth = 0): HQLNode {
  const indent = " ".repeat(depth * 2);
  console.log(`${indent}[expandNode:${depth}] Processing node type: ${node.type}`);

  // Base case: not a list
  if (node.type !== "list") {
    return node;
  }
  
  const listNode = node as ListNode;
  if (listNode.elements.length === 0) {
    return listNode;
  }

  const dotNotationResult = expandDotNotation(listNode, env, depth);
  if (dotNotationResult) {
    return dotNotationResult;
  }
  
  const first = listNode.elements[0];
  if (first.type !== "symbol") {
    // Recursively expand each element in the list
    console.log(`${indent}[expandNode:${depth}] List doesn't start with symbol, expanding elements`);
    return {
      type: "list",
      elements: listNode.elements.map(element => expandNode(element, env, depth + 1))
    } as ListNode;
  }
  
  const symbolName = (first as SymbolNode).name;
  console.log(`${indent}[expandNode:${depth}] List starts with symbol: ${symbolName}`);
  
  // SPECIAL CASE: Handle module.member references (e.g., other.square)
  if (symbolName.includes('.')) {
    const [moduleName, memberName] = symbolName.split('.');
    console.log(`${indent}[expandNode:${depth}] Found module reference: ${moduleName}.${memberName}`);
    
    // Try looking up with fully qualified name first
    if (env.hasMacro(symbolName)) {
      console.log(`${indent}[expandNode:${depth}] Found macro with qualified name: ${symbolName}`);
      const macroFn = env.getMacro(symbolName)!;
      const args = listNode.elements.slice(1).map(arg => expandNode(arg, env, depth + 1));
      
      try {
        const expanded = macroFn(args, env);
        console.log(`${indent}[expandNode:${depth}] Successfully expanded qualified macro: ${symbolName}`);
        return expandNode(expanded, env, depth + 1);
      } catch (err) {
        console.error(`${indent}[expandNode:${depth}] Error expanding qualified macro: ${err.message}`);
        throw err;
      }
    }
    
    // If not found as a qualified macro, try looking up the module
    try {
      console.log(`${indent}[expandNode:${depth}] Looking up module: ${moduleName}`);
      const module = env.lookup(moduleName);
      
      if (module && typeof module === 'object' && memberName in module) {
        console.log(`${indent}[expandNode:${depth}] Found member ${memberName} in module ${moduleName}`);
        const member = module[memberName];
        
        if (typeof member === 'function') {
          console.log(`${indent}[expandNode:${depth}] Member is a function, calling it`);
          const args = listNode.elements.slice(1).map(arg => expandNode(arg, env, depth + 1));
          
          try {
            const result = member(args, env);
            console.log(`${indent}[expandNode:${depth}] Successfully called module member function`);
            return expandNode(result, env, depth + 1);
          } catch (err) {
            console.error(`${indent}[expandNode:${depth}] Error calling module member: ${err.message}`);
            throw err;
          }
        } else {
          console.log(`${indent}[expandNode:${depth}] Member is not a function, returning as literal`);
          return { type: "literal", value: member };
        }
      }
    } catch (error) {
      console.log(`${indent}[expandNode:${depth}] Error looking up module: ${error.message}`);
    }
    
    // If we get here, we couldn't process it as a module.member reference
    console.log(`${indent}[expandNode:${depth}] Could not process as module.member, expanding arguments`);
    return {
      type: "list",
      elements: [
        first,
        ...listNode.elements.slice(1).map(element => expandNode(element, env, depth + 1))
      ]
    } as ListNode;
  }
  
  // Handle regular macros
  if (env.hasMacro(symbolName)) {
    console.log(`${indent}[expandNode:${depth}] Found regular macro: ${symbolName}`);
    const macroFn = env.getMacro(symbolName)!;
    const args = listNode.elements.slice(1).map(arg => expandNode(arg, env, depth + 1));
    
    try {
      const expanded = macroFn(args, env);
      console.log(`${indent}[expandNode:${depth}] Successfully expanded regular macro: ${symbolName}`);
      
      // DEBUG: Print the expanded form
      console.log(`${indent}[expandNode:${depth}] Expanded form:`, JSON.stringify(expanded));
      
      // CRITICAL: Recursively expand the result
      return expandNode(expanded, env, depth + 1);
    } catch (err) {
      console.error(`${indent}[expandNode:${depth}] Error expanding macro: ${err.message}`);
      throw err;
    }
  }
  
  // Not a macro, expand all elements
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
export async function expandMacros(nodes: HQLNode[]): Promise<HQLNode[]> {
  console.log("[expandMacros] Starting full recursive expansion");
  
  // Initialize environment with core macros
  const env: Env = await initializeGlobalEnv();
  console.log("[expandMacros] Global environment initialized");
  
  // We don't need to process imports here because bootstrap already does it
  
  console.log("[expandMacros] Starting recursive node expansion");
  // Log all registered macros for debugging
  console.log("[expandMacros] All registered macros:", Array.from(env.macros.keys()));
  
  // Expand nodes with detailed logging
  const expanded = nodes.map(node => expandNode(node, env));
  
  // Debug: Log expanded result
  console.log("[expandMacros] Expansion complete. Result:", JSON.stringify(expanded));
  
  return expanded;
}