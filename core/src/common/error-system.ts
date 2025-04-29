// core/src/common/error-system.ts - Improved error reporting

import { HQLError, ParseError, ValidationError, RuntimeError } from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { globalErrorReporter, reportError } from "./error.ts";
import { initializeErrorHandling, handleRuntimeError, setRuntimeContext } from "./runtime-error-handler.ts";
import { dirname, readTextFile } from "../platform/platform.ts";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";

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
        // If we don't have line info, look for potential error pattern in the error message
        const errorMsg = error.message.toLowerCase();
        
        // Try to match patterns like 'property x not found', 'symbol x not found', etc.
        let errorPattern: RegExp | null = null;
        let errorEntity: string | null = null;
        
        if (errorMsg.includes('property') && errorMsg.includes('not found')) {
          errorPattern = /'([^']+)'/g; // Match 'property_name'
          errorEntity = "property";
        } else if (errorMsg.includes('symbol') && errorMsg.includes('not found')) {
          errorPattern = /'([^']+)'/g; // Match 'symbol_name'
          errorEntity = "symbol";
        } else if (errorMsg.includes('undefined') || errorMsg.includes('null')) {
          errorPattern = /([a-zA-Z0-9_\-\.]+) is undefined|null/i;
          errorEntity = "reference";
        } else if (errorMsg.includes('is not defined')) {
          // Handle "X is not defined" errors
          errorPattern = /([a-zA-Z0-9_$]+) is not defined/;
          errorEntity = "variable";
        } else if (errorMsg.includes('is not a function')) {
          // Handle "X is not a function" errors
          errorPattern = /([a-zA-Z0-9_$]+) is not a function/;
          errorEntity = "function";
        } else if (errorMsg.includes('unexpected token')) {
          // Handle syntax errors with tokens
          errorPattern = /unexpected token ['"]?([^'"]+)['"]?/i;
          errorEntity = "token";
        }
        
        if (errorPattern && errorEntity) {
          const matches = [...error.message.matchAll(errorPattern)];
          if (matches.length > 0) {
            const entityName = matches[0][1];
            
            // Enhanced scanning: look for the entity in different forms
            const patterns = [
              new RegExp(`\\b${entityName}\\b`),  // Exact match 
              new RegExp(`\\.${entityName}\\b`),  // Property access
              new RegExp(`\\(\\s*${entityName}\\s`), // Function call
              new RegExp(`\\[['"]?${entityName}['"]?\\]`), // Array/Map access
            ];
            
            // Scan the file for the entity name using different patterns
            for (let i = 0; i < lines.length; i++) {
              // Try each pattern
              for (const pattern of patterns) {
                if (pattern.test(lines[i])) {
                  const match = pattern.exec(lines[i]);
                  const column = match ? match.index + 1 : lines[i].indexOf(entityName) + 1;
                  
                  // Create context lines around this location
                  const contextLines = [];
                  for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
                    contextLines.push({
                      line: j + 1,
                      content: lines[j],
                      isError: j === i,
                      column: j === i ? column : undefined
                    });
                  }
                  
                  error.contextLines = contextLines;
                  error.sourceLocation.line = i + 1;
                  error.sourceLocation.column = column;
                  
                  // Update the message to include more specific information
                  error.message = `${error.errorType}: ${errorEntity} '${entityName}' ${error.message.includes('not found') ? 'not found' : 'error'} in ${path.basename(sourcePath)}:${i + 1}:${column}`;
                  break;
                }
              }
              
              // If we found location, stop searching
              if (error.contextLines) break;
            }
            
            // If exact search didn't work, do a more relaxed search for the entity
            if (!error.contextLines) {
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(entityName)) {
                  const column = lines[i].indexOf(entityName) + 1;
                  
                  // Create context lines around this location
                  const contextLines = [];
                  for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
                    contextLines.push({
                      line: j + 1,
                      content: lines[j],
                      isError: j === i,
                      column: j === i ? column : undefined
                    });
                  }
                  
                  error.contextLines = contextLines;
                  error.sourceLocation.line = i + 1;
                  error.sourceLocation.column = column;
                  break;
                }
              }
            }
          }
        }
      }
    } else {
      // Convert regular Error to HQLError with context
      const newError = new HQLError(error.message, {
        errorType: "Error",
        originalError: error,
        sourceLocation: { filePath: sourcePath }
      });
      
      // Enhanced detection for common error patterns in non-HQLErrors
      if (error.message.includes("is not defined")) {
        const match = error.message.match(/([a-zA-Z0-9_$]+) is not defined/);
        if (match) {
          const varName = match[1];
          
          // Scan for the variable reference
          for (let i = 0; i < lines.length; i++) {
            // Match the variable as a word boundary to avoid partial matches
            const pattern = new RegExp(`\\b${varName}\\b`);
            if (pattern.test(lines[i])) {
              // Calculate the column position of the variable
              const column = lines[i].search(pattern) + 1;
              
              // Create context lines
              const contextLines = [];
              for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
                contextLines.push({
                  line: j + 1,
                  content: lines[j],
                  isError: j === i,
                  column: j === i ? column : undefined
                });
              }
              
              newError.contextLines = contextLines;
              newError.sourceLocation.line = i + 1;
              newError.sourceLocation.column = column;
              
              // Update message
              newError.message = `Variable '${varName}' is not defined in ${path.basename(sourcePath)}:${i + 1}:${column}`;
              break;
            }
          }
        }
      } else if (error.message.includes("is not a function")) {
        const match = error.message.match(/([a-zA-Z0-9_$.]+) is not a function/);
        if (match) {
          const fnName = match[1];
          
          // Scan for the function call
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(fnName)) {
              const column = lines[i].indexOf(fnName) + 1;
              
              // Create context lines
              const contextLines = [];
              for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
                contextLines.push({
                  line: j + 1,
                  content: lines[j],
                  isError: j === i,
                  column: j === i ? column : undefined
                });
              }
              
              newError.contextLines = contextLines;
              newError.sourceLocation.line = i + 1;
              newError.sourceLocation.column = column;
              break;
            }
          }
        }
      } else {
        // Scan for error indicators like keywords from the error message
        const errorWords = error.message.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(' ')
          .filter(word => word.length > 3);
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();
          const matchCount = errorWords.filter(word => line.includes(word)).length;
          
          if (matchCount >= 2 || (errorWords.length === 1 && matchCount === 1)) {
            // Found a line that contains multiple error-related words
            const contextLines = [];
            for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
              contextLines.push({
                line: j + 1,
                content: lines[j],
                isError: j === i,
                column: j === i ? line.indexOf(errorWords[0]) + 1 : undefined
              });
            }
            
            newError.contextLines = contextLines;
            newError.sourceLocation.line = i + 1;
            newError.sourceLocation.column = line.indexOf(errorWords[0]) + 1;
            break;
          }
        }
      }
      
      return newError;
    }
  } catch (readError) {
    logger.debug(`Failed to read source file for context: ${readError}`);
  }
  
  return error;
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
    const enrichedError = await enrichErrorWithContext(error, options.currentFile);
    
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