#!/usr/bin/env deno run -A

import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import { globalLogger as logger } from "../src/logger.ts";
import { parseCliOptions, applyCliOptions, CliOptions } from "./utils/cli-options.ts";
import { report, withErrorHandling, registerSourceFile, reportError } from "../src/common/common-errors.ts";
import { 
  cleanupAllTempFiles, 
  getCacheDir,
  registerExplicitOutput,
  getCacheStats
} from "../src/common/temp-file-tracker.ts";
import { initializeRuntime } from "../src/common/runtime-initializer.ts";
import { CircularDependencyError } from "../src/imports.ts";
import { TranspilerError } from "../src/transpiler/error/errors.ts";

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
  console.error("  --force           Force recompilation even if file hasn't changed");
  console.error("  --cache-info      Show information about the cache");
  console.error("  --debug           Show detailed error information including stack traces");
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
function parsePaths(
  args: string[]
): { inputPath: string; outputPath?: string } {
  const [inputPath, maybeOutput] = args;
  if (!inputPath) {
    printHelp();
    Deno.exit(1);
  }
  let outputPath: string | undefined;
  if (maybeOutput && !maybeOutput.startsWith("--")) {
    outputPath = maybeOutput;
  }
  return { inputPath, outputPath };
}

/**
 * Read and register source for better error reporting
 */
function loadSource(inputPath: string): Promise<string> {
  return timed("transpile", "File Read", async () => {
    try {
      const src = await Deno.readTextFile(inputPath);
      registerSourceFile(inputPath, src);
      return src;
    } catch (err) {
      console.error(report(err, { filePath: inputPath }));
      Deno.exit(1);
    }
  });
}

/**
 * Show cache statistics
 */
async function showCacheInfo(): Promise<void> {
  const cacheDir = await getCacheDir();
  const stats = await getCacheStats();
  
  console.log("\nHQL Cache Information:");
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Files in cache: ${stats.files}`);
  console.log(`Cache size: ${(stats.bytes / 1024 / 1024).toFixed(2)} MB`);
  
  Deno.exit(0);
}

/**
 * Invoke transpiler with error handling
 */
function transpile(
  inputPath: string,
  outputPath: string | undefined,
  opts: CliOptions
): Promise<string> {
  return timed("transpile", "Compile", async () => {
    // Set up cache-aware compilation
    const resolvedInputPath = resolve(inputPath);
    
    // Register output file if provided
    if (outputPath) {
      registerExplicitOutput(outputPath);
    }
    
    const bundled = await withErrorHandling(
      () => transpileCLI(resolvedInputPath, outputPath, {
        verbose: opts.verbose,
        showTiming: opts.showTiming,
        skipErrorReporting: true,
        force: opts.force
      }),
      { filePath: inputPath, source: '', context: 'CLI transpile', logErrors: false }
    )().catch(err => {
      console.error(report(err, { filePath: inputPath, source: '' }));
      Deno.exit(1);
    });
    
    return bundled;
  });
}

/**
 * Print bundled JS content
 */
function printJS(bundledPath: string): Promise<void> {
  return timed("transpile", "Output Read", async () => {
    try {
      const content = await Deno.readTextFile(bundledPath);
      console.log(content);
    } catch (err) {
      console.error(report(err, { filePath: bundledPath }));
      Deno.exit(1);
    }
  });
}

/**
 * Dynamically import and execute the JS file
 */
function runJS(
  bundledPath: string,
  inputPath: string,
  source: string
): Promise<void> {
  console.log(`Running: ${bundledPath}`);
  return timed("transpile", "Execute", async () => {
    try {
      await import("file://" + resolve(bundledPath));
    } catch (err) {
      console.error(report(err, { filePath: inputPath, source }));
      Deno.exit(1);
    }
  });
}

/**
 * Clean up all temp files
 */
function cleanup(): Promise<void> {
  return cleanupAllTempFiles().then(() => {
    logger.debug("Cleanup complete");
  });
}

/**
 * Entry point
 */
export async function main(): Promise<void> {
  const args = Deno.args;

  if (!args.length || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(args.length ? 1 : 0);
  }
  
  // Initialize runtime early - this will prevent redundant initializations later
  await initializeRuntime();
  
  // Handle cache info request
  if (args.includes("--cache-info")) {
    await showCacheInfo();
    return;
  }

  const { inputPath, outputPath } = parsePaths(args);
  const opts = parseCliOptions(args);
  applyCliOptions(opts);

  // Define source variable outside try/catch so it's available in error handling
  let source = "";
  
  try {
    const startTime = performance.now();
        
    // Show cache directory in verbose mode
    if (opts.verbose) {
      const cacheDir = await getCacheDir();
      logger.debug(`Using cache directory: ${cacheDir}`);
    }

    source = await loadSource(inputPath);
    const bundledPath = await transpile(inputPath, outputPath, opts);

    if (args.includes("--print")) {
      await printJS(bundledPath);
    }
    if (args.includes("--run")) {
      await runJS(bundledPath, inputPath, source);
    }
    
    const endTime = performance.now();
    
    if (opts.verbose) {
      logCompletionMessage(opts, bundledPath, startTime, endTime);
    }
    
    logger.logPerformance("transpile", inputPath.split("/").pop()!);
    await cleanup();
  } catch (error) {
    // Different error handling based on mode
    if (args.includes("--debug")) {
      // Debug mode - show complete error details with stack trace
      try {
        reportError(error, {
          filePath: inputPath,
          source,
          verbose: true,
          includeStack: true,
          useClickablePaths: true
        });
      } catch (e) {
        // Fallback if reportError fails
        console.error("\n\x1b[31m[ERROR]\x1b[0m Full error details:", error);
      }
    } else if (opts.verbose) {
      // Verbose mode - show detailed error but without stack trace
      try {
        reportError(error, {
          filePath: inputPath,
          source,
          verbose: true,
          includeStack: false,
          useClickablePaths: true
        });
      } catch (e) {
        // Fallback if reportError fails
        console.error("\n\x1b[31m[ERROR]\x1b[0m Detailed error:", error);
      }
    } else {
      // Normal mode - show simplified error with clickable file paths
      try {
        reportError(error, {
          filePath: inputPath,
          source,
          verbose: false,
          includeStack: false,
          useClickablePaths: true
        });
        
        // Suggest using debug flag for more details
        console.error("\nFor detailed information with stack trace, run with --debug flag");
      } catch (e) {
        // Fallback to basic error reporting if reportError fails
        let message = String(error);
        if (message.includes('\n')) {
          // Only take the first line
          message = message.split('\n')[0];
        }
        
        // Clean up and simplify the message
        message = message.replace(/^Error: /, '');
        
        console.error(`\nError: ${message}`);
        console.error("\nFor detailed information, run with --debug flag");
      }
    }
    
    Deno.exit(1);
  }
}

// Add near the end, before main is called
function logCompletionMessage(
  options: any,
  outputPath: string,
  startTime: number,
  endTime: number
): void {
  const duration = endTime - startTime;
  console.log(`\nTranspilation complete in ${(duration / 1000).toFixed(2)}s`);
  console.log(`Output written to: ${outputPath}`);
}

if (import.meta.main) {
  main();
}