/**
* Common logger module for unified logging with configurable verbosity
*/
export class Logger {
  private enabled: boolean;
  
  /**
  * Create a new logger
  */
  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }
  
  /**
  * Log a message if logging is enabled
  * 
  * @param message The message to log
  */
  log(message: string): void {
    if (this.enabled) {
      console.log(message);
    }
  }
  
  /**
  * Log a debug message if logging is enabled
  */
  debug(message: string, ...args: any[]): void {
    if (this.enabled) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
  
  /**
  * Log an info message if logging is enabled
  */
  info(message: string): void {
    if (this.enabled) {
      console.log(message);
    }
  }
  
  /**
  * Log a warning message (always shown)
  */
  warn(message: string): void {
    console.warn(`⚠️ ${message}`);
  }
  
  /**
  * Log an error message (always shown)
  */
  error(message: string, error?: any): void {
    const errorDetails = error ? `: ${error instanceof Error ? error.message : String(error)}` : '';
    console.error(`❌ ${message}${errorDetails}`);
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