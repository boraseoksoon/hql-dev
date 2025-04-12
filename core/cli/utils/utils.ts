/**
 * Common CLI utilities for HQL
 */

/**
 * Disable console.log output when --quiet is present.
 * To be removed in favor of logger-based approach.
 */
export function setupConsoleLogging(args: string[]): void {
  const quiet = args.includes("--quiet");
  if (quiet) {
    console.log = () => {};
  }
}

/**
 * Parse log namespaces from CLI args.
 * Supports both `--log=namespace1,namespace2` and `--log namespace1 namespace2` formats.
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
 */
export function setupLoggingOptions(
  args: string[],
): { verbose: boolean; logNamespaces: string[] } {
  const verbose = args.includes("--verbose") || args.includes("-v");
  const logNamespaces = parseLogNamespaces(args);
  return { verbose, logNamespaces };
}

/**
 * Parse debug flags for enhanced error reporting
 */
export function setupDebugOptions(args: string[]): { 
  debug: boolean;
  clickablePaths: boolean;
} {
  const debug = args.includes("--debug");
  const clickablePaths = !args.includes("--no-clickable-paths");
  
  return {
    debug,
    clickablePaths
  };
}
