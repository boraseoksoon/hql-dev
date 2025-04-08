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
 * Check if we're in the middle of a property access expression: obj.prop
 * Returns the object name and partial property name
 */
export function getPropertyAccessContext(line: string, cursorPos: number): { objectName: string; partialProp: string } | null {
  if (cursorPos <= 0) return null;
  
  // Get the part of the line up to the cursor
  const beforeCursor = line.substring(0, cursorPos);
  
  // Check if there's a dot in the line
  const lastDotIndex = beforeCursor.lastIndexOf('.');
  if (lastDotIndex < 0) return null;
  
  // Extract what's after the dot (the partial property name)
  const partialProp = beforeCursor.substring(lastDotIndex + 1);
  
  // Now extract the object name before the dot
  // We need to look for the start of the object identifier
  let objectStartIndex = lastDotIndex;
  
  // Move backward to find the start of the object name
  while (objectStartIndex > 0) {
    objectStartIndex--;
    
    // Stop at any delimiter that would break an identifier
    const char = beforeCursor.charAt(objectStartIndex);
    if (/[\s\(\)\[\]\{\}\'\"\,\;\:\+\-\*\/\\\&\|\!\~\=\<\>\?]/.test(char)) {
      objectStartIndex++;
      break;
    }
  }
  
  // Make sure we have a valid object name
  if (objectStartIndex < lastDotIndex) {
    const objectName = beforeCursor.substring(objectStartIndex, lastDotIndex);
    return { objectName, partialProp };
  }
  
  return null;
}

/**
 * Create a tab completion provider for the REPL
 */
export function createTabCompletion(evaluator: ModuleAwareEvaluator, currentModule: () => string): TabCompletion {
  return {
    getCompletions: async (line: string, cursorPos: number): Promise<string[]> => {
      try {
        // First, check if we're in a property access expression (obj.prop)
        const propContext = getPropertyAccessContext(line, cursorPos);
        if (propContext) {
          const { objectName, partialProp } = propContext;
          
          try {
            // Get the REPL environment to access the object
            const replEnv = evaluator.getREPLEnvironment();
            const obj = replEnv.getJsValue(objectName, currentModule());
            
            if (obj !== undefined && obj !== null) {
              const properties = new Set<string>();
              
              try {
                // Method 1: Try direct property access - this works for getters and direct properties
                try {
                  // This handles objects that define properties with getters
                  const descriptors = Object.getOwnPropertyDescriptors(obj);
                  for (const prop in descriptors) {
                    if (!prop.startsWith('_') && !prop.startsWith('__')) {
                      properties.add(prop);
                    }
                  }
                } catch (err) {
                  // Ignore errors, continue with other methods
                }
                
                // Method 2: Get enumerable properties using for...in
                try {
                  for (const prop in obj as Record<string, unknown>) {
                    if (!prop.startsWith('_') && !prop.startsWith('__')) {
                      properties.add(prop);
                    }
                  }
                } catch (err) {
                  // Ignore errors, continue with other methods
                }
                
                // Method 3: Get own properties (including non-enumerable ones)
                try {
                  const ownProps = Object.getOwnPropertyNames(obj);
                  for (const prop of ownProps) {
                    if (!prop.startsWith('_') && !prop.startsWith('__')) {
                      properties.add(prop);
                    }
                  }
                } catch (err) {
                  // Ignore errors, continue with other methods
                }
                
                // Method 4: Get enumerable own properties with Object.keys
                try {
                  const keys = Object.keys(obj as object);
                  for (const key of keys) {
                    if (!key.startsWith('_') && !key.startsWith('__')) {
                      properties.add(key);
                    }
                  }
                } catch (err) {
                  // Ignore errors, continue with other methods
                }
                
                // Method 5: Get method names from the prototype chain
                try {
                  let proto = Object.getPrototypeOf(obj);
                  while (proto && proto !== Object.prototype) {
                    const protoProps = Object.getOwnPropertyNames(proto);
                    for (const prop of protoProps) {
                      if (prop !== 'constructor' && 
                          !prop.startsWith('_') &&
                          !prop.startsWith('__')) {
                        properties.add(prop);
                      }
                    }
                    proto = Object.getPrototypeOf(proto);
                  }
                } catch (err) {
                  // Ignore errors, continue with other methods
                }
                
                // Method 6: Special handling for chalk-like objects that use proxies
                // Chalk defines colors as getters on a StylesAPI class and uses proxies
                try {
                  // Common chalk methods/colors
                  const chalkStyles = [
                    'rgb', 'hsl', 'hsv', 'hwb', 'ansi', 'ansi256', 'hex', 'keyword',
                    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray', 'grey',
                    'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright',
                    'bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta', 'bgCyan', 'bgWhite', 'bgGray', 'bgGrey',
                    'bgBlackBright', 'bgRedBright', 'bgGreenBright', 'bgYellowBright', 'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright',
                    'bold', 'dim', 'italic', 'underline', 'inverse', 'hidden', 'strikethrough', 'visible',
                    'reset'
                  ];
                  
                  if (objectName.toLowerCase().includes('chalk')) {
                    // For chalk and chalk-like objects, add common color methods
                    for (const style of chalkStyles) {
                      properties.add(style);
                    }
                  }
                } catch (err) {
                  // Ignore errors
                }
              } catch (err) {
                // Silently ignore overall extraction errors
              }
              
              // Filter by the partial property name
              const propertiesArray = Array.from(properties);
              const filtered = propertiesArray
                .filter(prop => prop.startsWith(partialProp))
                .map(prop => `${objectName}.${prop}`);
              
              return filtered;
            }
          } catch (error) {
            // Silently handle errors for better UX
          }
          
          return [];
        }
        
        // Continue with existing completion logic for other contexts...
        
        // Module completions for commands like cd, :go, etc.
        const moduleCommands = [
          "cd ", ":go ", ":goto ", ":module ", ":mod ", ":see ", "mkdir "
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
        
        // Context-specific completions for commands with subcommands/options
        
        // Handle :help command completion - show available commands
        if (line.trim().startsWith(':help ')) {
          const partialCmd = line.trim().substring(':help '.length);
          const commands = [
            "help", "quit", "exit", "env", "macros", 
            "go", "modules", "list", "find", "see", "remove",
            "verbose", "ast", "js", "doc", "cli"
          ];
          
          // Return matching commands for :help context
          return commands
            .filter(cmd => cmd.startsWith(partialCmd))
            .map(cmd => `:help ${cmd}`);
        }
        
        // Handle man command completion - similar to help
        if (line.trim().startsWith('man ')) {
          const partialCmd = line.trim().substring('man '.length);
          const commands = [
            "help", "quit", "exit", "env", "macros", 
            "go", "modules", "list", "find", "see", "remove",
            "cli", "ls", "cd", "pwd", "mkdir", "man", "rm"
          ];
          
          // Return matching commands for man context
          return commands
            .filter(cmd => cmd.startsWith(partialCmd))
            .map(cmd => `man ${cmd}`);
        }
        
        // Handle :see <module>:
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
            "go", "modules", "list", "see", "remove",
            "find", "verbose", "ast", "js", "doc", "cli"
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
            // Get symbols from this module
            const moduleSymbols = await evaluator.listModuleSymbols(moduleName);
            // Add them to our symbols list
            if (moduleSymbols.length > 0) {
              symbols.push(...moduleSymbols);
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