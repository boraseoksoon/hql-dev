// src/compiler.ts
import { parse } from "./parser.ts";
import { transformAST } from "./transformer.ts";
import { dirname } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Compiler options for the HQL to TypeScript/JavaScript compilation process.
 */
export interface CompilerOptions {
  /**
   * Output format - 'ts' for TypeScript, 'js' for JavaScript.
   * Default: 'js'
   */
  format?: 'ts' | 'js';
  
  /**
   * Whether to emit source maps.
   * Default: false
   */
  sourceMap?: boolean;
  
  /**
   * Whether to emit declaration files (.d.ts) when format is 'ts'.
   * Default: false
   */
  declaration?: boolean;
  
  /**
   * Optimization level:
   * - 0: No optimizations
   * - 1: Basic optimizations
   * - 2: Aggressive optimizations
   * Default: 1
   */
  optimizationLevel?: 0 | 1 | 2;
  
  /**
   * Whether to include runtime type checking.
   * Default: false
   */
  typeCheck?: boolean;
  
  /**
   * Whether to bundle all imports into a single file.
   * Default: false
   */
  bundle?: boolean;
  
  /**
   * Target JavaScript version.
   * Default: 'es2020'
   */
  target?: 'es5' | 'es2015' | 'es2016' | 'es2017' | 'es2018' | 'es2019' | 'es2020' | 'es2021' | 'es2022';
  
  /**
   * Module system to use in the output.
   * Default: 'esm'
   */
  module?: 'esm' | 'commonjs' | 'umd' | 'amd';
}

/**
 * Result of the compilation process.
 */
export interface CompilerResult {
  /**
   * The generated code (TypeScript or JavaScript).
   */
  code: string;
  
  /**
   * Source map if requested.
   */
  sourceMap?: string;
  
  /**
   * Declaration file content if requested.
   */
  declaration?: string;
  
  /**
   * Any warnings generated during compilation.
   */
  warnings: string[];
  
  /**
   * Compilation statistics.
   */
  stats: {
    /**
     * Input size in bytes.
     */
    inputSize: number;
    
    /**
     * Output size in bytes.
     */
    outputSize: number;
    
    /**
     * Parse time in milliseconds.
     */
    parseTime: number;
    
    /**
     * IR generation time in milliseconds.
     */
    irGenTime: number;
    
    /**
     * Code generation time in milliseconds.
     */
    codeGenTime: number;
    
    /**
     * Total compilation time in milliseconds.
     */
    totalTime: number;
  };
}

/**
 * The main compiler function that processes an HQL source file and produces TypeScript/JavaScript code.
 * 
 * @param source - The HQL source code to compile.
 * @param filePath - The path to the source file (used for imports and error reporting).
 * @param options - Compiler options.
 * @returns A promise that resolves to the compilation result.
 */
export async function compile(
  source: string,
  filePath: string,
  options: CompilerOptions = {}
): Promise<CompilerResult> {
  const startTime = performance.now();
  const warnings: string[] = [];
  
  try {
    // Parse the source to an AST
    const parseStart = performance.now();
    const ast = parse(source);
    const parseTime = performance.now() - parseStart;
    
    // Transform to IR and then to TypeScript
    const irGenStart = performance.now();
    const currentDir = dirname(filePath);
    const visited = new Set<string>();
    
    const code = await transformAST(ast, currentDir, visited, {}, false);
    const irGenTime = performance.now() - irGenStart;
    
    // TODO: Apply any additional transformations based on options
    // - If options.format === 'js', transpile TypeScript to JavaScript
    // - If options.sourceMap === true, generate source maps
    // - If options.optimizationLevel > 0, apply optimizations
    // - etc.
    
    const totalTime = performance.now() - startTime;
    
    return {
      code,
      warnings,
      stats: {
        inputSize: source.length,
        outputSize: code.length,
        parseTime,
        irGenTime,
        codeGenTime: totalTime - parseTime - irGenTime,
        totalTime
      }
    };
  } catch (error: any) {
    // Enhance error with source location information if available
    if (error.position) {
      const { line, column } = error.position;
      const sourceLines = source.split('\n');
      const errorLine = sourceLines[line - 1] || '';
      const pointer = ' '.repeat(column - 1) + '^';
      
      error.message = `Error at ${filePath}:${line}:${column}\n${errorLine}\n${pointer}\n${error.message}`;
    }
    
    throw error;
  }
}

/**
 * Compile an HQL file to TypeScript/JavaScript.
 * 
 * @param inputPath - Path to the input HQL file.
 * @param options - Compiler options.
 * @returns A promise that resolves to the compilation result.
 */
export async function compileFile(
  inputPath: string,
  options: CompilerOptions = {}
): Promise<CompilerResult> {
  try {
    const source = await Deno.readTextFile(inputPath);
    return await compile(source, inputPath, options);
  } catch (error: any) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`File not found: ${inputPath}`);
    }
    throw error;
  }
}

/**
 * Write the compilation result to a file.
 * 
 * @param result - The compilation result.
 * @param outputPath - Path to the output file.
 * @returns A promise that resolves when the file has been written.
 */
export async function writeOutput(
  result: CompilerResult,
  outputPath: string
): Promise<void> {
  try {
    const outputDir = dirname(outputPath);
    
    // Ensure the output directory exists
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    
    // Write the main output file
    await Deno.writeTextFile(outputPath, result.code);
    
    // Write source map if available
    if (result.sourceMap) {
      await Deno.writeTextFile(`${outputPath}.map`, result.sourceMap);
    }
    
    // Write declaration file if available
    if (result.declaration) {
      const declarationPath = outputPath.replace(/\.[^.]+$/, '.d.ts');
      await Deno.writeTextFile(declarationPath, result.declaration);
    }
  } catch (error) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}