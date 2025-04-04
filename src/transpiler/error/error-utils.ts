// src/transpiler/error-utils.ts
import { TranspilerError } from "./errors.ts";

/**
 * Helper function to handle synchronous operations with consistent error handling
 */
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

/**
 * Helper function to handle asynchronous operations with consistent error handling
 */
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
