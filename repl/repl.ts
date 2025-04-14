// cli/repl.ts - Entry point for the HQL REPL
// Uses the enhanced src/repl/repl.ts implementation

import { startRepl } from "./repl/repl.ts";
import { setupConsoleLogging, setupLoggingOptions } from "../core/cli/utils/utils.ts";
import logger, { Logger } from "@logger/logger.ts";
import { resolve } from "@platform/platform.ts";
import { initializeErrorHandling } from "@transpiler/error/error-initializer.ts";

/**
 * Print help information about REPL usage and options
 */
function printHelp() {
  console.error("Usage: deno run -A cli/repl.ts [options]");
  console.error("\nOptions:");
  console.error("  --verbose           Enable verbose logging");
  console.error("  --quiet             Disable console.log output");
  console.error("  --log <namespaces>  Filter logging to specified namespaces (e.g., --log parser,cli)");
  console.error("  --history <size>    Set history size (default: 100)");
  console.error("  --load <file>       Load and evaluate a file on startup");
  console.error("  --ast               Show AST for expressions by default");
  console.error("  --expanded          Show expanded forms by default");
  console.error("  --js                Show JavaScript output by default");
  console.error("  --no-colors         Disable colored output");
  console.error("  --help, -h          Display this help message");
}

/**
 * Main entry point - parse command line args and start the REPL
 */
async function run() {
  const args = Deno.args;

  // Set up console logging based on CLI options
  setupConsoleLogging(args);

  // Display help if requested
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }

  // Parse options
  const { verbose, logNamespaces } = setupLoggingOptions(args);

  // Set verbose mode using the new logger API
  logger.setEnabled(verbose);
  Logger.allowedNamespaces = logNamespaces; // Set static property for namespaces
  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
  }

  // Configure REPL options
  const replOptions: {
    verbose?: boolean;
    baseDir?: string;
    historySize?: number;
    showAst?: boolean;
    showExpanded?: boolean;
    showJs?: boolean;
    initialFile?: string;
    useColors?: boolean;
  } = {
    verbose,
    baseDir: Deno.cwd(),
    historySize: 100,
    showAst: args.includes("--ast"),
    showExpanded: args.includes("--expanded"),
    showJs: args.includes("--js"),
    useColors: !args.includes("--no-colors"),
  };

  // Override history size if specified
  const historyIndex = args.indexOf("--history");
  if (historyIndex !== -1 && historyIndex < args.length - 1) {
    const historySize = parseInt(args[historyIndex + 1], 10);
    if (!isNaN(historySize) && historySize > 0) {
      replOptions.historySize = historySize;
    } else {
      console.error("Warning: Invalid history size, using default (100)");
    }
  }

  // Specify initial file to load if provided
  const loadIndex = args.indexOf("--load");
  if (loadIndex !== -1 && loadIndex < args.length - 1) {
    const loadFile = args[loadIndex + 1];
    if (loadFile) {
      replOptions.initialFile = loadFile;
    }
  }

  console.log("Starting HQL REPL...");
  
  try {
    // Initialize error handling
    await initializeErrorHandling();
    
    // Start the REPL
    await startRepl(replOptions);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error starting REPL: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

run();