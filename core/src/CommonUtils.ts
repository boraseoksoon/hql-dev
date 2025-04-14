// core/src/CommonUtils.ts
// Centralized utilities for error formatting and other shared helpers

/**
 * Formats any error into a human-readable string for logging and reporting.
 * Handles Error instances, objects, and primitives gracefully.
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

// Export any additional common utilities here as needed.
