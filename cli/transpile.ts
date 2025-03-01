// cli/transpile.ts - Critical Transpiler Fix

import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transformAST } from "../src/transpiler/transformer.ts";
import { parse } from "../src/transpiler/parser.ts";

/**
 * Simple logger.
 */
function log(message: string) {
  console.log(message);
}

/**
 * Transpile an HQL file and write the output to a file.
 * This function properly bundles all dependencies.
 *
 * @param inputPath - Path to the input HQL file.
 * @param outputPath - Path to the output JavaScript file.
 */
async function transpileCLI(inputPath: string, outputPath?: string): Promise<void> {
  try {
    log(`Transpiling ${inputPath}...`);
    
    // Resolve the input path
    const resolvedInputPath = resolve(inputPath);
    log(`Resolved input path: ${resolvedInputPath}`);
    
    // Determine the output path if not provided
    const outPath = outputPath ?? resolvedInputPath.replace(/\.hql$/, '.js');
    log(`Output path: ${outPath}`);
    
    try {
      // IMPORTANT FIX: Use the direct approach instead of bundling
      const source = await Deno.readTextFile(resolvedInputPath);
      const ast = parse(source);
      const dir = dirname(resolvedInputPath);
      const transformed = await transformAST(ast, dir, new Set(), {
        module: 'esm'
      });
      
      // Write the output
      await writeOutput(transformed, outPath);
      log(`Successfully transpiled ${inputPath} -> ${outPath}`);
    } catch (error) {
      console.error(`Transpilation failed: ${error.message}`);
    }
  } catch (error: any) {
    console.error(`Transpilation failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

/**
 * Write the transpiled code to a file.
 *
 * @param code - The transpiled code.
 * @param outputPath - Path to the output file.
 * @returns A promise that resolves when the file has been written.
 */
async function writeOutput(code: string, outputPath: string): Promise<void> {
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
    await Deno.writeTextFile(outputPath, code);
    log(`Output written to: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

/**
 * Watch an HQL file for changes and transpile on modification.
 *
 * @param inputPath - Path to the input HQL file.
 */
async function watchFile(inputPath: string): Promise<void> {
  log(`Watching ${inputPath} for changes...`);
  
  try {
    // Initial transpilation
    await transpileCLI(inputPath);
    
    // Set up file watcher
    const watcher = Deno.watchFs(inputPath);
    
    for await (const event of watcher) {
      if (event.kind === 'modify') {
        try {
          log(`File changed, retranspiling...`);
          await transpileCLI(inputPath);
        } catch (error: any) {
          console.error(`Transpilation failed: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    console.error(`Watch error: ${error.message}`);
    Deno.exit(1);
  }
}

// Command-line execution when run directly
if (import.meta.main) {
  const args = Deno.args;
  
  if (args.length < 1) {
    console.error("Usage: deno run -A transpile.ts <input.hql> [output.js] [--watch]");
    Deno.exit(1);
  }
  
  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  let watch = false;
  
  // Check if the second argument is an output path (does not start with '--')
  if (args.length > 1 && !args[1].startsWith('--')) {
    outputPath = args[1];
  }
  
  // Check for watch flag
  if (args.includes('--watch')) {
    watch = true;
  }
  
  // Enable verbose logging with --verbose flag
  if (args.includes('--verbose')) {
    Deno.env.set("HQL_DEBUG", "1");
  }
  
  if (watch) {
    watchFile(inputPath).catch(() => Deno.exit(1));
  } else {
    transpileCLI(inputPath, outputPath).catch(() => Deno.exit(1));
  }
}

export default transpileCLI;