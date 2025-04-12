/**
 * Central initialization module for the logger
 * Provides a single function to set up logging across the codebase
 */

import logger from "./logger.ts";

/**
 * Initialize the logger with the specified options
 * @param options Configuration options for the logger
 */
export function initializeLogger(options: {
  verbose?: boolean;
  namespaces?: string[];
}): void {
  // Configure the logger singleton
  logger.configure({
    verbose: options.verbose || false,
    namespaces: options.namespaces || []
  });

  // Display startup information
  if (options.verbose) {
    console.log("Verbose logging enabled");
  }
  
  if (options.namespaces && options.namespaces.length > 0) {
    console.log(
      `Logging restricted to namespaces: ${options.namespaces.join(", ")}`
    );
  }
}

/**
 * Get the logger singleton, optionally configuring it with the provided options.
 * Use this function instead of creating new Logger instances throughout the codebase.
 * 
 * @param options Configuration options for the logger (optional)
 * @returns The logger singleton instance
 */
export function getLogger(options?: { verbose?: boolean; namespaces?: string[] }): typeof logger {
  if (options) {
    logger.configure({
      verbose: options.verbose,
      namespaces: options.namespaces
    });
  }
  return logger;
}

/**
 * Export the logger for convenience
 */
export default logger;

/**
 * Check if debug mode is enabled via the HQL_DEBUG environment variable
 * @returns true if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return Deno.env.get("HQL_DEBUG") === "1";
} 