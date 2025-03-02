// cli/transpile.ts - Updated with bundling support

import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transformAST, transpileFile } from "../src/transpiler/transformer.ts";
import { parse } from "../src/transpiler/parser.ts";

/**
 * Simple logger.
 */
function log(message: string) {
  console.log(message);
}

/**
 * Transpile an HQL file and write the output to a file.
 * This function transforms the source without bundling.
 *
 * @param inputPath - Path to the input HQL file.
 * @param outputPath - Path to the output JavaScript file.
 * @param options - Transpilation options.
 */
async function transpileCLI(
  inputPath: string, 
  outputPath?: string, 
  options: { 
    bundle?: boolean; 
    verbose?: boolean;
    module?: "esm" | "commonjs";
  } = {}
): Promise<void> {
  try {
    log(`Transpiling ${inputPath}...`);
    
    // Resolve the input path
    const resolvedInputPath = resolve(inputPath);
    log(`Resolved input path: ${resolvedInputPath}`);
    
    // Determine the output path if not provided
    const outPath = outputPath ?? resolvedInputPath.replace(/\.hql$/, '.js');
    log(`Output path: ${outPath}`);
    
    try {
      // Read the source
      const source = await Deno.readTextFile(resolvedInputPath);
      const ast = parse(source);
      const dir = dirname(resolvedInputPath);
      
      // Transform without bundling
      const transformed = await transformAST(ast, dir, new Set(), {
        module: options.module || 'esm',
        bundle: options.bundle,
        verbose: options.verbose
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
 * Uses bundling if the --bundle flag is provided.
 *
 * @param inputPath - Path to the input HQL file.
 * @param options - Transpilation options.
 */
async function watchFile(
  inputPath: string, 
  options: { 
    bundle?: boolean; 
    verbose?: boolean;
    module?: "esm" | "commonjs";
  } = {}
): Promise<void> {
  log(`Watching ${inputPath} for changes...`);
  
  try {
    // Initial transpilation using bundling if requested
    if (options.bundle) {
      await transpileFile(inputPath, undefined, options);
    } else {
      await transpileCLI(inputPath, undefined, options);
    }
    
    // Set up file watcher
    const watcher = Deno.watchFs(inputPath);
    
    for await (const event of watcher) {
      if (event.kind === 'modify') {
        try {
          log(`File changed, retranspiling...`);
          if (options.bundle) {
            await transpileFile(inputPath, undefined, options);
          } else {
            await transpileCLI(inputPath, undefined, options);
          }
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
    console.error("Usage: deno run -A transpile.ts <input.hql> [output.js] [--watch] [--bundle] [--format=esm|commonjs] [--verbose]");
    Deno.exit(1);
  }
  
  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  let watch = false;
  let bundle = false;
  let verbose = false;
  let format: "esm" | "commonjs" = "esm";
  
  // Check if the second argument is an output path (does not start with '--')
  if (args.length > 1 && !args[1].startsWith('--')) {
    outputPath = args[1];
  }
  
  // Parse flags
  for (const arg of args) {
    if (arg === '--watch') watch = true;
    if (arg === '--bundle') bundle = true;
    if (arg === '--verbose') verbose = true;
    if (arg === '--format=commonjs') format = "commonjs";
  }
  
  // Enable verbose logging with --verbose flag
  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }
  
  if (bundle) {
    console.log("Bundle mode enabled - output will be a self-contained JavaScript file");
  }
  
  if (watch) {
    watchFile(inputPath, { bundle, verbose, module: format }).catch(() => Deno.exit(1));
  } else {
    if (bundle) {
      transpileFile(inputPath, outputPath, { bundle, verbose, module: format }).catch(() => Deno.exit(1));
    } else {
      transpileCLI(inputPath, outputPath, { bundle, verbose, module: format }).catch(() => Deno.exit(1));
    }
  }
}

export default transpileCLI;
