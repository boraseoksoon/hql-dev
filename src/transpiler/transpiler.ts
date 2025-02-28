// src/transpiler/transpiler.ts
import { parse } from "./parser.ts";
import { transformAST } from "./transformer.ts";
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Transpile HQL source code into JavaScript.
 *
 * @param source - The HQL source code.
 * @param filePath - The file path used for resolving relative imports.
 * @returns A promise that resolves with the transpiled JavaScript code.
 */
export async function transpile(source: string, filePath: string = "."): Promise<string> {
  try {
    // Parse source code to HQL AST
    const ast = parse(source);
    
    // Get directory for resolving relative imports
    const currentDir = dirname(resolve(filePath));
    
    // Track visited files to avoid circular dependencies
    const visited = new Set<string>([resolve(filePath)]);
    
    // Transform the AST to JavaScript with ESM module format
    return await transformAST(ast, currentDir, visited, {
      module: 'esm'  // Always use ESM for top-level files
    });
  } catch (error: any) {
    throw new Error(`Transpile error: ${error.message}`);
  }
}

/**
 * Transpile an HQL file to JavaScript.
 *
 * @param inputPath - Path to the input HQL file.
 * @returns A promise that resolves with the transpiled JavaScript code.
 */
export async function transpileFile(inputPath: string): Promise<string> {
  try {
    // Convert to absolute path
    const absPath = resolve(inputPath);
    console.log(`Transpiling file: ${absPath}`);
    
    // Read the source file
    const source = await Deno.readTextFile(absPath);
    
    // Transpile the source with proper path resolution
    return await transpile(source, absPath);
  } catch (error: any) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`File not found: ${inputPath}`);
    }
    throw error;
  }
}

/**
 * Write the transpiled code to a file.
 *
 * @param code - The transpiled code.
 * @param outputPath - Path to the output file.
 * @returns A promise that resolves when the file has been written.
 */
export async function writeOutput(code: string, outputPath: string): Promise<void> {
  try {
    const outputDir = dirname(outputPath);
    
    // Ensure the output directory exists
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    
    // Write the output file
    await Deno.writeTextFile(outputPath, code);
    console.log(`Output written to: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

export default transpile;