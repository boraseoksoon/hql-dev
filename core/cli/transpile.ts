// cli/transpile.ts - with enhanced error handling
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import { globalLogger as logger } from "../src/logger.ts";
import { setupConsoleLogging, setupLoggingOptions } from "./utils/utils.ts";
import { report, withErrorHandling, registerSourceFile } from "../src/common/common-errors.ts";
import {
  cleanupAllTempFiles,
  registerExceptionTempFile,
} from "../src/common/temp-file-tracker.ts";

// Define the options interface
interface TranspileOptions {
  verbose?: boolean;
  showTiming?: boolean;
}

function printHelp() {
  // Unchanged
  console.error(
    "Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]",
  );
  console.error("\nBasic Options:");
  console.error("  --run             Run the compiled output");
  console.error("  --verbose, -v     Enable verbose logging and enhanced error formatting");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --time            Show performance metrics for each stage");
  console.error("  --help, -h        Display this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts input.hql");
  console.error("  deno run -A cli/transpile.ts input.hql output.js");
  console.error("  deno run -A cli/transpile.ts input.hql --time");
}

export async function transpile(options: TranspileOptions = {}): Promise<void> {
  const args = Deno.args;

  // Set up common console logging.
  setupConsoleLogging(args);

  if (args.length < 1 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(1);
  }

  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  
  // Check for timing flag in args or options
  const showTiming = args.includes("--time") || options.showTiming;
  let verbose = options.verbose || false;

  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
    registerExceptionTempFile(outputPath);
  }

  // Process common logging options.
  const loggingOptions = setupLoggingOptions(args);
  verbose = loggingOptions.verbose || verbose;

  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }
  
  // Enable logger if timing is requested
  logger.setEnabled(Boolean(verbose || showTiming));
  
  let source: string;
  try {
    // Read input file for error context
    try {
      source = await Deno.readTextFile(inputPath);
      registerSourceFile(inputPath, source);
    } catch (readError) {
      console.error(report(readError, { filePath: inputPath }));
      Deno.exit(1);
    }

    // Transpile the input with enhanced error handling
    const bundledPath = await withErrorHandling(
      () => transpileCLI(inputPath, outputPath, { 
        verbose: verbose || showTiming, // Enable verbose mode if timing is requested
        skipErrorReporting: true,
        showTiming
      }),
      { 
        filePath: inputPath, 
        source,
        context: "CLI transpilation",
        logErrors: false
      }
    )().catch(error => {
      console.error(report(error, { filePath: inputPath, source }));
      Deno.exit(1);
    });

    if (args.includes("--print")) {
      try {
        const finalOutput = await Deno.readTextFile(bundledPath);
        console.log(finalOutput);
      } catch (error) {
        console.error(report(error, { filePath: bundledPath }));
        Deno.exit(1);
      }
    } 

    if (args.includes("--run")) {
      console.log(`Running bundled output: ${bundledPath}`);
      try {
        await import("file://" + resolve(bundledPath));
      } catch (error) {
        // For runtime errors, try to map back to the original source
        console.error(report(error, { 
          filePath: inputPath, 
          source
        }));
        Deno.exit(1);
      }
    }

    await cleanupAllTempFiles();
    logger.debug("Cleaned up all registered temporary files");
  } catch (error) {
    console.error(report(error, { filePath: inputPath, source: source! }));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  transpile();
}