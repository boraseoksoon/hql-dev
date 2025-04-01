import { transpileCLI } from "../src/bundler.ts";
import { resolve } from "../src/platform/platform.ts";
import logger, { Logger } from "../src/logger.ts";
import { cleanupAllTempFiles } from "../src/temp-file-tracker.ts";
import { setupConsoleLogging, setupLoggingOptions } from "./utils/utils.ts";

function printHelp() {
  console.error(
    "Usage: deno run -A cli/run.ts <target.hql|target.js> [options]",
  );
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging (shows all logs)");
  console.error("  --quiet           Disable console.log output");
  console.error(
    "  --log <namespaces>  Filter logging to specified namespaces (e.g., --log parser,cli)",
  );
  console.error("  --performance     Apply performance optimizations");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --help, -h        Display this help message");
}

// ... (runModule function remains unchanged)

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

  const inputPath = resolve(nonOptionArgs[0]);
  logger.log({ text: `Processing entry: ${inputPath}`, namespace: "cli" });

  const tempDir = await Deno.makeTempDir({ prefix: "hql_run_" });
  logger.log({
    text: `Created temporary directory: ${tempDir}`,
    namespace: "cli",
  });

  
  try {
    const PERFORMANCE_MODE = {
      minify: true,
      drop: ["console", "debugger"],
    };
    const optimizationOptions = args.includes("--performance")
      ? PERFORMANCE_MODE
      : { minify: false };
    const bundleOptions = { verbose, tempDir, ...optimizationOptions };

    await runModule(
      inputPath,
      tempDir,
      bundleOptions,
      args.includes("--print"),
    );
  } catch (error) {
    logger.error(
      `Error during processing: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
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

/**
 * Run a single module execution
 */
async function runModule(
  inputPath: string,
  tempDir: string,
  options: any,
  printOutput: boolean,
): Promise<void> {
  const fileName = inputPath.split("/").pop() || "output";
  const tempOutputPath = `${tempDir}/${fileName.replace(/\.hql$/, ".run.js")}`;

  const bundledPath = await transpileCLI(inputPath, tempOutputPath, options);

  if (printOutput) {
    const bundledContent = await Deno.readTextFile(bundledPath);
    console.log(bundledContent);
    return;
  }

  logger.log({
    text: `Running bundled output: ${bundledPath}`,
    namespace: "cli",
  });
  await import("file://" + resolve(bundledPath));
}

if (import.meta.main) {
  run();
}
