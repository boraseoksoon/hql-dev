// src/repl/repl-completion-handlers.ts
// Specialized completion handlers for different contexts

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";

/**
 * Types of symbols in the system
 */
export enum SymbolType {
  Variable,
  Function,
  Macro,
  Module,
  Property,
  Unknown
}

/**
 * Determines the type of a given symbol for more intelligent completions
 */
export interface CompletionItem {
  name: string;       // The name of the symbol
  type: SymbolType;   // The type of the symbol
  fullName?: string;  // Full qualified name (for properties)
  parentObject?: string; // Parent object name (for properties)
}

/**
 * Base class for completion handlers
 */
export abstract class CompletionHandler {
  constructor(protected evaluator: ModuleAwareEvaluator) {}
  
  abstract getCompletions(input: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]>;
}

/**
 * Handles object property completions
 */
export class PropertyCompletionHandler extends CompletionHandler {
  async getCompletions(input: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    // Extract object name and partial property
    const propContext = getPropertyAccessContext(input, cursorPos);
    if (!propContext) return [];
    
    const { objectName, partialProp } = propContext;
    
    try {
      // Get object from environment
      const replEnv = this.evaluator.getREPLEnvironment();
      const obj = replEnv.getJsValue(objectName, currentModule);
      
      if (obj === undefined || obj === null) return [];
      
      // Extract all properties 
      const properties = await extractProperties(obj, objectName);
      
      // Filter by partial property
      return properties
        .filter(prop => prop.name.startsWith(partialProp))
        .map(prop => ({
          name: prop.name,
          type: prop.type,
          fullName: `${objectName}.${prop.name}`,
          parentObject: objectName
        }));
    } catch (error) {
      return [];
    }
  }
}

/**
 * Handles symbol completions
 */
export class SymbolCompletionHandler extends CompletionHandler {
  async getCompletions(input: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    try {
      // Get the current word being typed
      const currentWord = getCurrentWordInContext(input, cursorPos);
      if (!currentWord) return [];
      
      // Get all symbols from current module
      const symbols = await this.evaluator.listModuleSymbols(currentModule);
      
      // Get values and determine types
      const completions: CompletionItem[] = [];
      const replEnv = this.evaluator.getREPLEnvironment();
      
      for (const symbol of symbols) {
        if (!symbol.startsWith(currentWord)) continue;
        
        try {
          const value = replEnv.getJsValue(symbol, currentModule);
          let type = SymbolType.Variable;
          
          if (typeof value === 'function') {
            type = SymbolType.Function;
          } else if (value && typeof value === 'object' && 'transformSExp' in value) {
            type = SymbolType.Macro;
          }
          
          completions.push({ name: symbol, type });
        } catch (e) {
          completions.push({ name: symbol, type: SymbolType.Unknown });
        }
      }
      
      return completions;
    } catch (error) {
      return [];
    }
  }
}

/**
 * Handles completions for special forms
 */
export class SpecialFormCompletionHandler extends CompletionHandler {
  async getCompletions(input: string, cursorPos: number, currentModule: string): Promise<CompletionItem[]> {
    // Get the current word being typed
    const currentWord = getCurrentWordInContext(input, cursorPos);
    if (!currentWord) return [];
    
    // Special forms like if, let, lambda, etc.
    const specialForms = [
      { name: "if", type: SymbolType.Function },
      { name: "let", type: SymbolType.Function },
      { name: "lambda", type: SymbolType.Function },
      { name: "fn", type: SymbolType.Function },
      { name: "def", type: SymbolType.Function },
      { name: "defn", type: SymbolType.Function },
      { name: "import", type: SymbolType.Function },
      { name: "module", type: SymbolType.Function },
      { name: "do", type: SymbolType.Function },
      { name: "quote", type: SymbolType.Function },
      { name: "loop", type: SymbolType.Function },
      { name: "recur", type: SymbolType.Function },
      { name: "when", type: SymbolType.Function },
      { name: "unless", type: SymbolType.Function },
      { name: "cond", type: SymbolType.Function },
      { name: "case", type: SymbolType.Function },
      { name: "print", type: SymbolType.Function },
      { name: "println", type: SymbolType.Function },
    ];
    
    return specialForms.filter(form => form.name.startsWith(currentWord));
  }
}

/**
 * Extract all properties from an object including methods
 */
async function extractProperties(obj: any, objectName: string): Promise<CompletionItem[]> {
  const properties = new Set<string>();
  
  try {
    // Method 1: Try direct property access with descriptors
    try {
      const descriptors = Object.getOwnPropertyDescriptors(obj);
      for (const prop in descriptors) {
        if (!prop.startsWith('_') && !prop.startsWith('__')) {
          properties.add(prop);
        }
      }
    } catch (err) {
      // Ignore errors
    }
    
    // Method 2: Get enumerable properties using for...in
    try {
      for (const prop in obj as Record<string, unknown>) {
        if (!prop.startsWith('_') && !prop.startsWith('__')) {
          properties.add(prop);
        }
      }
    } catch (err) {
      // Ignore errors
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
      // Ignore errors
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
      // Ignore errors
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
      // Ignore errors
    }
    
    // Method 6: Special handling for proxy objects
    try {
      if (objectName.toLowerCase().includes('chalk') || typeof obj === 'function') {
        // This is likely a chalk-like object or some other proxy
        // Try to invoke the object as a function to see if it reveals properties
        try {
          const testResult = typeof obj === 'function' ? obj('test') : null;
          if (testResult && typeof testResult === 'object') {
            // Get properties from the result
            const resultProps = Object.getOwnPropertyNames(testResult);
            for (const prop of resultProps) {
              if (!prop.startsWith('_') && !prop.startsWith('__')) {
                properties.add(prop);
              }
            }
          }
        } catch (err) {
          // Ignore errors from trying to invoke the object
        }
      }
    } catch (err) {
      // Ignore errors
    }
  } catch (err) {
    // Ignore overall extraction errors
  }
  
  // Create completion items with types
  const result: CompletionItem[] = [];
  for (const prop of properties) {
    let type = SymbolType.Property;
    
    // Try to determine if it's a method
    try {
      const value = obj[prop];
      if (typeof value === 'function') {
        type = SymbolType.Function;
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
  
  return result;
}

/**
 * Extract the current word at the cursor position for tab completion
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