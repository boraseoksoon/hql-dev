import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI, OptimizationOptions } from "../src/bundler.ts";
import { Logger } from "../src/logger.ts";
import { MODES } from "./modes.ts";

function printHelp() {
  console.error("Usage: deno run -A cli/run.ts <target.hql|target.js> [options]");
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging");
  console.error("  --performance     Apply aggressive performance optimizations (minify, drop console/debugger, etc.)");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --help, -h        Display this help message");
}

async function runModule(): Promise<void> {
  // Check if help is requested
  if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }

  // Filter non-option arguments (assume they are file paths)
  const args = Deno.args.filter((arg) => !arg.startsWith("--"));
  const verbose = Deno.args.includes("--verbose");
  const performance = Deno.args.includes("--performance");
  const printOutput = Deno.args.includes("--print");
  const logger = new Logger(verbose);

  if (args.length < 1) {
    printHelp();
    Deno.exit(1);
  }

  const inputPath = resolve(args[0]);
  logger.log(`Processing entry: ${inputPath}`);

  // Create a temporary directory so that the output file doesn't conflict with any existing file.
  const tempDir = await Deno.makeTempDir();
  const tempOutput = resolve(tempDir, "bundled.js");

  // Prepare optimization options.
  let optimizationOptions: OptimizationOptions = {};
  if (performance) {
    logger.log("Aggressive performance optimizations enabled.");
    optimizationOptions = { ...MODES.performance };
  }

  // Transpile and bundle the input file.
  const bundledPath = await transpileCLI(inputPath, tempOutput, { verbose, ...optimizationOptions });

  if (printOutput) {
    // Print the final JS output directly to the CLI.
    const finalOutput = await Deno.readTextFile(bundledPath);
    console.log(finalOutput);
  } else {
    logger.log(`Running bundled output: ${bundledPath}`);
    // Dynamically import the bundled module.
    await import("file://" + resolve(bundledPath));
  }

  // Clean up the temporary directory.
  await Deno.remove(tempDir, { recursive: true });
  logger.log(`Cleaned up temporary directory: ${tempDir}`);
}

if (import.meta.main) {
  runModule().catch((error) => {
    console.error("Error:", error);
    Deno.exit(1);
  });
}
