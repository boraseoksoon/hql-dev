#!/usr/bin/env deno run -A

import { transpileCLI } from "../src/bundler.ts";
import { globalLogger as logger, Logger } from "../src/logger.ts";
import { initializeRuntime } from "../src/common/runtime-initializer.ts";
import { basename } from "../src/platform/platform.ts";
import { createTempDir } from "../src/common/hql-cache-tracker.ts";
import {
  parseLogNamespaces,
  parseCliOptions,
  applyCliOptions,
  CliOptions,
  parseNonOptionArgs
} from "./utils/cli-options.ts";
import { handleRuntimeError } from "../src/common/runtime-error-handler.ts";

// Import the enhanced error handling system
import {
  initializeErrorSystem,
  runWithErrorHandling,
  setErrorContext,
  updateErrorConfig,
  enrichErrorWithContext
} from "../src/common/error-system.ts";

/**
 * Show help flags
 */
function shouldShowHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

/**
 * Print CLI usage information
 */
function printHelp(): void {
  console.error("Usage: deno run -A cli/run.ts <target.hql|target.js> [options]");
  console.error("       deno run -A cli/run.ts '<expression>' [options]");
  console.error("\nOptions:");
  console.error("  --verbose             Enable verbose logging and enhanced error formatting");
  console.error("  --time                Show performance timing information");
  console.error("  --log <namespaces>    Filter logging to specified namespaces");
  console.error("  --print               Print final JS output without executing");
  console.error("  --debug               Show detailed debug information and stack traces");
  console.error("  --help, -h            Display this help message");
}

/**
 * Function to transpile and execute an HQL file with enhanced error handling
 */
async function transpileAndExecute(
  options: CliOptions,
  inputPath: string,
  runDir: string,
): Promise<void> {
  if (options.verbose) {
    logger.setEnabled(true);
  }
  
  const jsOutputPath = `${runDir}/${basename(inputPath)}.js`;

  // Set error context to enable proper error location mapping
  setErrorContext(inputPath, jsOutputPath);

  try {
    await transpileCLI(inputPath, jsOutputPath, {
      verbose: options.verbose,
      showTiming: options.showTiming,
      force: true, // Always regenerate to ensure latest code is used
    });
  } catch (transpileError) {
    // Enrich transpile errors with source context
    const enrichedError = await enrichErrorWithContext(transpileError, inputPath);
    throw enrichedError;
  }
  
  logger.debug(`Running transpiled code from: ${jsOutputPath}`);
  
  const importUrl = `file://${jsOutputPath}`;
  
  try {
    // Import and run with error handling
    const module = await import(importUrl);
    
    if (module.default && typeof module.default === "function") {
      logger.debug("Found default export function, executing it");
      await module.default();
    } else {
      logger.debug("Module imported successfully");
    }
  } catch (runtimeError) {
    // This is likely a runtime error in the user's code
    logger.debug(`Runtime error occurred: ${runtimeError.message}`);
    
    // Let the runtime error handler handle this - we enrich errors there
    await handleRuntimeError(runtimeError);
    throw runtimeError; // Propagate error to ensure process exits on fatal error
  }
}

/**
 * Main entry point for the HQL CLI
 */
export async function run(args: string[] = Deno.args): Promise<number> {
  // Parse options early to configure error system
  const cliOptions = parseCliOptions(args);
  
  // Initialize error system with debug flag if present
  initializeErrorSystem({
    debug: cliOptions.debug,
    verboseErrors: cliOptions.verbose
  });
  
  // Run the main function with enhanced error handling
  return await runWithErrorHandling(async () => {
    await initializeRuntime();
      
    if (shouldShowHelp(args)) {
      printHelp();
      return 0;
    }
  
    const namespaces = parseLogNamespaces(args);
  
    if (namespaces.length) {
      Logger.allowedNamespaces = namespaces;
      console.log(`Logging restricted to namespaces: ${namespaces.join(", ")}`);
    }
  
    const positional = parseNonOptionArgs(args);
    if (!positional.length) {
      printHelp();
      return 1;
    }
    
    applyCliOptions(cliOptions);
  
    // Update error config based on debug flag
    if (args.includes("--debug")) {
      cliOptions.debug = true;
      updateErrorConfig({ debug: true, showInternalErrors: true });
      console.log("Debug mode enabled - showing extended error information");
    }
  
    logger.startTiming("run", "Total Processing");
  
    const runDir = await createTempDir("run");
    
    logger.log({ text: `Created temporary directory: ${runDir}`, namespace: "cli" });
  
    const inputPath = positional[0];
    await transpileAndExecute(cliOptions, inputPath, runDir);
    
    logger.endTiming("run", "Total Processing");
    
    return 0;
  }, { 
    debug: cliOptions.debug, 
    exitOnError: true,
    currentFile: parseNonOptionArgs(args)[0] // Pass the current file for context
  });
}

if (import.meta.main) {
  run();
}