#!/usr/bin/env deno run -A

import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import { globalLogger as logger } from "../src/logger.ts";
import { parseCliOptions, applyCliOptions, CliOptions } from "./utils/cli-options.ts";
import { report, withErrorHandling, registerSourceFile } from "../src/common/common-errors.ts";
import { 
  cleanupAllTempFiles, 
  getCacheDir,
  registerExplicitOutput,
  getCacheStats
} from "../src/common/temp-file-tracker.ts";
import { initializeRuntime } from "../src/common/runtime-initializer.ts";

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
  console.error("  --help, -h        Show this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts src/file.hql");
  console.error("  deno run -A cli/transpile.ts src/file.hql dist/file.js --time");
  console.error("  deno run -A cli/transpile.ts src/file.hql --print --run");
  console.error("  deno run -A cli/transpile.ts src/file.hql --force");
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

  // Show cache directory in verbose mode
  if (opts.verbose) {
    const cacheDir = await getCacheDir();
    logger.debug(`Using cache directory: ${cacheDir}`);
  }

  const source = await loadSource(inputPath);
  const bundledPath = await transpile(inputPath, outputPath, opts);

  if (args.includes("--print")) {
    await printJS(bundledPath);
  }
  if (args.includes("--run")) {
    await runJS(bundledPath, inputPath, source);
  }

  logger.logPerformance("transpile", inputPath.split("/").pop()!);
  await cleanup();
}

if (import.meta.main) {
  main();
}