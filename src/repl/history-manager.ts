// src/repl/history-manager.ts
// Manages REPL command history persistence

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { Logger } from "../logger.ts";

const HISTORY_FILE = ".hql_history";

class HistoryManager {
  private logger = new Logger(false);
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
   * Set verbose logging
   */
  setVerbose(verbose: boolean): void {
    this.logger = new Logger(verbose);
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
    } catch (error) {
      this.logger.warn(`Error loading history: ${error.message}`);
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
    } catch (error) {
      this.logger.warn(`Error saving history: ${error.message}`);
    }
  }
}

// Export a singleton instance
export const historyManager = new HistoryManager();