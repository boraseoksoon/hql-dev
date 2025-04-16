import { transpileCLI } from "../src/bundler.ts";
import { resolve } from "../src/platform/platform.ts";
import { cleanupAllTempFiles } from "../src/common/temp-file-tracker.ts";
import { setupConsoleLogging, parseLogNamespaces, parseDebugOptions, parseCliOptions, applyCliOptions, CliOptions } from "./utils/cli-options.ts";
import { registerSourceFile, report, withErrorHandling } from "../src/transpiler/error/errors.ts";
import { globalLogger as logger, Logger } from "../src/logger.ts";

function printHelp() {
  console.error(
    "Usage: deno run -A cli/run.ts <target.hql|target.js> [options]",
  );
  console.error("       deno run -A cli/run.ts '<expression>' [options]");
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging and enhanced error formatting");
  console.error("  --time            Show performance timing information");
  console.error("  --quiet           Disable console.log output");
  console.error(
    "  --log <namespaces>  Filter logging to specified namespaces (e.g., --log parser,cli)",
  );
  console.error("  --performance     Apply performance optimizations (minification)");
  console.error("  --print           Print final JS output without executing");
  console.error("  --debug           Enable enhanced debugging and error reporting");
  console.error("  --no-clickable-paths  Disable clickable file paths in error messages");
  console.error("  --help, -h        Display this help message");
}

/**
 * Check if input appears to be an HQL expression rather than a file path
 */
function isExpression(input: string): boolean {
  // If it starts with a parenthesis, it's likely an expression
  if (input.trim().startsWith("(")) {
    return true;
  }
  
  // If it doesn't have an extension, it might be an expression
  if (!input.includes(".")) {
    return true;
  }
  
  // Otherwise, assume it's a file path
  return false;
}

/**
 * Create a temporary file containing an HQL expression
 */
async function createExpressionFile(expr: string): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: "hql_expr_" });
  const tempFilePath = `${tempDir}/expression.hql`;
  
  await Deno.writeTextFile(tempFilePath, expr);
  logger.log({
    text: `Created temporary expression file: ${tempFilePath}`,
    namespace: "cli",
  });
  
  return tempFilePath;
}

// --- Modularized helpers ---

function parseNonOptionArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("--") && !arg.startsWith("-"));
}

function shouldPrintHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

function setupLoggingAndDebug(args: string[]): void {
  setupConsoleLogging(args);
  const logNamespaces = parseLogNamespaces(args);
  if (logNamespaces.length > 0) {
    Logger.allowedNamespaces = logNamespaces;
    console.log(`Logging restricted to namespaces: ${logNamespaces.join(", ")}`);
  }
  const { debug } = parseDebugOptions(args);
  if (debug) {
    console.log("Debug mode enabled with enhanced error reporting");
  }
}

async function getInputPath(nonOptionArg: string): Promise<{ inputPath: string; tempExpressionFile: string | null }> {
  if (isExpression(nonOptionArg)) {
    logger.log({ text: `Processing expression: ${nonOptionArg}`, namespace: "cli" });
    const tempExpressionFile = await createExpressionFile(nonOptionArg);
    return { inputPath: tempExpressionFile, tempExpressionFile };
  } else {
    const resolved = resolve(nonOptionArg);
    logger.log({ text: `Processing file: ${resolved}`, namespace: "cli" });
    return { inputPath: resolved, tempExpressionFile: null };
  }
}

async function readInputFile(inputPath: string): Promise<string> {
  logger.startTiming("run", "File Reading");
  try {
    const source = await Deno.readTextFile(inputPath);
    registerSourceFile(inputPath, source);
    logger.endTiming("run", "File Reading");
    return source;
  } catch (readError) {
    console.error(report(readError, { filePath: inputPath }));
    Deno.exit(1);
  }
}

async function transpileAndMaybeRun({
  args,
  cliOptions,
  inputPath,
  source,
  tempDir,
}: {
  args: string[];
  cliOptions: CliOptions;
  inputPath: string;
  source: string;
  tempDir: string;
}): Promise<void> {
  const PERFORMANCE_MODE = {
    minify: true,
    drop: ["console", "debugger"],
  };

  const optimizationOptions = args.includes("--performance")
    ? PERFORMANCE_MODE
    : { minify: false };

  const bundleOptions = {
    verbose: cliOptions.verbose,
    showTiming: false,
    tempDir,
    ...optimizationOptions,
    skipErrorReporting: true,
    skipErrorHandling: true,
  };

  const fileName = inputPath.split("/").pop() || "output";

  const tempOutputPath = `${tempDir}/${fileName.replace(/\.hql$/, ".run.js")}`;

  logger.startTiming("run", "Transpilation");

  const bundledPath = await withErrorHandling(
    () => transpileCLI(inputPath, tempOutputPath, bundleOptions),
    {
      filePath: inputPath,
      source,
      context: "transpilation",
      logErrors: false,
    },
  )().catch((error) => {
    console.error(report(error, { filePath: inputPath, source }));
    Deno.exit(1);
  });

  logger.endTiming("run", "Transpilation");

  if (args.includes("--print")) {
    logger.startTiming("run", "Read Output");

    const bundledContent = await Deno.readTextFile(bundledPath);

    logger.endTiming("run", "Read Output");

    console.log(bundledContent);
  } else {
    logger.log({ text: `Running bundled output: ${bundledPath}`, namespace: "cli" });

    logger.startTiming("run", "Execution");

    await withErrorHandling(
      async () => await import("file://" + resolve(bundledPath)),
      {
        filePath: inputPath,
        source,
        context: "execution",
        logErrors: false,
      },
    )().catch((error: unknown) => {
      const enhancedError = report(error, { filePath: inputPath, source });

      console.error(enhancedError);

      Deno.exit(1);
    });

    logger.endTiming("run", "Execution");
  }

  logger.endTiming("run", "Total Processing");

  logger.logPerformance("run", inputPath.split("/").pop());
}


async function cleanupTempFiles({ tempExpressionFile, tempDir }: { tempExpressionFile: string | null; tempDir: string }) {
  if (tempExpressionFile) {
    try {
      const tempExprDir = tempExpressionFile.substring(0, tempExpressionFile.lastIndexOf("/"));
      await Deno.remove(tempExprDir, { recursive: true });
      logger.log({ text: `Cleaned up temporary expression directory: ${tempExprDir}`, namespace: "cli" });
    } catch (e) {
      logger.log({ text: `Error cleaning up temporary expression directory: ${e instanceof Error ? e.message : String(e)}`, namespace: "cli" });
    }
  }
  try {
    await Deno.remove(tempDir, { recursive: true });
    logger.log({ text: `Cleaned up temporary directory: ${tempDir}`, namespace: "cli" });
  } catch (e) {
    logger.log({ text: `Error cleaning up temporary directory: ${e instanceof Error ? e.message : String(e)}`, namespace: "cli" });
  }
  try {
    await cleanupAllTempFiles();
    logger.log({ text: "Cleaned up all registered temporary files", namespace: "cli" });
  } catch (e) {
    logger.log({ text: `Error cleaning up temporary files: ${e instanceof Error ? e.message : String(e)}`, namespace: "cli" });
  }
}

/**
 * Run an HQL file with specified options
 */
/**
 * Temporarily override Deno.args for the duration of the callback.
 * This is necessary because Deno.args is read-only and downstream code relies on it for CLI processing.
 * DO NOT REMOVE unless you refactor all CLI consumers to accept arguments directly.
 */
async function withTemporaryDenoArgs<T>(newArgs: string[], fn: () => Promise<T>): Promise<T> {
  const originalArgs = [...Deno.args];
  try {
    Object.defineProperty(Deno, "args", {
      value: newArgs,
      configurable: true
    });
    return await fn();
  } finally {
    Object.defineProperty(Deno, "args", {
      value: originalArgs,
      configurable: true
    });
  }
}

export async function runHqlFile(filename: string, options: CliOptions = {}): Promise<void> {
  applyCliOptions(options);
  const newArgs = [filename];
  if (options.verbose) newArgs.push("--verbose");
  if (options.showTiming) newArgs.push("--time");
  await withTemporaryDenoArgs(newArgs, async () => {
    await run();
  });
}


/**
 * Transpile an HQL file to JavaScript
 */
export async function transpileHqlFile(filename: string, options: CliOptions = {}): Promise<void> {
  applyCliOptions(options);
  const { transpile } = await import("./transpile.ts");
  const newArgs = [filename];
  if (options.verbose) newArgs.push("--verbose");
  if (options.showTiming) newArgs.push("--time");
  await withTemporaryDenoArgs(newArgs, async () => {
    await transpile();
  });
}

// --- Main orchestrator ---

async function run() {
  const args = Deno.args;
  if (shouldPrintHelp(args)) {
    printHelp();
    Deno.exit(0);
  }
  setupLoggingAndDebug(args);
  const nonOptionArgs = parseNonOptionArgs(args);
  if (nonOptionArgs.length < 1) {
    printHelp();
    Deno.exit(1);
  }
  const cliOptions = parseCliOptions(args);
  applyCliOptions(cliOptions);
  const { inputPath, tempExpressionFile } = await getInputPath(nonOptionArgs[0]);
  logger.startTiming("run", "Total Processing");
  const tempDir = await Deno.makeTempDir({ prefix: "hql_run_" });
  logger.log({ text: `Created temporary directory: ${tempDir}`, namespace: "cli" });
  const source = await readInputFile(inputPath);
  try {
    await transpileAndMaybeRun({ args, cliOptions, inputPath, source, tempDir });
  } catch (error) {
    console.error(report(error, { filePath: inputPath, source }));
    Deno.exit(1);
  } finally {
    await cleanupTempFiles({ tempExpressionFile, tempDir });
  }
}

if (import.meta.main) {
  run();
}