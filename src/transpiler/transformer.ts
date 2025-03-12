// src/transpiler/transformer.ts - Updated with minimal runtime

import { parse } from "./parser.ts";
import { transformToIR } from "./hql-code-to-hql-ir.ts";
import { generateTypeScript } from "./ts-ast-to-ts-code.ts";
import { dirname, resolve, readTextFile, writeTextFile } from "../platform/platform.ts";
import { expandMacros } from "../macro-expander.ts";
import { HQLNode } from "./hql_ast.ts";
import { HQLImportHandler } from "./hql_import_handler.ts";
import * as IR from "./hql_ir.ts";

// Minimal runtime functions to support data structure access
const RUNTIME_FUNCTIONS = `
// Helper for property access
function getProperty(obj, prop) {
  const member = obj[prop];
  return typeof member === "function" ? member.bind(obj) : member;
}

// Collection access function
function get(obj, key, notFound = null) {
  if (obj == null) return notFound;
  
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
  
  // Handle objects (maps)
  return (key in obj) ? obj[key] : notFound;
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
    // Step 1: Expand macros in the AST
    const expandedNodes = await expandMacros(astNodes);
    
    if (options.verbose) {
      console.log("Expanded AST:", JSON.stringify(expandedNodes, null, 2));
    }

    // Step 2: Transform to IR, passing the import handler
    const ir = await transformToIR(expandedNodes, currentDir);
    
    if (options.verbose) {
      console.log("IR:", JSON.stringify(ir, null, 2));
    }
    
    // Step 4: Generate TypeScript code 
    const tsCode = generateTypeScript(ir);
    
    // Step 5: Prepend runtime functions
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
    
    // Transform to IR - we'll modify this to handle HQL import paths
    let ir = transformToIR(expandedNodes, dirname(filePath));
    
    // Post-process the IR to rewrite HQL imports to JS imports
    ir = rewriteHqlImportsInIR(ir, importHandler);
    
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

/**
 * Post-process the IR to rewrite HQL imports to JS imports.
 * This is a safe way to modify imports without changing the transformer architecture.
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