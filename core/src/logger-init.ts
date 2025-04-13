/**
 * Re-export the shared logger-init module
 */
export * from "../../shared/logger-init.ts";
import logger from "../../shared/logger-init.ts";
export default logger;

/**
 * Extended initialization for core-specific features
 */
import { initializeLogger as sharedInitialize } from "../../shared/logger-init.ts";

/**
 * Core-specific logger initialization that extends the shared functionality
 */
export function initializeLogger(options: {
  verbose?: boolean;
  namespaces?: string[];
}): void {
  // Set up HQL_DEBUG environment variable if in verbose mode
  if (options.verbose) {
    Deno.env.set("HQL_DEBUG", "1");
  }

  // Use the shared initialization with an array of string options
  const args: string[] = [];
  if (options.verbose) {
    args.push("--verbose");
  }
  
  if (options.namespaces && options.namespaces.length > 0) {
    args.push("--log", options.namespaces.join(","));
  }
  
  sharedInitialize(args);
  
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
 * Check if debug mode is enabled via the HQL_DEBUG environment variable
 * @returns true if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return Deno.env.get("HQL_DEBUG") === "1";
} 