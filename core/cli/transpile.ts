// cli/transpile.ts - streamlined CLI interface
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import {
  cleanupAllTempFiles,
  registerExceptionTempFile,
} from "../src/utils/temp-file-tracker.ts";
import { initializeLogger } from "../src/logger-init.ts";
import logger from "../src/logger-init.ts";
import { setupConsoleLogging, setupLoggingOptions } from "./utils/utils.ts";
// Error handling imports
import { 
  registerSourceFile,
  CommonErrorUtils
} from "../src/transpiler/error/common-error-utils.ts";
import { initializeErrorHandling } from "../src/transpiler/error/error-initializer.ts";

function printHelp() {
  console.error(
    "Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]",
  );
  console.error("\nOptions:");
  console.error("  --verbose, -v     Enable verbose logging");
  console.error(
    "  --log <namespaces>  Filter logging to specified namespaces (e.g., --log parser,cli)",
  );
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --help, -h        Display this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts input.hql");
  console.error("  deno run -A cli/transpile.ts input.hql output.js");
}

async function transpile(): Promise<void> {
  const args = Deno.args;

  // Set up console logging
  setupConsoleLogging(args);

  if (args.length < 1 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(1);
  }

  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  const printOutput = args.includes("--print");

  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
    registerExceptionTempFile(outputPath);
  }

  // Process common logging options
  const loggingOptions = setupLoggingOptions(args);
  const verbose = loggingOptions.verbose;
  const logNamespaces = loggingOptions.logNamespaces;

  // Initialize the logger with the configured options
  initializeLogger({ 
    verbose, 
    namespaces: logNamespaces 
  });

  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
  }
  
  // Initialize enhanced error handling system
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
      CommonErrorUtils.reportError(readError, {
        filePath: inputPath,
        verbose: verbose,
        useClickablePaths: true, 
        includeStack: verbose
      });
      Deno.exit(1);
    }

    // Transpile the input with enhanced error handling
    const bundledPath = await CommonErrorUtils.withErrorHandling(
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
      CommonErrorUtils.reportError(error, {
        filePath: inputPath,
        verbose: verbose,
        useClickablePaths: true,
        includeStack: verbose
      });
      Deno.exit(1);
    });

    if (printOutput) {
      try {
        const finalOutput = await Deno.readTextFile(bundledPath);
        console.log(finalOutput);
      } catch (error) {
        // Use enhanced error reporting
        CommonErrorUtils.reportError(error, {
          filePath: bundledPath,
          verbose: verbose,
          useClickablePaths: true,
          includeStack: verbose
        });
        Deno.exit(1);
      }
    }

    await cleanupAllTempFiles();
    logger.debug("Cleaned up all registered temporary files");
  } catch (error) {
    // Use enhanced error reporting
    CommonErrorUtils.reportError(error, {
      filePath: inputPath,
      verbose: verbose,
      useClickablePaths: true,
      includeStack: verbose
    });
    Deno.exit(1);
  }
}

if (import.meta.main) {
  transpile();
}