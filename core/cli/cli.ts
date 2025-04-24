import { run } from "./run.ts";
import { parseCliOptions, CliOptions } from "./utils/cli-options.ts";

// Version information
const VERSION = "0.1.0";

/**
 * Print help information to the console
 */
function printHelp() {
  console.log(`
HQL - Command Line Interface

USAGE:
  hql run <file>            Execute an HQL source file
  hql run '<expr>'          Evaluate an HQL expression
  hql transpile <file>      Transpile HQL to JavaScript
  hql repl                  Start the interactive REPL

OPTIONS:
  --help, -h                Show this help message
  --version                 Show version
  --time                    Show performance timing information
  --verbose                 Enable detailed logging
  --debug                   Show detailed error information and call stacks
  --log <namespaces>        Filter log output to specific namespaces

EXAMPLES:
  hql run hello.hql
  hql transpile hello.hql
  hql repl                  # Start the REPL
  hql run '(+ 1 1)'         # prints: 2
  hql run '(+ 1 2)' --time  # prints: 3 with performance metrics
`);
}

/**
 * Display version information
 */
function showVersion() {
  console.log(`HQL CLI version ${VERSION}`);
}

/**
 * Validate command and arguments, return target if valid
 */
function validateCommand(args: string[]): { command: string; target?: string } {
  const command = args[0];
  const commandArgs = args.slice(1);
  
  // Accept valid commands
  if (command !== "run" && command !== "transpile" && command !== "repl") {
    console.error(`Error: Unknown command '${command}'`);
    printHelp();
    Deno.exit(1);
  }
  
  // Ensure a target is provided for run/transpile
  if ((command === "run" || command === "transpile") && commandArgs.length === 0) {
    console.error(`Error: Missing target for '${command}' command`);
    printHelp();
    Deno.exit(1);
  }
  
  return { command, target: commandArgs[0] };
}

/**
 * Execute the transpile command
 */
async function executeTranspileCommand() {
  const { main } = await import("./transpile.ts");
  await main();
}

/**
 * Execute the repl command
 */
async function executeReplCommand() {
  const { startRepl } = await import("../../repl/repl/repl.ts");
  await startRepl();
}

/**
 * Main CLI function
 */
async function main() {
  const args = Deno.args;

  // Handle help flag
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }

  // Handle version flag
  if (args.includes("--version")) {
    showVersion();
    Deno.exit(0);
  }

  // Parse CLI options
  const cliOptions = parseCliOptions(args);
  
  // Set debug mode if enabled
  if (args.includes("--debug")) {
    cliOptions.debug = true;
  }
  
  // Validate command and get target
  const { command } = validateCommand(args);

  if (command === "run") {
    await run(args);
  } else if (command === "transpile") {
    await executeTranspileCommand();
  } else if (command === "repl") {
    await executeReplCommand(cliOptions);
  }
}

if (import.meta.main) {
  main();
}
