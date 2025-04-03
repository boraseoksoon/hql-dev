// src/s-exp/repl-environment.ts - A stateful environment for the REPL

import { Environment, Value } from "../environment.ts";
import { Logger } from "../logger.ts";

/**
 * Options for the REPL Environment
 */
export interface REPLEnvironmentOptions {
  verbose?: boolean;
}

/**
 * Pattern constants for code analysis
 */
const PATTERNS = {
  VARIABLE_DECLARATION: /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,
  FUNCTION_DECLARATION: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
  FUNCTION_OR_VAR_START: /^(function |const |let |var )/,
  RETURN_OR_DECLARATION: /^(const|let|var|return)\s+/,
  VARIABLE_NAME_CAPTURE: /^(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/,
  EXPRESSION_OPERATORS: /[\(\)\+\-\*\/]/
};

/**
 * A stateful environment specifically for the REPL.
 * Extends the core Environment with features for maintaining state
 * between evaluations.
 */
export class REPLEnvironment {
  // The HQL environment for parsing, macros, and transpilation
  hqlEnv: Environment;
  
  // JavaScript runtime environment to maintain state between evaluations
  private jsEnv: Record<string, Value> = {};
  
  // Track defined symbols to maintain across evaluations
  private definitions: Set<string> = new Set();
  
  // Logger for debugging
  private logger: Logger;

  constructor(hqlEnv: Environment, options: REPLEnvironmentOptions = {}) {
    this.hqlEnv = hqlEnv;
    this.logger = new Logger(options.verbose || false);
  }

  /**
   * Get the value of a symbol from the JavaScript environment
   */
  getJsValue(name: string): Value {
    return this.jsEnv[name];
  }

  /**
   * Set a value in the JavaScript environment
   */
  setJsValue(name: string, value: Value): void {
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
    const definitions: string[] = [];
    
    // Process variable declarations
    for (const match of code.matchAll(PATTERNS.VARIABLE_DECLARATION)) {
      if (match[1]) {
        definitions.push(match[1]);
      }
    }
    
    // Process function declarations
    for (const match of code.matchAll(PATTERNS.FUNCTION_DECLARATION)) {
      if (match[1]) {
        definitions.push(match[1]);
      }
    }
    
    return definitions;
  }
  
  /**
   * Add code to register definitions in the REPL environment
   */
  private createRegistrationCode(definitions: string[]): string {
    let registerCode = "\n\n// Register definitions\n";
    for (const def of definitions) {
      registerCode += `if (typeof ${def} !== 'undefined') { replEnv.setJsValue("${def}", ${def}); }\n`;
    }
    return registerCode;
  }
  
  /**
   * Process the last expression to ensure it returns a value
   */
  private processLastExpression(code: string): string {
    // For expressions, capture the result by wrapping the last line
    const lines = code.split('\n');
    let lastNonEmptyIndex = lines.length - 1;
    
    // Find the last non-empty line
    while (lastNonEmptyIndex >= 0 && !lines[lastNonEmptyIndex].trim()) {
      lastNonEmptyIndex--;
    }
    
    if (lastNonEmptyIndex < 0) return code;
    
    const lastLine = lines[lastNonEmptyIndex].trim();
    if (!lastLine) return code;
    
    // If the last line is an expression (not a statement ending with semicolon)
    if (this.isNonDeclarationExpression(lastLine)) {
      // Replace with a return statement
      lines[lastNonEmptyIndex] = `return ${lastLine};`;
      this.debug(`Adding return for expression: ${lastLine}`);
    }
    else if (this.isExpressionWithSemicolon(lastLine)) {
      // It's an expression with semicolon, add return statement
      lines[lastNonEmptyIndex] = `return ${lastLine.substring(0, lastLine.length - 1)};`;
      this.debug(`Adding return for expression with semicolon: ${lastLine}`);
    }
    else if (this.isVariableDeclaration(lastLine)) {
      // If it's a variable declaration, add code to return its value
      const match = lastLine.match(PATTERNS.VARIABLE_NAME_CAPTURE);
      if (match && match[2]) {
        const varName = match[2];
        lines.push(`return ${varName};`);
        this.debug(`Adding return for variable: ${varName}`);
      }
    }
    else if (this.mightBeExpression(lastLine)) {
      // For any other expression, assume it's a statement and wrap it
      // Strip any trailing semicolon
      let expression = lastLine;
      if (expression.endsWith(';')) {
        expression = expression.substring(0, expression.length - 1);
      }
      
      lines[lastNonEmptyIndex] = `return ${expression};`;
      this.debug(`Adding return for general expression: ${expression}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Helpers for type checking expressions
   */
  private isNonDeclarationExpression(line: string): boolean {
    return !line.endsWith(';') && 
           !line.startsWith('function ') && 
           !line.match(PATTERNS.RETURN_OR_DECLARATION);
  }
  
  private isExpressionWithSemicolon(line: string): boolean {
    return line.endsWith(';') &&
           !line.startsWith('function ') && 
           !line.match(PATTERNS.RETURN_OR_DECLARATION);
  }
  
  private isVariableDeclaration(line: string): boolean {
    return !!line.match(PATTERNS.VARIABLE_NAME_CAPTURE);
  }
  
  private mightBeExpression(line: string): boolean {
    return PATTERNS.EXPRESSION_OPERATORS.test(line);
  }
  
  /**
   * Debug logging helper
   */
  private debug(message: string): void {
    if (this.logger.isVerbose) {
      console.log(`DEBUG: ${message}`);
    }
  }
  
  /**
   * Prepare JavaScript code for evaluation in the REPL
   * This transforms the code to capture the result of the last expression
   * and register any defined symbols in the environment
   */
  prepareJsForRepl(jsCode: string): string {
    // Extract definitions that should be captured in the environment
    const definitions = this.extractDefinitions(jsCode);
    this.debug(`Extracted definitions: ${JSON.stringify(definitions)}`);
    
    // Check if it's a function definition or variable declaration
    if (PATTERNS.FUNCTION_OR_VAR_START.test(jsCode.trim())) {
      // For function/variable definitions, add the code as is, then register the definitions
      const resultCode = jsCode + this.createRegistrationCode(definitions);
      this.debug("Handling function/variable definition");
      return resultCode;
    }
    
    // Process the code to ensure the last expression returns a value
    const processedCode = this.processLastExpression(jsCode);
    
    // Join everything back together and add the registration code
    const resultCode = processedCode + this.createRegistrationCode(definitions);
    
    this.debug(`Final prepared code: ${resultCode}`);
    return resultCode;
  }
} 