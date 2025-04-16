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
  console.log(`\nHQL - Command Line Interface\n\nUSAGE:\n  hql run <file>            Execute an HQL source file\n  hql transpile <file>      Transpile HQL to JavaScript\n  hql '<expr>'              Evaluate an HQL expression inline\n  hql -e "<expr>"           Evaluate with -e flag (alternative syntax)\n  hql --help                Show this help message\n  hql --version             Show version\n  hql --time                Show performance timing information\n  hql --verbose             Show detailed logging information\n\nEXAMPLES:\n  hql run hello.hql\n  hql transpile hello.hql\n  hql '(+ 1 1)'             # prints: 2 (preferred syntax)\n  hql '(print "hello")'     # prints: hello (note the quote nesting)\n  hql '(+ 1 1)' --time      # prints: 2 with performance metrics\n\nNOTE:\n  When using expressions with strings, use single quotes for the shell and\n  double quotes for strings in HQL: hql '(print "hello world")'\n`);
}

/**
 * Direct evaluation function that returns the actual value
 */
async function evaluateExpressionDirectly(expr: string, options = { showTiming: false, verbose: false }) {
  const { Environment } = await import("../src/environment.ts");
  const { REPLEvaluator } = await import("../../repl/repl/repl-evaluator.ts");
  const { loadSystemMacros } = await import("../src/transpiler/hql-transpiler.ts");
  const { loadSystemMacroFile } = await import("../src/s-exp/system-macros.ts");
  const { parse } = await import("../src/transpiler/pipeline/parser.ts");
  const { transformSyntax } = await import("../src/transpiler/pipeline/syntax-transformer.ts");
  const { expandMacros } = await import("../src/s-exp/macro.ts");
  const { convertToHqlAst } = await import("../src/s-exp/macro-reader.ts");
  const { transformAST } = await import("../src/transformer.ts");
  
  // Create environment with appropriate options
  const env = new Environment();
  
  // Initialize system macros with lazy loading
  await loadSystemMacros(env, { verbose: options.verbose });
  
  // Pre-load macros that are commonly used in CLI expressions
  await loadSystemMacroFile("core/lib/macro/core.hql", env, { verbose: options.verbose });
  await loadSystemMacroFile("core/lib/macro/loop.hql", env, { verbose: options.verbose });
  
  // For timing information
  const startTime = performance.now();
  const timings: Record<string, number> = {};
  let timePoint = startTime;
  
  const recordTiming = (label: string) => {
    const now = performance.now();
    timings[label] = now - timePoint;
    timePoint = now;
  };
  
  try {
    // Use direct pipeline execution for better control
    if (options.verbose) console.log("Parsing input...");
    const sexps = parse(expr);
    recordTiming("Parse");
    
    if (options.verbose) console.log("Transforming syntax...");
    const transformed = transformSyntax(sexps, { verbose: options.verbose });
    recordTiming("Syntax Transform");
    
    if (options.verbose) console.log("Processing imports...");
    // No imports in direct evaluation, but we'll include a placeholder timing
    recordTiming("Import Processing");
    
    if (options.verbose) console.log("Expanding macros...");
    const expanded = expandMacros(transformed, env, { verbose: options.verbose });
    recordTiming("Macro Expansion");
    
    if (options.verbose) console.log("Converting to HQL AST...");
    const ast = convertToHqlAst(expanded);
    recordTiming("AST Conversion");
    
    if (options.verbose) console.log("Generating JavaScript code...");
    const jsCode = await transformAST(ast, Deno.cwd(), { verbose: options.verbose });
    recordTiming("Code Generation");
    
    if (options.verbose) console.log("Evaluating JavaScript...");
    
    // Directly evaluate the generated code
    const result = eval(jsCode);
    recordTiming("JS Evaluation");
    
    // Display timing metrics if requested
    if (options.showTiming) {
      const totalTime = Object.values(timings).reduce((sum, t) => sum + t, 0);
      
      console.log("\n=== Performance Metrics ===");
      for (const [label, time] of Object.entries(timings)) {
        const percent = (time / totalTime) * 100;
        console.log(`  ${label.padEnd(20)} ${time.toFixed(2)}ms (${percent.toFixed(1)}%)`);
      }
      console.log(`  ${"─".repeat(40)}`);
      console.log(`  Total:              ${totalTime.toFixed(2)}ms`);
      console.log("================================");
    }
    
    return result;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${String(error)}`);
    }
    throw error;
  }
}

/**
 * Check if an expression might have shell quoting issues
 * Returns a helpful message or null if no issues detected
 */
function checkQuotingIssues(expr: string): string | null {
  // Check for unbalanced parentheses
  let openParens = 0;
  for (const char of expr) {
    if (char === '(') openParens++;
    if (char === ')') openParens--;
  }
  
  if (openParens !== 0) {
    return 'Unbalanced parentheses detected. Try using single quotes around your expression: hql \'(your expression)\'';
  }
  
  // Check for unquoted string literals (missing or partially-quoted strings)
  if (expr.includes(' "') && !expr.includes('" ')) {
    return 'Possible shell quoting issue with strings. Try: hql \'(your-function "your string")\' with single quotes outside, double quotes inside.';
  }
  
  // Check for double quotes around the expression (common mistake)
  if (expr.startsWith('"') && expr.endsWith('"')) {
    return 'Using double quotes around your entire expression may cause issues with strings. Try using single quotes instead: hql \'(your expression)\'';
  }
  
  return null;
}

/**
 * Extract expression from command line arguments
 * Supports both -e/--expr flag and direct expression format
 */
function getExpressionFromArgs(args: string[]): string | null {
  // Look for -e or --expr flag followed by expression
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === "-e" || args[i] === "--expr") {
      return args[i + 1];
    }
  }
  
  // Check for direct expression (any arg starting with '(' that isn't a flag)
  const nonFlagArgs = args.filter(arg => !arg.startsWith("--") && !arg.startsWith("-"));
  if (nonFlagArgs.length >= 1) {
    // If it starts with a parenthesis, it's likely an HQL expression
    if (nonFlagArgs[0].trim().startsWith("(")) {
      return nonFlagArgs[0];
    }
  }
  
  return null;
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

  // Check for flags
  const showTiming = args.includes("--time");
  const verbose = args.includes("--verbose");

  // Handle the run command
  if (args[0] === "run" && args[1]) {
    try {
      await runHqlFile(args[1], { showTiming, verbose });
    } catch (e) {
      // Enhanced error reporting
      console.error(report(e, { filePath: args[1] }));
      Deno.exit(1);
    }
    return;
  }

  // Handle the transpile command
  if (args[0] === "transpile") {
    try {
      await transpile({ showTiming, verbose });
    } catch (e) {
      // Enhanced error reporting
      console.error(report(e, { filePath: "cli.ts" }));
      Deno.exit(1);
    }
    return;
  }

  // Check for expression evaluation
  const expr = getExpressionFromArgs(args);
  if (expr) {
    try {
      // Check for potential quoting issues and provide helpful feedback
      const quotingIssue = checkQuotingIssues(expr);
      if (quotingIssue) {
        console.error(`Potential issue: ${quotingIssue}`);
        // Continue anyway - the user might still get their intended result
      }
      
      // Register expression for error context
      registerSourceFile("REPL-CLI", expr);
      
      // Use our direct evaluator with separate flag handling
      const result = await evaluateExpressionDirectly(expr, { 
        showTiming,
        verbose 
      });
      
      // Print the result, ensuring undefined isn't displayed as "undefined"
      if (result !== undefined) {
        console.log(result);
      }
    } catch (e) {
      // Check if the error might be related to shell quoting
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (errorMsg.includes("unexpected token") || errorMsg.includes("syntax error")) {
        console.error(`\nSyntax Error. This might be caused by shell quoting issues.`);
        console.error(`Try surrounding your expression with single quotes and using double quotes for strings:`);
        console.error(`  hql '(your-function "your string")'`);
      }
      
      // Enhanced error reporting
      console.error(report(e, { source: expr, filePath: "REPL-CLI" }));
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
