// cli/error-report.ts - Improved error reporting for HQL
import { resolve } from "../src/platform/platform.ts";
import { Logger } from "../src/logger.ts";
import { registerSourceFile } from "../src/error-handling.ts";
import { processHql } from "../src/transpiler/hql-transpiler.ts";
import { initializeErrorHandling } from "../src/error-initializer.ts";
import { reportError } from "../src/error-reporter.ts";
import { setupDebugOptions } from "./utils/utils.ts";

/**
 * Enhanced error reporter for HQL files
 */
async function showErrorReport(filePath: string, options: {
  verbose?: boolean;
  clickablePaths?: boolean;
} = {}) {
  console.log(`\n\x1b[34m⚡ Analyzing file: ${filePath}\x1b[0m\n`);
  
  // Initialize error handling
  initializeErrorHandling({
    enableGlobalHandlers: true,
    enableReplEnhancement: false
  });
  
  try {
    // Read the input file
    const source = await Deno.readTextFile(filePath);
    
    // Register source for error context
    registerSourceFile(filePath, source);
    
    // Try to process it (will likely fail if there are errors)
    await processHql(source, {
      baseDir: filePath,
      verbose: options.verbose
    });
    
    console.log("\x1b[32m✓ File processed successfully (no errors)\x1b[0m");
  } catch (error) {
    // Use unified error reporting
    reportError(error, {
      filePath: filePath,
      verbose: options.verbose,
      useClickablePaths: options.clickablePaths,
      includeStack: options.verbose
    });
  }
}

if (import.meta.main) {
  const args = Deno.args;
  
  if (args.length < 1) {
    console.error(`
Usage: deno run -A cli/error-report.ts <file.hql> [options]

Options:
  --verbose            Show verbose details including stack traces and enhanced formatting
  --debug              Same as --verbose but with more details
  --no-clickable-paths Disable clickable file paths in error messages
`);
    Deno.exit(1);
  }
  
  const inputPath = resolve(args[0]);
  const verbose = args.includes("--verbose") || args.includes("--debug");
  
  // Setup debug options for enhanced error reporting
  const { debug, clickablePaths } = setupDebugOptions(args);
  
  await showErrorReport(inputPath, {
    verbose: verbose || debug,
    clickablePaths: clickablePaths
  });
} 