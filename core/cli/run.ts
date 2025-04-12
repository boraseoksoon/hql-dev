// cli/run.ts - streamlined CLI interface
import { transpileCLI } from "../src/bundler.ts";
import { resolve } from "../src/platform/platform.ts";
import { initializeLogger } from "../src/logger-init.ts";
import logger from "../src/logger-init.ts";
import { cleanupAllTempFiles } from "../src/utils/temp-file-tracker.ts";
import { setupConsoleLogging, setupLoggingOptions } from "./utils/utils.ts";
// Error handling imports
import { 
  registerSourceFile,
  CommonErrorUtils
} from "../src/transpiler/error/common-error-utils.ts";
import { initializeErrorHandling } from "../src/transpiler/error/error-initializer.ts";

function printHelp() {
  console.error(
    "Usage: deno run -A cli/run.ts <target.hql|target.js> [options]",
  );
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging");
  console.error(
    "  --log <namespaces>  Filter logging to specified namespaces (e.g., --log parser,cli)",
  );
  console.error("  --help, -h        Display this help message");
}

async function run() {
  const args = Deno.args;

  // Set up console logging based on --quiet
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

  // Setup logging options (verbose & log namespaces)
  const { verbose, logNamespaces } = setupLoggingOptions(args);
  
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
    CommonErrorUtils.reportError(readError, {
      filePath: inputPath,
      verbose: verbose,
      useClickablePaths: true,
      includeStack: verbose
    });
    Deno.exit(1);
  }
  
  try {
    const bundleOptions = { 
      verbose, 
      tempDir, 
      skipErrorReporting: true,
      skipErrorHandling: true
    };
    
    // Run the module directly, with a single error handler
    const fileName = inputPath.split("/").pop() || "output";
    const tempOutputPath = `${tempDir}/${fileName.replace(/\.hql$/, ".run.js")}`;
    
    // Transpile the code with error handling
    const bundledPath = await CommonErrorUtils.withErrorHandling(
      () => transpileCLI(inputPath, tempOutputPath, bundleOptions),
      { 
        filePath: inputPath, 
        context: "transpilation",
        logErrors: false // Handle errors ourselves for better formatting
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
    
    if (args.includes("--print")) {
      const bundledContent = await Deno.readTextFile(bundledPath);
      console.log(bundledContent);
    } else {
      logger.log({
        text: `Running bundled output: ${bundledPath}`,
        namespace: "cli",
      });
      
      // Run the code with error handling
      await CommonErrorUtils.withErrorHandling(
        async () => await import("file://" + resolve(bundledPath)),
        { 
          filePath: bundledPath, 
          context: "execution",
          logErrors: false // Handle errors ourselves
        }
      )().catch(error => {
        // Use enhanced error reporting for runtime errors
        CommonErrorUtils.reportError(error, {
          filePath: bundledPath,
          verbose: verbose,
          useClickablePaths: true,
          includeStack: verbose
        });
        Deno.exit(1);
      });
    }
  } catch (error) {
    // Use enhanced error reporting
    CommonErrorUtils.reportError(error, {
      filePath: inputPath,
      verbose: verbose,
      useClickablePaths: true,
      includeStack: verbose
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