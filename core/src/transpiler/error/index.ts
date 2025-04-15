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
export const perform = CommonError.withErrorHandling;

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

export { initializeErrorHandling  } from './error-initializer.ts';

export * from './errors.ts';
