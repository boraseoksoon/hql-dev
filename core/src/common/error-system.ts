// core/src/common/error-system.ts - Improved error reporting

import { HQLError, ParseError, ValidationError, RuntimeError } from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { globalErrorReporter, reportError } from "./error.ts";
import { initializeErrorHandling, handleRuntimeError, setRuntimeContext } from "./runtime-error-handler.ts";
import { dirname, readTextFile } from "../platform/platform.ts";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { ERROR_PATTERNS, ERROR_REGEX } from "./error-constants.ts";

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
        // If we don't have line info, infer from error message patterns
        error = await inferErrorLocationFromMessage(error, lines, sourcePath);
      }
    } else {
      // Convert regular Error to HQLError with context
      const newError = new HQLError(error.message, {
        errorType: "Error",
        originalError: error,
        sourceLocation: { filePath: sourcePath }
      });
      
      // Infer location from the error message
      return await inferErrorLocationFromMessage(newError, lines, sourcePath);
    }
  } catch (readError) {
    logger.debug(`Failed to read source file for context: ${readError instanceof Error ? readError.message : String(readError)}`);
  }
  
  return error;
}

/**
 * Infer error location from specific error message patterns
 */
async function inferErrorLocationFromMessage(
  error: HQLError, 
  lines: string[], 
  sourcePath: string
): Promise<HQLError> {
  const errorMsg = error.message.toLowerCase();
  
  // Check for property-related errors
  if (errorMsg.includes(ERROR_PATTERNS.PROPERTY_OF)) {
    const location = await findPropertyErrorLocation(error, lines, sourcePath);
    if (location) {
      updateErrorLocation(error, location, sourcePath);
    }
  }
  // Check for "is not defined" errors
  else if (errorMsg.includes(ERROR_PATTERNS.IS_NOT_DEFINED)) {
    const location = await findUndefinedVariableLocation(error, lines, sourcePath);
    if (location) {
      updateErrorLocation(error, location, sourcePath);
    }
  }
  // Check for "is not a function" errors
  else if (errorMsg.includes(ERROR_PATTERNS.IS_NOT_FUNCTION)) {
    const location = await findNotAFunctionLocation(error, lines, sourcePath);
    if (location) {
      updateErrorLocation(error, location, sourcePath);
    }
  }
  // Check for import errors
  else if (errorMsg.includes(ERROR_PATTERNS.NOT_FOUND_IN_MODULE)) {
    const location = await findImportErrorLocation(error, lines, sourcePath);
    if (location) {
      updateErrorLocation(error, location, sourcePath);
    }
  }
  // Check for syntax errors
  else if (errorMsg.includes(ERROR_PATTERNS.UNEXPECTED_TOKEN)) {
    const location = await findSyntaxErrorLocation(error, lines, sourcePath);
    if (location) {
      updateErrorLocation(error, location, sourcePath);
    }
  }
  // Check for "too many arguments" errors
  else if (errorMsg.includes(ERROR_PATTERNS.TOO_MANY_ARGUMENTS)) {
    const location = await findTooManyArgumentsLocation(error, lines, sourcePath);
    if (location) {
      updateErrorLocation(error, location, sourcePath);
    }
  }
  // Check for syntax form errors
  else if (errorMsg.includes(ERROR_PATTERNS.INVALID) && errorMsg.includes(ERROR_PATTERNS.FORM)) {
    const location = await findInvalidFormLocation(error, lines, sourcePath);
    if (location) {
      updateErrorLocation(error, location, sourcePath);
    }
  }
  // Fallback: scan for keywords in the error message
  else {
    const location = await findLocationByKeywords(error, lines, sourcePath);
    if (location) {
      updateErrorLocation(error, location, sourcePath);
    }
  }
  
  return error;
}

/**
 * Update an error with location information and add context lines
 */
function updateErrorLocation(
  error: HQLError,
  location: { line: number; column: number },
  sourcePath: string
): void {
  // Update the source location
  error.sourceLocation.line = location.line;
  error.sourceLocation.column = location.column;
  error.sourceLocation.filePath = sourcePath;
  
  // Create context lines
  const lines = sourcePath.split('\n');
  const contextLines = [];
  
  // Add context lines before the error line
  for (let i = Math.max(0, location.line - 2); i < location.line; i++) {
    if (i < lines.length) {
      contextLines.push({
        line: i + 1,
        content: lines[i] || "",
        isError: false
      });
    }
  }
  
  // Add the error line
  if (location.line > 0 && location.line <= lines.length) {
    contextLines.push({
      line: location.line,
      content: lines[location.line - 1] || "",
      isError: true,
      column: location.column
    });
  }
  
  // Add context lines after the error line
  for (let i = location.line; i < Math.min(lines.length, location.line + 2); i++) {
    contextLines.push({
      line: i + 1,
      content: lines[i] || "",
      isError: false
    });
  }
  
  error.contextLines = contextLines;
}

/**
 * Find location for property-related errors
 */
async function findPropertyErrorLocation(
  error: HQLError,
  lines: string[],
  sourcePath: string
): Promise<{ line: number; column: number } | null> {
  // Extract property name from error message if available
  const propertyMatch = error.message.match(ERROR_REGEX.PROPERTY);
  const propertyName = propertyMatch ? propertyMatch[1] : null;
  
  // If we have a property name, look for it in property access expressions
  if (propertyName) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for the property name in dot notation or get calls
      if (line.includes('.' + propertyName) || 
          (line.includes('get') && line.includes(propertyName))) {
        
        // Try dot notation first
        const dotNotationIndex = line.indexOf('.' + propertyName);
        if (dotNotationIndex >= 0) {
          return {
            line: i + 1,
            column: dotNotationIndex + 1
          };
        }
        
        // Try get calls
        const getCallIndex = line.indexOf('get');
        if (getCallIndex >= 0 && line.includes(propertyName, getCallIndex)) {
          return {
            line: i + 1,
            column: line.indexOf(propertyName, getCallIndex) + 1
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Find location for "is not defined" errors
 */
async function findUndefinedVariableLocation(
  error: HQLError,
  lines: string[],
  sourcePath: string
): Promise<{ line: number; column: number } | null> {
  // Extract variable name from error message
  const match = error.message.match(ERROR_REGEX.UNDEFINED_VAR);
  const varName = match ? match[1] : null;
  
  if (!varName) {
    return null;
  }
  
  // Look for the variable in the file
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for the variable but ensure it's a standalone identifier
    // (not part of another word)
    const varRegex = new RegExp(`\\b${escapeRegExp(varName)}\\b`);
    if (varRegex.test(line)) {
      const match = varRegex.exec(line);
      const pos = match ? match.index : line.indexOf(varName);
      
      if (pos >= 0) {
        return {
          line: i + 1,
          column: pos + 1
        };
      }
    }
  }
  
  return null;
}

/**
 * Find location for "is not a function" errors
 */
async function findNotAFunctionLocation(
  error: HQLError,
  lines: string[],
  sourcePath: string
): Promise<{ line: number; column: number } | null> {
  // Extract function name from error message
  const match = error.message.match(ERROR_REGEX.NOT_FUNCTION);
  const fnName = match ? match[1] : null;
  
  if (!fnName) {
    return null;
  }
  
  // Look for function calls
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for function call patterns - ignoring function definitions
    if (line.includes(fnName) && 
        !line.includes(`(fn ${fnName}`) && 
        !line.includes(`(fx ${fnName}`)) {
      
      // Try to find the function in call position
      const callPattern = new RegExp(`\\([\\s\\(]*${escapeRegExp(fnName)}\\s`);
      const callMatch = callPattern.exec(line);
      
      if (callMatch) {
        const pos = line.indexOf(fnName, callMatch.index);
        return {
          line: i + 1,
          column: pos + 1
        };
      }
      
      // Regular variable or property occurrence
      const pos = line.indexOf(fnName);
      if (pos >= 0) {
        return {
          line: i + 1,
          column: pos + 1
        };
      }
    }
  }
  
  return null;
}

/**
 * Find location for import-related errors
 */
async function findImportErrorLocation(
  error: HQLError,
  lines: string[],
  sourcePath: string
): Promise<{ line: number; column: number } | null> {
  // Extract symbol name and module path
  const symbolMatch = error.message.match(ERROR_REGEX.IMPORT_SYMBOL);
  const symbolName = symbolMatch ? symbolMatch[1] : null;
  
  const moduleMatch = error.message.match(ERROR_REGEX.MODULE_PATH);
  const modulePath = moduleMatch ? moduleMatch[1] : null;
  
  // Look for relevant import statements
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('import') && 
        (line.includes(modulePath || '') || symbolName && line.includes(symbolName))) {
      
      // If we have a symbol name, try to find it in vector imports
      if (symbolName && line.includes('[') && line.includes(']')) {
        const bracketStart = line.indexOf('[');
        const bracketEnd = line.indexOf(']');
        
        if (bracketStart >= 0 && bracketEnd > bracketStart) {
          const importVector = line.substring(bracketStart, bracketEnd);
          const symbolPos = importVector.indexOf(symbolName);
          
          if (symbolPos >= 0) {
            return {
              line: i + 1,
              column: bracketStart + symbolPos + 1
            };
          }
        }
      }
      
      // For 'from' in the wrong place or misspelled
      if (line.includes('from') || line.includes('fom') || line.includes('form')) {
        const wrongWordPos = line.search(/\b(fom|form)\b/);
        if (wrongWordPos >= 0) {
          return {
            line: i + 1,
            column: wrongWordPos + 1
          };
        }
      }
      
      // Fallback to the import statement itself
      return {
        line: i + 1,
        column: line.indexOf('import') + 1
      };
    }
  }
  
  return null;
}

/**
 * Find location for syntax errors
 */
async function findSyntaxErrorLocation(
  error: HQLError,
  lines: string[],
  sourcePath: string
): Promise<{ line: number; column: number } | null> {
  // Extract the unexpected token
  const match = error.message.match(ERROR_REGEX.TOKEN);
  const token = match ? match[1] : null;
  
  if (token) {
    // Look for the token in the file
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const pos = line.indexOf(token);
      
      if (pos >= 0) {
        return {
          line: i + 1,
          column: pos + 1
        };
      }
    }
  }
  
  return null;
}

/**
 * Find location for "too many arguments" errors
 */
async function findTooManyArgumentsLocation(
  error: HQLError,
  lines: string[],
  sourcePath: string
): Promise<{ line: number; column: number } | null> {
  // Extract function name from error message
  const match = error.message.match(ERROR_REGEX.ARGS_COUNT);
  const fnName = match ? match[1] : null;
  
  if (!fnName) {
    return null;
  }
  
  // Look for function calls
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for function call patterns (not function definitions)
    if (line.includes(fnName) && 
        !line.includes(`(fn ${fnName}`) && 
        !line.includes(`(fx ${fnName}`)) {
      
      // Count the number of arguments by looking at whitespace-separated tokens after the function name
      const fnCallPattern = new RegExp(`\\([\\s\\(]*${escapeRegExp(fnName)}\\s+[^\\)]+`);
      const fnCallMatch = fnCallPattern.exec(line);
      
      if (fnCallMatch) {
        const fnNamePos = line.indexOf(fnName, fnCallMatch.index);
        
        // Look for a call with multiple arguments
        const afterFnName = line.substring(fnNamePos + fnName.length);
        const argCount = afterFnName.trim().split(/\s+/).filter(s => s && s !== '').length;
        
        if (argCount > 1) {
          return {
            line: i + 1,
            column: fnNamePos + 1
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Find location for invalid form errors
 */
async function findInvalidFormLocation(
  error: HQLError,
  lines: string[],
  sourcePath: string
): Promise<{ line: number; column: number } | null> {
  // Look for form keywords that might be related to the error
  const formKeywords = ['let', 'fn', 'fx', 'if', 'cond', 'vector', 'import', 'export'];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for forms with these keywords
    for (const keyword of formKeywords) {
      if (line.includes(`(${keyword}`) || line.includes(`( ${keyword}`)) {
        const keywordPos = line.indexOf(keyword);
        
        if (keywordPos >= 0) {
          return {
            line: i + 1,
            column: keywordPos + 1
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Find location by scanning for keywords from the error message
 */
async function findLocationByKeywords(
  error: HQLError,
  lines: string[],
  sourcePath: string
): Promise<{ line: number; column: number } | null> {
  // Extract keywords from the error message
  const keywords = error.message
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .map(word => word.trim());
  
  // Extract any quoted strings
  const quotedStrings: string[] = [];
  const quotedMatches = error.message.match(/'([^']+)'/g) || [];
  
  for (const match of quotedMatches) {
    // Remove the quotes
    const unquoted = match.substring(1, match.length - 1);
    if (unquoted.length > 0) {
      quotedStrings.push(unquoted);
    }
  }
  
  // Score each line based on keyword matches
  const lineScores: Array<{ line: number; column: number; score: number }> = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    let score = 0;
    let bestPos = -1;
    
    // Check quoted strings first (highest priority)
    for (const str of quotedStrings) {
      if (lines[i].includes(str)) {
        score += 10;
        bestPos = lines[i].indexOf(str);
      }
    }
    
    // Check keywords
    for (const keyword of keywords) {
      if (line.includes(keyword)) {
        score += 2;
        
        // If we don't have a position yet, use this keyword
        if (bestPos === -1) {
          bestPos = line.indexOf(keyword);
        }
      }
    }
    
    // If this line has matches, add it to our scores
    if (score > 0) {
      lineScores.push({
        line: i + 1,
        column: bestPos >= 0 ? bestPos + 1 : 1,
        score
      });
    }
  }
  
  // Find the line with the highest score
  if (lineScores.length > 0) {
    lineScores.sort((a, b) => b.score - a.score);
    return {
      line: lineScores[0].line,
      column: lineScores[0].column
    };
  }
  
  return null;
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

// Helper function to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\// core/src/common/error-system.ts -');
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