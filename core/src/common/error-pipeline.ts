// error-pipeline.ts - Unified error handling pipeline
// Consolidates error handling logic for the entire codebase

import {
  BaseError,
  BaseParseError,
  TranspilerError,
  SpecializedError,
  ParseError,
  MacroError,
  ImportError,
  TransformError,
  CodeGenError,
  ValidationError,
  formatError,
  report,
  reportError,
  getSuggestion,
  createErrorReport,
  registerSourceFile,
  getSourceFile,
  withErrorHandling,
  translateTypeScriptError,
  withTypeScriptErrorTranslation
} from './common-errors.ts';

// ===== Error Pipeline Configuration =====

export interface ErrorHandlerOptions {
  // Error context
  source?: string;        // Source code
  filePath?: string;      // File where error occurred
  line?: number;          // Line number
  column?: number;        // Column number
  
  // Error handling behavior
  rethrow?: boolean;      // Whether to rethrow the error
  logErrors?: boolean;    // Whether to log errors
  
  // Error display
  verbose?: boolean;      // Whether to include verbose details
  useColors?: boolean;    // Whether to use colors in error output
  useClickablePaths?: boolean; // Whether to make file paths clickable
  includeStack?: boolean; // Whether to include stack trace
  
  // Error metadata
  context?: string;       // Additional context about what was happening
  phase?: string;         // Phase of processing where error occurred
  platform?: string;      // Platform context (for platform-specific code)
}

// ===== Error Pipeline Implementation =====

/**
 * Unified error pipeline function - central point for processing all errors
 * 
 * This function:
 * 1. Takes any error and options
 * 2. Processes the error according to options
 * 3. Returns the processed error
 * 
 * All error handling should flow through this pipeline
 */
export function processError(
  error: unknown,
  options: ErrorHandlerOptions = {}
): Error {
  // 1. Convert non-Error objects to Error
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  // 2. Extract source location if possible
  const enhancedOptions = enhanceErrorOptions(errorObj, options);
  
  // 3. Create appropriate error type based on context
  const processedError = categorizeError(errorObj, enhancedOptions);
  
  // 4. Log error if requested
  if (enhancedOptions.logErrors !== false) {
    logError(processedError, enhancedOptions);
  }
  
  // 5. Return the processed error
  return processedError;
}

/**
 * Enhanced version of withErrorHandling that uses the error pipeline
 */
export function withErrorPipeline<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T,
  options: ErrorHandlerOptions = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error: unknown) {
      // Process the error through our pipeline
      const processedError = processError(error, {
        ...options,
        logErrors: options.logErrors !== false
      });
      
      // Rethrow if requested (default) or return undefined
      if (options.rethrow !== false) throw processedError;
      return undefined as unknown as T;
    }
  };
}

/**
 * Synchronous version of withErrorPipeline
 */
export function withSyncErrorPipeline<T, Args extends any[]>(
  fn: (...args: Args) => T,
  options: ErrorHandlerOptions = {}
): (...args: Args) => T {
  return (...args: Args): T => {
    try {
      return fn(...args);
    } catch (error: unknown) {
      // Process the error through our pipeline
      const processedError = processError(error, {
        ...options,
        logErrors: options.logErrors !== false
      });
      
      // Rethrow if requested (default) or return undefined
      if (options.rethrow !== false) throw processedError;
      return undefined as unknown as T;
    }
  };
}

// ===== Helper Functions =====

/**
 * Enhance error options with additional information extracted from the error
 */
function enhanceErrorOptions(
  error: Error,
  options: ErrorHandlerOptions
): ErrorHandlerOptions {
  const enhanced = { ...options };

  // Extract source location from stack trace if not provided
  if (!enhanced.line && !enhanced.column && error.stack) {
    const stackLines = error.stack.split('\n');
    for (const line of stackLines) {
      const match = line.match(/\((.*):(\d+):(\d+)\)/) || line.match(/(.*):(\d+):(\d+)/);
      if (match) {
        const [_, filePath, lineNum, colNum] = match;
        if (!filePath.includes("node_modules") && !filePath.includes("deno:")) {
          enhanced.filePath = enhanced.filePath || filePath;
          enhanced.line = enhanced.line || parseInt(lineNum, 10);
          enhanced.column = enhanced.column || parseInt(colNum, 10);
          break;
        }
      }
    }
  }

  // Look for line/column info in the error message
  if (!enhanced.line || !enhanced.column) {
    const msg = error.message;
    const lineColMatches = [
      ...msg.matchAll(/(?:at|on|in)?\s*line\s+(\d+)(?:[,:]\s*(?:column|col)?\s*(\d+))?/ig),
      ...msg.matchAll(/(?:^|[^\d])(\d+):(\d+)(?:\s*-\s*\d+:\d+)?/g)
    ];

    if (lineColMatches.length > 0) {
      const bestMatch = lineColMatches[0];
      if (!enhanced.line) enhanced.line = parseInt(bestMatch[1], 10);
      if (!enhanced.column && bestMatch[2]) enhanced.column = parseInt(bestMatch[2], 10);
    }
  }

  // If we have a filePath but no source, try to load the source
  if (enhanced.filePath && !enhanced.source) {
    try {
      enhanced.source = getSourceFile(enhanced.filePath);
    } catch {
      // Failed to load source, continue without it
    }
  }

  return enhanced;
}

/**
 * Categorize the error and convert to the appropriate type
 */
function categorizeError(
  error: Error,
  options: ErrorHandlerOptions
): Error {
  // If it's already one of our specialized errors, just return it
  if (error instanceof BaseError) {
    return error;
  }
  
  // Check if it's a CircularDependencyError by property/method existence
  if (typeof (error as any).getSuggestion === 'function' && 
      error.name === 'CircularDependencyError' &&
      (error as any).cycle) {
    return error;
  }

  const msg = error.message.toLowerCase();
  
  // Specifically handle circular dependency errors
  if (msg.includes("circular") && (msg.includes("dependency") || msg.includes("import") || msg.includes("reference"))) {
    // Extract the cycle information if available
    const cycleMatch = error.message.match(/cycle:?\s*(.*)/i);
    const cyclePath = cycleMatch ? cycleMatch[1] : "";
    
    const circularError = new ImportError(
      `Circular dependency detected: ${error.message}`,
      extractImportPath(error.message) || "unknown",
      {
        sourceFile: options.filePath,
        originalError: error,
        source: options.source,
        filePath: options.filePath,
        line: options.line,
        column: options.column
      }
    );
    
    // Add detailed suggestion for circular dependencies
    circularError.getSuggestion = () => {
      return `Circular dependencies create problems during initialization and execution.
To fix this:
1. Identify where the cycle occurs: ${cyclePath || "Check import statements in the files"}
2. Restructure your imports by:
   - Moving shared code to a separate module
   - Using dependency injection
   - Using dynamic imports
   - Breaking mutual dependencies with interfaces`;
    };
    
    return circularError;
  }
  
  // Categorize by message content pattern matching
  if (msg.includes("unexpected token") || 
      msg.includes("unexpected end of input") ||
      msg.includes("unexpected identifier")) {
    // Syntax error pattern
    return new ParseError(
      error.message,
      { 
        line: options.line || 1, 
        column: options.column || 1, 
        offset: 0 
      },
      options.source
    );
  }
  
  if (msg.includes("import") || msg.includes("require") || msg.includes("module not found")) {
    // Import error pattern
    const importError = new ImportError(
      error.message,
      extractImportPath(error.message) || "unknown",
      {
        sourceFile: options.filePath,
        originalError: error,
        source: options.source,
        filePath: options.filePath,
        line: options.line,
        column: options.column
      }
    );
    
    // Enhanced suggestion for import errors
    importError.getSuggestion = () => {
      const importPath = extractImportPath(error.message) || "unknown";
      return `Import failed for module '${importPath}'. Try:
1. Check if the file exists at the specified path
2. Ensure the import path is correct (including case sensitivity)
3. Verify file permissions
4. Check for typos in the module name`;
    };
    
    return importError;
  }
  
  if (msg.includes("type") && (msg.includes("expected") || msg.includes("incompatible"))) {
    // Type error pattern
    return new ValidationError(
      error.message,
      options.context || "type checking",
      {
        source: options.source,
        filePath: options.filePath,
        line: options.line,
        column: options.column
      }
    );
  }

  // Default case: return a generic TranspilerError
  return new TranspilerError(error.message, {
    source: options.source,
    filePath: options.filePath,
    line: options.line,
    column: options.column
  });
}

/**
 * Log an error using the configured options
 */
function logError(
  error: Error,
  options: ErrorHandlerOptions
): void {
  // Format the error message with suggestion if available
  let errorMsg = error.message;
  
  // Check for getSuggestion method on both BaseError and potentially CircularDependencyError
  if ((error instanceof BaseError && typeof error.getSuggestion === 'function') || 
      (typeof (error as any).getSuggestion === 'function')) {
    const suggestionFn = error instanceof BaseError ? 
      error.getSuggestion.bind(error) : 
      (error as any).getSuggestion.bind(error);
    
    const suggestion = suggestionFn();
    if (suggestion && suggestion.trim()) {
      errorMsg += `\n\nSuggestion: ${suggestion}`;
    }
  }
  
  // Use existing reportError with enhanced options
  reportError(error, {
    source: options.source,
    filePath: options.filePath,
    line: options.line,
    column: options.column,
    verbose: options.verbose ?? false,
    useColors: options.useColors ?? true,
    useClickablePaths: options.useClickablePaths ?? true,
    includeStack: options.includeStack ?? options.verbose ?? false
  });
}

/**
 * Extract an import path from an error message
 */
function extractImportPath(message: string): string | null {
  const importMatches = [
    message.match(/['"]([^'"]+)['"]/),
    message.match(/(?:import|require)\s+(?:from\s+)?['"]([^'"]+)['"]/i),
    message.match(/module ['"]([^'"]+)['"] not found/i),
    message.match(/cannot find module ['"]([^'"]+)['"]/i)
  ];
  
  for (const match of importMatches) {
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// ===== Export Existing Error Utilities =====

// Re-export from common-errors.ts
export {
  BaseError,
  BaseParseError,
  TranspilerError,
  SpecializedError,
  ParseError,
  MacroError,
  ImportError,
  TransformError,
  CodeGenError,
  ValidationError,
  formatError,
  report,
  reportError,
  getSuggestion,
  createErrorReport,
  registerSourceFile,
  getSourceFile,
  withErrorHandling,
  translateTypeScriptError,
  withTypeScriptErrorTranslation
}; 