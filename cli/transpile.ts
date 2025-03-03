// cli/transpile.ts - Updated with bundling support and better error handling

import { dirname, resolve } from "jsr:@std/path@1.0.8";
import { transformAST, transpileFile } from "../src/transpiler/transformer.ts";
import { parse } from "../src/transpiler/parser.ts";
import * as logger from "../src/logger.ts";

/**
 * Transpile an HQL file and write the output to a file.
 * This function transforms the source without bundling.
 *
 * @param inputPath - Path to the input HQL file
 * @param outputPath - Path to the output JavaScript file
 * @param options - Transpilation options
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
  // Configure logging
  logger.setLogLevel(logger.verboseToLogLevel(options.verbose));
  const log = logger.createLogger("transpile-cli");
  
  try {
    log.start(`Transpiling ${inputPath}...`);
    
    // Resolve the input path
    const resolvedInputPath = resolve(inputPath);
    log.verbose(`Resolved input path: ${resolvedInputPath}`);
    
    // Determine the output path if not provided
    const outPath = outputPath ?? resolvedInputPath.replace(/\.hql$/, '.js');
    log.verbose(`Output path: ${outPath}`);
    
    // Use the transpileFile function which has better error handling
    await transpileFile(resolvedInputPath, outPath, {
      bundle: options.bundle,
      verbose: options.verbose,
      module: options.module || 'esm'
    });
    
    log.success(`Successfully transpiled ${inputPath} -> ${outPath}`);
  } catch (error: any) {
    log.error(`Transpilation failed`, error);
    Deno.exit(1);
  }
}

/**
 * Watch an HQL file for changes and transpile on modification.
 * Uses bundling if the --bundle flag is provided.
 *
 * @param inputPath - Path to the input HQL file
 * @param options - Transpilation options
 */
async function watchFile(
  inputPath: string, 
  options: { 
    bundle?: boolean; 
    verbose?: boolean;
    module?: "esm" | "commonjs";
  } = {}
): Promise<void> {
  // Configure logging
  logger.setLogLevel(logger.verboseToLogLevel(options.verbose));
  const log = logger.createLogger("watcher");
  
  log.info(`Watching ${inputPath} for changes...`);
  
  try {
    // Initial transpilation
    await transpileCLI(inputPath, undefined, options);
    
    // Set up file watcher
    const watcher = Deno.watchFs(inputPath);
    
    for await (const event of watcher) {
      if (event.kind === 'modify') {
        try {
          log.info(`File changed, retranspiling...`);
          await transpileCLI(inputPath, undefined, options);
        } catch (error: any) {
          log.error(`Transpilation failed after file change`, error);
        }
      }
    }
  } catch (error: any) {
    log.error(`Watch error`, error);
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
  
  // Configure logging based on verbose flag
  logger.setLogLevel(logger.verboseToLogLevel(verbose));
  const log = logger.createLogger("transpile-cli");
  
  // Enable verbose logging with --verbose flag
  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    log.info("Verbose logging enabled");
  }
  
  if (bundle) {
    log.info("Bundle mode enabled - output will be a self-contained JavaScript file");
  }
  
  if (watch) {
    watchFile(inputPath, { bundle, verbose, module: format }).catch(() => Deno.exit(1));
  } else {
    transpileCLI(inputPath, outputPath, { bundle, verbose, module: format }).catch(() => Deno.exit(1));
  }
}

export default transpileCLI;