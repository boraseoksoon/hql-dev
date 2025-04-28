// core/src/common/error-system.ts
// Central integration point for the HQL error system

import { HQLError, ParseError, ValidationError, RuntimeError } from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { globalErrorReporter, reportError } from "./error-handler.ts";
import { initializeErrorHandling, handleRuntimeError, setRuntimeContext } from "./runtime-error-handler.ts";

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
 * Generate examples of different error types for testing
 */
export function generateExampleErrors(): { [key: string]: HQLError } {
  const examples: { [key: string]: HQLError } = {};
  
  // Parse error example
  examples.parseError = new ParseError(
    "Unexpected token in app.hql:23:8",
    {
      line: 23,
      column: 8,
      filePath: "app.hql",
      source: `(fn calculate (x y)
  (let (result (+ x y))
    (if result = 0
      "Zero"
      result)))`
    }
  );
  
  // Add context lines to parse error
  examples.parseError.contextLines = [
    { line: 21, content: "(fn calculate (x y)", isError: false },
    { line: 22, content: "  (let (result (+ x y))", isError: false },
    { line: 23, content: "    (if result = 0", isError: true, column: 8 },
    { line: 24, content: '      "Zero"', isError: false },
    { line: 25, content: "      result)))", isError: false }
  ];
  
  // Add suggested fix
  examples.parseError.getSuggestion = () => "Use '===' for equality comparison: (if (=== result 0) ...)";
  
  // Runtime error example
  examples.runtimeError = new RuntimeError(
    "Cannot read property 'value' of undefined",
    {
      filePath: "user-service.hql",
      line: 25,
      column: 18
    }
  );
  
  // Add context lines to runtime error
  examples.runtimeError.contextLines = [
    { line: 23, content: "(fn process-user (user)", isError: false },
    { line: 24, content: "  (let (score (get user \"score\")", isError: false },
    { line: 25, content: "        total (calculate score \"bonus\"))", isError: true, column: 18 },
    { line: 26, content: "    total))", isError: false },
    { line: 27, content: "", isError: false }
  ];
  
  // Add suggested fix
  examples.runtimeError.getSuggestion = () => "Check that 'score' is defined before passing it to calculate. Consider adding a default value: (calculate (or score 0) \"bonus\")";
  
  // Validation error example
  examples.validationError = new ValidationError(
    "Type error: Expected number but got string",
    "function argument",
    {
      expectedType: "number",
      actualType: "string",
      filePath: "math.hql",
      line: 15,
      column: 10
    }
  );
  
  // Add context lines to validation error
  examples.validationError.contextLines = [
    { line: 13, content: "(fn multiply (a b)", isError: false },
    { line: 14, content: "  (if (and (number? a) (number? b))", isError: false },
    { line: 15, content: "    (* a b)", isError: true, column: 10 },
    { line: 16, content: "    (throw \"Both arguments must be numbers\")))", isError: false }
  ];
  
  // Add suggested fix
  examples.validationError.getSuggestion = () => "Convert string values to numbers before multiplication: (fn multiply (a b) (let (numA (Number a) numB (Number b)) (* numA numB)))";
  
  return examples;
}

/**
 * Display an example error to demonstrate the formatting
 */
export async function displayExampleError(errorType: string = 'parseError'): Promise<void> {
  const examples = generateExampleErrors();
  
  if (errorType in examples) {
    await reportError(examples[errorType], errorConfig.debug);
  } else {
    console.error(`Unknown error type: ${errorType}`);
    console.error(`Available error types: ${Object.keys(examples).join(', ')}`);
  }
}

/**
 * Run a CLI command with error handling
 */
export async function runWithErrorHandling(
  command: () => Promise<void>, 
  options: { debug?: boolean; exitOnError?: boolean } = {}
): Promise<void> {
  try {
    await command();
  } catch (error) {
    // Configure error reporting based on options
    const debug = options.debug ?? errorConfig.debug;
    
    if (error instanceof Error) {
      await reportError(error, debug);
    } else {
      console.error(`Unknown error: ${error}`);
    }
    
    // Exit if requested
    if (options.exitOnError !== false) {
      Deno.exit(1);
    }
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