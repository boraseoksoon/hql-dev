#!/usr/bin/env deno run -A

import { transpileCLI } from "../src/bundler.ts";
import { reportError } from "../src/common/error-pipeline.ts";
import { globalLogger as logger, Logger } from "../src/logger.ts";
import { initializeRuntime } from "../src/common/runtime-initializer.ts";
import { basename } from "../src/platform/platform.ts";
import {
  createTempDir,
  cleanupAllTempFiles
} from "../src/common/temp-file-tracker.ts";
import {
  parseLogNamespaces,
  parseCliOptions,
  applyCliOptions,
  CliOptions
} from "./utils/cli-options.ts";

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
  console.error("  --help, -h            Display this help message");
}

/**
 * Extract positional args (non-options)
 */
function parseNonOptionArgs(args: string[]): string[] {
  return args.filter(arg => !arg.startsWith("-"));
}

/**
 * Function to transpile and execute an HQL file
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

  await transpileCLI(inputPath, jsOutputPath, {
    verbose: options.verbose,
    showTiming: options.showTiming,
    force: true, // Always regenerate to ensure latest code is used
  });
  
  logger.debug(`Running transpiled code from: ${jsOutputPath}`);
  
  const importUrl = `file://${jsOutputPath}`;
  
  const module = await import(importUrl);
  
  if (module.default && typeof module.default === "function") {
    logger.debug("Found default export function, executing it");
    await module.default();
  } else {
    logger.debug("Module imported successfully");
  }
}

/**
 * Main entry point for the HQL CLI
 */
export async function run(args: string[] = Deno.args): Promise<number> {
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
  const cliOptions = parseCliOptions(args);
  
  applyCliOptions(cliOptions);

  // Handle debug mode
  if (args.includes("--debug")) {
    cliOptions.debug = true;
    console.log("Debug mode enabled - showing extended error information");
  }

  logger.startTiming("run", "Total Processing");

  const runDir = await createTempDir("run");
  logger.log({ text: `Created temporary directory: ${runDir}`, namespace: "cli" });

  const inputPath = positional[0]
  await transpileAndExecute(cliOptions, inputPath, runDir);
  
  return 0;
}

if (import.meta.main) {
  try {
    run();
  } catch (error) {
    reportError(error);
    Deno.exit(1); 
  } finally {
    await cleanupAllTempFiles();
  }
}
