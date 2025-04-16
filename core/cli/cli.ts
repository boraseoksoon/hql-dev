#!/usr/bin/env -S deno run --allow-read
/*
* HQL Command Line Interface (CLI)
* =================================
*
* The HQL CLI provides a flexible interface for running, transpiling, and evaluating HQL code.
*
* ───────────────────────────────────────────────────────────────
* SUPPORTED COMMANDS:
*
*   hql run <file>             Execute an HQL source file
*   hql transpile <file>       Transpile HQL to JavaScript
*   hql '<expr>'               Evaluate an inline HQL expression
*
* COMMON OPTIONS:
*
*   --help, -h                 Show usage & help
*   --version                  Show CLI version
*   --time                     Print performance metrics
*   --verbose                  Enable detailed logging
*   --log <namespaces>         Filter log output to specific namespaces
*/
import { runHqlFile } from "./run.ts";
import { transpile } from "./transpile.ts";
import { report, registerSourceFile } from "../src/common/common-errors.ts";
import { parseCliOptions, applyCliOptions } from "./utils/cli-options.ts";
import { globalLogger as logger } from "../src/logger.ts";

const VERSION = "1.0.0"; // Update as needed

function printHelp() {
  console.log(`
HQL - Command Line Interface

USAGE:
  hql run <file>            Execute an HQL source file
  hql transpile <file>      Transpile HQL to JavaScript
  hql "<expr>"              Evaluate an HQL expression inline

OPTIONS:
  --help, -h                Show this help message
  --version                 Show version
  --time                    Show performance timing information
  --verbose                 Enable detailed logging
  --log <namespaces>        Filter log output to specific namespaces

EXAMPLES:
  hql run hello.hql
  hql transpile hello.hql
  hql "(+ 1 1)"             # prints: 2
  hql "(+ 1 2)" --time      # prints: 3 with performance metrics
`);
}

async function main() {
  const args = Deno.args;

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }
  if (args.includes("--version")) {
    console.log(`hql ${VERSION}`);
    Deno.exit(0);
  }

  // Parse CLI options (--verbose, --time)
  const cliOptions = parseCliOptions(args);
  applyCliOptions(cliOptions);

  if (args[0] === "run" && args[1]) {
    try {
      await runHqlFile(args[1], cliOptions);
    } catch (e) {
      // Enhanced error reporting
      console.error(report(e, { filePath: args[1] }));
      Deno.exit(1);
    }
    return;
  }

  if (args[0] === "transpile") {
    try {
      await transpile();
    } catch (e) {
      // Enhanced error reporting
      console.error(report(e, { filePath: "cli.ts" }));
      Deno.exit(1);
    }
    return;
  }

  // Direct expression evaluation: hql "(+ 1 1)" [--time]
  if ((args.length === 1 && args[0].startsWith("(")) || (args.length === 2 && args.some(a => a.startsWith("(") && !a.startsWith("--")))) {
    // Find the expression argument
    const exprArg = args.find(a => a.startsWith("(") && !a.startsWith("--"));
    try {
      // Register expression for error context
      registerSourceFile("REPL-CLI", exprArg!);
      
      // Start timing the whole operation
      logger.startTiming("expr-eval", "Total");
      
      const { evaluateExpression } = await import("./run.ts");
      const result = await evaluateExpression(exprArg!, cliOptions);
      
      // End timing and log performance if enabled
      logger.endTiming("expr-eval", "Total");
      logger.logPerformance("expr-eval", "Expression Evaluation");
      
      // Print only the result
      if (typeof result !== "undefined") {
        console.log(result);
      }
    } catch (e) {
      // Enhanced error reporting
      console.error(report(e, { source: exprArg, filePath: "REPL-CLI" }));
      Deno.exit(1);
    }
    return;
  }

  // Fallback: unknown command
  console.error("Unknown command or invalid usage.\n");
  printHelp();
  Deno.exit(1);
}

if (import.meta.main) {
  main();
}
