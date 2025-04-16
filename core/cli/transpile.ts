/*
* HQL Transpile Command (CLI)
* ==========================
*
* The transpile command converts HQL code to JavaScript without executing it.
*
* ───────────────────────────────────────────────────────────────
* USAGE:
*
*   deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]
*
* OPTIONS:
*
*   --run                     Run the compiled output
*   --verbose, -v             Enable verbose logging
*   --time                    Show performance timing information
*   --print                   Print final JS output without saving to file
*   --help, -h                Display help message
*
* EXAMPLES:
*
*   deno run -A cli/transpile.ts input.hql
*   deno run -A cli/transpile.ts input.hql output.js
*   deno run -A cli/transpile.ts input.hql --run --time
*/
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import { globalLogger as logger } from "../src/logger.ts";
import { setupConsoleLogging } from "./utils/cli-options.ts";
import { report, withErrorHandling, registerSourceFile } from "../src/common/common-errors.ts";
import { parseCliOptions, applyCliOptions } from "./utils/cli-options.ts";
import {
  cleanupAllTempFiles,
  registerExceptionTempFile,
} from "../src/common/temp-file-tracker.ts";

function printHelp() {
  console.error(
    "Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]",
  );
  console.error("\nOptions:");
  console.error("  --run             Run the compiled output");
  console.error("  --verbose, -v     Enable verbose logging");
  console.error("  --time            Show performance timing information");
  console.error("  --print           Print final JS output without saving to file");
  console.error("  --help, -h        Display this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts input.hql");
  console.error("  deno run -A cli/transpile.ts input.hql output.js");
  console.error("  deno run -A cli/transpile.ts input.hql --run --time");
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

  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
    registerExceptionTempFile(outputPath);
  }

  // Parse CLI options and apply to logger
  const cliOptions = parseCliOptions(args);
  applyCliOptions(cliOptions);

  // Start timing the overall process
  logger.startTiming("transpile", "Total");
  
  let source: string;
  try {
    // Read input file for error context
    try {
      logger.startTiming("transpile", "File Reading");
      source = await Deno.readTextFile(inputPath);
      registerSourceFile(inputPath, source);
      logger.endTiming("transpile", "File Reading");
    } catch (readError) {
      console.error(report(readError, { filePath: inputPath }));
      Deno.exit(1);
    }

    // Transpile the input with enhanced error handling
    logger.startTiming("transpile", "Transpilation");
    const bundledPath = await withErrorHandling(
      () => transpileCLI(inputPath, outputPath, { 
        verbose: cliOptions.verbose,
        showTiming: cliOptions.showTiming,
        skipErrorReporting: true
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
    logger.endTiming("transpile", "Transpilation");

    if (args.includes("--print")) {
      try {
        logger.startTiming("transpile", "Read Output");
        const finalOutput = await Deno.readTextFile(bundledPath);
        logger.endTiming("transpile", "Read Output");
        console.log(finalOutput);
      } catch (error) {
        console.error(report(error, { filePath: bundledPath }));
        Deno.exit(1);
      }
    } 

    if (args.includes("--run")) {
      console.log(`Running bundled output: ${bundledPath}`);
      try {
        logger.startTiming("transpile", "Execution");
        await import("file://" + resolve(bundledPath));
        logger.endTiming("transpile", "Execution");
      } catch (error) {
        // For runtime errors, try to map back to the original source
        console.error(report(error, { 
          filePath: inputPath, 
          source
        }));
        Deno.exit(1);
      }
    }

    logger.endTiming("transpile", "Total");
    logger.logPerformance("transpile", inputPath.split("/").pop());

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