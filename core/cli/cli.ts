#!/usr/bin/env -S deno run --allow-read
/**
 * HQL CLI Entrypoint
 * Supports: run, transpile, and direct expression evaluation
 * Usage: see --help output
 */
import { runHqlFile } from "./run.ts";
import { transpile } from "./transpile.ts";
import { report, registerSourceFile } from "../src/common/common-errors.ts";

const VERSION = "1.0.0"; // Update as needed

function printHelp() {
  console.log(`\nHQL - Command Line Interface\n\nUSAGE:\n  hql run <file>            Execute an HQL source file\n  hql transpile <file>      Transpile HQL to JavaScript\n  hql "<expr>"               Evaluate an HQL expression inline\n  hql --help                Show this help message\n  hql --version             Show version\n\nEXAMPLES:\n  hql run hello.hql\n  hql transpile hello.hql\n  hql "(+ 1 1)"             # prints: 2\n`);
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

  if (args[0] === "run" && args[1]) {
    try {
      await runHqlFile(args[1]);
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

  // Direct expression evaluation: hql "(+ 1 1)"
  if (args.length === 1 && args[0].startsWith("(")) {
    try {
      // Register expression for error context
      registerSourceFile("REPL-CLI", args[0]);
      
      const { evaluateExpression } = await import("./run.ts");
      const result = await evaluateExpression(args[0]);
      // Print only the result
      if (typeof result !== "undefined") {
        console.log(result);
      }
    } catch (e) {
      // Enhanced error reporting
      console.error(report(e, { source: args[0], filePath: "REPL-CLI" }));
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
