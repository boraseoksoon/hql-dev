// src/transpiler/transformer.ts - Updated with macro expansion

import { parse } from "./parser.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { dirname, resolve } from "../platform/platform.ts";
import { expandMacros } from "../macro.ts";
import { HQLNode } from "./hql_ast.ts";

export interface TransformOptions {
  verbose?: boolean;
  module?: "esm" | "commonjs";
  bundle?: boolean;
}

/**
 * Transform a parsed AST with macro expansion
 */
export async function transformAST(
  astNodes: HQLNode[], 
  currentDir: string, 
  visited = new Set<string>(),
  options: TransformOptions = {}
): Promise<string> {
  // Step 1: Expand macros in the AST
  const expandedNodes = astNodes.map(node => expandMacros(node));
  
  if (options.verbose) {
    console.log("Expanded AST:", JSON.stringify(expandedNodes, null, 2));
  }
  
  // Step 2: Transform to IR
  const ir = transformToIR(expandedNodes, currentDir);
  
  // Step 3: Convert to TypeScript AST
  const tsAST = convertIRToTSAST(ir);
  
  // Step 4: Generate TypeScript code
  const codeOptions: CodeGenerationOptions = {
    indentSize: 2,
    useSpaces: true,
    formatting: "standard",
    module: options.module || "esm"
  };
  
  const tsCode = generateTypeScript(tsAST, codeOptions);
  return tsCode;
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
    const code = await transformAST(astNodes, dirname(filePath), new Set(), options);
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