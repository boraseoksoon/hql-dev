// src/transpiler/transformer.ts - Updated with minimal runtime

import { parse } from "./parser.ts";
import { transformToIR } from "./hql-code-to-hql-ir.ts";
import { generateTypeScript } from "./ts-ast-to-ts-code.ts";
import { dirname, resolve, readTextFile, writeTextFile } from "../platform/platform.ts";
import { expandMacros } from "../macro-expander.ts";
import { HQLNode, ListNode, SymbolNode } from "./hql_ast.ts";
import * as IR from "./hql_ir.ts";
import { HQLImportHandler } from "./hql_import_handler.ts";
import { moduleRegistry } from "../macro-expander.ts";
import { Env, initializeGlobalEnv } from "../bootstrap.ts";

// Replace the current RUNTIME_FUNCTIONS with this enhanced version:
const RUNTIME_FUNCTIONS = `
// Enhanced runtime functions for HQL transpilation

/**
 * Helper for property access
 */
function getProperty(obj, prop) {
  const member = obj[prop];
  return typeof member === "function" ? member.bind(obj) : member;
}

/**
 * Collection access function - get an element from a collection
 */
function get(obj, key, notFound = null) {
  // Handle null/undefined case
  if (obj == null) return notFound;
  
  // Handle function case: call the function with key as argument
  if (typeof obj === 'function') {
    try {
      return obj(key);
    } catch (e) {
      // If function call fails, fall back to property access
      return (key in obj) ? obj[key] : notFound;
    }
  }
  
  // Handle arrays (vectors)
  if (Array.isArray(obj)) {
    return (typeof key === 'number' && key >= 0 && key < obj.length) 
      ? obj[key] 
      : notFound;
  }
  
  // Handle Sets
  if (obj instanceof Set) {
    return obj.has(key) ? key : notFound;
  }
  
  // Handle objects (maps) - includes handling of numeric keys
  const propKey = typeof key === 'number' ? String(key) : key;
  return (propKey in obj) ? obj[propKey] : notFound;
}

// ==== Type Predicates ====

/**
 * Check if value is a symbol (string in JS representation)
 * In HQL: (symbol? value)
 */
function symbol_pred(value) {
  return typeof value === 'string';
}

/**
 * Check if value is a list (array in JS representation)
 * In HQL: (list? value)
 */
function list_pred(value) {
  return Array.isArray(value);
}

/**
 * Check if value is a map (object in JS representation)
 * In HQL: (map? value)
 */
function map_pred(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Set);
}

/**
 * Check if value is null
 * In HQL: (nil? value)
 */
function nil_pred(value) {
  return value === null || value === undefined;
}

/**
 * Check if collection is empty
 * In HQL: (empty? coll)
 */
function empty_pred(coll) {
  if (coll == null) return true;
  if (Array.isArray(coll)) return coll.length === 0;
  if (coll instanceof Set) return coll.size === 0;
  if (typeof coll === 'object') return Object.keys(coll).length === 0;
  return false;
}

// ==== Sequence Operations ====

/**
 * Get the first item in a collection
 * In HQL: (first coll)
 */
function first(coll) {
  if (coll == null) return null;
  if (Array.isArray(coll) && coll.length > 0) return coll[0];
  return null;
}

/**
 * Get all items except the first
 * In HQL: (rest coll)
 */
function rest(coll) {
  if (coll == null) return [];
  if (Array.isArray(coll)) return coll.slice(1);
  return [];
}

/**
 * Get all items except the first, or null if collection has less than 2 items
 * In HQL: (next coll)
 */
function next(coll) {
  if (coll == null) return null;
  if (Array.isArray(coll) && coll.length > 1) return coll.slice(1);
  return null;
}

/**
 * Convert to a sequence or null if empty
 * In HQL: (seq coll)
 */
function seq(coll) {
  if (coll == null) return null;
  if (Array.isArray(coll)) return coll.length > 0 ? coll : null;
  if (coll instanceof Set) return coll.size > 0 ? Array.from(coll) : null;
  if (typeof coll === 'object') {
    const entries = Object.entries(coll);
    return entries.length > 0 ? entries : null;
  }
  return null;
}

/**
 * Add items to a collection
 * In HQL: (conj coll & items)
 */
function conj(coll, ...items) {
  if (coll == null) return items;
  if (Array.isArray(coll)) return [...coll, ...items];
  if (coll instanceof Set) {
    const newSet = new Set(coll);
    items.forEach(item => newSet.add(item));
    return newSet;
  }
  if (typeof coll === 'object') {
    return { ...coll, ...Object.fromEntries(items) };
  }
  return coll;
}

/**
 * Combine collections
 * In HQL: (concat & colls)
 */
function concat(...colls) {
  return [].concat(...colls.map(coll => 
    coll == null ? [] : Array.isArray(coll) ? coll : [coll]
  ));
}

/**
 * Create a list from arguments
 * In HQL: (list & items)
 */
function list(...items) {
  return items;
}
`;


export interface TransformOptions {
  verbose?: boolean;
  bundle?: boolean;
  module?: "esm"; // Only ESM supported
}

/**
 * Transform a parsed AST with macro expansion.
 */
export async function transformAST(

  astNodes: HQLNode[], 
  currentDir: string, 
  options: TransformOptions = {}
): Promise<string> {
  try {
    const env: Env = await initializeGlobalEnv();

    // Step 1: Expand macros in the AST
    const expandedNodes = await expandMacros(astNodes, env);
    
    if (options.verbose) {
      console.log("Expanded AST : ", JSON.stringify(expandedNodes, null, 2));
    }

    // NEW: Check for modules used in the expanded AST
    const usedModules = findUsedModulesInNodes(expandedNodes);
    console.log(">>>>>>>>>>>>>>>>>>> usedModules : ", usedModules)
    if (options.verbose) {
      console.log("Used modules:", Array.from(usedModules));
    }
   
    const fullAST = [];
    
    console.log("moduleRegistry : ", moduleRegistry)
    console.log("env : ", env)

    for (const moduleName of usedModules) {
      if (moduleRegistry.has(moduleName)) {
        const importPath = moduleRegistry.get(moduleName)!;
        console.log(`[transformAST] Adding import for module: ${moduleName} from ${importPath}`);
        
        fullAST.push({
          type: "list" as const,
          elements: [
            { type: "symbol" as const, name: "js-import" },
            { type: "symbol" as const, name: moduleName },
            { type: "literal" as const, value: importPath }
          ]
        });    
      }
    }
        
    // Add the original expanded nodes
    fullAST.push(...expandedNodes);

    // Step 2: Transform to IR with the augmented AST
    const ir = transformToIR(fullAST, currentDir);
    
    if (options.verbose) {
      console.log("IR:", JSON.stringify(ir, null, 2));
    }
    
    // Step 3: Generate TypeScript code 
    const tsCode = generateTypeScript(ir);
    
    // Step 4: Prepend runtime functions
    return RUNTIME_FUNCTIONS + tsCode;
  } catch (error) {
    console.error("Transformation error:", error);
    throw error;
  }
}

export async function transpile(
  source: string, 
  filePath: string, 
  options: TransformOptions = {}
): Promise<string> {
  try {
    // Create an import handler for preprocessing HQL imports
    const importHandler = new HQLImportHandler(options);
    
    // First, preprocess all HQL imports to generate JS equivalents
    await importHandler.preprocessImports(source, filePath);
    
    // Parse the HQL source into an AST
    const astNodes = parse(source);

    if (options.verbose) {
      console.log("Parsed AST:", JSON.stringify(astNodes, null, 2));
    }
    
    // Now do the usual macro expansion
    const expandedNodes = await expandMacros(astNodes);
    
    if (options.verbose) {
      console.log("Expanded AST:", JSON.stringify(expandedNodes, null, 2));
    }

    const ir = transformToIR(expandedNodes, dirname(filePath));
    
    if (options.verbose) {
      console.log("IR:", JSON.stringify(ir, null, 2));
    }
    
    // Generate TypeScript code
    const tsCode = generateTypeScript(ir);
    
    // Prepend runtime functions
    return RUNTIME_FUNCTIONS + tsCode;
  } catch (error) {
    throw new Error(`Transpile error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper function to find modules used in js-call nodes
function findUsedModulesInNodes(nodes: HQLNode[]): Set<string> {
  const usedModules = new Set<string>();
  
  function traverse(node: HQLNode) {
    if (node.type === "list") {
      const listNode = node as ListNode;
      
      // Check for js-call pattern
      if (
        listNode.elements.length >= 3 &&
        listNode.elements[0].type === "symbol" &&
        (listNode.elements[0] as SymbolNode).name === "js-call" &&
        listNode.elements[1].type === "symbol"
      ) {
        const moduleName = (listNode.elements[1] as SymbolNode).name;
        usedModules.add(moduleName);
      }
      
      // Traverse all elements
      listNode.elements.forEach(traverse);
    }
  }
  
  nodes.forEach(traverse);
  return usedModules;
}

/**
 * Transpile an HQL file to TypeScript.
 */
export async function transpileFile(
  inputPath: string, 
  outputPath?: string, 
  options: TransformOptions = {}
): Promise<string> {
  const absPath = resolve(inputPath);
  try {
    const source = await readTextFile(absPath);
    const tsCode = await transpile(source, absPath, options);
    if (outputPath) {
      await writeTextFile(outputPath, tsCode);
    }
    return tsCode;
  } catch (error) {
    throw new Error(`Failed to transpile "${inputPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default transpile;