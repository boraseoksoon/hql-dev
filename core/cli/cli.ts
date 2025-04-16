#!/usr/bin/env -S deno run --allow-read
/**
 * HQL Command Line Interface (CLI)
 * =================================
 *
 * The HQL CLI provides a flexible interface for running, transpiling, and evaluating HQL (Homoiconic Query Language) code directly from your terminal.
 *
 * ───────────────────────────────────────────────────────────────
 * SUPPORTED COMMANDS & FLAGS
 *
 *   hql run <file>             Execute an HQL source file
 *   hql transpile <file>       Transpile HQL to JavaScript (prints output)
 *   hql '<expr>'               Evaluate an inline HQL expression (preferred)
 *   hql -e "<expr>"            Evaluate an inline expression using -e/--expr flag
 *
 *   --help, -h                 Show usage & help
 *   --version                  Show CLI version
 *   --time                     Print performance metrics (timing)
 *   --verbose                  Enable detailed logging
 *
 *
 * ───────────────────────────────────────────────────────────────
 * USAGE EXAMPLES
 *
 *   # Run a HQL file
 *   hql run hello.hql
 *   hql run scripts/example.hql --time
 *   hql run myfile.hql --verbose
 *
 *   # Transpile a HQL file to JavaScript
 *   hql transpile hello.hql
 *   hql transpile src/logic.hql --time
 *
 *   # Evaluate inline expressions (preferred: single quotes outside, double inside)
 *   hql '(+ 1 2 3)'
 *   hql '(print "hello world")'
 *   hql '(+ 1 1)' --time
 *   hql '(print (+ 2 2))' --verbose
 *
 *   # Alternative: use -e or --expr flag
 *   hql -e '(+ 10 20)'
 *   hql --expr '(print "sum:" (+ 2 3))' --time
 *
 *   # Combine flags (order flexible)
 *   hql '(+ 1 2)' --time --verbose
 *   hql run file.hql --verbose --time
 *
 *   # Show version/help
 *   hql --version
 *   hql --help
 *
 *
 * ───────────────────────────────────────────────────────────────
 * SHELL QUOTING & STRING TIPS
 *
 *   - Always use single quotes '...' around your HQL expressions in the shell.
 *   - Use double quotes "..." for string literals inside HQL.
 *   - Example: hql '(print "hello world")'
 *   - Avoid: hql "(print 'hello world')"   # May break string parsing
 *   - Avoid: hql "(print \"hello\")"      # Double-escaping is error-prone
 *   - For complex expressions, prefer single-quoted shell syntax.
 *
 *   Common quoting mistakes:
 *     - Unbalanced parentheses: hql '(+ 1 2'    # Missing closing parenthesis
 *     - Double quotes around the whole expr: hql "(+ 1 2)"  # May break nested strings
 *
 *   For strings with both single and double quotes, escape as needed or use concatenation.
 *
 *
 * ───────────────────────────────────────────────────────────────
 * ADVANCED USAGE & TIPS
 *
 *   - Evaluate multiple expressions:
 *       hql '(begin (print "a") (print "b"))'
 *   - Print results of expressions:
 *       hql '(+ 1 2)'              # Prints: 3
 *       hql '(print (+ 2 3))'      # Prints: 5
 *   - Performance timing:
 *       hql '(+ 1 2)' --time       # Prints result and timing info
 *   - Verbose/debug logging:
 *       hql '(* 2 3)' --verbose
 *   - Evaluate with file input and flags:
 *       hql run script.hql --time --verbose
 *   - Use -e/--expr anywhere in the argument list:
 *       hql --time -e '(+ 4 5)'
 *
 *
 * ───────────────────────────────────────────────────────────────
 * ERROR HANDLING & TROUBLESHOOTING
 *
 *   - Syntax errors may be caused by incorrect shell quoting.
 *   - If you see 'unexpected token' or 'syntax error', try:
 *       hql '(your-function "your string")'
 *   - Ensure parentheses are balanced and strings are correctly quoted.
 *   - For troubleshooting, use --verbose for more detailed error output.
 *   - Temporary files for expressions are auto-cleaned; errors in cleanup are shown only in verbose mode.
 *
 *
 * ───────────────────────────────────────────────────────────────
 * EXAMPLES FOR COPY/PASTE
 *
 *   hql '(print "hello world")'
 *   hql '(+ 42 58)' --time
 *   hql -e '(print (* 7 6))' --verbose
 *   hql run ./examples/hello.hql
 *   hql transpile ./examples/math.hql
 *
 *
 * ───────────────────────────────────────────────────────────────
 * NOTES
 *   - The CLI is case-sensitive for commands and file paths.
 *   - Expressions are always evaluated as if in a temporary file for consistent behavior.
 *   - Use --help for the latest usage information.
 *
 * For more documentation, see the project README or visit the official repo.
 */

import { runHqlFile } from "./run.ts";
import { transpile } from "./transpile.ts";
import { report, registerSourceFile } from "../src/common/common-errors.ts";

const VERSION = "1.0.0"; // Update as needed

function printHelp() {
  console.log(`\nHQL - Command Line Interface\n\nUSAGE:\n  hql run <file>            Execute an HQL source file\n  hql transpile <file>      Transpile HQL to JavaScript\n  hql '<expr>'              Evaluate an HQL expression inline\n  hql -e "<expr>"           Evaluate with -e flag (alternative syntax)\n  hql --help                Show this help message\n  hql --version             Show version\n  hql --time                Show performance timing information\n  hql --verbose             Show detailed logging information\n\nEXAMPLES:\n  hql run hello.hql\n  hql transpile hello.hql\n  hql '(+ 1 1)'             # prints: 2 (preferred syntax)\n  hql '(print "hello")'     # prints: hello (note the quote nesting)\n  hql '(+ 1 1)' --time      # prints: 2 with performance metrics\n\nNOTE:\n  When using expressions with strings, use single quotes for the shell and\n  double quotes for strings in HQL: hql '(print "hello world")'\n`);
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
  
  // Check for direct expression (non-flag args that don't match a command)
  // Skip the first argument if it's a command like "run" or "transpile"
  const commands = ["run", "transpile"];
  const nonFlagArgs = args.filter(arg => !arg.startsWith("--") && !arg.startsWith("-"));
  
  // If the first argument isn't a known command, it might be an expression
  if (nonFlagArgs.length > 0 && !commands.includes(nonFlagArgs[0])) {
    return nonFlagArgs[0];
  }
  
  return null;
}

/**
 * Creates a temporary HQL file with the given expression and runs it
 * This ensures a unified execution flow through the transpiler pipeline
 */
async function evaluate(expr: string, options = { showTiming: false, verbose: false }) {
  try {
    // Check if this is a simple expression that should display a result
    const shouldDisplayResult = !expr.includes("print") && !expr.includes("console.log");
    
    // If we need the result displayed, modify the expression
    let fileContent = expr;
    if (shouldDisplayResult) {
      fileContent = `(print ${expr})`;
    }
    
    // Register expression for error context
    registerSourceFile("REPL-CLI", expr);
    
    // Create a temporary file with the expression
    const tempDir = await Deno.makeTempDir({ prefix: "hql_expr_" });
    const tempFile = `${tempDir}/expr_${Date.now()}.hql`;
    
    // Write the expression to the temporary file
    await Deno.writeTextFile(tempFile, fileContent);
    
    try {
      // Run the temporary file through the standard pipeline
      // Pass options separately to ensure timing doesn't enable verbose
      await runHqlFile(tempFile, { 
        showTiming: options.showTiming,
        verbose: options.verbose
      });
    } finally {
      // Clean up the temporary directory
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch (e) {
        // Ignore cleanup errors in non-verbose mode
        if (options.verbose) {
          console.error(`Error cleaning temporary files: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
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
    // Check for potential quoting issues and provide helpful feedback
    const quotingIssue = checkQuotingIssues(expr);
    if (quotingIssue) {
      console.error(`Potential issue: ${quotingIssue}`);
      // Continue anyway - the user might still get their intended result
    }
    
    if (verbose) {
      console.log(`Evaluating expression: ${expr}`);
    }
    
    // Use the unified pipeline approach for evaluation
    await evaluate(expr, { 
      showTiming,
      verbose 
    });
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
