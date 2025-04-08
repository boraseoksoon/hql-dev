// src/repl/repl-completion.ts
// Tab completion for the REPL 

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { 
  CompletionHandler, 
  PropertyCompletionHandler, 
  SymbolCompletionHandler, 
  SpecialFormCompletionHandler,
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
    new PropertyCompletionHandler(evaluator),
    new SymbolCompletionHandler(evaluator),
    new SpecialFormCompletionHandler(evaluator)
  ];
  
  // Module completion helper
  async function handleModuleCompletion(line: string, cmdPrefix: string): Promise<CompletionItem[]> {
    if (line.trim().startsWith(cmdPrefix)) {
      const partialModule = line.trim().substring(cmdPrefix.length);
      const modules = await evaluator.getAvailableModules();
      
      return modules
        .filter(mod => mod.startsWith(partialModule))
        .map(mod => ({ 
          name: mod, 
          type: SymbolType.Module 
        }));
    }
    return [];
  }
  
  // Command completion helper  
  function handleCommandCompletion(line: string, cmdPrefix: string, commands: string[]): CompletionItem[] {
    if (line.trim().startsWith(cmdPrefix)) {
      const partialCmd = line.trim().substring(cmdPrefix.length);
      
      return commands
        .filter(cmd => cmd.startsWith(partialCmd))
        .map(cmd => ({
          name: `${cmdPrefix}${cmd}`,
          type: SymbolType.Function
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
  
  async function getCompletionItems(line: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    try {
      // Check for specific context completions first
      
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
              .filter(sym => sym.startsWith(partialSymbol))
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
          .filter(cmd => cmd.startsWith(commandPart))
          .map(cmd => ({
            name: `:${cmd}`,
            type: SymbolType.Function
          }));
      }

      // 6. Try all handlers
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
  
  function formatCompletionText(item: CompletionItem): string {
    // Format the text differently based on the type
    switch (item.type) {
      case SymbolType.Function:
      case SymbolType.Macro:
        if (item.fullName) {
          // For property/method access like chalkJSR.green
          return item.fullName;
        } else {
          // No parentheses in the text - they'll be added in the display version
          return item.name;
        }
      default:
        return item.name;
    }
  }
  
  function formatCompletionDisplay(item: CompletionItem): string {
    // Format the display text differently based on the type
    switch (item.type) {
      case SymbolType.Function:
      case SymbolType.Macro:
        if (item.fullName) {
          // For property/method access like chalkJSR.green()
          const parts = item.fullName.split('.');
          return `${parts[0]}.${parts[1]}()`;
        } else {
          // Add parentheses for display
          return `${item.name}()`;
        }
      case SymbolType.Module:
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