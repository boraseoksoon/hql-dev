#!/usr/bin/env deno run -A

import { transpileCLI } from "../src/bundler.ts";
import { resolve } from "../src/platform/platform.ts";
import {
  clearCache,
  registerExplicitOutput,
  createTempDir,
  cleanupAllTempFiles
} from "../src/common/temp-file-tracker.ts";
import {
  parseLogNamespaces,
  parseCliOptions,
  applyCliOptions,
  CliOptions
} from "./utils/cli-options.ts";
import { registerSourceFile, report } from "../src/transpiler/error/errors.ts";
import { ErrorPipeline } from "../src/common/error-pipeline.ts";
import { globalLogger as logger, Logger } from "../src/logger.ts";
import { basename, dirname } from "../src/platform/platform.ts";
import { initializeRuntime } from "../src/common/runtime-initializer.ts";

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
 * Determine if input is inline expression
 */
function isExpression(input: string): boolean {
  const t = input.trim();
  return t.startsWith("(") || !t.includes(".");
}

/**
 * Write inline expression to temp file
 */
async function createExpressionFile(expr: string): Promise<{ filePath: string; dir: string }> {
  const dir = await createTempDir("expr");
  const filePath = `${dir}/expression.hql`;
  await Deno.writeTextFile(filePath, expr);
  logger.log({ text: `Created temporary expression file: ${filePath}`, namespace: "cli" });
  return { filePath, dir };
}

/**
 * Resolve file path or create temp for expression
 */
async function getInputPath(arg: string): Promise<{ inputPath: string; exprDir?: string }> {
  if (isExpression(arg)) {
    logger.log({ text: `Processing expression: ${arg}`, namespace: "cli" });
    const { filePath, dir } = await createExpressionFile(arg);
    return { inputPath: filePath, exprDir: dir };
  }
  const resolved = resolve(arg);
  logger.log({ text: `Processing file: ${resolved}`, namespace: "cli" });
  return { inputPath: resolved };
}

/**
 * Read source, register for errors
 */
async function readInputFile(inputPath: string): Promise<string> {
  logger.startTiming("run", "File Reading");
  try {
    const source = await Deno.readTextFile(inputPath);
    ErrorPipeline.registerSourceFile(inputPath, source);
    return source;
  } catch (e) {
    ErrorPipeline.reportError(e, { filePath: inputPath });
    Deno.exit(1);
  } finally {
    logger.endTiming("run", "File Reading");
  }
}

/**
 * Override Deno.args for internal consumers
 */
async function withTemporaryDenoArgs<T>(newArgs: string[], fn: () => Promise<T>): Promise<T> {
  const orig = [...Deno.args];
  Object.defineProperty(Deno, "args", { value: newArgs, configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(Deno, "args", { value: orig, configurable: true });
  }
}

/**
 * Function to transpile and execute an HQL file
 */
async function transpileAndExecute(
  args: string[],
  options: CliOptions,
  inputPath: string,
  source: string,
  runDir: string,
): Promise<void> {
  try {
    // Start timing if requested
    const tStart = performance.now();
    
    // Configure logger based on verbose flag
    if (options.verbose) {
      logger.setEnabled(true);
    }
    
    // Create a temp JS file for the transpiled code
    const jsOutputPath = `${runDir}/${basename(inputPath)}.js`;
    
    // Run the compiler
    await transpileCLI(inputPath, jsOutputPath, {
      verbose: options.verbose,
      showTiming: options.showTiming,
      skipErrorReporting: false,
      force: true, // Always regenerate to ensure latest code is used
    });
    
    // Execute the transpiled code
    logger.debug(`Running transpiled code from: ${jsOutputPath}`);
    
    // Create a dynamic import URL
    const importUrl = `file://${jsOutputPath}`;
    
    try {
      // Dynamic import of the transpiled code
      const module = await import(importUrl);
      
      // Check if the module has a default export to execute
      if (module.default && typeof module.default === "function") {
        logger.debug("Found default export function, executing it");
        const result = await module.default();
        
        // If the default export returned a value, log it
        if (result !== undefined) {
          console.log(result);
        }
      } else {
        // If no default export, the module was likely already executed during import
        logger.debug("Module imported successfully");
      }
    } catch (error) {
      // Use the new error pipeline for execution errors
      ErrorPipeline.reportError(error, {
        source,
        filePath: inputPath,
        verbose: options.verbose || options.debug,
        showCallStack: options.debug,
        makePathsClickable: true,
        enhancedDebug: options.debug
      });
    }
  } catch (error) {
    // Use the new error pipeline for transpilation errors
    // Only report if the error hasn't already been reported
    if (!(error instanceof ErrorPipeline.HQLError && error.reported)) {
      ErrorPipeline.reportError(error, {
        source,
        filePath: inputPath,
        verbose: options.verbose || options.debug,
        showCallStack: options.debug,
        makePathsClickable: true,
        enhancedDebug: options.debug
      });
    }
  } finally {
    logger.debug("Cleaning up temporary files");
    await cleanupAllTempFiles();
  }
}

/**
 * Programmatic run API
 */
export async function runHqlFile(
  filename: string, options: CliOptions = {}
): Promise<void> {
  applyCliOptions(options);
  const args = [
    filename, 
    ...(options.verbose ? ["--verbose"] : []), 
    ...(options.showTiming ? ["--time"] : []),
    ...(options.debug ? ["--debug"] : [])
  ];
  await withTemporaryDenoArgs(args, async () => { await run(); });
}

/**
 * Programmatic transpile API
 */
export async function transpileHqlFile(
  filename: string, options: CliOptions = {}
): Promise<void> {
  applyCliOptions(options);
  const { main } = await import("./transpile.ts");
  const args = [filename, ...(options.verbose ? ["--verbose"] : []), ...(options.showTiming ? ["--time"] : [])];
  await withTemporaryDenoArgs(args, async () => { await main(); });
}

/**
 * Main entry point for the HQL CLI
 */
export async function run(args: string[] = Deno.args): Promise<number> {
  // Initialize the runtime first
  await initializeRuntime();
  
  if (shouldShowHelp(args)) {
    printHelp();
    return 0;
  }

  // Handle log namespaces directly
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
    const { setDebugMode } = await import("../src/common/error-pipeline.ts");
    setDebugMode(true);
    // This ensures all debug flags are set consistently
    cliOptions.debug = true;
    cliOptions.verbose = true;
  }

  const { inputPath, exprDir } = await getInputPath(positional[0]);
  logger.startTiming("run", "Total Processing");

  const runDir = await createTempDir("run");
  logger.log({ text: `Created temporary directory: ${runDir}`, namespace: "cli" });

  const source = await readInputFile(inputPath);
  try {
    await transpileAndExecute(args, cliOptions, inputPath, source, runDir);
  } catch (error) {
    console.error(report(error, { filePath: inputPath, source }));
    return 1;
  } finally {
    await cleanupAllTempFiles();
  }
  return 0;
}

if (import.meta.main) {
  run();
}
