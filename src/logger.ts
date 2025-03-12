// src/logger.ts - Simple logging utility

/**
 * A simple logger class that can be enabled or disabled
 */
export class Logger {
    private enabled: boolean;
    
    /**
     * Create a new logger
     * 
     * @param enabled Whether logging is enabled
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
     * Log a warning message (always shown)
     * 
     * @param message The warning message
     */
    warn(message: string): void {
      console.warn(`⚠️ ${message}`);
    }
    
    /**
     * Log an error message (always shown)
     * 
     * @param message The error message
     */
    error(message: string): void {
      console.error(`❌ ${message}`);
    }
    
    /**
     * Enable or disable logging
     * 
     * @param enabled Whether logging should be enabled
     */
    setEnabled(enabled: boolean): void {
      this.enabled = enabled;
    }
  }