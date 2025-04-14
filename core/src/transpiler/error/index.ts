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

// If there are any wrappers/utilities unique to the transpiler, define or import them here.
// Otherwise, use CommonError utilities for generic error handling.

// Example: Re-export generic error handling wrappers from CommonError
export const withErrorHandling = CommonError.withErrorHandling;
export const getSuggestion = CommonError.getSuggestion;
export const registerSourceFile = CommonError.registerSourceFile;
export const getSourceFile = CommonError.getSourceFile;
export const formatError = CommonError.formatError;

// Export transpiler-specific error types/utilities
export {
  TranspilerError,
  ParseError,
  ValidationError,
  MacroError,
  ImportError,
  CodeGenError,
  TransformError,
  summarizeNode,
  createErrorReport
};

// If there are transpiler-specific helpers from error-utils, bring them here (or refactor as needed)
// For now, import and re-export if needed:
export * from './error-utils.ts';

// Add any additional transpiler-specific logic below as needed.

// Re-export initialization logic for consumers
export { initializeErrorHandling, setupEnhancedErrorHandling } from './error-initializer.ts';

// Re-export ErrorUtils and all error types/utilities
export { ErrorUtils } from './error-handling.ts';
export * from './errors.ts';
