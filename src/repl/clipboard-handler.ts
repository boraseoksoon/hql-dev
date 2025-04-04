// src/repl/clipboard-handler.ts
// Handles clipboard operations for the REPL with fallbacks

import { Logger } from "../logger.ts";

class ClipboardHandler {
  private logger = new Logger(false);
  private useNative = true;
  
  constructor() {
    // Check if we're running in an environment with clipboard access
    this.useNative = this.checkClipboardAccess();
    
    if (!this.useNative) {
      this.logger.debug("Native clipboard access is not available, using fallback");
    }
  }
  
  /**
   * Set verbose logging
   */
  setVerbose(verbose: boolean): void {
    this.logger = new Logger(verbose);
  }
  
  /**
   * Check if we have clipboard access
   */
  private checkClipboardAccess(): boolean {
    try {
      // Check if we can access clipboard permissions
      return typeof navigator !== 'undefined' && 
             typeof navigator.clipboard !== 'undefined' &&
             typeof navigator.clipboard.readText === 'function';
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Read text from clipboard
   */
  async read(): Promise<string> {
    if (this.useNative) {
      try {
        // Try native clipboard first
        return await navigator.clipboard.readText();
      } catch (e) {
        this.logger.debug(`Native clipboard failed: ${e.message}`);
        this.useNative = false;
      }
    }
    
    // Fallback to Deno's clipboard command if available
    try {
      const command = Deno.build.os === "windows" 
                     ? new Deno.Command("powershell", { args: ["-command", "Get-Clipboard"] })
                     : new Deno.Command("pbpaste");
      
      const output = await command.output();
      if (output.success) {
        return new TextDecoder().decode(output.stdout);
      }
    } catch (e) {
      this.logger.debug(`Command-line clipboard failed: ${e.message}`);
    }
    
    throw new Error("Clipboard access not available");
  }
  
  /**
   * Write text to clipboard
   */
  async write(text: string): Promise<boolean> {
    if (this.useNative) {
      try {
        // Try native clipboard first
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        this.logger.debug(`Native clipboard failed: ${e.message}`);
        this.useNative = false;
      }
    }
    
    // Fallback to Deno's clipboard command if available
    try {
      const command = Deno.build.os === "windows"
                     ? new Deno.Command("powershell", { 
                         args: ["-command", `Set-Clipboard -Value "${text.replace(/"/g, '\\"')}"`] 
                       })
                     : new Deno.Command("pbcopy", { 
                         stdin: "piped" 
                       });
      
      const process = command.spawn();
      
      if (Deno.build.os !== "windows") {
        // Write to stdin for Unix-based systems
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(text));
        await writer.close();
      }
      
      const status = await process.status;
      return status.success;
    } catch (e) {
      this.logger.debug(`Command-line clipboard failed: ${e.message}`);
    }
    
    return false;
  }
}

// Export a singleton instance
export const clipboardHandler = new ClipboardHandler();