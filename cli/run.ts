// cli/run.ts - Improved version with better logging and error handling

import { resolve, extname } from "jsr:@std/path@1.0.8";
import transpileCLI from "./transpile.ts";
import * as logger from "../src/logger.ts";

/**
 * Import and run a JavaScript module
 * @param filePath Path to the JavaScript file to run
 */
async function runModule(filePath: string): Promise<void> {
  const log = logger.createLogger("runner");
  
  try {
    log.info(`Executing module: "${filePath}"`);
    
    // Use dynamic import to run the transpiled JavaScript
    await import("file://" + filePath);
    
    log.success(`Module execution completed successfully`);
  } catch (error) {
    log.error(`Module execution failed: ${error instanceof Error ? error.message : String(error)}`, error);
    
    // Exit with error code
    Deno.exit(1);
  }
}

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
HQL Runner - Run HQL and JavaScript files

USAGE:
  deno run --allow-read --allow-write run.ts <target.hql|target.js> [options]

OPTIONS:
  --bundle        Bundle the output into a self-contained JavaScript file
  --verbose       Enable verbose logging
  --format=esm    Use ESM module format (default)
  --format=commonjs  Use CommonJS module format
  --help          Show this help message

EXAMPLES:
  deno run --allow-read --allow-write run.ts app.hql
  deno run --allow-read --allow-write run.ts app.hql --bundle --verbose
  deno run --allow-read --allow-write run.ts app.js
`);
}

async function main() {
  const args = Deno.args;
  
  // Parse command line arguments
  let bundle = false;
  let verbose = false;
  let format: "esm" | "commonjs" = "esm";
  let showHelpFlag = false;
  let target: string | undefined;
  
  // Process all arguments
  for (const arg of args) {
    if (arg === '--bundle') bundle = true;
    else if (arg === '--verbose') verbose = true;
    else if (arg === '--format=commonjs') format = "commonjs";
    else if (arg === '--help' || arg === '-h') showHelpFlag = true;
    else if (!arg.startsWith('--') && !target) target = arg;
  }
  
  // Configure logging based on verbose flag
  logger.setLogLevel(logger.verboseToLogLevel(verbose));
  const log = logger.createLogger("hql-runner");
  
  // Show help if requested or if no target file is provided
  if (showHelpFlag || !target) {
    showHelp();
    Deno.exit(showHelpFlag ? 0 : 1);
  }
  
  // Print execution info
  log.info(`HQL Runner started`);
  log.info(`Running with options:
  Target: "${target}"
  Bundle: ${bundle ? 'enabled' : 'disabled'}
  Format: ${format}
  Verbose: ${verbose ? 'enabled' : 'disabled'}`);
  
  try {
    const targetPath = resolve(target);
    const ext = extname(targetPath);
    let modulePath = targetPath;

    // If HQL file, transpile to JS first
    if (ext === ".hql") {
      if (bundle) {
        log.info(`Bundle mode enabled - transpiling to a self-contained JavaScript file`);
      }
      
      log.start(`Transpiling HQL file: "${targetPath}"`);
      await transpileCLI(targetPath, undefined, { 
        bundle, 
        verbose, 
        module: format 
      });
      
      modulePath = targetPath.replace(/\.hql$/, ".js");
      log.success(`Transpilation complete: "${modulePath}"`);
    } else if (ext !== ".js") {
      log.error(`Unsupported file type: "${ext}". Please provide a .hql or .js file.`);
      Deno.exit(1);
    }
    
    // Run the module
    await runModule(modulePath);
  } catch (error) {
    log.error(`Error running module`, error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main().catch(error => {
    logger.logError(`Unhandled error`, error);
    Deno.exit(1);
  });
}