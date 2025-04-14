// src/repl/common-utils.ts

/**
 * Common utility functions for the REPL system
 */
export class CommonUtils {
  /**
   * Formats an error message in a consistent way for the REPL
   */
  static formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
