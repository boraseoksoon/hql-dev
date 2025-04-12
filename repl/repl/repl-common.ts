// src/repl/repl-common.ts
// Common utilities and shared functionality for the REPL system

import { ReplState } from "./repl-state.ts";
import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { Logger } from "@logger/logger.ts";
import * as colors from "@core/utils/colors.ts";

/**
 * Shared REPL state handlers
 */
export interface ReplStateHandlers {
  setRunning: (val: boolean) => void;
  setVerbose: (val: boolean) => void;
  setShowAst: (val: boolean) => void;
  setShowExpanded: (val: boolean) => void;
  setShowJs: (val: boolean) => void;
}

/**
 * Common options for REPL components
 */
export interface CommonReplOptions {
  baseDir: string;
  showAst: boolean;
  showExpanded: boolean;
  showJs: boolean;
  useColors: boolean;
}

/**
 * Format a value for display in a consistent way
 */
export function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  
  if (typeof value === 'function') {
    return value.toString().includes("native code")
      ? "[Native Function]"
      : "[Function]";
  }
  
  if (typeof value === 'object') {
    try {
      if (Array.isArray(value)) {
        if (value.length > 5) {
          return `[Array(${value.length}): ${JSON.stringify(value.slice(0, 5))}...]`;
        }
        return JSON.stringify(value);
      }
      
      const stringified = JSON.stringify(value, null, 2);
      if (stringified.length > 100) {
        return stringified.substring(0, 100) + "...";
      }
      return stringified;
    } catch (e) {
      return "[Object]";
    }
  }
  
  return String(value);
}

/**
 * Extract the current word at the cursor position
 */
export function getCurrentWordAtCursor(input: string, cursorPos: number): string {
  const beforeCursor = input.substring(0, cursorPos);
  const afterCursor = input.substring(cursorPos);
  
  const beforeMatch = beforeCursor.match(/[a-zA-Z0-9_$-]*$/);
  const afterMatch = afterCursor.match(/^[a-zA-Z0-9_$-]*/);
  
  if (!beforeMatch) return "";
  
  return beforeMatch[0] + (afterMatch ? afterMatch[0] : "");
}

/**
 * Helper function for confirmation dialogs
 */
export async function confirmAction(prompt: string): Promise<boolean> {
  console.log(`${prompt} (y/N)`);
  
  // Use standard Deno prompt
  const buf = new Uint8Array(10);
  const n = await Deno.stdin.read(buf);
  
  if (n) {
    const response = new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
    return response === 'y' || response === 'yes';
  }
  
  return false;
}

/**
 * Color text with the given color code if colors are enabled
 */
export function colorText(text: string, colorCode: string, useColors = true): string {
  return useColors ? `${colorCode}${text}${colors.reset}` : text;
}

/**
 * Print an error message in red if colors are enabled
 */
export function printError(msg: string, useColors: boolean): void {
  console.error(useColors ? `${colors.fg.red}${msg}${colors.reset}` : msg);
}

/**
 * Handle JavaScript evaluation errors in a consistent way
 */
export function handleJsEvaluationError(
  error: Error, 
  input: string, 
  evaluator: ModuleAwareEvaluator, 
  useColors: boolean, 
  replState: ReplState, 
  logger: { isVerbose: boolean }
): void {
  // Handle specific error cases with better messages
  const errorMessage = error.message || "Unknown error";
  
  // Special handling for common CLI commands when used incorrectly
  if (errorMessage.includes("is not defined") || errorMessage.includes("not a function")) {
    const commandMatch = /(?:return\s+)?([\w-]+)(?:\(.*\))?;?/.exec(input);
    if (commandMatch) {
      const possibleCommand = commandMatch[1].toLowerCase();
      
      // Handle common CLI commands that users might try to use directly
      const cliCommands: Record<string, string> = {
        "rm": "Use rm as a command: rm <symbol> or rm <module> or rm <module>:<symbol>",
        "cd": "Use cd as a command: cd <module-name>",
        "ls": "Use ls as a command to list symbols in the current module",
        "pwd": "Use pwd as a command to show the current module",
        "find": "Use find as a command: find <pattern>",
        "mkdir": "Use mkdir as a command: mkdir <module-name>",
        "man": "Use man as a command: man <command>",
        "clear": "Use clear or cls as a command to clear the terminal screen",
        "cls": "Use clear or cls as a command to clear the terminal screen"
      };
      
      if (possibleCommand in cliCommands) {
        printError(`${possibleCommand} is not a valid expression in the REPL. Did you mean to use it as a command?`, useColors);
        console.log(cliCommands[possibleCommand]);
        console.log(`For more help, try: :help ${possibleCommand}`);
        
        // For certain commands, show available modules/symbols to help the user
        if (['rm', 'cd'].includes(possibleCommand)) {
          // Show available modules and symbols to help the user
          console.log("");
          console.log(colorText("Available modules:", useColors ? colors.fg.cyan : "", useColors));
          evaluator.getAvailableModules().then(modules => {
            if (modules.length > 0) {
              modules.forEach(module => {
                console.log(`  ${module}${module === replState.currentModule ? ' (current)' : ''}`);
              });
            } else {
              console.log("  No modules available");
            }
            
            console.log("");
            console.log(colorText("Symbols in current module:", useColors ? colors.fg.cyan : "", useColors));
            evaluator.listModuleSymbols().then(symbols => {
              if (symbols.length > 0) {
                symbols.forEach(symbol => {
                  console.log(`  ${symbol}`);
                });
              } else {
                console.log("  No symbols defined in current module");
              }
              
              // Examples
              console.log("");
              console.log(colorText("Examples:", useColors ? colors.fg.yellow : "", useColors));
              
              if (possibleCommand === 'rm') {
                console.log(`  rm factorial     - Remove 'factorial' symbol from current module`);
                console.log(`  rm math          - Remove 'math' module (with confirmation)`);
                console.log(`  rm math:sqrt     - Remove 'sqrt' symbol from 'math' module`);
                console.log(`  rm -f math       - Force remove 'math' module without confirmation`);
                console.log(`  rm *             - Remove all symbols in current module`);
              } else if (possibleCommand === 'cd') {
                console.log(`  cd math          - Switch to 'math' module`);
                console.log(`  cd utils         - Switch to 'utils' module`);
              }
            });
          });
        }
        
        return;
      }
    }
  }
  
  // Default error handling
  printError(`JavaScript evaluation error: ${errorMessage}`, useColors);
  logger.isVerbose && console.log("[Debug] Processing error first time:", errorMessage, "in REPL JS evaluation");
  
  let errorType = "JavaScript";
  let errorLocation = "REPL JS";
  
  printError(`${errorMessage}`, useColors);
  console.log(`Location: ${errorLocation}`);
  
  // Show the code snippet where the error occurred
  console.log();
  const codeLines = input.split("\n");
  const numLines = codeLines.length;
  
  // Show at most 5 lines of code
  const startLine = Math.max(0, numLines > 5 ? numLines - 5 : 0);
  for (let i = startLine; i < numLines; i++) {
    console.log(`${i + 1} │ ${codeLines[i]}`);
  }
  
  console.log();
  console.log(errorMessage);
}

/**
 * Module utility functions
 */
export const moduleUtils = {
  /**
   * Show available modules with formatting
   */
  async showAvailableModules(
    evaluator: ModuleAwareEvaluator, 
    currentModule: string,
    useColors: boolean
  ): Promise<void> {
    console.log(colorText("Available modules:", useColors ? colors.fg.cyan : "", useColors));
    const modules = await evaluator.getAvailableModules();
    
    if (modules.length === 0) {
      console.log("No modules available");
      return;
    }
    
    // Separate modules into core and user modules
    const coreModules = ['global', 'user'];
    const userModules = modules.filter(m => !coreModules.includes(m));
    
    console.log("Core System Modules (protected):");
    console.log("--------------------------");
    coreModules.forEach(module => {
      if (modules.includes(module)) {
        const isCurrent = module === currentModule;
        const displayName = isCurrent 
          ? colorText(module, useColors ? colors.fg.green + colors.bright : "", useColors) + " (current)"
          : module;
        
        // Add special marker for global module
        const description = module === 'global' 
          ? " - Core system module with essential functionality"
          : " - Protected system module";
          
        console.log(`- ${displayName}${colorText(description, useColors ? colors.fg.cyan : "", useColors)}`);
      }
    });
    
    if (userModules.length > 0) {
      console.log("\nUser Modules:");
      console.log("-----------");
      userModules.sort().forEach(module => {
        const isCurrent = module === currentModule;
        const displayName = isCurrent 
          ? colorText(module, useColors ? colors.fg.green + colors.bright : "", useColors) + " (current)"
          : module;
        console.log(`- ${displayName}`);
      });
    }
  },
  
  /**
   * Get a module name from a path
   */
  getModuleNameFromPath(modulePath: string): string {
    // Handle npm/jsr imports
    if (modulePath.startsWith('npm:')) {
      return modulePath.substring(4).split('/')[0].replace(/[-]/g, '_');
    }
    
    // Handle jsr imports
    if (modulePath.startsWith('jsr:')) {
      return modulePath.substring(4).split('/')[0].replace(/[-]/g, '_');
    }
    
    // Handle http/https URLs
    if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
      try {
        const url = new URL(modulePath);
        const pathname = url.pathname;
        const filename = pathname.split('/').pop() || 'module';
        return filename.replace(/\.[^/.]+$/, '').replace(/[-]/g, '_');
      } catch (error: unknown) {
        return 'remote_module';
      }
    }
    
    // Regular file path
    const basename = modulePath.split('/').pop() || 'module';
    return basename.replace(/\.[^/.]+$/, '').replace(/[-]/g, '_');
  }
};

/**
 * Command execution utilities
 */
export const commandUtils = {
  /**
   * Check if input is a CLI command
   */
  isCliCommand(input: string): boolean {
    if (!input || input.trim() === '') return false;
    
    const [cmd] = input.split(/\s+/);
    const cliCommands = ['cd', 'ls', 'pwd', 'mkdir', 'find', 'man', 'help', 'rm', 'clear', 'cls'];
    return cliCommands.includes(cmd);
  },
  
  /**
   * Check if input is a REPL command (starts with :)
   */
  isReplCommand(input: string): boolean {
    return input.trim().startsWith(':');
  },
  
  /**
   * Parse a REPL command from input
   */
  parseReplCommand(input: string): { command: string, args: string } {
    // Remove the leading colon
    const commandInput = input.substring(1).trim();
    
    // Split on the first space
    const firstSpaceIndex = commandInput.indexOf(' ');
    
    if (firstSpaceIndex === -1) {
      return { command: commandInput, args: '' };
    }
    
    const command = commandInput.substring(0, firstSpaceIndex);
    const args = commandInput.substring(firstSpaceIndex + 1).trim();
    
    return { command, args };
  },
  
  /**
   * Extract command and arguments from CLI-style input
   */
  parseCliCommand(input: string): { command: string, args: string } {
    const parts = input.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1).join(' ');
    
    return { command, args };
  }
};