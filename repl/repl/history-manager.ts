// src/repl/history-manager.ts
// Manages REPL command history with persistence between sessions

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { getLogger } from "@logger/logger-init.ts";
import { Logger } from "@logger/logger.ts";
import * as CommonErrorUtils from "@transpiler/error/common-error-utils.ts";

const HISTORY_FILE = ".hql_history";

class HistoryManager {
  private logger = getLogger({ verbose: false });
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
    this.logger = getLogger({ verbose: verbose });
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
      this.logger.warn(`Error loading history: ${CommonErrorUtils.formatErrorMessage(error)}`);
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
      this.logger.warn(`Error saving history: ${CommonErrorUtils.formatErrorMessage(error)}`);
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
      this.logger.warn(`Error clearing history: ${CommonErrorUtils.formatErrorMessage(error)}`);
    }
  }
}

// Export a singleton instance
export const historyManager = new HistoryManager();