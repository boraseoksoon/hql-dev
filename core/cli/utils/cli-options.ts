/**
 * CLI option parsing and application utilities
 */
import { globalLogger } from "../../src/logger.ts";

export interface CliOptions {
  verbose?: boolean;
  showTiming?: boolean;
  forceCache?: boolean;
  debug?: boolean;
}

/**
 * Extract positional args (non-options)
 */
export function parseNonOptionArgs(args: string[]): string[] {
  return args.filter(arg => !arg.startsWith("-"));
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

// Re-export from shared CLI utils
export { parseCliOptions } from "../../src/common/cli-utils.ts";

// Re-export from shared CLI utils
export { applyCliOptions } from "../../src/common/cli-utils.ts";

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