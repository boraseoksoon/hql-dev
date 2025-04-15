// src/transpiler/error/transpiler-error-handler.ts
// Consolidated entry point for all transpiler-specific error logic.
// Imports generic error utilities from CommonError to avoid duplication.

import * as CommonError from '../../CommonError.ts';
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
  errorContext?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (errorContext) {
      // Only wrap the error with context if context is provided
      if (error instanceof Error) {
        throw new Error(`${errorContext}: ${error.message}`, { cause: error });
      }
      throw new Error(`${errorContext}: ${String(error)}`);
    } else {
      // Just rethrow the original error without wrapping
      throw error;
    }
  }
}

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
      ? `${context}: ${error instanceof Error ? error.message : String(error)}`
      : error instanceof Error
      ? error.message
      : String(error);

    // If an error type is specified, create a new error of that type
    if (errorType) {
      throw new errorType(msg, ...(errorArgs || []));
    }

    // Otherwise, use a generic TranspilerError
    throw new TranspilerError(msg);
  }
}