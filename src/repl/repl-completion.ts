// src/repl/repl-completion.ts
// Tab completion for the REPL 

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";

/**
 * Interface for tab completion provider
 */
export interface TabCompletion {
  getCompletions(line: string, cursorPos: number): Promise<string[]>;
}

/**
 * Extract the current word at the cursor position for tab completion
 * Works with nested expressions and partial words
 */
export function getCurrentWordInContext(line: string, cursorPos: number): string {
  if (cursorPos <= 0 || cursorPos > line.length) return "";
  
  // Get the part of the line up to the cursor
  const beforeCursor = line.substring(0, cursorPos);
  
  // Find the last opening delimiter or whitespace before cursor
  const lastDelimiter = Math.max(
    beforeCursor.lastIndexOf('('),
    beforeCursor.lastIndexOf('['),
    beforeCursor.lastIndexOf('{'),
    beforeCursor.lastIndexOf(' '),
    beforeCursor.lastIndexOf('\n'),
    beforeCursor.lastIndexOf('\t')
  );
  
  // Extract the partial word between the delimiter and cursor
  if (lastDelimiter >= 0) {
    return beforeCursor.substring(lastDelimiter + 1);
  }
  
  // If no delimiter, use the whole string up to cursor
  return beforeCursor;
}

/**
 * Create a tab completion provider for the REPL
 */
export function createTabCompletion(evaluator: ModuleAwareEvaluator, currentModule: () => string): TabCompletion {
  return {
    getCompletions: async (line: string, cursorPos: number): Promise<string[]> => {
      try {
        // First, check for module-related commands that should autocomplete module names
        const moduleCommands = [
          "cd ", "ls ", ":module ", ":mod ", ":see ", "mkdir "
        ];
        
        for (const cmdPrefix of moduleCommands) {
          if (line.trim().startsWith(cmdPrefix)) {
            // Extract the partial module name after the command
            const partialModule = line.trim().substring(cmdPrefix.length);
            
            // Get the current list of available modules (dynamic)
            const modules = await evaluator.getAvailableModules();
            
            // Filter modules that match the partial input
            return modules.filter(mod => mod.startsWith(partialModule));
          }
        }
        
        // Handle special case for :see <module>:
        if (line.trim().startsWith(':see ') && line.includes(':')) {
          const parts = line.trim().substring(':see '.length).split(':');
          if (parts.length === 2) {
            const moduleName = parts[0];
            const partialSymbol = parts[1];
            
            // Get symbols from the specified module
            try {
              const moduleSymbols = await evaluator.listModuleSymbols(moduleName);
              return moduleSymbols
                .filter(sym => sym.startsWith(partialSymbol))
                .map(sym => `${moduleName}:${sym}`);
            } catch (e) {
              // Module not found or error fetching symbols
              return [];
            }
          }
        }
        
        // Command completion (starts with :)
        if (line.trim().startsWith(':')) {
          const commandPart = line.trim().substring(1); // Remove the colon
          const commands = [
            "help", "quit", "exit", "env", "macros", 
            "module", "modules", "list", "see", "remove",
            "verbose", "ast", "js", "doc"
          ];
          
          // Filter commands based on what's already typed
          return commands
            .filter(cmd => cmd.startsWith(commandPart))
            .map(cmd => `:${cmd}`); // Add the colon back
        }
        
        // Get current module's symbols and environment bindings for symbol completion
        const symbols: string[] = [];
        
        // Get current module's symbols (always fetch fresh for dynamic updates)
        const moduleSymbols = await evaluator.listModuleSymbols(currentModule());
        symbols.push(...moduleSymbols);
        
        // Get imported symbols from other modules
        const allModules = await evaluator.getAvailableModules();
        for (const moduleName of allModules) {
          if (moduleName !== currentModule()) {
            // Get the exports from this module
            const exports = await evaluator.getModuleExports(moduleName);
            // Only add exported symbols from other modules
            if (exports.length > 0) {
              symbols.push(...exports);
            }
          }
        }
        
        // Get special forms and keywords
        const specialForms = [
          // Core special forms
          "if", "let", "lambda", "fn", "def", "defn", "import", "module", "do", "quote",
          // Control flow
          "loop", "recur", "when", "unless", "cond", "case",
          // Collections
          "list", "vector", "map", "set", "concat", "cons", "first", "rest",
          // Functions
          "apply", "filter", "map", "reduce", "compose", "partial",
          // I/O
          "print", "println", "read", "slurp", "spit",
          // Other common operations
          "not", "and", "or", "str", "range", "repeat", "inc", "dec", "even?", "odd?",
          // Math
          "+", "-", "*", "/", "mod", "pow", "max", "min", "abs"
        ];
        symbols.push(...specialForms);
        
        // Filter based on current text
        const currentWord = getCurrentWordInContext(line, cursorPos);
        if (currentWord) {
          return symbols.filter(sym => sym.startsWith(currentWord));
        }
        
        return symbols;
      } catch (error) {
        // Silently handle errors in completion
        console.error(`Autocompletion error: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    }
  };
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