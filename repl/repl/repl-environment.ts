// src/repl/repl-environment.ts - Enhanced environment for REPL

import { Environment, Value } from "@core/environment.ts";
import { Logger, globalLogger as logger } from "@core/logger.ts";
import { SExp } from "@s-exp/types.ts";

export interface REPLEnvironmentOptions {
  verbose?: boolean;
  historySize?: number;
}

// Type definitions for module exports
export interface ModuleExports {
  [key: string]: Value;
}

const PATTERNS = {
  VARIABLE_DECLARATION: /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,
  FUNCTION_DECLARATION: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
  FUNCTION_OR_VAR_START: /^(function |const |let |var )/,
  RETURN_OR_DECLARATION: /^(const|let|var|return)\s+/,
  VARIABLE_NAME_CAPTURE: /^(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/,
  EXPRESSION_OPERATORS: /[\(\)\+\-\*\/]/
};

/**
 * Enhanced environment for the REPL that manages JavaScript values,
 * module references, and code preparation
 */
export class REPLEnvironment {
  public hqlEnv: Environment;
  
  // JavaScript environment to store values for evaluation
  private jsEnv: Record<string, Value> = {};
  
  // Set of defined symbols for tracking
  private definitions: Set<string> = new Set();
  
  // Track modules so we can persist them between evaluations
  private modules: Map<string, Value> = new Map();
  
  // Track which module each symbol belongs to
  private symbolModules: Map<string, string> = new Map();
  
  // Cache of S-expression evaluations for performance
  private evalCache: Map<string, Value> = new Map();
  
  // Maximum eval cache size to avoid memory leaks
  private maxEvalCacheSize = 100;
  
  // Current active module
  private currentModule = "global";
  
  // Logger for debugging
  private logger: Logger;

  constructor(hqlEnv: Environment, options: REPLEnvironmentOptions = {}) {
    this.hqlEnv = hqlEnv;
    this.logger = logger;
    
    // Set maximum cache size if provided
    if (options.historySize && options.historySize > 0) {
      this.maxEvalCacheSize = options.historySize;
    }
    
    this.debug("REPL environment initialized");
  }

  /**
   * Set the current active module
   */
  setCurrentModule(moduleName: string): void {
    this.currentModule = moduleName;
    this.debug(`REPLEnvironment active module set to: ${moduleName}`);
  }
  
  /**
   * Get the current active module
   */
  getCurrentModule(): string {
    return this.currentModule;
  }

  /**
   * Create a namespaced symbol name for internal use
   * This prevents conflicts between modules
   */
  private getNamespacedName(name: string, moduleName?: string): string {
    const module = moduleName || this.currentModule;
    return `${module}:${name}`;
  }

  /**
   * Get a JavaScript value by name
   */
  getJsValue(name: string, moduleName?: string): Value {
    const namespacedName = this.getNamespacedName(name, moduleName);
    return this.jsEnv[namespacedName];
  }

  /**
   * Set a JavaScript value and define it in the HQL environment
   */
  setJsValue(name: string, value: Value, moduleName?: string): void {
    const module = moduleName || this.currentModule;
    const namespacedName = this.getNamespacedName(name, module);
    
    this.jsEnv[namespacedName] = value;
    this.definitions.add(namespacedName);
    this.symbolModules.set(name, module);
    
    // Define in HQL environment with module prefix
    this.hqlEnv.define(namespacedName, value);
    
    // Also define with the original name in the current module's context
    // This allows direct lookup within a module
    if (module === this.currentModule) {
      this.hqlEnv.define(name, value);
    }
    
    // If this looks like a module (object with functions/properties), also track it in modules
    if (value !== null && typeof value === 'object') {
      this.modules.set(name, value);
      this.debug(`Registered module '${name}' in REPL environment`);
    }
    
    this.logger.debug(`Defined '${name}' in module '${module}'`);
  }

  /**
   * Check if a JavaScript value exists in a specific module
   */
  hasJsValue(name: string, moduleName?: string): boolean {
    const namespacedName = this.getNamespacedName(name, moduleName);
    return this.definitions.has(namespacedName);
  }

  /**
   * Check if a symbol exists in any module
   */
  hasSymbolInAnyModule(name: string): boolean {
    return this.symbolModules.has(name);
  }

  /**
   * Get all modules where a symbol is defined
   */
  getSymbolModules(name: string): string[] {
    const modules: string[] = [];
    for (const [symbol, module] of this.symbolModules.entries()) {
      if (symbol === name) {
        modules.push(module);
      }
    }
    return modules;
  }

  /**
   * Remove a JavaScript value
   */
  removeJsValue(name: string, moduleName?: string): void {
    const module = moduleName || this.currentModule;
    const namespacedName = this.getNamespacedName(name, module);
    
    delete this.jsEnv[namespacedName];
    this.definitions.delete(namespacedName);
    
    // Remove the module tracking for this symbol
    if (this.symbolModules.get(name) === module) {
      this.symbolModules.delete(name);
    }
    
    // Set to null in HQL environment to effectively remove
    this.hqlEnv.define(namespacedName, null);
    if (module === this.currentModule) {
      this.hqlEnv.define(name, null);
    }
    
    this.modules.delete(name);
    this.logger.debug(`Removed '${name}' from module '${module}'`);
  }

  /**
   * Get a list of all defined symbols in the current module
   */
  getDefinedSymbols(moduleName?: string): string[] {
    const module = moduleName || this.currentModule;
    const symbols: string[] = [];
    
    for (const name of this.definitions) {
      // Extract the original symbol name from the namespaced version
      const parts = name.split(':');
      if (parts.length === 2 && parts[0] === module) {
        symbols.push(parts[1]);
      }
    }
    
    return symbols;
  }
  
  /**
   * Get all tracked modules
   */
  getModules(): Map<string, Value> {
    return new Map(this.modules);
  }
  
  /**
   * Get a module by name
   */
  getModule(name: string): Value | undefined {
    return this.modules.get(name);
  }
  
  /**
   * Check if a module is defined
   */
  hasModule(name: string): boolean {
    return this.modules.has(name);
  }
  
  /**
   * Import module exports into the REPL environment
   */
  importModuleExports(moduleName: string, moduleObj: Record<string, unknown>): void {
    // Register the module itself
    this.setJsValue(moduleName, moduleObj as Value);
    
    // If it has named exports, register each of them
    for (const [key, value] of Object.entries(moduleObj)) {
      if (key !== 'default') {
        const exportName = `${moduleName}_${key}`;
        this.setJsValue(exportName, value as Value);
        this.debug(`Registered export '${exportName}' from module '${moduleName}'`);
      }
    }
    
    this.debug(`Imported module '${moduleName}' with ${Object.keys(moduleObj).length} exports`);
  }

  /**
   * Create a JavaScript evaluation context with all defined symbols
   */
  createEvalContext(): string {
    // Get current module symbols and create declarations
    const currentModule = this.currentModule;
    const currentModuleSymbols = this.getDefinedSymbols(currentModule);
    
    // Create declarations for symbols in the current module
    const symbolDeclarations = currentModuleSymbols
      .map((name) => `const ${name} = replEnv.getJsValue("${name}", "${currentModule}");`)
      .join("\n");
    
    // Set up all modules
    const moduleSetup = Array.from(this.modules.keys())
      .map((name) => {
        // Get the module that this name belongs to
        const moduleNamespace = this.symbolModules.get(name) || currentModule;
        return `globalThis.${name} = replEnv.getJsValue("${name}", "${moduleNamespace}");`;
      })
      .join("\n");
    
    return symbolDeclarations + "\n" + moduleSetup;
  }

  /**
   * Extract defined symbols from JavaScript code
   */
  extractDefinitions(code: string): string[] {
    const defs = new Set<string>();
    
    // Check for variable declarations
    for (const match of code.matchAll(PATTERNS.VARIABLE_DECLARATION)) {
      if (match[1]) defs.add(match[1]);
    }
    
    // Check for function declarations
    for (const match of code.matchAll(PATTERNS.FUNCTION_DECLARATION)) {
      if (match[1]) defs.add(match[1]);
    }
    
    // Check for arrow function assignments
    const arrowFnMatch = code.match(/const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/);
    if (arrowFnMatch && arrowFnMatch[1]) {
      defs.add(arrowFnMatch[1]);
    }
    
    return Array.from(defs);
  }

  /**
   * Create code that registers all extracted definitions
   */
  private createRegistrationCode(definitions: string[]): string {
    const currentModule = this.currentModule;
    
    return "\n\n// Register definitions\n" +
      definitions
        .map(
          (def) =>
            `if (typeof ${def} !== 'undefined') { replEnv.setJsValue("${def}", ${def}, "${currentModule}"); }`
        )
        .join("\n");
  }

  /**
   * Check if a value is cacheable
   */
  private isValueCacheable(value: unknown): boolean {
    const valueType = typeof value;
    // Only cache primitives and small objects
    return (
      valueType === 'string' ||
      valueType === 'number' ||
      valueType === 'boolean' ||
      valueType === 'undefined' ||
      value === null ||
      (valueType === 'object' && 
       value !== null && 
       Object.keys(value as object).length < 10)
    );
  }
  
  /**
   * Cache a S-expression evaluation result
   */
  cacheEvaluation(expr: SExp | string, value: Value): void {
    // Convert SExp to string if needed
    const exprKey = typeof expr === 'string' ? expr : JSON.stringify(expr);
    
    // Only cache if the value is cacheable
    if (this.isValueCacheable(value)) {
      // Limit cache size
      if (this.evalCache.size >= this.maxEvalCacheSize) {
        // Remove oldest entry (first key)
        const firstKey = this.evalCache.keys().next().value;
        if (firstKey) {
          this.evalCache.delete(firstKey);
        }
      }
      
      this.evalCache.set(exprKey, value);
      
      // Safe substring to handle possible null or undefined
      const shortExprLength = Math.min(exprKey.length, 30);
      const shortExpr = shortExprLength === exprKey.length 
        ? exprKey 
        : exprKey.substring(0, shortExprLength) + '...';
      
      this.debug(`Cached evaluation result for expression: ${shortExpr}`);
    }
  }
  
  /**
   * Get a cached evaluation result
   */
  getCachedEvaluation(expr: SExp | string): Value | undefined {
    const exprKey = typeof expr === 'string' ? expr : JSON.stringify(expr);
    return this.evalCache.get(exprKey);
  }
  
  /**
   * Check if an evaluation is cached
   */
  hasEvaluationCached(expr: SExp | string): boolean {
    const exprKey = typeof expr === 'string' ? expr : JSON.stringify(expr);
    return this.evalCache.has(exprKey);
  }
  
  /**
   * Clear evaluation cache
   */
  clearEvalCache(): void {
    this.evalCache.clear();
    this.debug("Evaluation cache cleared");
  }

  /**
   * Process the last expression to add return statement if needed
   */
  private processLastExpression(code: string): string {
    const lines = code.split("\n");
    let lastIndex = lines.length - 1;
    while (lastIndex >= 0 && !lines[lastIndex].trim()) lastIndex--;
    if (lastIndex < 0) return code;
    const lastLine = lines[lastIndex].trim();
    if (!lastLine) return code;
    if (
      !lastLine.endsWith(";") &&
      !lastLine.startsWith("function ") &&
      !PATTERNS.RETURN_OR_DECLARATION.test(lastLine)
    ) {
      lines[lastIndex] = `return ${lastLine};`;
      this.debug(`Adding return for expression: ${lastLine}`);
    } else if (
      lastLine.endsWith(";") &&
      !lastLine.startsWith("function ") &&
      !PATTERNS.RETURN_OR_DECLARATION.test(lastLine)
    ) {
      lines[lastIndex] = `return ${lastLine.slice(0, -1)};`;
      this.debug(`Adding return for expression with semicolon: ${lastLine}`);
    } else if (PATTERNS.VARIABLE_NAME_CAPTURE.test(lastLine)) {
      const match = lastLine.match(PATTERNS.VARIABLE_NAME_CAPTURE);
      if (match && match[2]) {
        const varName = match[2];
        lines.push(`return ${varName};`);
        this.debug(`Adding return for variable: ${varName}`);
      }
    } else if (PATTERNS.EXPRESSION_OPERATORS.test(lastLine)) {
      const expr = lastLine.endsWith(";") ? lastLine.slice(0, -1) : lastLine;
      lines[lastIndex] = `return ${expr};`;
      this.debug(`Adding return for general expression: ${expr}`);
    }
    return lines.join("\n");
  }

  /**
   * Log debug message if verbose
   */
  private debug(message: string): void {
    if (this.logger.isVerbose) {
      this.logger.debug(message);
    }
  }

  /**
   * Prepare JavaScript code for REPL evaluation
   */
  prepareJsForRepl(jsCode: string): string {
    const definitions = this.extractDefinitions(jsCode);
    this.debug(`Extracted definitions: ${JSON.stringify(definitions)}`);
    let resultCode = jsCode;
    if (PATTERNS.FUNCTION_OR_VAR_START.test(jsCode.trim())) {
      resultCode += this.createRegistrationCode(definitions);
      this.debug("Handling function/variable definition");
    } else {
      resultCode = this.processLastExpression(jsCode) + this.createRegistrationCode(definitions);
    }
    this.debug(`Final prepared code: ${resultCode}`);
    return resultCode;
  }
}