/**
 * Enhanced logger module with improved namespace support
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
    if (this.isNamespaceEnabled(namespace)) {
      console.log(`[${namespace}] ${text}`);
    }
  }

  /**
   * Check if a given namespace is enabled for logging
   */
  isNamespaceEnabled(namespace?: string): boolean {
    if (!namespace) return false;
    
    // If no allowed namespaces are specified, none are enabled
    if (Logger.allowedNamespaces.length === 0) return false;
    
    // Check if the exact namespace is allowed
    if (Logger.allowedNamespaces.includes(namespace)) return true;
    
    // Check for wildcard matches (e.g., "macro*" would match "macro-expansion")
    for (const allowed of Logger.allowedNamespaces) {
      if (allowed.endsWith('*') && 
          namespace.startsWith(allowed.slice(0, -1))) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Log a debug message if logging is enabled or if namespace is enabled
   */
  debug(message: string, namespace?: string): void {
    if (this.enabled || this.isNamespaceEnabled(namespace)) {
      const prefix = namespace ? `[${namespace}] ` : '';
      console.log(`${prefix}${message}`);
    }
  }

  /**
   * Log an info message if logging is enabled or if namespace is enabled
   */
  info(message: string, namespace?: string): void {
    if (this.enabled || this.isNamespaceEnabled(namespace)) {
      const prefix = namespace ? `[${namespace}] ` : '';
      console.log(`${prefix}${message}`);
    }
  }

  /**
   * Log a warning message (always shown, can include namespace)
   */
  warn(message: string, namespace?: string): void {
    const prefix = namespace ? `[${namespace}] ` : '';
    console.warn(`⚠️ ${prefix}${message}`);
  }

  /**
   * Log an error message (always shown, can include namespace)
   */
  error(message: string, error?: unknown, namespace?: string): void {
    const errorDetails = error
      ? `: ${error instanceof Error ? error.message : String(error)}`
      : "";
    const prefix = namespace ? `[${namespace}] ` : '';
    console.error(`❌ ${prefix}${message}${errorDetails}`);
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Singleton instance for shared logging across modules
const globalLogger = new Logger();
export default globalLogger;