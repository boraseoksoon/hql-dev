// src/transpiler/transformer.ts - Clean version without utility functions

import { parse } from "./parser.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript } from "./ts-ast-to-code.ts";
import { dirname, resolve } from "../platform/platform.ts";
import { expandMacros } from "../macro-expander.ts";
import { HQLNode } from "./hql_ast.ts";

// Minimal runtime functions - only what's absolutely necessary
const RUNTIME_FUNCTIONS = `
// HQL Runtime Functions
function list(...args) {
  return args;
}
`;

export interface TransformOptions {
  verbose?: boolean;
  bundle?: boolean;
}

/**
 * Transform a parsed AST with macro expansion
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
    
    // Step 2: Transform to IR
    const ir = transformToIR(expandedNodes, currentDir);
    
    // Step 3: Convert to TypeScript AST
    const tsAST = convertIRToTSAST(ir);
    
    // Step 4: Generate TypeScript code
    const tsCode = generateTypeScript(tsAST);
    
    // Step 5: Prepend the runtime functions
    return RUNTIME_FUNCTIONS + tsCode;
  } catch (error) {
    console.error("Transformation error:", error);
    throw error;
  }
}

/**
 * Transform HQL source to TypeScript
 */
export async function transpile(
  source: string, 
  filePath: string, 
  options: TransformOptions = {}
): Promise<string> {
  try {
    // Parse the HQL source into an AST
    const astNodes = parse(source);

    if (options.verbose) {
      console.log("Parsed AST:", JSON.stringify(astNodes, null, 2));
    }
    
    // Transform the AST with macro expansion
    const code = await transformAST(astNodes, dirname(filePath), options);
    
    return code;
  } catch (error) {
    throw new Error(`Transpile error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Transpile an HQL file to TypeScript
 */
export async function transpileFile(
  inputPath: string, 
  outputPath?: string, 
  options: TransformOptions = {}
): Promise<string> {
  const absPath = resolve(inputPath);
  try {
    const source = await Deno.readTextFile(absPath);
    const tsCode = await transpile(source, absPath, options);
    if (outputPath) {
      await Deno.writeTextFile(outputPath, tsCode);
    }
    return tsCode;
  } catch (error) {
    throw new Error(`Failed to transpile "${inputPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default transpile;