import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import {
  cleanupAllTempFiles,
  registerExceptionTempFile,
} from "../src/temp-file-tracker.ts";
import { Logger } from "../src/logger.ts";
import { setupConsoleLogging, setupLoggingOptions } from "./utils/utils.ts";

function printHelp() {
  console.error(
    "Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]",
  );
  console.error("\nBasic Options:");
  console.error("  --run             Run the compiled output");
  console.error("  --verbose, -v     Enable verbose logging");
  console.error("  --quiet           Disable console.log output");
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
    logger.allowedNamespaces = logNamespaces;
    console.log(
      `Logging restricted to namespaces: ${logNamespaces.join(", ")}`,
    );
  }

  try {
    const bundledPath = await transpileCLI(inputPath, outputPath, { verbose });

    if (printOutput) {
      try {
        const finalOutput = await Deno.readTextFile(bundledPath);
        console.log(finalOutput);
      } catch (error) {
        console.error(
          `Error reading output file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        Deno.exit(1);
      }
    } else if (runAfter) {
      console.log(`Running bundled output: ${bundledPath}`);
      try {
        await import("file://" + resolve(bundledPath));
      } catch (error) {
        console.error(
          `Error running bundled output: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        Deno.exit(1);
      }
    }

    await cleanupAllTempFiles();
    logger.debug("Cleaned up all registered temporary files");
  } catch (error) {
    console.error(
      "Error during transpilation:",
      error instanceof Error ? error.message : error,
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  transpile();
}
