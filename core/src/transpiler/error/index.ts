// src/transpiler/error/transpiler-error-handler.ts
// Consolidated entry point for all transpiler-specific error logic.
// Imports generic error utilities from CommonError to avoid duplication.

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

export const getSuggestion = CommonError.getSuggestion;
export const registerSourceFile = CommonError.registerSourceFile;
export const getSourceFile = CommonError.getSourceFile;
export const formatError = CommonError.formatError;
export const report = CommonError.report;
export const reportError = CommonError.reportError;
export const translateTypeScriptError = CommonError.translateTypeScriptError;

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

export * from './errors.ts';

export async function performAsync<T>(
  fn: () => Promise<T>,
  options: {
    context?: string;
    filePath?: string;
    line?: number;
    column?: number;
    errorType?: new (message: string, ...args: any[]) => TranspilerError;
    errorArgs?: any[];
  } = {}
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Build context object for error reporting
    const errorContext = {
      filePath: options.filePath,
      line: options.line,
      column: options.column
    };
    
    // If error is already of the expected type, just enhance it
    if (options.errorType && error instanceof options.errorType) {
      throw error;
    }

    // Prepare the message with context
    const msg = options.context
      ? `${options.context}: ${error instanceof Error ? error.message : String(error)}`
      : error instanceof Error
        ? error.message
        : String(error);

    // If an error type is specified, create a new error of that type
    if (options.errorType) {
      throw new options.errorType(msg, ...(options.errorArgs || []));
    }

    // Create a better error with source context
    throw new TranspilerError(msg, errorContext);
  }
}

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
  try {
    return fn();
  } catch (error) {
    // If error is already of the expected type, re-throw it
    if (errorType && error instanceof errorType) {
      throw error;
    }

    // Prepare the message with context
    const msg = context
      ? `${context}: ${error instanceof Error ? error.message : String(error)}`
      : error instanceof Error
        ? error.message
        : String(error);

    // If an error type is specified, create a new error of that type
    if (errorType) {
      if (sourceContext) {
        throw new errorType(msg, {
          ...sourceContext,
          ...(Array.isArray(errorArgs) && errorArgs.length > 0 ? errorArgs[0] : {})
        });
      } else {
        throw new errorType(msg, ...(errorArgs || []));
      }
    }

    // Otherwise, use a generic TranspilerError with source context if available
    if (sourceContext) {
      throw new TranspilerError(msg, sourceContext);
    } else {
      throw new TranspilerError(msg);
    }
  }
}