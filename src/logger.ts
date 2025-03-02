// src/logger.ts - Centralized logging utilities

/**
 * Log levels
 */
export enum LogLevel {
    NONE = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
    VERBOSE = 5
  }
  
  /**
   * Global log level setting
   */
  let globalLogLevel = LogLevel.INFO;
  
  /**
   * Set the global log level
   * @param level The log level to set
   */
  export function setLogLevel(level: LogLevel): void {
    globalLogLevel = level;
  }
  
  /**
   * Convert verbose flag to log level
   * @param verbose Whether verbose logging is enabled
   */
  export function verboseToLogLevel(verbose: boolean): LogLevel {
    return verbose ? LogLevel.VERBOSE : LogLevel.INFO;
  }
  
  /**
   * Format path for display in logs
   * @param path The file path
   * @returns Formatted path string
   */
  export function formatPath(path: string): string {
    return `"${path}"`;
  }
  
  /**
   * Log a message at ERROR level
   * @param message The message to log
   * @param error Optional error object
   */
  export function logError(message: string, error?: Error | string): void {
    if (globalLogLevel >= LogLevel.ERROR) {
      const errorMsg = error instanceof Error ? error.message : (error || '');
      console.error(`\n❌ ${message}${errorMsg ? ': ' + errorMsg : ''}`);
      
      // Log stack trace for Error objects if in debug mode
      if (globalLogLevel >= LogLevel.DEBUG && error instanceof Error && error.stack) {
        console.error(`Stack trace:\n${error.stack}`);
      }
    }
  }
  
  /**
   * Log a message at WARN level
   * @param message The message to log
   */
  export function logWarning(message: string): void {
    if (globalLogLevel >= LogLevel.WARN) {
      console.warn(`\n⚠️ ${message}`);
    }
  }
  
  /**
   * Log a message at INFO level
   * @param message The message to log
   */
  export function logInfo(message: string): void {
    if (globalLogLevel >= LogLevel.INFO) {
      console.log(`\nℹ️ ${message}`);
    }
  }
  
  /**
   * Log a success message at INFO level
   * @param message The message to log
   */
  export function logSuccess(message: string): void {
    if (globalLogLevel >= LogLevel.INFO) {
      console.log(`\n✅ ${message}`);
    }
  }
  
  /**
   * Log a message at DEBUG level
   * @param message The message to log
   */
  export function logDebug(message: string): void {
    if (globalLogLevel >= LogLevel.DEBUG) {
      console.log(`\n🔍 ${message}`);
    }
  }
  
  /**
   * Log a message at VERBOSE level
   * @param message The message to log
   */
  export function logVerbose(message: string): void {
    if (globalLogLevel >= LogLevel.VERBOSE) {
      console.log(`  → ${message}`);
    }
  }
  
  /**
   * Log the start of a process at INFO level
   * @param message The message to log
   */
  export function logStart(message: string): void {
    if (globalLogLevel >= LogLevel.INFO) {
      console.log(`\n🔨 ${message}`);
    }
  }
  
  /**
   * Create a logger instance with fixed prefix
   * @param prefix Prefix to add to all log messages
   * @returns An object with scoped logging methods
   */
  export function createLogger(prefix: string) {
    const scopedPrefix = `[${prefix}]`;
    
    return {
      error: (message: string, error?: Error | string) => 
        logError(`${scopedPrefix} ${message}`, error),
      warning: (message: string) => 
        logWarning(`${scopedPrefix} ${message}`),
      info: (message: string) => 
        logInfo(`${scopedPrefix} ${message}`),
      success: (message: string) => 
        logSuccess(`${scopedPrefix} ${message}`),
      debug: (message: string) => 
        logDebug(`${scopedPrefix} ${message}`),
      verbose: (message: string) => 
        logVerbose(`${scopedPrefix} ${message}`),
      start: (message: string) => 
        logStart(`${scopedPrefix} ${message}`),
    };
  }