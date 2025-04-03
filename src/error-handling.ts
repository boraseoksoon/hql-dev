import { 
  TranspilerError, 
  ParseError, 
  ValidationError, 
  MacroError, 
  ImportError, 
  CodeGenError, 
  TransformError,
  summarizeNode,
  createErrorReport
} from "./transpiler/errors.ts";
import { 
  EnhancedTranspilerError, 
  enhanceError, 
  enhanceParseError 
} from "./transpiler/enhanced-errors.ts";
import { 
  translateTypeScriptError, 
  withTypeScriptErrorTranslation 
} from "./transpiler/typescript-error-translator.ts";
import { Logger } from "./logger.ts";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

// Store source files for error context
const sourceRegistry = new Map<string, string>();

// Add a new property to track processed errors with debug info
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
  // First translate TypeScript errors if applicable
  if (error.message.includes("TS")) {
    error = translateTypeScriptError(error);
  }
  
  // Get source from registry if filePath is provided
  const source = options.filePath ? sourceRegistry.get(options.filePath) : undefined;
  
  // Enhance the error with source context
  let enhancedError: Error;
  if (error instanceof ParseError) {
    enhancedError = enhanceParseError(error, options.useColors);
  } else {
    enhancedError = enhanceError(error, {
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
    } else {
      // If no line number is available, show the first few lines
      const lines = source.split('\n');
      const maxLines = Math.min(5, lines.length);
      
      result += '\n\n';
      for (let i = 0; i < maxLines; i++) {
        result += c.gray(`${i + 1} │ ${lines[i]}`) + '\n';
      }
      if (lines.length > maxLines) {
        result += c.gray(`... (${lines.length - maxLines} more lines)`) + '\n';
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
        console.debug(`[Debug] Processing error first time: ${errorId}`);
        
        // Enhance the error with context information
        const enhancedErr = enhanceError(error, {
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
 * Setup error handling for the entire pipeline
 * This function should be called once during initialization
 */
export function setupErrorHandling(): void {
  // Register global error handlers using Deno API
  // instead of Node.js process.on("uncaughtException")
  globalThis.addEventListener("error", (event) => {
    const error = event.error;
    logger.error(formatError(error, { useColors: true, includeStack: true }));
    
    // Add suggestion
    logger.info(`Suggestion: ${getSuggestion(error)}`);
    
    // Note: Deno will exit automatically after an uncaught exception
    // so we don't need to call Deno.exit() here
  });
  
  // Handle unhandled promise rejections
  globalThis.addEventListener("unhandledrejection", (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    
    logger.error(formatError(error, { useColors: true, includeStack: true }));
    logger.info(`Suggestion: ${getSuggestion(error)}`);
  });
  
  logger.debug("Global error handling has been set up");
}

/**
 * Create an error handler for a specific transpiler stage
 */
export function createStageErrorHandler(stageName: string): Function {
  return (error: Error, context: Record<string, unknown> = {}): void => {
    const errorReport = createErrorReport(error, stageName, context);
    logger.error(errorReport);
    
    // Add suggestion
    logger.info(`Suggestion: ${getSuggestion(error)}`);
    
    throw error;
  };
}

/**
 * Collection of error utilities for easier importing
 */
export const ErrorUtils = {
  enhanceError,
  enhanceParseError,
  translateTypeScriptError,
  withTypeScriptErrorTranslation,
  withErrorHandling,
  formatError,
  getSuggestion,
  registerSourceFile,
  getSourceFile,
  createStageErrorHandler
};

// Export everything from errors.ts for convenience
export {
  TranspilerError,
  ParseError,
  ValidationError,
  MacroError,
  ImportError,
  CodeGenError,
  TransformError
}; 