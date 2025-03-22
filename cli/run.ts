// cli/run.ts
import { resolve, dirname } from "../src/platform/platform.ts";
import { transpileCLI } from "../src/bundler.ts";
import { Logger } from "../src/logger.ts";
import { parse } from "../src/s-exp/parser.ts";
import { processImports } from "../src/s-exp/imports.ts";
import { Environment } from "../src/environment.ts";

function printHelp() {
  console.error("Usage: deno run -A cli/run.ts <target.hql|target.js> [options]");
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging");
  console.error("  --performance     Apply performance optimizations");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --help, -h        Display this help message");
}

/**
 * Load core macros from lib/core.hql and register them in the environment.
 */
async function loadCoreMacros(env: Environment, logger: Logger): Promise<void> {
  const corePath = resolve("lib/core.hql");
  logger.debug(`Loading core macros from: ${corePath}`);
  try {
    const coreSource = await Deno.readTextFile(corePath);
    const coreSexps = parse(coreSource);
    // Process the S-expressions from core.hql to register its macros
    await processImports(coreSexps, env, { verbose: logger.enabled, baseDir: dirname(corePath) });
    logger.debug("Core macros loaded successfully.");
  } catch (error) {
    logger.error(`Failed to load core.hql: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Run a single execution.
 */
async function run(
  inputPath: string, 
  tempDir: string,
  options: any,
  printOutput: boolean,
  logger: Logger,
  env: Environment
): Promise<void> {
  // Create a temporary output path
  const fileName = inputPath.split('/').pop() || "output";
  const tempOutputPath = `${tempDir}/${fileName.replace(/\.hql$/, ".run.js")}`;
  
  // Bundle the file
  const bundledPath = await transpileCLI(inputPath, tempOutputPath, options);
  
  // Print if requested
  if (printOutput) {
    const bundledContent = await Deno.readTextFile(bundledPath);
    console.log(bundledContent);
    return;
  }
  
  // Run the bundled output
  logger.log(`Running bundled output: ${bundledPath}`);
  await import("file://" + resolve(bundledPath));
}

/**
 * Main module execution.
 */
async function runModule(): Promise<void> {
  // Parse command line arguments
  const args = Deno.args;
  
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }
  
  // Get non-option arguments
  const nonOptionArgs = args.filter(arg => !arg.startsWith("--") && !arg.startsWith("-"));
  if (nonOptionArgs.length < 1) {
    printHelp();
    Deno.exit(1);
  }
  
  // Parse basic options
  const verbose = args.includes("--verbose");
  const performance = args.includes("--performance");
  const printOutput = args.includes("--print");
  
  const logger = new Logger(verbose);
  const inputPath = resolve(nonOptionArgs[0]);
  logger.log(`Processing entry: ${inputPath}`);
  
  // Create a temporary directory for output
  const tempDir = await Deno.makeTempDir({ prefix: "hql_run_" });
  logger.debug(`Created temporary directory: ${tempDir}`);
  
  // Initialize the global environment and automatically load core.hql macros.
  const env = await Environment.initializeGlobalEnv({ verbose });
  try {
    await loadCoreMacros(env, logger);
  } catch (error) {
    logger.error("Error during core macro loading. Aborting.");
    Deno.exit(1);
  }
  
  try {
    // Set up bundle options
    const PERFORMANCE_MODE = {
      minify: true,
      target: "es2020",
      sourcemap: false,
      drop: ["console", "debugger"],
      treeShaking: true
    };
    const optimizationOptions = performance ? PERFORMANCE_MODE : { 
      minify: false,
      sourcemap: true 
    };
    
    // Combine all options
    const bundleOptions = {
      verbose,
      tempDir,
      ...optimizationOptions
    };
    
    // Process the entry file, now passing the environment with core.hql macros loaded.
    await run(inputPath, tempDir, bundleOptions, printOutput, logger, env);
  } catch (error) {
    logger.error(`Error during processing: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Always clean up temporary directory
    try {
      await Deno.remove(tempDir, { recursive: true });
      logger.debug(`Cleaned up temporary directory: ${tempDir}`);
    } catch (e) {
      logger.debug(`Error cleaning up temporary directory: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// Run the module if invoked directly
if (import.meta.main) {
  runModule().catch(error => {
    console.error("Fatal error:", error);
    Deno.exit(1);
  });
}
