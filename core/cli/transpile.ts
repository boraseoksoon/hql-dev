#!/usr/bin/env deno run -A

import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import { globalLogger as logger } from "../src/logger.ts";
import { parseCliOptions, applyCliOptions, CliOptions } from "./utils/cli-options.ts";
import { initializeRuntime } from "../src/common/runtime-initializer.ts";

// Import the new error handling system
import {
  initializeErrorSystem,
  runWithErrorHandling,
  setErrorContext,
  updateErrorConfig
} from "../src/common/error-system.ts";

/**
 * Utility to time async phases and log durations
 */
async function timed<T>(
  category: string,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  logger.startTiming(category, label);
  try {
    return await fn();
  } finally {
    logger.endTiming(category, label);
  }
}

/**
 * Display CLI usage
 */
function printHelp(): void {
  console.error(
    `Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]`
  );
  console.error("\nOptions:");
  console.error("  --run             Execute the transpiled output");
  console.error("  --verbose, -v     Enable verbose logging");
  console.error("  --time            Show timing for each phase");
  console.error("  --print           Print JS to stdout instead of writing to file");
  console.error("  --cache-info      Show information about the cache");
  console.error("  --debug           Show detailed error information and stack traces");
  console.error("  --help, -h        Show this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts src/file.hql");
  console.error("  deno run -A cli/transpile.ts src/file.hql dist/file.js --time");
  console.error("  deno run -A cli/transpile.ts src/file.hql --print --run");
  console.error("  deno run -A cli/transpile.ts src/file.hql --debug");
}

/**
 * Parse positional args: input and optional output
 */
function parsePaths(args: string[]): { inputPath: string; outputPath?: string } {
  const positional = args.filter(arg => !arg.startsWith("--") && !arg.startsWith("-"));
  const inputPath = positional[0];
  
  if (!inputPath) {
    printHelp();
    Deno.exit(1);
  }
  
  let outputPath: string | undefined;
  if (positional.length > 1) {
    outputPath = positional[1];
  }
  
  return { inputPath, outputPath };
}

/**
 * Invoke transpiler with error handling
 */
function transpile(
  inputPath: string,
  outputPath: string | undefined,
  opts: CliOptions
): Promise<string> {
  // Only use forceCache for controlling recompilation
  const force = opts.forceCache;

  return timed("transpile", "Compile", async () => {
    const resolvedInputPath = resolve(inputPath);
    
    // Register context for error reporting
    setErrorContext(resolvedInputPath, outputPath);

    // Use direct execution with error handling
    return await transpileCLI(resolvedInputPath, outputPath, {
      verbose: opts.verbose,
      showTiming: opts.showTiming,
      force: force
    });
  });
}

/**
 * Print bundled JS content
 */
function printJS(bundledPath: string): Promise<void> {
  return timed("transpile", "Output Read", async () => {
    const content = await Deno.readTextFile(bundledPath);
    console.log(content);
  });
}

/**
 * Dynamically import and execute the JS file
 */
function runJS(bundledPath: string): Promise<void> {
  console.log(`Running: ${bundledPath}`);
  return timed("transpile", "Execute", async () => {
    await import("file://" + resolve(bundledPath));
  });
}

/**
 * Entry point
 */
export async function main(): Promise<void> {
  const args = Deno.args;

  // Parse options early for error system configuration
  const opts = parseCliOptions(args);
  
  // Initialize error system with debug flag if present
  initializeErrorSystem({
    debug: opts.debug,
    verboseErrors: opts.verbose
  });

  await runWithErrorHandling(async () => {
    if (!args.length || args.includes("--help") || args.includes("-h")) {
      printHelp();
      Deno.exit(args.length ? 1 : 0);
    }
    
    // Initialize runtime early - this will prevent redundant initializations later
    await initializeRuntime();
    
    // Parse paths
    const { inputPath, outputPath } = parsePaths(args);
    
    // Handle debug mode
    if (args.includes("--debug")) {
      opts.debug = true;
      updateErrorConfig({ debug: true, showInternalErrors: true });
    }
    
    applyCliOptions(opts);
  
    if (opts.verbose) {
      logger.debug(`Processing file: ${inputPath}`);
      if (outputPath) {
        logger.debug(`Output will be written to: ${outputPath}`);
      }
    }
  
    const bundledPath = await transpile(inputPath, outputPath, opts);
  
    if (args.includes("--print")) {
      await printJS(bundledPath);
    }
  
    if (args.includes("--run")) {
      await runJS(bundledPath);
    }
  
    logger.logPerformance("transpile", inputPath.split("/").pop()!);
  }, { debug: opts.debug, exitOnError: true });
}

if (import.meta.main) {
  main();
}