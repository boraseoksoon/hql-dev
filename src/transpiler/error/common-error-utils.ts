/**
 * Common error utilities module - THE SINGLE SOURCE OF TRUTH for error handling across the codebase
 * 
 * This module consolidates all error handling functionality and should be the only import
 * source for error utilities. It replaces and supersedes:
 * - error-utils.ts (deprecated)
 * - error-handling.ts (partially consolidated)
 * - Local error handling implementations
 * 
 * IMPORTANT: Always import error utilities from this module, not from individual files.
 */

import {
  TranspilerError,
  ParseError,
  ValidationError,
  MacroError,
  ImportError,
  CodeGenError,
  TransformError,
  report,
  parseError,
} from "./errors.ts";
import logger from "../../logger.ts";

// Store source files for error context
const sourceRegistry = new Map<string, string>();
// Track processed errors to avoid duplicates
const processedErrors = new WeakMap<Error, string>();

/**
 * Register a source file for error enhancement
 */
export function registerSourceFile(filePath: string, source: string): void {
  sourceRegistry.set(filePath, source);
}

/**
 * Get source for a file path
 */
export function getSourceFile(filePath: string): string | undefined {
  return sourceRegistry.get(filePath);
}

/**
 * Format an error message consistently
 */
export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Wrap an error with context - for synchronous operations
 */
export function wrapError<T extends Error = Error>(
  context: string,
  error: unknown,
  filePath?: string,
  currentFile?: string,
  ErrorConstructor?: new (message: string, ...args: any[]) => T,
  ...errorArgs: any[]
): never {
  const errorMsg = `${context}: ${formatErrorMessage(error)}`;
  
  if (ErrorConstructor) {
    throw new ErrorConstructor(errorMsg, ...errorArgs);
  } else if (error instanceof TranspilerError) {
    throw error; // Don't wrap an already wrapped error
  } else if (filePath) {
    // Use ImportError as default if we have a file path
    throw new ImportError(
      errorMsg,
      filePath,
      currentFile,
      error instanceof Error ? error : undefined
    );
  } else {
    // Use generic TranspilerError if no specialized error provided
    throw new TranspilerError(errorMsg);
  }
}

/**
 * Helper function to handle synchronous operations with consistent error handling
 */
export function perform<T>(
  fn: () => T,
  context?: string,
  errorType?: new (message: string, ...args: any[]) => TranspilerError,
  errorArgs?: any[],
): T {
  try {
    return fn();
  } catch (error) {
    // If error is already of the expected type, re-throw it
    if (errorType && error instanceof errorType) {
      throw error;
    }

    // Prepare the message with context
    const msg = context
      ? `${context}: ${formatErrorMessage(error)}`
      : formatErrorMessage(error);

    // If an error type is specified, create a new error of that type
    if (errorType) {
      throw new errorType(msg, ...(errorArgs || []));
    }

    // Otherwise, use a generic TranspilerError
    throw new TranspilerError(msg);
  }
}

/**
 * Helper function to handle asynchronous operations with consistent error handling
 */
export async function performAsync<T>(
  fn: () => Promise<T>,
  context?: string,
  errorType?: new (message: string, ...args: any[]) => TranspilerError,
  errorArgs?: any[],
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // If error is already of the expected type, re-throw it
    if (errorType && error instanceof errorType) {
      throw error;
    }

    // Prepare the message with context
    const msg = context
      ? `${context}: ${formatErrorMessage(error)}`
      : formatErrorMessage(error);

    // If an error type is specified, create a new error of that type
    if (errorType) {
      throw new errorType(msg, ...(errorArgs || []));
    }

    // Otherwise, use a generic TranspilerError
    throw new TranspilerError(msg);
  }
}

/**
 * Format an error with enhanced context and suggestions
 */
export function formatError(
  error: Error,
  options: {
    filePath?: string;
    useColors?: boolean;
    includeStack?: boolean;
    makePathsClickable?: boolean;
  } = {}
): string {
  // Get source from registry if filePath is provided
  const source = options.filePath ? sourceRegistry.get(options.filePath) : undefined;
  
  // Enhance the error with source context
  let enhancedError: Error;
  if (error instanceof ParseError) {
    enhancedError = parseError(error, options.useColors);
  } else {
    enhancedError = report(error, {
      source,
      filePath: options.filePath,
      useColors: options.useColors
    });
  }
  
  // Initialize colorizer functions
  const c = options.useColors !== false ? 
    { 
      red: (s: string) => `\x1b[31m${s}\x1b[0m`, 
      yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, 
      gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
      cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
      bold: (s: string) => `\x1b[1m${s}\x1b[0m` 
    } : 
    { 
      red: (s: string) => s, 
      yellow: (s: string) => s, 
      gray: (s: string) => s, 
      cyan: (s: string) => s,
      bold: (s: string) => s 
    };
  
  // Get the main error message
  let result = c.red(c.bold(`${error.message}`));
  
  // Add file location if available
  if (options.filePath) {
    // Extract line information from error if available
    const lineMatch = error.message.match(/line (\d+)/i);
    const columnMatch = error.message.match(/column (\d+)/i);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
    const column = columnMatch ? parseInt(columnMatch[1], 10) : undefined;
    
    // Generate location path
    let locationPath = options.filePath;
    if (options.makePathsClickable && line !== undefined) {
      // Create a path format that editors can make clickable
      locationPath = `${options.filePath}:${line}${column ? `:${column}` : ''}`;
    }
    
    result += `\n${c.cyan("Location:")} ${locationPath}`;
  }
  
  // If we have a source file but no formatted context yet, add it manually
  if (source) {
    // Find the line with error if possible
    const lineMatch = error.message.match(/line (\d+)/i);
    const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : 0;
    
    if (lineNum > 0) {
      const lines = source.split('\n');
      
      result += '\n\n';
      
      // Add line before for context
      if (lineNum > 1 && lineNum <= lines.length) {
        result += `${c.gray(`${lineNum-1} │ ${lines[lineNum-2]}`)}\n`;
      }
      
      // Add the error line
      if (lineNum <= lines.length) {
        result += `${c.yellow(`${lineNum} │ ${lines[lineNum-1]}`)}\n`;
        
        // Add pointer to the likely error location
        const errorCol = error.message.match(/column (\d+)/i);
        const col = errorCol ? parseInt(errorCol[1], 10) : lines[lineNum-1].length;
        result += `${c.red(`  │ ${' '.repeat(Math.max(0, col-1))}^`)}\n`;
      }
      
      // Add line after for context
      if (lineNum < lines.length) {
        result += `${c.gray(`${lineNum+1} │ ${lines[lineNum]}`)}\n`;
      }
    }
  }
  
  // Add stack trace if requested and available
  if (options.includeStack && error.stack) {
    result += `\n\n${error.stack.split('\n').slice(1).join('\n')}`;
  }
  
  return result;
}

/**
 * Add intelligent suggestions based on the error
 */
export function getSuggestion(error: Error): string {
  // Check error message for common patterns
  const msg = error.message.toLowerCase();
  
  if (error instanceof ParseError) {
    if (msg.includes("unexpected ')'") || msg.includes("unexpected ']'") || msg.includes("unexpected '}'")) {
      return "Check for mismatched parentheses or brackets. You might have an extra closing delimiter or missing an opening one.";
    }
    if (msg.includes("unexpected end of input")) {
      return "Your expression is incomplete. Check for unclosed parentheses, brackets, or strings.";
    }
    return "Review your syntax for errors like mismatched delimiters or invalid tokens.";
  }
  
  if (error instanceof MacroError) {
    if (msg.includes("not found") || msg.includes("undefined") || msg.includes("does not exist")) {
      return "Make sure the macro is defined and imported correctly before using it.";
    }
    if (msg.includes("parameter") || msg.includes("argument")) {
      return "Check that you're passing the correct number and types of arguments to the macro.";
    }
    return "Review your macro definition and usage. Ensure parameters match expected types.";
  }
  
  if (error instanceof ImportError) {
    if (msg.includes("not found") || msg.includes("could not find") || msg.includes("no such file")) {
      return "Verify that the file exists at the specified path. Check for typos in the path.";
    }
    if (msg.includes("circular")) {
      return "You have a circular dependency. Review your import structure to break the cycle.";
    }
    return "Check that the imported file exists and is accessible. Verify import paths are correct.";
  }
  
  if (error instanceof ValidationError) {
    if (msg.includes("type") || msg.includes("expected")) {
      return "The value doesn't match the expected type. Check the type annotations and values passed.";
    }
    return "Review your code for type errors and ensure values match their expected types.";
  }
  
  if (msg.includes("undefined") || msg.includes("not defined")) {
    return "The referenced variable or function doesn't exist. Check for typos or add a definition.";
  }
  
  if (msg.includes("null") || msg.includes("undefined is not an object")) {
    return "You're trying to access a property on null or undefined. Add a check before accessing properties.";
  }
  
  // Generic suggestion
  return "Try simplifying your code to isolate the problem. Break complex expressions into smaller parts.";
}

/**
 * Create a function wrapper that handles errors
 * Prevents duplicate error messages
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T,
  options: {
    source?: string;
    filePath?: string;
    context?: string;
    rethrow?: boolean;
    logErrors?: boolean;
  } = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      // Register source file if both source and filePath are provided
      if (options.source && options.filePath) {
        registerSourceFile(options.filePath, options.source);
      }
      
      // Create a context string for the error
      const context = options.context ? `in ${options.context}` : '';
      
      if (error instanceof Error) {
        // Check if we've already processed this error
        const alreadyProcessed = processedErrors.has(error);
        
        if (alreadyProcessed) {
          // Just rethrow without additional processing
          console.debug(`[Debug] Skipping already processed error: ${processedErrors.get(error)}`);
          throw error;
        }
        
        // Mark this error as processed with context
        const errorId = `${error.message} in ${options.context || 'unknown context'}`;
        processedErrors.set(error, errorId);
        
        // Enhance the error with context information
        const enhancedErr = report(error, {
          source: options.source,
          filePath: options.filePath
        });
        
        // Log the error if requested
        if (options.logErrors !== false) {
          logger.error(formatError(enhancedErr, { 
            filePath: options.filePath,
            useColors: true 
          }));
          
          // Add suggestion
          const suggestion = getSuggestion(error);
          if (suggestion) {
            logger.info(`Suggestion: ${suggestion}`);
          }
        }
        
        // Rethrow by default, unless explicitly set to false
        if (options.rethrow !== false) {
          throw enhancedErr;
        }
        
        // If not rethrowing, return a default value (undefined)
        return undefined as unknown as T;
      }
      
      // For non-Error objects, just rethrow
      throw error;
    }
  };
}

/**
 * Print syntax-highlighted box with text
 */
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

/**
 * Print syntax-highlighted box with suggestion
 */
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

/**
 * Collection of error utilities for easier importing
 */
export const CommonErrorUtils = {
  report,
  parseError,
  formatErrorMessage,
  wrapError,
  perform,
  performAsync,
  withErrorHandling,
  formatError,
  getSuggestion,
  registerSourceFile,
  getSourceFile,
  printErrorBox,
  printSuggestionBox,
  formatErrorForReporting,
  reportError
};

// Re-export everything from errors.ts for convenience
export {
  TranspilerError,
  ParseError,
  ValidationError,
  MacroError,
  ImportError,
  CodeGenError,
  TransformError
}; 