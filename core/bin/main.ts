// cli/main.ts - Main entry point for the HQL binary
import { initializeLogger } from "../src/logger-init.ts";
import { initializeErrorHandling } from "../src/transpiler/error/error-initializer.ts";

// Utils
function setupConsoleLogging(args: string[]): void {
  // Silence output if --quiet is specified
  if (args.includes("--quiet")) {
    console.log = () => {};
    console.info = () => {};
  }
}

function setupLoggingOptions(args: string[]): { verbose: boolean; logNamespaces: string[] } {
  const verbose = args.includes("--verbose") || args.includes("-v");
  
  // Parse log namespaces if specified
  let logNamespaces: string[] = [];
  const logIndex = args.indexOf("--log");
  if (logIndex !== -1 && args.length > logIndex + 1) {
    const namespacesArg = args[logIndex + 1];
    logNamespaces = namespacesArg.split(",").map(ns => ns.trim());
  }
  
  return { verbose, logNamespaces };
}

function printHelp() {
  console.log("HQL - Hyper Query Language");
  console.log("\nUsage:");
  console.log("  hql <command> [options]");
  console.log("\nCommands:");
  console.log("  run <file.hql>      Run an HQL file");
  console.log("  transpile <file.hql> [output.js]  Transpile HQL to JavaScript");
  console.log("  \"<expression>\"      Evaluate an HQL expression directly");
  console.log("\nGlobal Options:");
  console.log("  --verbose, -v     Enable verbose logging");
  console.log("  --log <namespaces>  Filter logging to specified namespaces");
  console.log("  --help, -h        Display help for command");
  console.log("\nExamples:");
  console.log("  hql run hello.hql");
  console.log("  hql transpile hello.hql output.js");
  console.log("  hql \"(+ 1 1)\"       # Evaluates to 2");
}

async function main() {
  const args = Deno.args;
  
  // Set up console logging
  setupConsoleLogging(args);
  
  // Early help check
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(args.length === 0 ? 1 : 0);
  }
  
  // Process common logging options
  const loggingOptions = setupLoggingOptions(args);
  
  // Initialize the logger with the configured options
  initializeLogger({
    verbose: loggingOptions.verbose,
    namespaces: loggingOptions.logNamespaces
  });
  
  if (loggingOptions.verbose) {
    Deno.env.set("HQL_DEBUG", "1");
  }
  
  // Initialize enhanced error handling system
  initializeErrorHandling({
    enableGlobalHandlers: true,
    enableReplEnhancement: false
  });
  
  // Check if the first argument is a quoted expression for direct evaluation
  const firstArg = args[0] || "";
  if (firstArg.startsWith("(") && firstArg.includes(")")) {
    // This appears to be a HQL expression
    await import("../cli/eval.ts").then(module => {
      if (typeof module.evaluate === 'function') {
        return module.evaluate();
      } else {
        console.error("The evaluate function was not found");
        Deno.exit(1);
      }
    }).catch(error => {
      console.error(`Error loading evaluate command: ${error.message}`);
      Deno.exit(1);
    });
    return;
  }
  
  // Extract the command (first argument)
  const command = args[0];
  
  // Route to the appropriate subcommand
  switch (command) {
    case "run":
      // Call run command by importing dynamically
      await import("../cli/run.ts").then(module => {
        if (typeof module.run === 'function') {
          return module.run();
        } else {
          console.error("The run command implementation was not found.");
          Deno.exit(1);
        }
      }).catch(error => {
        console.error(`Error loading run command: ${error.message}`);
        Deno.exit(1);
      });
      break;
    
    case "transpile":
      // Call transpile command by importing dynamically
      await import("../cli/transpile.ts").then(module => {
        if (typeof module.transpile === 'function') {
          return module.transpile();
        } else {
          console.error("The transpile command implementation was not found.");
          Deno.exit(1);
        }
      }).catch(error => {
        console.error(`Error loading transpile command: ${error.message}`);
        Deno.exit(1);
      });
      break;
    
    default:
      // If command starts with a quote or parenthesis, treat it as expression
      if (command.startsWith("\"") || command.startsWith("'") || command.startsWith("(")) {
        await import("../cli/eval.ts").then(module => {
          if (typeof module.evaluate === 'function') {
            return module.evaluate();
          } else {
            console.error("The evaluate function was not found");
            Deno.exit(1);
          }
        }).catch(error => {
          console.error(`Error loading evaluate command: ${error.message}`);
          Deno.exit(1);
        });
      } else {
        console.error(`Unknown command: ${command}`);
        printHelp();
        Deno.exit(1);
      }
  }
}

// Run the main function if this is the main module
if (import.meta.main) {
  main();
} 