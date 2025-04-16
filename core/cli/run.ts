/*
* HQL Run Command (CLI)
* ====================
*
* The run command executes HQL source files directly from the command line.
*
* ───────────────────────────────────────────────────────────────
* USAGE:
*
*   deno run -A cli/run.ts <target.hql|target.js> [options]
*
* OPTIONS:
*
*   --verbose                 Enable verbose logging
*   --time                    Show performance timing information
*   --quiet                   Disable console.log output
*   --log <namespaces>        Filter logging to specific namespaces
*   --performance             Apply performance optimizations (minification)
*   --print                   Print final JS output without executing
*   --debug                   Enable enhanced debugging and error reporting
*   --no-clickable-paths      Disable clickable file paths in error messages
*   --help, -h                Display help message
*/

import { Environment } from "../src/environment.ts";
import { parse } from "../src/transpiler/pipeline/parser.ts";
import { transformSyntax } from "../src/transpiler/pipeline/syntax-transformer.ts";
import { expandMacros } from "../src/s-exp/macro.ts";
import { convertToHqlAst } from "../src/s-exp/macro-reader.ts";
import { transformAST } from "../src/transformer.ts";
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

async function run() {
  const args = Deno.args;

  // Set up common console logging based on --quiet or production.
  setupConsoleLogging(args);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }

  const nonOptionArgs = args.filter((arg) =>
    !arg.startsWith("--") && !arg.startsWith("-")
  );
  if (nonOptionArgs.length < 1) {
    printHelp();
    Deno.exit(1);
  }

  // Parse CLI options and apply to logger
  const cliOptions = parseCliOptions(args);
  applyCliOptions(cliOptions);

  // Set up namespace filtering if specified
  const logNamespaces = parseLogNamespaces(args);
  if (logNamespaces.length > 0) {
    Logger.allowedNamespaces = logNamespaces;
    console.log(
      `Logging restricted to namespaces: ${logNamespaces.join(", ")}`,
    );
  }
  
  // Setup debug options for enhanced error reporting
  const { debug } = parseDebugOptions(args);
  if (debug) {
    console.log("Debug mode enabled with enhanced error reporting");
  }

  const inputPath = resolve(nonOptionArgs[0]);
  logger.log({ text: `Processing entry: ${inputPath}`, namespace: "cli" });

  // Start timing the overall process
  logger.startTiming("run", "Total Processing");

  const tempDir = await Deno.makeTempDir({ prefix: "hql_run_" });
  logger.log({
    text: `Created temporary directory: ${tempDir}`,
    namespace: "cli",
  });

  let source: string;
  
  // Read input file for error context
  try {
    logger.startTiming("run", "File Reading");
    source = await Deno.readTextFile(inputPath);
    // Register the source for enhanced error handling
    registerSourceFile(inputPath, source);
    logger.endTiming("run", "File Reading");
  } catch (readError) {
    // Use the enhanced error reporter
    console.error(report(readError, { filePath: inputPath }));
    Deno.exit(1);
  }
  
  try {
    const PERFORMANCE_MODE = {
      minify: true,
      drop: ["console", "debugger"],
    };
    const optimizationOptions = args.includes("--performance")
      ? PERFORMANCE_MODE
      : { minify: false };
    const bundleOptions = { 
      verbose: cliOptions.verbose, 
      showTiming: false, // Disable timing in transpileCLI to avoid duplicate metrics
      tempDir, 
      ...optimizationOptions, 
      skipErrorReporting: true,
      skipErrorHandling: true
    };

    // Run the module directly, with a single error handler
    const fileName = inputPath.split("/").pop() || "output";
    const tempOutputPath = `${tempDir}/${fileName.replace(/\.hql$/, ".run.js")}`;
    
    // Transpile the code with error handling
    logger.startTiming("run", "Transpilation");
    const bundledPath = await withErrorHandling(
      () => transpileCLI(inputPath, tempOutputPath, bundleOptions),
      { 
        filePath: inputPath, 
        source,
        context: "transpilation",
        logErrors: false // Handle errors ourselves for better formatting
      }
    )().catch(error => {
      // Use enhanced error reporting
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
      logger.log({
        text: `Running bundled output: ${bundledPath}`,
        namespace: "cli",
      });
      
      // Read the transpiled code
      const transpiled = await Deno.readTextFile(bundledPath);
      
      // Run the code with error handling
      logger.startTiming("run", "Execution");
      await withErrorHandling(
        async () => await import("file://" + resolve(bundledPath)),
        { 
          filePath: inputPath, // Use original source file for better errors
          source,  // Pass original source for context
          context: "execution",
          logErrors: false // Handle errors ourselves
        }
      )().catch((error: unknown) => {
        // Use enhanced error reporting for runtime errors
        // Try to map transpiled JS error back to HQL source
        const enhancedError = report(error, { 
          filePath: inputPath, 
          source 
        });
        console.error(enhancedError);
        Deno.exit(1);
      });
      logger.endTiming("run", "Execution");
    }

    logger.endTiming("run", "Total Processing");
    logger.logPerformance("run", inputPath.split("/").pop());
  } catch (error) {
    // Use enhanced error reporting
    console.error(report(error, { filePath: inputPath, source }));
    Deno.exit(1);
  } finally {
    try {
      await Deno.remove(tempDir, { recursive: true });
      logger.log({
        text: `Cleaned up temporary directory: ${tempDir}`,
        namespace: "cli",
      });
    } catch (e) {
      logger.log({
        text: `Error cleaning up temporary directory: ${
          e instanceof Error ? e.message : String(e)
        }`,
        namespace: "cli",
      });
    }

    try {
      await cleanupAllTempFiles();
      logger.log({
        text: "Cleaned up all registered temporary files",
        namespace: "cli",
      });
    } catch (e) {
      logger.log({
        text: `Error cleaning up temporary files: ${
          e instanceof Error ? e.message : String(e)
        }`,
        namespace: "cli",
      });
    }
  }
}

if (import.meta.main) {
  run();
}

// --- HQL CLI/Expression API ---

/**
 * Evaluate an HQL expression and return the result
 * 
 * @param expr - HQL expression to evaluate
 * @param options - CLI options for processing
 * @returns The result of the evaluation
 */
export async function evaluateExpression(expr: string, options: CliOptions = {}): Promise<any> {
  try {
    registerSourceFile("REPL-CLI", expr);
    
    // 1. Environment Init
    logger.startTiming("expr-eval", "Environment Init");
    const env = new Environment();
    env.initializeBuiltins();
    logger.endTiming("expr-eval", "Environment Init");
    
    // 2. Parse
    logger.startTiming("expr-eval", "Parse");
    const sexps = parse(expr);
    logger.endTiming("expr-eval", "Parse");
    
    // 3. Syntax Transform
    logger.startTiming("expr-eval", "Syntax Transform");
    const transformed = transformSyntax(sexps, { verbose: options.verbose });
    logger.endTiming("expr-eval", "Syntax Transform");
    
    // 4. Macro Expansion
    logger.startTiming("expr-eval", "Macro Expansion");
    const expanded = expandMacros(transformed, env, { verbose: options.verbose });
    logger.endTiming("expr-eval", "Macro Expansion");
    
    // 5. AST Conversion
    logger.startTiming("expr-eval", "AST Conversion");
    const ast = convertToHqlAst(expanded, { verbose: options.verbose });
    logger.endTiming("expr-eval", "AST Conversion");
    
    // 6. Code Generation
    logger.startTiming("expr-eval", "Code Generation");
    const jsCode = await transformAST(ast, Deno.cwd(), { verbose: options.verbose, replMode: true });
    logger.endTiming("expr-eval", "Code Generation");
    
    // 7. JS Evaluation
    logger.startTiming("expr-eval", "JS Evaluation");
    // eslint-disable-next-line no-eval
    const result = eval(jsCode);
    logger.endTiming("expr-eval", "JS Evaluation");
    
    return result;
  } catch (error) {
    console.error(report(error, { source: expr, filePath: "REPL-CLI" }));
    throw error;
  }
}

/**
 * Run an HQL file with specified options
 */
export async function runHqlFile(filename: string, options: CliOptions = {}): Promise<void> {
  // Apply options to the global logger
  applyCliOptions(options);
  
  // Create a new version of args that includes our options
  const newArgs = [filename];
  if (options.verbose) newArgs.push("--verbose");
  if (options.showTiming) newArgs.push("--time");
  
  // Create a custom run function that uses our args
  const customRun = async () => {
    // Store original args
    const originalArgs = [...Deno.args];
    
    try {
      // Temporarily replace args without modifying the readonly property
      Object.defineProperty(Deno, "args", {
        value: newArgs,
        configurable: true
      });
      
      // Run with our custom args
      await run();
    } finally {
      // Restore original args
      Object.defineProperty(Deno, "args", {
        value: originalArgs,
        configurable: true
      });
    }
  };
  
  await customRun();
}

/**
 * Transpile an HQL file to JavaScript
 */
export async function transpileHqlFile(filename: string, options: CliOptions = {}): Promise<void> {
  // Apply options to the global logger
  applyCliOptions(options);
  
  // Import the transpile function
  const { transpile } = await import("./transpile.ts");
  
  // Create a custom transpile function that uses our options
  const customTranspile = async () => {
    // Create new args that include our options
    const newArgs = [filename];
    if (options.verbose) newArgs.push("--verbose");
    if (options.showTiming) newArgs.push("--time");
    
    // Store original args
    const originalArgs = [...Deno.args];
    
    try {
      // Temporarily replace args without modifying the readonly property
      Object.defineProperty(Deno, "args", {
        value: newArgs,
        configurable: true
      });
      
      // Run transpile with our custom args
      await transpile();
    } finally {
      // Restore original args
      Object.defineProperty(Deno, "args", {
        value: originalArgs,
        configurable: true
      });
    }
  };
  
  await customTranspile();
}