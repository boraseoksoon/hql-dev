/**
 * CLI option parsing and application utilities
 */
import { globalLogger } from "../../src/logger.ts";

export interface CliOptions {
  verbose?: boolean;
  showTiming?: boolean;
}

/**
 * Parse common CLI flags for logging and timing options
 */
export function parseCliOptions(args: string[]): CliOptions {
  return {
    verbose: args.includes("--verbose") || args.includes("-v"),
    showTiming: args.includes("--time"),
  };
}

/**
 * Apply CLI options to the global logger
 */
export function applyCliOptions(options: CliOptions): void {
  // Set verbose logging
  if (options.verbose) {
    globalLogger.setEnabled(true);
    Deno.env.set("HQL_DEBUG", "1");
    globalLogger.debug("Verbose logging enabled");
  }
  
  // Set timing options
  globalLogger.setTimingOptions({ showTiming: options.showTiming });
  if (options.showTiming) {
    globalLogger.debug("Performance timing enabled");
  }
}

/**
 * Extract log namespace settings from CLI args
 */
export function parseLogNamespaces(args: string[]): string[] {
  const logIndex = args.findIndex((arg) =>
    arg === "--log" || arg.startsWith("--log=")
  );
  
  if (logIndex === -1) return [];

  let namespaceArg = "";
  const arg = args[logIndex];
  
  if (arg.includes("=")) {
    namespaceArg = arg.split("=")[1];
  } else if (args[logIndex + 1] && !args[logIndex + 1].startsWith("-")) {
    namespaceArg = args[logIndex + 1];
  }
  
  return namespaceArg.split(",").map((ns) => ns.trim()).filter((ns) =>
    ns.length > 0
  );
}

/**
 * Parse debug flags like --debug and --no-clickable-paths
 */
export function parseDebugOptions(args: string[]): { 
  debug: boolean;
  clickablePaths: boolean;
} {
  return {
    debug: args.includes("--debug"),
    clickablePaths: !args.includes("--no-clickable-paths")
  };
}

/**
 * Disable console output when --quiet is present or in production environment
 */
export function setupConsoleLogging(args: string[]): void {
  const quiet = args.includes("--quiet");
  const isProduction = Deno.env.get("ENV") === "production";
  
  if (quiet || isProduction) {
    console.log = () => {};
  }
}

/**
 * Setup common logging options such as verbose mode and log namespaces.
 * Returns an object with settings that can be used to configure your logger.
 * 
 * This is a convenience function that combines parseCliOptions and parseLogNamespaces.
 */
export function setupLoggingOptions(
  args: string[],
): { verbose: boolean; logNamespaces: string[] } {
  const verbose = args.includes("--verbose") || args.includes("-v");
  const logNamespaces = parseLogNamespaces(args);
  return { verbose, logNamespaces };
}