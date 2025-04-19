// error-adapter.ts - Compatibility layer for transitioning to the new error pipeline
// This allows for gradual migration without breaking existing code

import { 
  processError, 
  withErrorPipeline, 
  withSyncErrorPipeline,
  ErrorHandlerOptions,
  reportError as pipelineReportError,
  BaseError,
  TranspilerError
} from './error-pipeline.ts';
import * as CommonError from './common-errors.ts';

/**
 * Legacy-compatible version of reportError that uses the new pipeline
 * Drop-in replacement for the old CommonError.reportError
 */
export function reportError(
  error: unknown,
  options: {
    source?: string;
    filePath?: string;
    line?: number;
    column?: number;
    verbose?: boolean;
    useColors?: boolean;
    useClickablePaths?: boolean;
    includeStack?: boolean;
  } = {}
): void {
  // Process through the pipeline with backward compatibility options
  processError(error, {
    source: options.source,
    filePath: options.filePath,
    line: options.line,
    column: options.column,
    verbose: options.verbose,
    useColors: options.useColors,
    useClickablePaths: options.useClickablePaths,
    includeStack: options.includeStack,
    logErrors: true,
    rethrow: false
  });
}

/**
 * Legacy-compatible version of withErrorHandling
 * Drop-in replacement for CommonError.withErrorHandling
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
  // Adapt to new pipeline options
  const pipelineOptions: ErrorHandlerOptions = {
    source: options.source,
    filePath: options.filePath,
    context: options.context,
    rethrow: options.rethrow !== false,
    logErrors: options.logErrors !== false
  };
  
  return withErrorPipeline(fn, pipelineOptions);
}

/**
 * Wraps a function to catch errors using the legacy pattern but process them
 * through the new pipeline
 */
export function wrapError<T extends ErrorConstructor = ErrorConstructor>(
  context: string,
  error: unknown,
  resource: string,
  currentFile?: string,
  ErrorClass?: T
): never {
  // Process the error through our pipeline
  const processedError = processError(error, {
    context: `Processing ${resource}${currentFile ? ` in context of ${currentFile}` : ''}`,
    filePath: typeof resource === 'string' ? resource : undefined,
    rethrow: false,
    logErrors: false
  });
  
  // Create the error with the formatted message
  const errorMsg = `${context}: ${processedError.message}`;
  const ErrorConstructor = ErrorClass || Error;
  
  // Create a new error of the requested type with the enhanced message
  const wrappedError = new ErrorConstructor(errorMsg);
  
  // Attach additional properties
  Object.assign(wrappedError, {
    resource,
    currentFile,
    cause: error instanceof Error ? error : undefined,
  });
  
  throw wrappedError;
}

// For compatibility with code that imports directly from common-errors
// Redirect all the core error utilities to the pipeline-backed versions
export const {
  // Error classes
  BaseParseError,
  SpecializedError,
  ParseError,
  MacroError,
  ImportError,
  TransformError,
  CodeGenError,
  ValidationError,
  
  // Error utilities
  formatError,
  report,
  getSuggestion,
  createErrorReport,
  registerSourceFile,
  getSourceFile,
  translateTypeScriptError,
  withTypeScriptErrorTranslation
} = CommonError; 