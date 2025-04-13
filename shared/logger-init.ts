/**
 * Logger initialization module
 * Shared between core and LSP
 */
// @ts-ignore: Handle both Deno and Node environments
import logger, { Logger } from "./logger.ts";

/**
 * Initialize the logger with command line arguments
 */
export function initializeLogger(args: string[]): void {
  const options: { verbose?: boolean, namespaces?: string[] } = {};
  
  // Check for --verbose flag
  if (args.includes("--verbose")) {
    options.verbose = true;
  }
  
  // Check for --log flag with namespaces
  const logIndex = args.indexOf("--log");
  if (logIndex !== -1 && logIndex < args.length - 1) {
    // If --log is followed by namespaces, get them
    const namespaces = args[logIndex + 1].split(",");
    if (namespaces.length > 0) {
      options.namespaces = namespaces;
    }
  }
  
  // Configure the logger with options from arguments
  logger.configure(options);
}

/**
 * Get the singleton logger instance
 */
export function getLogger(): Logger {
  return logger;
}

/**
 * Check if debug mode is enabled for the logger
 */
export function isDebugMode(): boolean {
  return logger.isVerbose;
}

// Export the default logger as well
export default logger; 