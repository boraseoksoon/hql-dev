// src/transpiler/transformer.ts - Fixed import handling

import { parse } from "./parser.ts";
import { transformToIR } from "./hql-code-to-hql-ir.ts";
import { generateTypeScript } from "./ts-ast-to-ts-code.ts";
import { dirname, resolve, readTextFile, writeTextFile } from "../platform/platform.ts";
import { expandMacros } from "../macro.ts";
import { HQLNode } from "./hql_ast.ts";
import { HQLImportHandler } from "./hql_import_handler.ts";
import * as IR from "./hql_ir.ts";
import { isTestEnvironment } from "../bootstrap.ts";

// Comprehensive runtime functions supporting both old and new code
const RUNTIME_FUNCTIONS = `
/**
 * Enhanced runtime for HQL
 */

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
 * Ensure that a value is an array of HQLNodes
 */
function ensureNodeArray(nodes: HQLNode | HQLNode[]): HQLNode[] {
  return Array.isArray(nodes) ? nodes : [nodes];
}

/**
 * Extract imports from original source to ensure they're preserved
 * This processes the given source code to find all import statements
 */
function extractImports(source: string): Array<{name: string, source: string}> {
  const imports: Array<{name: string, source: string}> = [];
  
  // Extract imports using a regex that matches (import name "source")
  const importRegex = /\(import\s+([^\s)]+)\s+["']([^"']+)["']\)/g;
  let match;
  
  while ((match = importRegex.exec(source)) !== null) {
    const name = match[1];
    const importSource = match[2];
    
    imports.push({
      name: name,
      source: importSource
    });
  }
  
  return imports;
}

/**
 * Generate import code that works with both old and new HQL
 */
function generateImportCode(name: string, source: string): string {
  // Rewrite npm: URLs to esm.sh for Deno compatibility if needed
  let importUrl = source;
  
  // Simple dynamic import that will work in all contexts
  return `// Import ${name} from ${source}
import * as ${name}Module from "${importUrl}";
var ${name} = (function() {
  // Handle both ESM and CommonJS-style modules
  const wrapper = ${name}Module.default !== undefined ? ${name}Module.default : {};
  for (const [key, value] of Object.entries(${name}Module)) {
    if (key !== "default") wrapper[key] = value;
  }
  return wrapper;
})();
`;
}

/**
 * Transform a parsed AST with macro expansion.
 * Fixed to handle both single node and array returns from expandMacros.
 */
export async function transformAST(
  astNodes: HQLNode[], 
  currentDir: string, 
  options: TransformOptions = {}
): Promise<string> {
  try {
    // Extract imports from the original source
    const sourceStr = JSON.stringify(astNodes);
    const extractedImports = extractImports(sourceStr);
    
    // Step 1: Expand macros in the AST
    const expandedMacros = await expandMacros(astNodes);
    // Ensure we have an array of nodes
    const expandedNodes = ensureNodeArray(expandedMacros);
    
    if (options.verbose) {
      console.log("Expanded AST:", JSON.stringify(expandedNodes, null, 2));
    }

    // Step 2: Transform to IR
    const ir = transformToIR(expandedNodes, currentDir);
    
    if (options.verbose) {
      console.log("IR:", JSON.stringify(ir, null, 2));
    }
    
    // Step 3: Generate TypeScript code
    const tsCode = generateTypeScript(ir);
    
    // Step 4: Generate import code
    let importCode = "";
    for (const imp of extractedImports) {
      importCode += generateImportCode(imp.name, imp.source);
    }
    
    // Step 5: Combine runtime functions, imports, and generated code
    return RUNTIME_FUNCTIONS + importCode + tsCode;
  } catch (error) {
    console.error("Transformation error:", error);
    throw error;
  }
}

/**
 * Transpile HQL source code to JavaScript.
 * Fixed to maintain bidirectional import functionality.
 */
export async function transpile(
  source: string, 
  filePath: string, 
  options: TransformOptions = {}
): Promise<string> {
  try {
    // Extract all imports from the source
    const extractedImports = extractImports(source);
    
    // Create an import handler for preprocessing HQL imports
    const importHandler = new HQLImportHandler(options);
    
    // First, preprocess all HQL imports to generate JS equivalents
    await importHandler.preprocessImports(source, filePath);
    
    // Parse the HQL source into an AST
    const astNodes = parse(source);

    if (options.verbose) {
      console.log("Parsed AST:", JSON.stringify(astNodes, null, 2));
    }
    
    // Perform macro expansion
    const expandedMacros = await expandMacros(astNodes);
    // Ensure we have an array of nodes
    const expandedNodes = ensureNodeArray(expandedMacros);
    
    if (options.verbose) {
      console.log("Expanded AST:", JSON.stringify(expandedNodes, null, 2));
    }
    
    // Transform to IR
    let ir = transformToIR(expandedNodes, dirname(filePath));
    
    // Post-process the IR to rewrite HQL imports to JS imports
    ir = rewriteHqlImportsInIR(ir, importHandler);
    
    if (options.verbose) {
      console.log("IR:", JSON.stringify(ir, null, 2));
    }
    
    // Generate TypeScript code
    const tsCode = generateTypeScript(ir);
    
    // Generate import code
    let importCode = "";
    for (const imp of extractedImports) {
      importCode += generateImportCode(imp.name, imp.source);
    }
    
    // Combine runtime functions, imports, and generated code
    return RUNTIME_FUNCTIONS + importCode + tsCode;
  } catch (error) {
    throw new Error(`Transpile error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Post-process the IR to rewrite HQL imports to JS imports.
 */
function rewriteHqlImportsInIR(ir: IR.IRProgram, importHandler: HQLImportHandler): IR.IRProgram {
  const newBody = ir.body.map(node => {
    // Look for JsImportReference nodes
    if (node.type === IR.IRNodeType.JsImportReference) {
      const importNode = node as IR.IRJsImportReference;
      const source = importNode.source;
      
      // If this is an HQL import, rewrite it to the JS equivalent
      if (HQLImportHandler.isHqlFile(source)) {
        const jsPath = importHandler.getJsImportPath(source);
        if (jsPath) {
          return {
            ...importNode,
            source: jsPath
          };
        }
      }
    }
    return node;
  });
  
  return {
    ...ir,
    body: newBody
  };
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