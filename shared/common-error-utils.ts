/**
 * Shared error utilities for use in both core and LSP
 */

/**
 * Format an error message consistently
 */
export function formatErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}

/**
 * Perform a function with basic error handling
 */
export function perform<T>(
  fn: () => T,
  context?: string
): T {
  try {
    return fn();
  } catch (error) {
    // Prepare the message with context
    const msg = context
      ? `${context}: ${formatErrorMessage(error)}`
      : formatErrorMessage(error);

    // Create a new error with the formatted message
    throw new Error(msg);
  }
}

/**
 * Perform an async function with basic error handling
 */
export async function performAsync<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Prepare the message with context
    const msg = context
      ? `${context}: ${formatErrorMessage(error)}`
      : formatErrorMessage(error);

    // Create a new error with the formatted message
    throw new Error(msg);
  }
} 