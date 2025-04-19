// src/transpiler/error/transpiler-error-handler.ts
// Consolidated entry point for all transpiler-specific error logic.
// Now using the unified error pipeline.

import * as CommonError from '../../common/common-errors.ts';
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
} from './errors.ts';
import { 
  processError, 
  withErrorPipeline,
  withSyncErrorPipeline,
  ErrorHandlerOptions 
} from '../../common/error-pipeline.ts';

export const getSuggestion = CommonError.getSuggestion;
export const registerSourceFile = CommonError.registerSourceFile;
export const getSourceFile = CommonError.getSourceFile;
export const formatError = CommonError.formatError;
export const report = CommonError.report;
export const reportError = CommonError.reportError;
export const translateTypeScriptError = CommonError.translateTypeScriptError;

// Re-export error types
export {
  TranspilerError,
  ParseError,
  ValidationError,
  MacroError,
  ImportError,
  CodeGenError,
  TransformError,
  summarizeNode,
  createErrorReport,
};

// Re-export utilities from error-pipeline.ts
export * from '../../common/error-pipeline.ts';

/**
 * Enhanced async wrapper using the error pipeline for transpiler operations
 */
export async function performAsync<T>(
  fn: () => Promise<T>,
  options: ErrorHandlerOptions = {}
): Promise<T> {
  return withErrorPipeline(fn, options)();
}

/**
 * Enhanced sync wrapper using the error pipeline for transpiler operations
 */
export function perform<T>(
  fn: () => T,
  context?: string,
  errorType?: new (message: string, ...args: any[]) => TranspilerError,
  errorArgs?: any[],
  sourceContext?: {
    filePath?: string;
    line?: number;
    column?: number;
  }
): T {
  // Convert the old-style parameters to the new unified options format
  const options: ErrorHandlerOptions = {
    context,
    filePath: sourceContext?.filePath,
    line: sourceContext?.line,
    column: sourceContext?.column,
    rethrow: true
  };

  // Use the sync error pipeline with conversion to specific error type if needed
  return withSyncErrorPipeline(
    () => {
      try {
        return fn();
      } catch (error) {
        // If error type was specified, we need to convert it
        if (errorType) {
          if (error instanceof errorType) {
            throw error; // Already the right type
          }
          
          // Convert to the specified error type
          const msg = context
            ? `${context}: ${error instanceof Error ? error.message : String(error)}`
            : error instanceof Error
              ? error.message
              : String(error);

          if (sourceContext) {
            throw new errorType(msg, {
              ...sourceContext,
              ...(Array.isArray(errorArgs) && errorArgs.length > 0 ? errorArgs[0] : {})
            });
          } else {
            throw new errorType(msg, ...(errorArgs || []));
          }
        }
        
        // Otherwise let the pipeline handle it
        throw error;
      }
    }, 
    options
  )();
}