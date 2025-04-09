// src/repl/repl-completion.ts
// Tab completion for the REPL 

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { 
  CompletionHandler, 
  PropertyCompletionHandler, 
  SymbolCompletionHandler, 
  SpecialFormCompletionHandler,
  CommandOptionCompletionHandler,
  CompletionItem,
  SymbolType,
  getCurrentWordInContext,
  getPropertyAccessContext
} from "./repl-completion-handlers.ts";

/**
 * Interface for tab completion provider
 */
export interface TabCompletion {
  getCompletions(line: string, cursorPos: number): Promise<string[]>;
  getFormattedCompletions(line: string, cursorPos: number): Promise<{ text: string, displayText: string }[]>;
}

/**
 * Create a tab completion provider for the REPL
 */
export function createTabCompletion(evaluator: ModuleAwareEvaluator, getCurrentModule: () => string): TabCompletion {
  // Create the handlers
  const handlers: CompletionHandler[] = [
    new CommandOptionCompletionHandler(evaluator),
    new PropertyCompletionHandler(evaluator),
    new SymbolCompletionHandler(evaluator),
    new SpecialFormCompletionHandler(evaluator)
  ];
  
  /**
   * Module completion helper
   */
  async function handleModuleCompletion(line: string, cmdPrefix: string): Promise<CompletionItem[]> {
    if (line.trim().startsWith(cmdPrefix)) {
      const partialModule = line.trim().substring(cmdPrefix.length);
      const modules = await evaluator.getAvailableModules();
      
      return modules
        .filter(mod => mod.toLowerCase().startsWith(partialModule.toLowerCase()))
        .map(mod => ({ 
          name: mod, 
          type: SymbolType.Module,
          context: cmdPrefix.trim() === ':see' ? 'see' : 'cli-command' 
        }));
    }
    return [];
  }
  
  /**
   * Command completion helper
   */  
  function handleCommandCompletion(line: string, cmdPrefix: string, commands: string[]): CompletionItem[] {
    if (line.trim().startsWith(cmdPrefix)) {
      const partialCmd = line.trim().substring(cmdPrefix.length);
      
      return commands
        .filter(cmd => cmd.toLowerCase().startsWith(partialCmd.toLowerCase()))
        .map(cmd => ({
          name: `${cmdPrefix}${cmd}`,
          type: SymbolType.Function,
          context: 'cli-command'
        }));
    }
    return [];
  }

  return {
    getCompletions: async (line: string, cursorPos: number): Promise<string[]> => {
      const currentModule = getCurrentModule();
      const completions = await getCompletionItems(line, cursorPos, currentModule);
      return completions.map(item => formatCompletionText(item));
    },
    
    getFormattedCompletions: async (line: string, cursorPos: number): Promise<{ text: string, displayText: string }[]> => {
      const currentModule = getCurrentModule();
      const completions = await getCompletionItems(line, cursorPos, currentModule);
      return completions.map(item => ({
        text: formatCompletionText(item),
        displayText: formatCompletionDisplay(item)
      }));
    }
  };
  
  /**
   * Get completion items for the given input and cursor position
   */
  async function getCompletionItems(line: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    try {
      // Check if we have a command with or without space but no dash yet - prioritize options
      const commandMatch = line.trim().match(/^([^\s]+)(?:\s+)?$/);
      if (commandMatch) {
        const [, command] = commandMatch;
        const cliCommands = ["ls", "cd", "pwd", "find", "mkdir", "man", "rm"];
        
        if (cliCommands.includes(command) || command.startsWith(':')) {
          // Try the command option handler first for possible options
          for (const handler of handlers) {
            if (handler.constructor.name === 'CommandOptionCompletionHandler') {
              const options = await handler.getCompletions(line, cursorPos, currentModule);
              if (options.length > 0) {
                return options;
              }
            }
          }
        }
      }
    
      // Check for basic CLI commands first (for early completion)
      if (line.trim().length <= 5 && !line.trim().startsWith(':')) {
        // Try to match any cli command starts
        const cliCommands = ["ls", "cd", "pwd", "find", "mkdir", "man", "rm"];
        const matchedCommands = cliCommands
          .filter(cmd => cmd.toLowerCase().startsWith(line.trim().toLowerCase()))
          .map(cmd => ({
            name: cmd,
            type: SymbolType.Function,
            context: 'cli-command'
          }));
          
        if (matchedCommands.length > 0) {
          return matchedCommands;
        }
      }
    
      // Check for specific context completions
      
      // 1. Module-related commands
      const moduleCommands = [
        "cd ", ":go ", ":goto ", ":module ", ":mod ", ":see ", "mkdir "
      ];
      
      for (const cmdPrefix of moduleCommands) {
        const moduleCompletions = await handleModuleCompletion(line, cmdPrefix);
        if (moduleCompletions.length > 0) {
          return moduleCompletions;
        }
      }
      
      // 2. Help command completions
      if (line.trim().startsWith(':help ')) {
        const commands = [
          "help", "quit", "exit", "env", "macros", 
          "go", "modules", "list", "find", "see", "remove",
          "verbose", "ast", "js", "doc", "cli"
        ];
        return handleCommandCompletion(line, ':help ', commands);
      }
      
      // 3. Man command completions
      if (line.trim().startsWith('man ')) {
        const commands = [
          "help", "quit", "exit", "env", "macros", 
          "go", "modules", "list", "find", "see", "remove",
          "cli", "ls", "cd", "pwd", "mkdir", "man", "rm"
        ];
        return handleCommandCompletion(line, 'man ', commands);
      }
      
      // 4. See module:symbol completions
      if (line.trim().startsWith(':see ') && line.includes(':')) {
        const parts = line.trim().substring(':see '.length).split(':');
        if (parts.length === 2) {
          const moduleName = parts[0];
          const partialSymbol = parts[1];
          
          try {
            const moduleSymbols = await evaluator.listModuleSymbols(moduleName);
            return moduleSymbols
              .filter(sym => sym.toLowerCase().startsWith(partialSymbol.toLowerCase()))
              .map(sym => ({
                name: `${moduleName}:${sym}`,
                type: SymbolType.Unknown
              }));
          } catch (e) {
            // Module not found or error fetching symbols
            return [];
          }
        }
      }
      
      // 5. Command completions
      if (line.trim().startsWith(':')) {
        const commandPart = line.trim().substring(1);
        const commands = [
          "help", "quit", "exit", "env", "macros", 
          "go", "modules", "list", "see", "remove",
          "find", "verbose", "ast", "js", "doc", "cli"
        ];
        
        return commands
          .filter(cmd => cmd.toLowerCase().startsWith(commandPart.toLowerCase()))
          .map(cmd => ({
            name: `:${cmd}`,
            type: SymbolType.Function,
            context: 'cli-command'
          }));
      }

      // 6. Try all generic handlers
      let allResults: CompletionItem[] = [];
      
      for (const handler of handlers) {
        const results = await handler.getCompletions(line, cursorPos, currentModule);
        allResults = [...allResults, ...results];
      }
      
      return allResults;
    } catch (error) {
      // Silently handle errors in completion
      return [];
    }
  }
  
  /**
   * Format the completion text for insertion
   */
  function formatCompletionText(item: CompletionItem): string {
    // Format the text differently based on the type - Lisp-style syntax with opening parenthesis
    switch (item.type) {
      case SymbolType.Function:
      case SymbolType.Macro:
        // Don't add parentheses for CLI commands and REPL commands (those starting with :)
        if (item.name.startsWith(':') || item.context === 'cli-command') {
          return item.name;
        }
        
        if (item.fullName) {
          // For property access like chalkJSR.green with opening parenthesis
          const parts = item.fullName.split('.');
          // Strip any parentheses that might already exist in the name
          const baseName = parts[0].replace(/^\(/, '');
          const propName = parts[1].replace(/^\(/, '');
          return `(${baseName}.${propName}`;
        } else {
          // Add opening parenthesis for functions and macros
          // Strip any parentheses that might already exist in the name
          const cleanName = item.name.replace(/^\(/, '');
          return `(${cleanName}`;
        }
      case SymbolType.Module:
        // Don't add slash for :see command or cd command
        if (item.context === 'see' || item.context === 'cli-command') {
          return item.name;
        }
        return `${item.name}/`;
      default:
        return item.name;
    }
  }
  
  /**
   * Format the display text for showing in completion UI
   */
  function formatCompletionDisplay(item: CompletionItem): string {
    // Format the display text differently based on the type
    switch (item.type) {
      case SymbolType.Function:
      case SymbolType.Macro:
        // Don't add parentheses for CLI commands and REPL commands (those starting with :)
        if (item.name.startsWith(':') || item.context === 'cli-command') {
          return item.name;
        }
        
        if (item.fullName) {
          // For property access like (chalkJSR.green
          const parts = item.fullName.split('.');
          // Strip any parentheses that might already exist in the name
          const baseName = parts[0].replace(/^\(/, '');
          const propName = parts[1].replace(/^\(/, '');
          return `(${baseName}.${propName}`;
        } else {
          // Add opening parenthesis for display
          // Strip any parentheses that might already exist in the name
          const cleanName = item.name.replace(/^\(/, '');
          return `(${cleanName}`;
        }
      case SymbolType.Module:
        // Don't add slash for :see command or cd command
        if (item.context === 'see' || item.context === 'cli-command') {
          return item.name;
        }
        return `${item.name}/`;
      default:
        return item.name;
    }
  }
}

/**
 * Convert from user-facing hyphenated names to internal underscore names
 */
export function toInternalName(name: string): string {
  return name.replace(/-/g, '_');
}

/**
 * Convert from internal underscore names to user-facing hyphenated names
 */
export function toUserFacingName(name: string): string {
  return name.replace(/_/g, '-');
}