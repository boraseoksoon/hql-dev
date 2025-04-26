// core/src/error/index.ts
// Main entry point for the HQL error reporting system

// Export all error types
export * from './error-types.ts';
export * from './error-formatter.ts';
export * from './error-manager.ts';
export * from './source-mapper.ts';
export * from './parser-integration.ts';
export * from './source-map-integration.ts';
export * from './runtime-error-handler.ts';
export * from './error-suggestions.ts';

import { errorManager } from './error-manager.ts';
import { sourceMapper } from './source-mapper.ts';
import { installGlobalErrorHandler } from './runtime-error-handler.ts';
import { HQLError } from './error-types.ts';
import { formatError, formatErrorAsJson } from './error-formatter.ts';
import { getNodeLocation, trackNode } from './parser-integration.ts';
import { rewriteJavaScriptSourceMap } from './source-map-integration.ts';

/**
 * Initialize the error reporting system
 */
export function initErrorSystem({
  throwImmediately = false,
  jsonOutput = false,
  installRuntimeHandler = false
}: {
  throwImmediately?: boolean;
  jsonOutput?: boolean;
  installRuntimeHandler?: boolean;
} = {}): void {
  // Configure the error manager
  errorManager.configure({
    throwImmediately,
    jsonOutput
  });
  
  // Clear any previous errors
  errorManager.clearErrors();
  
  // Clear source mapper
  sourceMapper.clearMappings();
  
  // Install global runtime error handler if requested
  if (installRuntimeHandler) {
    installGlobalErrorHandler();
  }
}

/**
 * Report an error to the system
 */
export function reportError(error: HQLError): void {
  errorManager.reportError(error);
}

/**
 * Check if any errors have been reported
 */
export function hasErrors(): boolean {
  return errorManager.hasErrors();
}

/**
 * Get all errors that have been reported
 */
export function getErrors(): HQLError[] {
  return errorManager.getErrors();
}

/**
 * Print all errors to the console
 */
export function printErrors(): void {
  errorManager.printErrors();
}

/**
 * Throw an error if any were reported
 */
export function throwIfErrors(): void {
  errorManager.throwIfErrors();
}

/**
 * Register source file content for error reporting
 */
export function registerSourceFile(filePath: string, content: string): void {
  sourceMapper.registerSourceFile(filePath, content);
}

/**
 * Add a mapping from generated code to original source
 */
export function addSourceMapping(
  generatedFile: string,
  generatedLine: number,
  generatedColumn: number,
  originalFile: string,
  originalLine: number,
  originalColumn: number
): void {
  sourceMapper.addMapping(
    generatedFile,
    generatedLine,
    generatedColumn,
    {
      filePath: originalFile,
      line: originalLine,
      column: originalColumn
    }
  );
}

/**
 * Should stop on first error (for checking in catch blocks)
 */
export function shouldStopOnFirstError(): boolean {
  return errorManager.shouldStopOnFirstError();
}

/**
 * Safely execute a function with error handling
 */
export function safeExecute<T>(
  fn: () => T,
  errorContext: string,
  location: { filePath: string, line: number, column: number }
): T | undefined {
  try {
    return fn();
  } catch (error: unknown) {
    // Handle error appropriately based on its type
    if (error instanceof HQLError) {
      errorManager.reportError(error);
    } else {
      // Create a transform error
      const message = error instanceof Error ? error.message : String(error);
      const transformError = errorManager.createTransformError(
        `${errorContext}: ${message}`,
        location
      );
      errorManager.reportError(transformError);
    }
    
    // Return undefined to indicate error
    return undefined;
  }
}

// Export the error manager and source mapper for direct access
export { 
  errorManager, 
  sourceMapper, 
  formatError, 
  formatErrorAsJson,
  getNodeLocation,
  trackNode,
  rewriteJavaScriptSourceMap
};

/**
 * Utility function to get name from a macro expression
 */
export function getMacroName(expr: any): string {
  if (expr && typeof expr === 'object' && 'type' in expr && expr.type === 'list') {
    if (expr.elements && expr.elements.length > 1 && 
        expr.elements[0].type === 'symbol' && 
        expr.elements[1].type === 'symbol') {
      return expr.elements[1].name || 'unknown';
    }
  }
  return 'unknown';
}

/**
 * Utility function to extract content from environment
 */
export function getFileContentFromEnv(env: any, filePath: string): string | undefined {
  if (!env || !filePath) return undefined;
  
  try {
    // Try to read from disk if available
    return Deno.readTextFileSync(filePath);
  } catch {
    // Fallback - try to extract from environment if possible
    return undefined;
  }
}