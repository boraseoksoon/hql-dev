// core/src/CommonUtils.ts

/**
 * Consistently format error messages regardless of error type
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch (e) {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Standardized error wrapper that preserves the original error
 * and adds context information
 * 
 * @param context Description of what was happening when the error occurred
 * @param error The original error
 * @param resource The file or resource being processed
 * @param currentFile The current file context (useful for import errors)
 * @param ErrorClass Optional custom error class to use
 * @returns Never returns - always throws an error
 */
export function wrapError<T extends ErrorConstructor = ErrorConstructor>(
  context: string,
  error: unknown,
  resource: string,
  currentFile?: string,
  ErrorClass?: T
): never {
  const errorMsg = `${context}: ${formatErrorMessage(error)}`;
  const ErrorConstructor = ErrorClass || Error;
  
  // Create the error with the formatted message
  const wrappedError = new ErrorConstructor(errorMsg);
  
  // Attach additional properties
  Object.assign(wrappedError, {
    resource,
    currentFile,
    cause: error instanceof Error ? error : undefined,
  });
  
  throw wrappedError;
}