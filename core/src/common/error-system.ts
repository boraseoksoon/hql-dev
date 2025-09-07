// core/src/common/error-system.ts - Improved error reporting

import { HQLError, ParseError, ValidationError, RuntimeError } from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { globalErrorReporter, reportError } from "./error.ts";
import { initializeErrorHandling, handleRuntimeError, setRuntimeContext } from "./runtime-error-handler.ts";
import { dirname, readTextFile } from "../platform/platform.ts";
import * as path from "jsr:@std/path@1";
import { ERROR_PATTERNS, ERROR_SUGGESTIONS, ERROR_REGEX } from "./error-constants.ts";

/**
 * Error system configuration options
 */
export interface ErrorSystemOptions {
  debug?: boolean;
  verboseErrors?: boolean;
  showInternalErrors?: boolean;
}

/**
 * Global configuration for the error system
 */
const errorConfig: ErrorSystemOptions = {
  debug: false,
  verboseErrors: false,
  showInternalErrors: false
};

/**
 * Initialize the HQL error system
 */
export function initializeErrorSystem(options: ErrorSystemOptions = {}): void {
  // Set configuration options
  errorConfig.debug = options.debug ?? false;
  errorConfig.verboseErrors = options.verboseErrors ?? false;
  errorConfig.showInternalErrors = options.showInternalErrors ?? false;
  
  // Initialize runtime error handling
  initializeErrorHandling();
  
  // Override Deno.exit to ensure errors are properly handled
  const originalExit = Deno.exit;
  Deno.exit = (code?: number) => {
    logger.debug(`Application exit with code ${code}`);
    return originalExit(code);
  };
  
  logger.debug("HQL error system initialized with options:", options);
}

/**
 * Update error system configuration
 */
export function updateErrorConfig(options: Partial<ErrorSystemOptions>): void {
  Object.assign(errorConfig, options);
  logger.debug("Error system configuration updated:", errorConfig);
}

/**
 * Get current error system configuration
 */
export function getErrorConfig(): ErrorSystemOptions {
  return { ...errorConfig };
}

/**
 * Wrap a function with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T> | T,
  errorHandler?: (error: Error) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Log the error
    logger.error(`Error caught in withErrorHandling: ${error.message}`);
    
    // Handle the error with our improved system
    if (error instanceof Error) {
      await handleRuntimeError(error);
      
      // Call custom error handler if provided
      if (errorHandler) {
        errorHandler(error);
      }
    }
    
    // Re-throw the error for upstream handling
    throw error;
  }
}

/**
 * Create a formatted error for CLI display
 */
export async function formatErrorForCLI(error: Error | HQLError): Promise<string> {
  if (error instanceof HQLError) {
    return await globalErrorReporter.formatter.formatError(error, errorConfig.debug);
  }
  
  // Convert regular Error to HQLError
  const hqlError = new HQLError(error.message, {
    errorType: "Error",
    originalError: error
  });
  
  return await globalErrorReporter.formatter.formatError(hqlError, errorConfig.debug);
}

/**
 * Enhanced error enrichment function that tries to add source context
 * This is especially useful for validation errors that lack source location
 */
export async function enrichErrorWithContext(error: Error | HQLError, filePath?: string): Promise<Error | HQLError> {
  // If it's already an HQLError with context, don't modify it
  if (error instanceof HQLError && error.contextLines && error.contextLines.length > 0) {
    return error;
  }
  
  // If it's an HQLError but missing source location info, try to add it
  if (error instanceof HQLError) {
    // Always set filePath if it's not already set
    if (!error.sourceLocation.filePath && filePath) {
      error.sourceLocation.filePath = filePath;
    }
  }
  
  // Extract the source file path from the error or use provided filePath
  const sourcePath = error instanceof HQLError ? 
    error.sourceLocation.filePath || filePath : 
    filePath;
  
  // Can't add context without a source file
  if (!sourcePath) {
    return error;
  }
  
  try {
    // Try to read the source file
    const content = await readTextFile(sourcePath);
    const lines = content.split('\n');
    
    if (error instanceof HQLError) {
      // If we have line info, use it
      if (error.sourceLocation.line) {
        const line = error.sourceLocation.line;
        const contextLines = [];
        
        // Add context lines before the error line
        for (let i = Math.max(0, line - 2); i < line; i++) {
          contextLines.push({
            line: i + 1,
            content: lines[i] || "",
            isError: false
          });
        }
        
        // Add the error line
        contextLines.push({
          line: line,
          content: lines[line - 1] || "",
          isError: true,
          column: error.sourceLocation.column
        });
        
        // Add context lines after the error line
        for (let i = line; i < Math.min(lines.length, line + 2); i++) {
          contextLines.push({
            line: i + 1,
            content: lines[i] || "",
            isError: false
          });
        }
        
        error.contextLines = contextLines;
      } else {
        // If we don't have line info, try to infer from error message
        error = await inferErrorLocationFromMessage(error, content, sourcePath);
      }
    } else {
      // For standard errors, create an HQLError with context
      const hqlError = new HQLError(error.message, {
        errorType: "Error",
        originalError: error,
        sourceLocation: { filePath: sourcePath }
      });
      
      // Try to infer location from the error message
      const enhancedError = await inferErrorLocationFromMessage(hqlError, content, sourcePath);
      return enhancedError;
    }
  } catch (readError) {
    logger.debug(`Failed to read source file for context: ${readError instanceof Error ? readError.message : String(readError)}`);
  }
  
  return error;
}

/**
 * Infer error location from the error message
 */
async function inferErrorLocationFromMessage(
  error: HQLError, 
  fileContent: string,
  sourcePath: string
): Promise<HQLError> {
  const lines = fileContent.split('\n');
  const errorMsg = error.message.toLowerCase();
  
  // Look for specific error patterns
  
  // Import errors - check for import statements
  if (errorMsg.includes("import")) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('import')) {
        // Check for common import typos
        if (errorMsg.includes("invalid") && line.match(/\bfom\b/)) {
          const pos = line.search(/\bfom\b/);
          error.sourceLocation.line = i + 1;
          error.sourceLocation.column = pos + 1;
          
          // Add suggestion
          error.getSuggestion = () => "Did you mean 'from' instead of 'fom'?";
          break;
        } else {
          error.sourceLocation.line = i + 1;
          error.sourceLocation.column = line.indexOf('import') + 1;
          break;
        }
      }
    }
  }
  // Undefined variables or function calls
  else if (errorMsg.includes("is not defined") || errorMsg.includes("is not a function")) {
    const match = errorMsg.match(/['"]?([a-zA-Z0-9_]+)['"]?\s+is\s+not/i);
    if (match && match[1]) {
      const name = match[1];
      
      // Look for the name in the file
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const pos = line.indexOf(name);
        
        if (pos >= 0 && (pos === 0 || !isAlphaNumeric(line[pos-1])) && 
            (pos + name.length >= line.length || !isAlphaNumeric(line[pos + name.length]))) {
          error.sourceLocation.line = i + 1;
          error.sourceLocation.column = pos + 1;
          break;
        }
      }
    }
  }
  
  // Add context lines if we found a line
  if (error.sourceLocation.line) {
    const line = error.sourceLocation.line;
    const contextLines = [];
    
    // Add context lines before the error line
    for (let i = Math.max(0, line - 2); i < line; i++) {
      contextLines.push({
        line: i + 1,
        content: lines[i] || "",
        isError: false
      });
    }
    
    // Add the error line
    contextLines.push({
      line: line,
      content: lines[line - 1] || "",
      isError: true,
      column: error.sourceLocation.column
    });
    
    // Add context lines after the error line
    for (let i = line; i < Math.min(lines.length, line + 2); i++) {
      contextLines.push({
        line: i + 1,
        content: lines[i] || "",
        isError: false
      });
    }
    
    error.contextLines = contextLines;
  }
  
  return error;
}

/**
 * Check if a character is alphanumeric or underscore
 */
function isAlphaNumeric(char: string): boolean {
  return /[a-zA-Z0-9_]/.test(char);
}

/**
 * Run a CLI command with enhanced error handling
 */
export async function runWithErrorHandling(
  command: () => Promise<number | void>,
  options: { debug?: boolean; exitOnError?: boolean; currentFile?: string } = {}
): Promise<number> {
  try {
    const result = await command();
    return typeof result === 'number' ? result : 0;
  } catch (error) {
    // Configure error reporting based on options
    const debug = options.debug ?? errorConfig.debug;
    
    // Try to enrich the error with context
    let enrichedError = error;
    
    if (options.currentFile) {
      enrichedError = await enrichErrorWithContext(error, options.currentFile);
    }
    
    if (enrichedError instanceof Error) {
      await reportError(enrichedError, debug);
    } else {
      console.error(`Unknown error: ${error}`);
    }
    
    // Exit if requested
    if (options.exitOnError !== false) {
      Deno.exit(1);
    }
    
    return 1;
  }
}

/**
 * Extract error information for structured output (e.g., JSON)
 */
export function extractErrorInfo(error: Error | HQLError): Record<string, unknown> {
  if (!(error instanceof HQLError)) {
    return {
      type: 'Error',
      message: error.message,
      stack: errorConfig.debug ? error.stack : undefined
    };
  }
  
  const result: Record<string, unknown> = {
    type: error.errorType || 'Error',
    message: error.message
  };
  
  if (error.sourceLocation) {
    result.location = {
      file: error.sourceLocation.filePath,
      line: error.sourceLocation.line,
      column: error.sourceLocation.column
    };
  }
  
  if (error.contextLines && error.contextLines.length > 0) {
    result.context = error.contextLines.map(line => ({
      line: line.line,
      content: line.content,
      isError: line.isError,
      column: line.column
    }));
  }
  
  if (error.getSuggestion && typeof error.getSuggestion === 'function') {
    result.suggestion = error.getSuggestion();
  }
  
  if (errorConfig.debug && error.stack) {
    result.stack = error.stack;
  }
  
  return result;
}

// Export error classes and utilities for easier access
export {
  HQLError,
  ParseError,
  ValidationError,
  RuntimeError,
  reportError
} from "./error.ts";

// Export error handling functions
export {
  setRuntimeContext as setErrorContext,
  handleRuntimeError
} from "./runtime-error-handler.ts";