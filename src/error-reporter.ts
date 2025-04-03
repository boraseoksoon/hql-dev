// src/error-reporter.ts - Unified error reporting for HQL
import { formatError, getSuggestion } from "./error-handling.ts";
import { Logger } from "./logger.ts";

// Print syntax-highlighted box with text
export function printErrorBox(text: string, title: string = "Error") {
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
export function printSuggestionBox(text: string) {
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

/**
 * Format an error for reporting with enhanced info
 */
export function formatErrorForReporting(
  error: Error,
  options: {
    filePath?: string;
    verbose?: boolean;
    useClickablePaths?: boolean;
    includeStack?: boolean;
  } = {}
): void {
  const logger = new Logger();
  
  try {
    // Use boxes in verbose mode
    const useBoxes = options.verbose === true;
    
    // Check if this is a JS error from our transpiled code
    const isTranspiledFileError = options.filePath?.includes('/T/hql_run_') || 
                                 options.filePath?.includes('\\T\\hql_run_') ||
                                 options.filePath?.endsWith('.js');
    
    // If it's a transpiled file error, try to get the original source
    let originalFilePath = options.filePath;
    if (isTranspiledFileError && error.message.includes('is not defined')) {
      // Extract the original file path from the temporary path
      const parts = options.filePath?.split('/');
      const filename = parts?.[parts.length - 1]?.replace('.run.js', '.hql');
      if (filename) {
        // Try to locate the original file
        try {
          const cwd = Deno.cwd();
          const possiblePaths = [
            `${cwd}/examples/${filename}`,
            `${cwd}/src/${filename}`,
            `${cwd}/${filename}`
          ];
          
          for (const path of possiblePaths) {
            try {
              Deno.statSync(path);
              originalFilePath = path;
              break;
            } catch {
              // File not found at this path, try next one
            }
          }
        } catch {
          // Keep using the original path if we can't find a better one
        }
      }
    }
    
    // Enhanced error formatting
    const formattedError = formatError(error, {
      filePath: originalFilePath,
      useColors: true,
      includeStack: options.includeStack || false,
      makePathsClickable: options.useClickablePaths
    });
    
    // Generate suggestion
    const suggestion = getSuggestion(error);
    
    // Format output based on verbose mode
    if (useBoxes) {
      printErrorBox(formattedError, "HQL Error");
      if (suggestion) {
        printSuggestionBox(suggestion);
      }
    } else {
      // Simple output without boxes
      console.error(`\x1b[31m${formattedError}\x1b[0m`);
      if (suggestion) {
        console.error(`\x1b[36mSuggestion: ${suggestion}\x1b[0m`);
      }
    }
  } catch (e) {
    // If formatting fails, just output the original error
    logger.error(`Error formatting error: ${e instanceof Error ? e.message : String(e)}`);
    console.error(`Original error: ${error.message}`);
  }
}

/**
 * Handle errors with standard formatting
 */
export function reportError(
  error: unknown,
  options: {
    filePath?: string;
    verbose?: boolean;
    useClickablePaths?: boolean;
    includeStack?: boolean;
  } = {}
): void {
  if (error instanceof Error) {
    formatErrorForReporting(error, options);
  } else {
    console.error(`\x1b[31mUnknown error: ${String(error)}\x1b[0m`);
  }
} 