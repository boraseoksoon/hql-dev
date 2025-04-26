// Shared CLI utilities for option parsing and logger configuration
import { globalLogger } from "../logger.ts";

export interface CliOptions {
  verbose?: boolean;
  showTiming?: boolean;
  forceCache?: boolean;
  debug?: boolean;
}

/**
 * Parse common CLI flags for logging and timing options
 */
export function parseCliOptions(args: string[]): CliOptions {
  return {
    verbose: args.includes("--verbose") || args.includes("-v"),
    showTiming: args.includes("--time"),
    forceCache: args.includes("--force-cache"),
    debug: args.includes("--debug"),
  };
}

/**
 * Apply CLI options to the global logger and environment
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
