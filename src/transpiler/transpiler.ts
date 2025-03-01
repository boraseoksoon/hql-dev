// src/transpiler/transpiler.ts
import { parse } from "./parser.ts";
import { transformAST, TransformOptions } from "./transformer.ts";
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { normalizePath } from "./path-utils.ts";

// Cache for transpiled files to avoid redundant work
const transpileCache = new Map<string, string>();

/**
 * Transpile HQL source code into JavaScript.
 *
 * @param source - The HQL source code.
 * @param filePath - The file path used for resolving relative imports.
 * @param options - Optional transformation options.
 * @returns A promise that resolves with the transpiled JavaScript code.
 */
export async function transpile(
  source: string, 
  filePath: string = ".", 
  options: TransformOptions = {}
): Promise<string> {
  try {
    // Generate a cache key based on source and options
    const cacheKey = getCacheKey(source, filePath, options);
    
    // Check cache first
    if (transpileCache.has(cacheKey)) {
      return transpileCache.get(cacheKey)!;
    }
    
    // Parse source code to HQL AST
    const ast = parse(source);
    
    // Get directory for resolving relative imports
    const currentDir = dirname(resolve(filePath));
    
    // Track visited files to avoid circular dependencies
    const visited = new Set<string>([normalizePath(resolve(filePath))]);
    
    // Transform the AST to JavaScript
    const result = await transformAST(ast, currentDir, visited, {
      module: 'esm',  // Always use ESM for top-level files
      ...options
    });
    
    // Cache the result
    transpileCache.set(cacheKey, result);
    
    return result;
  } catch (error: any) {
    // Provide more helpful error messages
    if (error.name === 'ParseError') {
      // Format parser errors with location information
      throw new Error(`Parse error at line ${error.position?.line}, column ${error.position?.column}: ${error.message}`);
    }
    
    throw new Error(`Transpile error: ${error.message}`);
  }
}

/**
 * Generate a cache key for transpiled code
 */
function getCacheKey(source: string, filePath: string, options: TransformOptions): string {
  // Create a simplified options object with only the properties that affect transpilation
  const relevantOptions = {
    module: options.module,
    formatting: options.formatting,
    preserveImports: options.preserveImports,
    inlineSourceMaps: options.inlineSourceMaps
  };
  
  // Hash the source + options to create a cache key
  return `${filePath}:${objectHash(relevantOptions)}:${source.length}`;
}

/**
 * A simple object hash function for caching
 */
function objectHash(obj: any): string {
  return JSON.stringify(obj);
}

/**
 * Transpile an HQL file to JavaScript.
 *
 * @param inputPath - Path to the input HQL file.
 * @param options - Optional transformation options.
 * @returns A promise that resolves with the transpiled JavaScript code.
 */
export async function transpileFile(
  inputPath: string,
  options: TransformOptions = {}
): Promise<string> {
  try {
    // Convert to absolute path
    const absPath = resolve(inputPath);
    console.log(`Transpiling file: ${absPath}`);
    
    // Read the source file
    const source = await Deno.readTextFile(absPath);
    
    // Transpile the source with proper path resolution
    return await transpile(source, absPath, options);
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