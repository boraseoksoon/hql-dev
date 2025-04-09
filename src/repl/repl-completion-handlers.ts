// src/repl/repl-completion-handlers.ts
// Completion handlers for the REPL

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";

/**
 * Enumeration of symbol types for completions
 */
export enum SymbolType {
  Variable = "variable",
  Property = "property",
  Function = "function",
  Macro = "macro",
  Module = "module",
  Option = "option",
  Unknown = "unknown"
}

/**
 * Interface for completion items
 */
export interface CompletionItem {
  name: string;
  type: SymbolType;
  fullName?: string;
  parentObject?: string;
  context?: string; // Indicates the context where this completion is used (e.g., 'see')
}

/**
 * Abstract base class for all completion handlers
 */
export abstract class CompletionHandler {
  constructor(protected evaluator: ModuleAwareEvaluator) {}
  
  /**
   * Get completions for the current input at the cursor position
   */
  abstract getCompletions(
    input: string, 
    cursorPos: number, 
    currentModule: string
  ): Promise<CompletionItem[]>;
}

/**
 * Utility functions for property extraction and completion context
 */
export const CompletionUtils = {
  /**
   * Extract the current word at the cursor position for tab completion
   */
  getCurrentWordInContext(line: string, cursorPos: number): string {
    if (cursorPos <= 0 || cursorPos > line.length) return "";
    
    // Get the part of the line up to the cursor
    const beforeCursor = line.substring(0, cursorPos);
    
    // Handle case when cursor is immediately after an opening parenthesis
    if (beforeCursor.endsWith('(')) {
      return "";
    }
    
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
  },

  /**
   * Check if we're in the middle of a property access expression: obj.prop
   */
  getPropertyAccessContext(line: string, cursorPos: number): { objectName: string; partialProp: string } | null {
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
};

/**
 * Handles property completions for object property access (obj.prop)
 */
export class PropertyCompletionHandler extends CompletionHandler {
  async getCompletions(input: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    // Get property access context
    const context = CompletionUtils.getPropertyAccessContext(input, cursorPos);
    if (!context) return [];
    
    // Try to evaluate the object
    try {
      // Get the REPL environment to access the object
      const replEnv = this.evaluator.getREPLEnvironment();
      let obj;
      
      try {
        // First try to get the object from the environment directly
        obj = replEnv.getJsValue(context.objectName, currentModule);
      } catch (err) {
        // If direct access fails, try to evaluate the expression
        const result = await this.evaluator.evaluate(context.objectName);
        obj = result.value;
      }
      
      if (obj === undefined || obj === null) return [];
      
      // Extract properties from the object
      const properties = this.extractProperties(obj, context.objectName);
      
      // Filter properties based on the partial property name
      return properties.filter(prop => 
        prop.name.toLowerCase().startsWith(context.partialProp.toLowerCase())
      );
    } catch (err) {
      return [];
    }
  }
  
  /**
   * Extract all properties from an object with their types
   */
  private extractProperties(obj: any, objectName: string): CompletionItem[] {
    if (obj === null || obj === undefined) return [];
    
    // Set to store unique property names
    const properties = new Set<string>();
    const result: CompletionItem[] = [];
    
    try {
      // Extract properties using multiple methods to ensure comprehensive coverage
      this.extractPropertiesFromObject(obj, properties);
      
      // Create completion items with types
      for (const prop of properties) {
        let type = SymbolType.Property;
        
        // Try to determine if it's a method
        try {
          const value = obj[prop];
          if (typeof value === 'function') {
            type = SymbolType.Function;
          } else if (value && typeof value === 'object') {
            // Check if it's a macro or other callable object
            if ('transformSExp' in value) {
              type = SymbolType.Macro;
            } else if ('__call__' in value && typeof value.__call__ === 'function') {
              type = SymbolType.Function;
            }
          }
        } catch (err) {
          // If we can't access it, assume it's a property
        }
        
        result.push({
          name: prop,
          type,
          fullName: `${objectName}.${prop}`,
          parentObject: objectName
        });
      }
    } catch (err) {
      // Ignore any errors during extraction
    }
    
    return result;
  }
  
  /**
   * Use various methods to extract properties from an object
   */
  private extractPropertiesFromObject(obj: any, properties: Set<string>): void {
    // Skip null and undefined
    if (obj === null || obj === undefined) return;
    
    // Method 1: Direct Object.keys
    try {
      const keys = Object.keys(obj);
      for (const key of keys) {
        if (!key.startsWith('_') && !key.startsWith('__')) {
          properties.add(key);
        }
      }
    } catch (err) {
      // Continue if this method fails
    }
    
    // Method 2: Object.getOwnPropertyNames
    try {
      const ownProps = Object.getOwnPropertyNames(obj);
      for (const prop of ownProps) {
        if (!prop.startsWith('_') && !prop.startsWith('__')) {
          properties.add(prop);
        }
      }
    } catch (err) {
      // Continue if this method fails
    }
    
    // Method 3: Get method names from the prototype chain
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
      // Continue if this method fails
    }
    
    // Method 4: Handle proxy and callable objects
    try {
      if (typeof obj === 'function' || typeof obj === 'object') {
        // For function objects, try to invoke and get properties from result
        if (typeof obj === 'function') {
          try {
            const testResult = obj('test');
            if (testResult && typeof testResult === 'object') {
              // Extract properties from the result
              this.extractPropertiesFromObject(testResult, properties);
            }
          } catch (err) {
            // Ignore errors from invoking the function
          }
        }
      }
    } catch (err) {
      // Continue if this method fails
    }
  }
}

/**
 * Handles symbol completions in the current scope
 */
export class SymbolCompletionHandler extends CompletionHandler {
  async getCompletions(input: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    try {
      // Get the current word being typed
      const currentWord = CompletionUtils.getCurrentWordInContext(input, cursorPos);
      if (!currentWord) return [];
      
      // Check if we're in a CLI command context
      const isCliCommand = input.trim().startsWith(':') || 
                          input.trim().startsWith('ls ') ||
                          input.trim().startsWith('cd ') || 
                          input.trim().startsWith('mkdir ');
      
      // Get all symbols from current module
      const symbols = await this.evaluator.listModuleSymbols(currentModule);
      
      // Get values and determine types
      const completions: CompletionItem[] = [];
      const replEnv = this.evaluator.getREPLEnvironment();
      
      for (const symbol of symbols) {
        if (!symbol.toLowerCase().startsWith(currentWord.toLowerCase())) continue;
        
        try {
          const value = replEnv.getJsValue(symbol, currentModule);
          let type = SymbolType.Variable;
          
          // Better type detection
          if (typeof value === 'function') {
            type = SymbolType.Function;
          } else if (value && typeof value === 'object') {
            if ('transformSExp' in value) {
              type = SymbolType.Macro;
            }
            // Check if it's a callable object with __call__ method
            else if ('__call__' in value && typeof value.__call__ === 'function') {
              type = SymbolType.Function;
            }
          }
          
          completions.push({ 
            name: symbol, 
            type,
            context: isCliCommand ? 'cli-command' : 'code'
          });
        } catch (e) {
          completions.push({ 
            name: symbol, 
            type: SymbolType.Unknown,
            context: isCliCommand ? 'cli-command' : 'code'
          });
        }
      }
      
      return completions;
    } catch (error) {
      return [];
    }
  }
}

/**
 * Handles completions for special forms and language keywords
 */
export class SpecialFormCompletionHandler extends CompletionHandler {
  // Special forms in the language
  private specialForms = [
    "if", "cond", "do", "let", "fn", "macro", "import", "export", 
    "module", "quote", "quasiquote", "unquote", "unquote-splicing",
    "set", "def", "defn", "defmacro", "try", "catch", "finally",
    "throw", "new", "instanceof", "typeof", "print", "pprint"
  ];
  
  async getCompletions(input: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    try {
      // Get the current word being typed
      const currentWord = CompletionUtils.getCurrentWordInContext(input, cursorPos);
      if (!currentWord) return [];
      
      // Check if we're in a CLI command context
      const isCliCommand = input.trim().startsWith(':') || 
                          input.trim().startsWith('ls ') ||
                          input.trim().startsWith('cd ') || 
                          input.trim().startsWith('mkdir ');
      
      // Find matching special forms
      return this.specialForms
        .filter(form => form.toLowerCase().startsWith(currentWord.toLowerCase()))
        .map(form => ({ 
          name: form, 
          type: SymbolType.Function,
          // Mark CLI commands to avoid adding parentheses
          context: isCliCommand ? 'cli-command' : 'code'
        }));
    } catch (error) {
      return [];
    }
  }
}

/**
 * Handles completions for command options (like ls -all, ls -m)
 */
export class CommandOptionCompletionHandler extends CompletionHandler {
  // Define command options
  private commandOptions: Record<string, string[]> = {
    'ls': ['all', 'm', 'modules'],
    ':see': ['source', 'js'],
    ':help': ['all'],
    ':go': ['module'],
    ':modules': ['all'],
    ':list': ['all', 'modules'],
    ':remove': ['module', 'symbol'],
    ':doc': ['module', 'symbol'],
    'mkdir': ['p'],
    'rm': ['r', 'f', 'rf'],
    'find': ['all', 'modules', 'symbols'],
  };
  
  // Command aliases - maps command names to their primary name
  private commandAliases: Record<string, string> = {
    ':list': 'ls',
    ':modules': 'ls',
  };
  
  // List of all CLI commands for basic command completion
  private cliCommands = [
    'ls', 'cd', 'pwd', 'find', 'mkdir', 'man', 'rm'
  ];
  
  // List of all REPL commands
  private replCommands = [
    ':see', ':go', ':help', ':modules', ':list', ':remove', ':doc',
    ':quit', ':exit', ':env', ':verbose', ':ast', ':js', ':cli'
  ];
  
  async getCompletions(input: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    try {
      // Case 1: Handle empty input or single character input for base commands
      if (input.trim().length <= 1) {
        const allCommands = [...this.cliCommands, ...this.replCommands];
        return allCommands
          .filter(cmd => cmd.startsWith(input.trim()))
          .map(cmd => ({
            name: cmd,
            type: SymbolType.Function,
            context: 'cli-command'
          }));
      }
      
      // Extract the base command from the input (strip options)
      const baseCommandMatch = input.trim().match(/^([^\s]+)(?:\s+-\w+)*\s*$/);
      const baseCommand = baseCommandMatch ? baseCommandMatch[1] : "";
      
      // Case 2: Check if we're after a command followed by a dash (e.g., "ls -")
      let match = input.trim().match(/^([^\s]+)\s+-([^-\s]*)$/);
      if (match) {
        const [, command, partialOption] = match;
        
        // Get the normalized command name (handle aliases)
        const normalizedCommand = this.commandAliases[command] || command;
        
        // Get available options for this command
        const options = this.commandOptions[normalizedCommand] || [];
        if (options.length === 0) return [];
        
        // Filter options based on the partial option
        return options
          .filter(opt => opt.startsWith(partialOption))
          .map(opt => ({
            name: `${command} -${opt}`,
            type: SymbolType.Option,
            context: 'cli-command'
          }));
      }

      // Case 3: Handle command with space but no dash yet (e.g., "ls ")
      match = input.trim().match(/^([^\s]+)$/);
      const spaceMatch = input.match(/^([^\s]+)\s+$/);
      
      if (spaceMatch) {
        const command = spaceMatch[1];
        // Get the normalized command name
        const normalizedCommand = this.commandAliases[command] || command;
        
        // Check if we have options for this command
        const options = this.commandOptions[normalizedCommand] || [];
        
        if (options.length > 0) {
          // Return all options as completions with the command prefix
          return options.map(opt => ({
            name: `${command} -${opt}`,
            type: SymbolType.Option,
            context: 'cli-command'
          }));
        }
      }
      // Case 4: Handle just the command name (like "ls")
      else if (match) {
        const [, command] = match;
        
        // Get the normalized command name
        const normalizedCommand = this.commandAliases[command] || command;
        
        // Check if this is a full CLI command or REPL command
        const isFullCommand = this.cliCommands.includes(command) || 
                             this.replCommands.includes(command) ||
                             Object.keys(this.commandOptions).includes(normalizedCommand);
        
        // If it's a basic CLI command or known command with options
        if (isFullCommand) {
          // Check if we have options for this command
          const options = this.commandOptions[normalizedCommand] || [];
          if (options.length > 0) {
            // Suggest all available options
            return options.map(opt => ({
              name: `${command} -${opt}`,
              type: SymbolType.Option,
              context: 'cli-command'
            }));
          }
        }
        
        // If this is a partial CLI command, complete it
        if (command.length < 5) {
          // Check for CLI commands first
          const matchingCliCommands = this.cliCommands
            .filter(cmd => cmd.startsWith(command));
            
          if (matchingCliCommands.length > 0) {
            return matchingCliCommands.map(cmd => ({
              name: cmd,
              type: SymbolType.Function,
              context: 'cli-command'
            }));
          }
          
          // Then check for REPL commands
          const matchingReplCommands = this.replCommands
            .filter(cmd => cmd.startsWith(command));
          
          if (matchingReplCommands.length > 0) {
            return matchingReplCommands.map(cmd => ({
              name: cmd,
              type: SymbolType.Function,
              context: 'cli-command'
            }));
          }
        }
      }
      // Case 5: Handle a command with existing options (cycling through options)
      else if (baseCommand) {
        // Get the normalized command name
        const normalizedCommand = this.commandAliases[baseCommand] || baseCommand;
        
        // Check if we have options for this command
        const options = this.commandOptions[normalizedCommand] || [];
        if (options.length > 0) {
          // Return all options for cycling
          return options.map(opt => ({
            name: `${baseCommand} -${opt}`,
            type: SymbolType.Option,
            context: 'cli-command'
          }));
        }
      }
      
      return [];
    } catch (error) {
      return [];
    }
  }
}

// Export the utility functions directly
export const { getCurrentWordInContext, getPropertyAccessContext } = CompletionUtils; 