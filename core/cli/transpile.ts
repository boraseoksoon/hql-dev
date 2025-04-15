// cli/transpile.ts - with enhanced error handling
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import { globalLogger as logger } from "../src/logger.ts";
import { setupConsoleLogging, setupLoggingOptions } from "./utils/utils.ts";
import CommonError, { registerSourceFile } from "../src/common/common-errors.ts";
import {
  cleanupAllTempFiles,
  registerExceptionTempFile,
} from "../src/common/temp-file-tracker.ts";

function printHelp() {
  // Unchanged
  console.error(
    "Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]",
  );
  console.error("\nBasic Options:");
  console.error("  --run             Run the compiled output");
  console.error("  --verbose, -v     Enable verbose logging and enhanced error formatting");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --help, -h        Display this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts input.hql");
  console.error("  deno run -A cli/transpile.ts input.hql output.js");
}

export async function transpile(): Promise<void> {
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

  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
    registerExceptionTempFile(outputPath);
  }

  // Process common logging options.
  const loggingOptions = setupLoggingOptions(args);
  verbose = loggingOptions.verbose;

  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }
  
  try {
    // Read input file for error context
    let source;
    try {
      source = await Deno.readTextFile(inputPath);
      registerSourceFile(inputPath, source);
    } catch (readError) {
      console.error(CommonError.report(readError instanceof Error ? readError : new Error(String(readError))));
      Deno.exit(1);
    }

    // Transpile the input with enhanced error handling
    const bundledPath = await CommonError.withErrorHandling(
      () => transpileCLI(inputPath, outputPath, { 
        verbose,
        skipErrorReporting: true
      }),
      { 
        filePath: inputPath, 
        context: "CLI transpilation",
        logErrors: false
      }
    )().catch(error => {
      console.error(CommonError.report(error instanceof Error ? error : new Error(String(error))));
      Deno.exit(1);
    });

    if (args.includes("--print")) {
      try {
        const finalOutput = await Deno.readTextFile(bundledPath);
        console.log(finalOutput);
      } catch (error) {
        console.error(CommonError.report(error instanceof Error ? error : new Error(String(error))));
        Deno.exit(1);
      }
    } 

    if (args.includes("--run")) {
      console.log(`Running bundled output: ${bundledPath}`);
      try {
        await import("file://" + resolve(bundledPath));
      } catch (error) {
        console.error(CommonError.report(error instanceof Error ? error : new Error(String(error))));
        Deno.exit(1);
      }
    }

    await cleanupAllTempFiles();
    logger.debug("Cleaned up all registered temporary files");
  } catch (error) {
    console.error(CommonError.report(error instanceof Error ? error : new Error(String(error))));    Deno.exit(1);
  }
}

if (import.meta.main) {
  transpile();
}