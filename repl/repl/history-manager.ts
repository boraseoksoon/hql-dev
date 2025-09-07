// src/repl/history-manager.ts
// Manages REPL command history with persistence between sessions

import * as path from "jsr:@std/path@1";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { globalLogger as logger } from "@core/logger.ts";
import { formatErrorMessage } from "../../core/src/common/error.ts";
const HISTORY_FILE = ".hql_history";

class HistoryManager {
  private logger = logger;
  private historyPath: string;
  private initialized = false;

  constructor() {
    try {
      const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
      this.historyPath = path.join(homeDir, HISTORY_FILE);
    } catch (e) {
      // Fallback to current directory if environment variables are not accessible
      this.historyPath = HISTORY_FILE;
    }
  }


  /**
   * Load history from file
   */
  load(maxSize: number = 100): string[] {
    this.initialized = true;
    
    try {
      if (!exists(this.historyPath)) {
        this.logger.debug(`History file not found at: ${this.historyPath}`);
        return [];
      }
      
      const content = Deno.readTextFileSync(this.historyPath);
      const lines = content.split('\n')
                        .filter(line => line.trim())
                        .slice(-maxSize);
                        
      this.logger.debug(`Loaded ${lines.length} history entries from ${this.historyPath}`);
      return lines;
    } catch (error: unknown) {
      this.logger.warn(`Error loading history: ${formatErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Save history to file
   */
  save(history: string[]): void {
    if (!this.initialized) return;
    
    try {
      const content = history.join('\n');
      Deno.writeTextFileSync(this.historyPath, content);
      this.logger.debug(`Saved ${history.length} history entries to ${this.historyPath}`);
    } catch (error: unknown) {
      this.logger.warn(`Error saving history: ${formatErrorMessage(error)}`);
    }
  }

  /**
   * Clear all history entries
   */
  clearAll(): void {
    if (!this.initialized) return;
    
    try {
      Deno.writeTextFileSync(this.historyPath, '');
      this.logger.debug(`Cleared all history entries from ${this.historyPath}`);
    } catch (error: unknown) {
      this.logger.warn(`Error clearing history: ${formatErrorMessage(error)}`);
    }
  }
}

// Export a singleton instance
export const historyManager = new HistoryManager();