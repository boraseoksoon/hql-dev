/**
 * Common logger module for unified logging with configurable verbosity and namespaces
 */
export interface LogOptions {
  text: string;
  namespace?: string;
}

export class Logger {
  /** Static property to hold allowed namespaces from the CLI --log option */
  static allowedNamespaces: string[] = [];

  /** Instance property to control logging when no namespace filtering is applied */
  public enabled: boolean;

  /**
   * Create a new logger
   * @param enabled Whether logging is enabled (used when --verbose is set)
   */
  constructor(enabled = false) {
    this.enabled = enabled;
  }

  /**
   * Log a message based on namespace filtering or verbose mode
   * @param options Object containing the message text and optional namespace
   */
  log({ text, namespace }: LogOptions): void {
    // If --verbose is enabled, log everything regardless of namespace
    if (this.enabled) {
      console.log(namespace ? `[${namespace}] ${text}` : text);
      return;
    }
    // If --log is provided with namespaces, only log if the namespace matches
    if (
      Logger.allowedNamespaces.length > 0 &&
      namespace &&
      Logger.allowedNamespaces.includes(namespace)
    ) {
      console.log(`[${namespace}] ${text}`);
    }
  }

  /**
   * Log a debug message if logging is enabled (for backward compatibility)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.enabled) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Log an info message if logging is enabled (for backward compatibility)
   */
  info(message: string): void {
    if (this.enabled) {
      console.log(message);
    }
  }

  /**
   * Log a warning message (always shown, unchanged from original)
   */
  warn(message: string): void {
    console.warn(`⚠️ ${message}`);
  }

  /**
   * Log an error message (always shown, unchanged from original)
   */
  error(message: string, error?: unknown): void {
    const errorDetails = error
      ? `: ${error instanceof Error ? error.message : String(error)}`
      : "";
    console.error(`❌ ${message}${errorDetails}`);
  }

  /**
   * Enable or disable logging (for backward compatibility with --verbose)
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Singleton instance for shared logging across modules
const globalLogger = new Logger();
export default globalLogger;
