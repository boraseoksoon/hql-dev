// cli/run.ts - with enhanced error handling
import { transpileCLI } from "../src/bundler.ts";
import { resolve } from "../src/platform/platform.ts";
import logger, { Logger } from "../src/logger.ts";
import { cleanupAllTempFiles } from "../src/temp-file-tracker.ts";
import { setupConsoleLogging, setupLoggingOptions, setupDebugOptions } from "./utils/utils.ts";
// New imports for enhanced error handling
import { 
  registerSourceFile, 
  formatError, 
  getSuggestion,
  ErrorUtils,
  withErrorHandling
} from "../src/error-handling.ts";
import { initializeErrorHandling } from "../src/error-initializer.ts";
import { reportError } from "../src/error-reporter.ts";

function printHelp() {
  // Unchanged
  console.error(
    "Usage: deno run -A cli/run.ts <target.hql|target.js> [options]",
  );
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging and enhanced error formatting");
  console.error("  --quiet           Disable console.log output");
  console.error(
    "  --log <namespaces>  Filter logging to specified namespaces (e.g., --log parser,cli)",
  );
  console.error("  --performance     Apply performance optimizations");
  console.error("  --print           Print final JS output directly in CLI");
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

  // Setup logging options (verbose & log namespaces).
  const { verbose, logNamespaces } = setupLoggingOptions(args);
  logger.setEnabled(verbose);
  if (logNamespaces.length > 0) {
    Logger.allowedNamespaces = logNamespaces;
    console.log(
      `Logging restricted to namespaces: ${logNamespaces.join(", ")}`,
    );
  }

  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }
  
  // Setup debug options for enhanced error reporting
  const { debug, clickablePaths } = setupDebugOptions(args);
  if (debug) {
    console.log("Debug mode enabled with enhanced error reporting");
  }
  
  // Initialize enhanced error handling system
  initializeErrorHandling({
    enableGlobalHandlers: true,
    enableReplEnhancement: false
  });

  const inputPath = resolve(nonOptionArgs[0]);
  logger.log({ text: `Processing entry: ${inputPath}`, namespace: "cli" });

  const tempDir = await Deno.makeTempDir({ prefix: "hql_run_" });
  logger.log({
    text: `Created temporary directory: ${tempDir}`,
    namespace: "cli",
  });

  // Read input file for error context
  try {
    const source = await Deno.readTextFile(inputPath);
    // Register the source for enhanced error handling
    registerSourceFile(inputPath, source);
  } catch (readError) {
    // Use the enhanced error reporter
    reportError(readError, {
      filePath: inputPath,
      verbose: verbose,
      useClickablePaths: clickablePaths,
      includeStack: verbose
    });
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
      verbose, 
      tempDir, 
      ...optimizationOptions, 
      skipErrorReporting: true,
      skipErrorHandling: true
    };
    
    const useColors = !args.includes("--no-colors");

    // Run the module directly, with a single error handler
    const fileName = inputPath.split("/").pop() || "output";
    const tempOutputPath = `${tempDir}/${fileName.replace(/\.hql$/, ".run.js")}`;
    
    // Transpile the code with error handling
    const bundledPath = await ErrorUtils.withErrorHandling(
      () => transpileCLI(inputPath, tempOutputPath, bundleOptions),
      { 
        filePath: inputPath, 
        context: "transpilation",
        logErrors: false // Handle errors ourselves for better formatting
      }
    )().catch(error => {
      // Use enhanced error reporting
      reportError(error, {
        filePath: inputPath,
        verbose: verbose || debug,
        useClickablePaths: clickablePaths,
        includeStack: verbose || debug
      });
      Deno.exit(1);
    });
    
    if (args.includes("--print")) {
      const bundledContent = await Deno.readTextFile(bundledPath);
      console.log(bundledContent);
    } else {
      logger.log({
        text: `Running bundled output: ${bundledPath}`,
        namespace: "cli",
      });
      
      // Run the code with error handling
      await ErrorUtils.withErrorHandling(
        async () => await import("file://" + resolve(bundledPath)),
        { 
          filePath: bundledPath, 
          context: "execution",
          logErrors: false // Handle errors ourselves
        }
      )().catch(error => {
        // Use enhanced error reporting for runtime errors
        reportError(error, {
          filePath: bundledPath,
          verbose: verbose || debug,
          useClickablePaths: clickablePaths,
          includeStack: verbose || debug
        });
        Deno.exit(1);
      });
    }
  } catch (error) {
    // Use enhanced error reporting
    reportError(error, {
      filePath: inputPath,
      verbose: verbose || debug,
      useClickablePaths: clickablePaths,
      includeStack: verbose || debug
    });
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