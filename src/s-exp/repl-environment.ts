// src/s-exp/repl-environment.ts - A stateful environment for the REPL

import { Environment } from "../environment.ts";
import { Logger } from "../logger.ts";

/**
 * A stateful environment specifically for the REPL.
 * Extends the core Environment with features for maintaining state
 * between evaluations.
 */
export class REPLEnvironment {
  // The HQL environment for parsing, macros, and transpilation
  hqlEnv: Environment;
  
  // JavaScript runtime environment to maintain state between evaluations
  private jsEnv: Record<string, any> = {};
  
  // Track defined symbols to maintain across evaluations
  private definitions: Set<string> = new Set();
  
  // Logger for debugging
  private logger: Logger;

  constructor(hqlEnv: Environment, options: { verbose?: boolean } = {}) {
    this.hqlEnv = hqlEnv;
    this.logger = new Logger(options.verbose || false);
  }

  /**
   * Get the value of a symbol from the JavaScript environment
   */
  getJsValue(name: string): any {
    return this.jsEnv[name];
  }

  /**
   * Set a value in the JavaScript environment
   */
  setJsValue(name: string, value: any): void {
    this.jsEnv[name] = value;
    this.definitions.add(name);
    
    // Also register in the HQL environment for symbol resolution
    this.hqlEnv.define(name, value);
    
    this.logger.debug(`Defined '${name}' in REPL environment`);
  }

  /**
   * Check if a symbol is defined in the JavaScript environment
   */
  hasJsValue(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * Remove a symbol from the JavaScript environment
   */
  removeJsValue(name: string): void {
    delete this.jsEnv[name];
    this.definitions.delete(name);
    // For Environment, we can set the value to null to effectively unregister it
    this.hqlEnv.define(name, null);
    this.logger.debug(`Removed '${name}' from REPL environment`);
  }

  /**
   * Get all defined symbols in the JavaScript environment
   */
  getDefinedSymbols(): string[] {
    return Array.from(this.definitions);
  }

  /**
   * Creates a JavaScript context with all defined variables
   * for evaling in the REPL
   */
  createEvalContext(): string {
    return Array.from(this.definitions)
      .map(name => `const ${name} = replEnv.getJsValue("${name}");`)
      .join("\n");
  }
  
  /**
   * Extract definitions from generated JavaScript code
   * and store them in the environment
   */
  extractDefinitions(code: string): string[] {
    // Match variable declarations that should be captured
    // This handles 'const', 'let', and 'var' declarations and function declarations
    const varMatches = code.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g);
    const funcMatches = code.matchAll(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g);
    
    const definitions: string[] = [];
    
    // Process variable declarations
    for (const match of varMatches) {
      if (match[1]) {
        definitions.push(match[1]);
      }
    }
    
    // Process function declarations
    for (const match of funcMatches) {
      if (match[1]) {
        definitions.push(match[1]);
      }
    }
    
    return definitions;
  }
  
  /**
   * Prepare JavaScript code for evaluation in the REPL
   * This transforms the code to capture the result of the last expression
   * and register any defined symbols in the environment
   */
  prepareJsForRepl(jsCode: string): string {
    // Extract definitions that should be captured in the environment
    const definitions = this.extractDefinitions(jsCode);
    
    if (this.logger.isVerbose) {
      console.log("DEBUG: Extracted definitions:", definitions);
    }
    
    let resultCode = "";
    
    // Function to add code to register definitions
    const addRegistrationCode = () => {
      let registerCode = "\n\n// Register definitions\n";
      for (const def of definitions) {
        registerCode += `if (typeof ${def} !== 'undefined') { replEnv.setJsValue("${def}", ${def}); }\n`;
      }
      return registerCode;
    };
    
    // Check if it's a function definition or variable declaration
    if (jsCode.trim().startsWith("function ") || /^(const|let|var)\s+/.test(jsCode.trim())) {
      // For function/variable definitions, add the code as is, then register the definitions
      resultCode = jsCode + addRegistrationCode();
      if (this.logger.isVerbose) {
        console.log("DEBUG: Handling function/variable definition");
      }
      return resultCode;
    }
    
    // For expressions, capture the result by wrapping the last line
    const lines = jsCode.split('\n');
    let lastNonEmptyIndex = lines.length - 1;
    
    // Find the last non-empty line
    while (lastNonEmptyIndex >= 0 && !lines[lastNonEmptyIndex].trim()) {
      lastNonEmptyIndex--;
    }
    
    if (lastNonEmptyIndex >= 0) {
      const lastLine = lines[lastNonEmptyIndex].trim();
      
      // If the last line is an expression (not a statement ending with semicolon)
      if (lastLine && !lastLine.endsWith(';') && 
          !lastLine.startsWith('function ') && 
          !lastLine.match(/^(const|let|var|return)\s+/)) {
        
        // Replace with a return statement
        lines[lastNonEmptyIndex] = `return ${lastLine};`;
        if (this.logger.isVerbose) {
          console.log(`DEBUG: Adding return for expression: ${lastLine}`);
        }
      }
      else if (lastLine && lastLine.endsWith(';') &&
               !lastLine.startsWith('function ') && 
               !lastLine.match(/^(const|let|var|return)\s+/)) {
        // It's an expression with semicolon, add return statement
        lines[lastNonEmptyIndex] = `return ${lastLine.substring(0, lastLine.length - 1)};`;
        if (this.logger.isVerbose) {
          console.log(`DEBUG: Adding return for expression with semicolon: ${lastLine}`);
        }
      }
      else if (lastLine && lastLine.match(/^(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/)) {
        // If it's a variable declaration, add code to return its value
        const match = lastLine.match(/^(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
        if (match && match[2]) {
          const varName = match[2];
          lines.push(`return ${varName};`);
          if (this.logger.isVerbose) {
            console.log(`DEBUG: Adding return for variable: ${varName}`);
          }
        }
      }
      else {
        // For any other expression, assume it's a statement and wrap it
        // Strip any trailing semicolon
        let expression = lastLine;
        if (expression.endsWith(';')) {
          expression = expression.substring(0, expression.length - 1);
        }
        
        // Replace the line with a return statement if it could have a value
        if (expression.includes('(') || 
            expression.includes('+') || 
            expression.includes('-') || 
            expression.includes('*') || 
            expression.includes('/')) {
          lines[lastNonEmptyIndex] = `return ${expression};`;
          if (this.logger.isVerbose) {
            console.log(`DEBUG: Adding return for general expression: ${expression}`);
          }
        }
      }
    }
    
    // Join everything back together and add the registration code
    resultCode = lines.join('\n') + addRegistrationCode();
    
    if (this.logger.isVerbose) {
      console.log("DEBUG: Final prepared code:", resultCode);
    }
    return resultCode;
  }
} 