#!/usr/bin/env deno run -A

import { transpileCLI } from "../src/bundler.ts";
import { resolve } from "../src/platform/platform.ts";
import { cleanupAllTempFiles } from "../src/common/temp-file-tracker.ts";
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
  const dir = await Deno.makeTempDir({ prefix: "hql_expr_" });
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
  if (exprDir) {
    try {
      await Deno.remove(exprDir, { recursive: true });
    } catch { /* ignore */ }
  }
  try {
    await Deno.remove(runDir, { recursive: true });
  } catch { /* ignore */ }
  try {
    await cleanupAllTempFiles();
  } catch { /* ignore */ }
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
 * Core transpile + run logic
 */
async function transpileAndExecute(
  args: string[], options: CliOptions, inputPath: string,
  source: string, runDir: string
): Promise<void> {
  const perf = args.includes("--performance")
    ? { minify: true, drop: ["console", "debugger"] }
    : { minify: false };

  const bundleOpts = {
    verbose: options.verbose,
    showTiming: false,
    tempDir: runDir,
    skipErrorReporting: true,
    skipErrorHandling: true,
    ...perf
  };

  const name = inputPath.split("/").pop() || "output";
  const outPath = `${runDir}/${name.replace(/\.hql$/, ".run.js")}`;

  logger.startTiming("run", "Transpilation");
  const bundled = await withErrorHandling(
    () => transpileCLI(inputPath, outPath, bundleOpts),
    { filePath: inputPath, source, context: "transpilation", logErrors: false }
  )().catch(err => {
    console.error(report(err, { filePath: inputPath, source }));
    Deno.exit(1);
  });
  logger.endTiming("run", "Transpilation");

  if (args.includes("--print")) {
    logger.startTiming("run", "Read Output");
    console.log(await Deno.readTextFile(bundled));
    logger.endTiming("run", "Read Output");
  } else {
    logger.log({ text: `Running bundled output: ${bundled}`, namespace: "cli" });
    logger.startTiming("run", "Execution");
    await withErrorHandling(
      () => import("file://" + resolve(bundled)),
      { filePath: inputPath, source, context: "execution", logErrors: false }
    )().catch(err => {
      console.error(report(err, { filePath: inputPath, source }));
      Deno.exit(1);
    });
    logger.endTiming("run", "Execution");
  }

  logger.endTiming("run", "Total Processing");
  logger.logPerformance("run", name);
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
  const { transpile } = await import("./transpile.ts");
  const args = [filename, ...(options.verbose ? ["--verbose"] : []), ...(options.showTiming ? ["--time"] : [])];
  await withTemporaryDenoArgs(args, async () => { await transpile(); });
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

  const runDir = await Deno.makeTempDir({ prefix: "hql_run_" });
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
