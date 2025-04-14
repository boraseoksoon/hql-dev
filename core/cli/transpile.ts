// cli/transpile.ts - with enhanced error handling
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import {
  cleanupAllTempFiles,
  registerExceptionTempFile,
} from "../src/utils/temp-file-tracker.ts";
import { Logger } from "../src/logger.ts";
import { setupConsoleLogging, setupLoggingOptions, setupDebugOptions } from "./utils/utils.ts";
// New imports for enhanced error handling
import CommonError from "../src/CommonError.ts";

function printHelp() {
  // Unchanged
  console.error(
    "Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]",
  );
  console.error("\nBasic Options:");
  console.error("  --run             Run the compiled output");
  console.error("  --verbose, -v     Enable verbose logging and enhanced error formatting");
  console.error("  --quiet           Disable console.log output");
  console.error(
    "  --log <namespaces>  Filter logging to specified namespaces (e.g., --log parser,cli)",
  );
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --debug           Enable enhanced debugging and error reporting");
  console.error("  --no-clickable-paths  Disable clickable file paths in error messages");
  console.error("  --help, -h        Display this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts input.hql");
  console.error("  deno run -A cli/transpile.ts input.hql output.js");
}

async function transpile(): Promise<void> {
  const args = Deno.args;

  // Set up common console logging.
  setupConsoleLogging(args);

  if (args.length < 1 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(1);
  }

  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  let verbose = false;
  let runAfter = false;
  const printOutput = args.includes("--print");
  const useColors = !args.includes("--no-colors");

  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
    registerExceptionTempFile(outputPath);
  }

  // Process common logging options.
  const loggingOptions = setupLoggingOptions(args);
  verbose = loggingOptions.verbose;
  const logNamespaces = loggingOptions.logNamespaces;

  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }

  // If log namespaces are provided, configure the logger accordingly.
  const logger = new Logger(verbose);
  if (logNamespaces.length > 0) {
    Logger.allowedNamespaces = logNamespaces;
    console.log(
      `Logging restricted to namespaces: ${logNamespaces.join(", ")}`,
    );
  }
  
  // Setup debug options for enhanced error reporting
  const { debug, clickablePaths } = setupDebugOptions(args);
  if (debug) {
    console.log("Debug mode enabled with enhanced error reporting");
  }
  
  // Initialize our enhanced error handling system
  initializeErrorHandling({
    enableGlobalHandlers: true,
    enableReplEnhancement: false
  });

  try {
    // Read input file for error context
    let source;
    try {
      source = await Deno.readTextFile(inputPath);
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

    // Transpile the input with enhanced error handling
    const bundledPath = await ErrorUtils.withErrorHandling(
      () => transpileCLI(inputPath, outputPath, { 
        verbose,
        skipErrorReporting: true
      }),
      { 
        filePath: inputPath, 
        context: "CLI transpilation",
        logErrors: false // Handle errors ourselves
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

    if (printOutput) {
      try {
        const finalOutput = await Deno.readTextFile(bundledPath);
        console.log(finalOutput);
      } catch (error) {
        // Use enhanced error reporting
        reportError(error, {
          filePath: bundledPath,
          verbose: verbose || debug,
          useClickablePaths: clickablePaths,
          includeStack: verbose || debug
        });
        Deno.exit(1);
      }
    } else if (runAfter) {
      console.log(`Running bundled output: ${bundledPath}`);
      try {
        await import("file://" + resolve(bundledPath));
      } catch (error) {
        // Use enhanced error reporting
        reportError(error, {
          filePath: bundledPath,
          verbose: verbose || debug,
          useClickablePaths: clickablePaths,
          includeStack: verbose || debug
        });
        Deno.exit(1);
      }
    }

    await cleanupAllTempFiles();
    logger.debug("Cleaned up all registered temporary files");
  } catch (error) {
    // Use enhanced error reporting
    reportError(error, {
      filePath: inputPath,
      verbose: verbose || debug,
      useClickablePaths: clickablePaths,
      includeStack: verbose || debug
    });
    Deno.exit(1);
  }
}

if (import.meta.main) {
  transpile();
}