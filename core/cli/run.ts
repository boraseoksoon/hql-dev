#!/usr/bin/env deno run -A

import { transpileCLI } from "../src/bundler.ts";
import { resolve } from "../src/platform/platform.ts";
import { 
  cleanupAllTempFiles, 
  createTempDir, 
  registerExplicitOutput,
  getImportMapping,
  registerImportMapping,
  prepareStdlibInCache
} from "../src/common/temp-file-tracker.ts";
import {
  parseLogNamespaces,
  parseCliOptions,
  applyCliOptions,
  CliOptions
} from "./utils/cli-options.ts";
import {
  registerSourceFile,
  withErrorHandling,
  report
} from "../src/transpiler/error/errors.ts";
import { globalLogger as logger, Logger } from "../src/logger.ts";
import { parse } from "https://deno.land/std@0.170.0/flags/mod.ts";
import { basename, dirname } from "../src/platform/platform.ts";

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
    registerSourceFile(inputPath, source);
    return source;
  } catch (e) {
    console.error(report(e, { filePath: inputPath }));
    Deno.exit(1);
  } finally {
    logger.endTiming("run", "File Reading");
  }
}

/**
 * Cleanup expression and run temp directories and all registered files
 */
async function cleanupTempFiles(exprDir: string | undefined, runDir: string): Promise<void> {
  // All temp directories are now managed by the cache system
  // Just run the cleanup to handle everything
  try {
    await cleanupAllTempFiles();
  } catch (error) { 
    logger.debug(`Error during cleanup: ${error}`);
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
    // Prepare stdlib in cache - this creates cache locations for stdlib
    await prepareStdlibInCache();
    
    // Create a temp JS file for the transpiled code
    const jsOutputPath = `${runDir}/${basename(inputPath)}.js`;
    
    // Run the compiler
    await transpileCLI(inputPath, jsOutputPath, {
      verbose: options.verbose,
      showTiming: options.showTiming,
      tempDir: runDir,
      sourceDir: dirname(inputPath),
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
      // Format and report execution errors
      report(error, {
        source,
        filePath: inputPath,
      });
    }
  } catch (error) {
    // Format and report transpilation errors
    report(error, {
      source,
      filePath: inputPath,
    });
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
  const args = [filename, ...(options.verbose ? ["--verbose"] : []), ...(options.showTiming ? ["--time"] : [])];
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
 * Main CLI entry point
 */
async function run(): Promise<void> {
  const args = Deno.args;
  if (shouldShowHelp(args)) {
    printHelp();
    Deno.exit(0);
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
    Deno.exit(1);
  }
  const cliOptions = parseCliOptions(args);
  applyCliOptions(cliOptions);

  const { inputPath, exprDir } = await getInputPath(positional[0]);
  logger.startTiming("run", "Total Processing");

  const runDir = await createTempDir("run");
  logger.log({ text: `Created temporary directory: ${runDir}`, namespace: "cli" });

  const source = await readInputFile(inputPath);
  try {
    await transpileAndExecute(args, cliOptions, inputPath, source, runDir);
  } catch (error) {
    console.error(report(error, { filePath: inputPath, source }));
    Deno.exit(1);
  } finally {
    await cleanupTempFiles(exprDir, runDir);
  }
}

if (import.meta.main) {
  run();
}
