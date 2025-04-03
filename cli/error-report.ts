// cli/error-report.ts - Improved error reporting for HQL
import { resolve } from "../src/platform/platform.ts";
import { Logger } from "../src/logger.ts";
import { registerSourceFile, formatError, getSuggestion } from "../src/error-handling.ts";
import { processHql } from "../src/transpiler/hql-transpiler.ts";

// Print syntax-highlighted box with text
function printBox(text: string, title: string = "Error") {
  const lines = text.split("\n");
  const width = Math.max(...lines.map(line => line.length), title.length + 4);
  
  // Create box
  console.log(`\x1b[31m┌${"─".repeat(width + 2)}┐\x1b[0m`);
  console.log(`\x1b[31m│\x1b[0m \x1b[1m\x1b[31m${title.padEnd(width)}\x1b[0m \x1b[31m│\x1b[0m`);
  console.log(`\x1b[31m├${"─".repeat(width + 2)}┤\x1b[0m`);
  
  for (const line of lines) {
    console.log(`\x1b[31m│\x1b[0m ${line.padEnd(width)} \x1b[31m│\x1b[0m`);
  }
  
  console.log(`\x1b[31m└${"─".repeat(width + 2)}┘\x1b[0m`);
}

// Print syntax-highlighted box with suggestion
function printSuggestion(text: string) {
  const lines = text.split("\n");
  const width = Math.max(...lines.map(line => line.length), "Suggestion".length + 4);
  
  // Create box
  console.log(`\x1b[36m┌${"─".repeat(width + 2)}┐\x1b[0m`);
  console.log(`\x1b[36m│\x1b[0m \x1b[1m\x1b[36mSuggestion\x1b[0m${" ".repeat(width - 10)} \x1b[36m│\x1b[0m`);
  console.log(`\x1b[36m├${"─".repeat(width + 2)}┤\x1b[0m`);
  
  for (const line of lines) {
    console.log(`\x1b[36m│\x1b[0m ${line.padEnd(width)} \x1b[36m│\x1b[0m`);
  }
  
  console.log(`\x1b[36m└${"─".repeat(width + 2)}┘\x1b[0m`);
}

async function showErrorReport(filePath: string, verbose: boolean = false) {
  console.log(`\n\x1b[34m⚡ Analyzing file: ${filePath}\x1b[0m\n`);
  
  try {
    // Read the input file
    const source = await Deno.readTextFile(filePath);
    
    // Register source for error context
    registerSourceFile(filePath, source);
    
    // Try to process it (will likely fail)
    await processHql(source, {
      baseDir: filePath,
      verbose: verbose
    });
    
    console.log("\x1b[32m✓ File processed successfully (no errors)\x1b[0m");
  } catch (error) {
    if (error instanceof Error) {
      // Format error with our enhanced error reporting
      const formattedError = formatError(error, {
        filePath: filePath,
        useColors: true,
        includeStack: verbose
      });
      
      // Get suggestion
      const suggestion = getSuggestion(error);
      
      // Print nicely formatted errors
      printBox(formattedError, "HQL Error");
      
      if (suggestion) {
        printSuggestion(suggestion);
      }
    } else {
      console.error(`\x1b[31m✗ Unknown error: ${String(error)}\x1b[0m`);
    }
  }
}

if (import.meta.main) {
  if (Deno.args.length < 1) {
    console.error("Usage: deno run -A cli/error-report.ts <file.hql> [--verbose]");
    Deno.exit(1);
  }
  
  const inputPath = resolve(Deno.args[0]);
  const verbose = Deno.args.includes("--verbose");
  
  await showErrorReport(inputPath, verbose);
} 