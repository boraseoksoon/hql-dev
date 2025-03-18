// src/unified-environment.ts
import { SExp, SList, SSymbol, isSymbol, isList, createSymbol, createList, createLiteral } from './s-exp/types.ts';
import { Logger } from './logger.ts';

/**
 * Type definition for macro functions
 */
export type MacroFn = (args: SExp[], env: Environment) => SExp;

/**
 * Unified Environment class that combines runtime and macro-expansion environments
 */
export class Environment {
  // Runtime variables store JavaScript values
  public variables = new Map<string, any>();
  
  // Macros store macro expansion functions
  public macros = new Map<string, MacroFn>();
  
  // Imported modules store module exports
  public moduleExports = new Map<string, Record<string, any>>();
  
  // Evaluation cache for storing pre-evaluated expressions
  private evalCache = new Map<string, any>();
  
  // Parent environment for lexical scoping
  private parent: Environment | null;
  
  // Logger for debugging
  private logger: Logger;
  
  // Global environment singleton
  private static globalEnv: Environment | null = null;

  /**
   * Initialize a global unified environment
   */
  static async initializeGlobalEnv(options: { verbose?: boolean } = {}): Promise<Environment> {
    if (Environment.globalEnv) {
      return Environment.globalEnv;
    }
    
    const env = new Environment(null, new Logger(options.verbose));
    
    // Initialize built-in functions and macros
    env.initializeBuiltins();
    
    env.logger.debug("Global environment initialized");
    Environment.globalEnv = env;
    return env;
  }
  
  /**
   * Create a new environment
   */
  constructor(parent: Environment | null = null, logger?: Logger) {
    this.parent = parent;
    this.logger = logger || new Logger(false);
  }

  /**
   * Initialize built-in functions and operators
   */
  initializeBuiltins(): void {
    // Math operations
    this.define('+', (...args: number[]) => args.reduce((a, b) => a + b, 0));
    this.define('-', (a: number, b: number) => a - b);
    this.define('*', (...args: number[]) => args.reduce((a, b) => a * b, 1));
    this.define('/', (a: number, b: number) => a / b);
    this.define('%', (a: number, b: number) => a % b);
    
    // Comparison operations
    this.define('=', (a: any, b: any) => a === b);
    this.define('!=', (a: any, b: any) => a !== b);
    this.define('<', (a: number, b: number) => a < b);
    this.define('>', (a: number, b: number) => a > b);
    this.define('<=', (a: number, b: number) => a <= b);
    this.define('>=', (a: number, b: number) => a >= b);
    
    // List operations
    this.define('list', (...items: any[]) => items);
    this.define('first', (list: any[]) => list.length > 0 ? list[0] : null);
    this.define('rest', (list: any[]) => list.slice(1));
    this.define('length', (list: any[]) => list.length);
    
    // Type predicates
    this.define('nil?', (x: any) => x === null || x === undefined);
    this.define('list?', (x: any) => Array.isArray(x));
    this.define('map?', (x: any) => x !== null && typeof x === 'object' && !Array.isArray(x));
    
    // Console operations
    this.define('console.log', console.log);
    
    // JS Interop
    this.define('js-get', (obj: any, prop: string) => obj[prop]);
    this.define('js-call', (obj: any, method: string, ...args: any[]) => obj[method](...args));
    
    this.logger.debug("Built-in functions initialized");
  }

  /**
   * Define a variable in this environment
   * Makes it available to both runtime and macros
   */
  define(key: string, value: any): void {
    this.logger.debug(`Defining symbol: ${key}`);
    this.variables.set(key, value);
    
    // For functions, also register them with a metadata property
    // to indicate they can be used during macro expansion
    if (typeof value === 'function') {
      Object.defineProperty(value, 'isDefFunction', { value: true });
    }
  }

  /**
   * Look up a variable in this environment or its parents
   */
  lookup(key: string): any {
    // Handle dot notation (module.property)
    if (key.includes('.')) {
      return this.lookupDotNotation(key);
    }

    // Handle symbol name with dashes by replacing with underscores
    const sanitizedKey = key.replace(/-/g, '_');
    
    // Try with sanitized name first
    if (this.variables.has(sanitizedKey)) {
      this.logger.debug(`Found variable with sanitized name: ${sanitizedKey}`);
      return this.variables.get(sanitizedKey);
    }
    
    // Try with original name
    if (this.variables.has(key)) {
      this.logger.debug(`Found variable with original name: ${key}`);
      return this.variables.get(key);
    }

    // Try parent environment
    if (this.parent) {
      return this.parent.lookup(key);
    }

    this.logger.debug(`Symbol not found: ${key}`);
    throw new Error(`Symbol not found: ${key}`);
  }

  /**
   * Look up a property using dot notation
   */
  private lookupDotNotation(key: string): any {
    const [moduleName, ...propertyParts] = key.split('.');
    const propertyPath = propertyParts.join('.');

    // Get the module object
    let moduleValue: any;
    try {
      moduleValue = this.lookup(moduleName);
    } catch (error) {
      // Check if it's an imported module
      if (this.moduleExports.has(moduleName)) {
        moduleValue = this.moduleExports.get(moduleName);
      } else {
        this.logger.debug(`Module not found for dot notation: ${moduleName}`);
        throw new Error(`Module not found: ${moduleName}`);
      }
    }

    // Navigate the property path
    let current = moduleValue;
    
    // For single property access
    if (propertyParts.length === 1) {
      const part = propertyParts[0];
      
      if (current && typeof current === 'object') {
        // Try direct property access
        if (part in current) {
          return current[part];
        }
        
        // Try sanitized property name
        const sanitizedPart = part.replace(/-/g, '_');
        if (sanitizedPart !== part && sanitizedPart in current) {
          return current[sanitizedPart];
        }
        
        this.logger.debug(`Property "${part}" not found in module "${moduleName}"`);
        throw new Error(`Property "${part}" not found in module "${moduleName}"`);
      } else {
        throw new Error(`Cannot access property "${part}" of non-object: ${current}`);
      }
    }
    
    // For multi-part property paths
    for (const part of propertyParts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        // Try with dashes converted to underscores
        const underscorePart = part.replace(/-/g, '_');
        if (current && typeof current === 'object' && underscorePart in current) {
          current = current[underscorePart];
        } else {
          this.logger.debug(`Property not found in path: ${key}`);
          throw new Error(`Property not found: ${key}`);
        }
      }
    }

    return current;
  }

  /**
   * Define a macro in this environment
   */
  defineMacro(key: string, macro: MacroFn): void {
    this.logger.debug(`Defining macro: ${key}`);
    this.macros.set(key, macro);
    
    // Tag the function as a macro for later identification
    Object.defineProperty(macro, 'isMacro', { value: true });
    
    // Also register with sanitized name if different
    const sanitizedKey = key.replace(/-/g, '_');
    if (sanitizedKey !== key) {
      this.logger.debug(`Also registering macro with sanitized name: ${sanitizedKey}`);
      this.macros.set(sanitizedKey, macro);
    }
  }

  /**
   * Check if a macro exists
   */
  hasMacro(key: string): boolean {
    // Check direct macros
    if (this.macros.has(key)) {
      this.logger.debug(`Found direct macro: ${key}`);
      return true;
    }
    
    // Try with sanitized name
    const sanitizedKey = key.replace(/-/g, '_');
    if (sanitizedKey !== key && this.macros.has(sanitizedKey)) {
      this.logger.debug(`Found macro with sanitized name: ${sanitizedKey}`);
      return true;
    }
    
    // Check module exports
    if (key.includes('.')) {
      const [moduleName, macroName] = key.split('.');
      
      if (this.moduleExports.has(moduleName)) {
        const moduleExports = this.moduleExports.get(moduleName)!;
        const hasMacro = typeof moduleExports[macroName] === 'function' && 
                        'isMacro' in moduleExports[macroName];
        
        if (hasMacro) return true;
      }
    }
    
    // Try parent environment
    return this.parent !== null && this.parent.hasMacro(key);
  }

  /**
   * Get a macro by name
   */
  getMacro(key: string): MacroFn | undefined {
    // Direct macro lookup
    if (this.macros.has(key)) {
      return this.macros.get(key);
    }
    
    // Try with sanitized name
    const sanitizedKey = key.replace(/-/g, '_');
    if (sanitizedKey !== key && this.macros.has(sanitizedKey)) {
      return this.macros.get(sanitizedKey);
    }
    
    // Check module exports
    if (key.includes('.')) {
      const [moduleName, macroName] = key.split('.');
      
      if (this.moduleExports.has(moduleName)) {
        const moduleExports = this.moduleExports.get(moduleName)!;
        if (typeof moduleExports[macroName] === 'function' && 
            'isMacro' in moduleExports[macroName]) {
          return moduleExports[macroName] as MacroFn;
        }
      }
    }
    
    // Check parent environment
    return this.parent ? this.parent.getMacro(key) : undefined;
  }

  /**
   * Import a module with all its exports
   */
  importModule(moduleName: string, exports: Record<string, any>): void {
    this.logger.debug(`Importing module: ${moduleName}`);

    // Create a module object with all exports
    const moduleObj: Record<string, any> = {...exports};

    // Store the module as a variable
    this.define(moduleName, moduleObj);

    // Store module exports for qualified access
    this.moduleExports.set(moduleName, exports);

    // Register all macros and functions from the module
    for (const [exportName, exportValue] of Object.entries(exports)) {
      if (typeof exportValue === 'function') {
        if ('isMacro' in exportValue) {
          // Register macros
          this.macros.set(`${moduleName}.${exportName}`, exportValue as MacroFn);
          
          // For core modules, also register direct macros
          if (moduleName === 'core' || moduleName === 'lib/core') {
            this.defineMacro(exportName, exportValue as MacroFn);
          }
        }
        // Register functions for macro evaluation
        else if ('isDefFunction' in exportValue) {
          this.define(`${moduleName}.${exportName}`, exportValue);
        }
      }
    }

    this.logger.debug(`Module ${moduleName} imported with exports in Environment`);
  }

  /**
   * Create a child environment with this one as parent
   */
  extend(): Environment {
    return new Environment(this, this.logger);
  }

  /**
   * Evaluate an S-expression for use during macro expansion
   * This is the key feature that allows macros to use runtime functions
   */
  evaluateForMacro(expr: SExp): any {
    this.logger.debug(`Evaluating for macro: ${expr}`);
    
    // Handle different expression types
    if (isSymbol(expr)) {
      // Symbol lookup
      const name = (expr as SSymbol).name;
      try {
        return this.lookup(name);
      } catch (e) {
        return expr; // Return symbol as is if not found
      }
    } 
    else if (isList(expr)) {
      const list = expr as SList;
      
      // Empty list
      if (list.elements.length === 0) {
        return [];
      }
      
      const first = list.elements[0];
      
      // Handle special forms
      if (isSymbol(first)) {
        const op = (first as SSymbol).name;
        
        // Handle if
        if (op === 'if') {
          if (list.elements.length < 3) {
            throw new Error('if requires at least 2 arguments');
          }
          
          const test = this.evaluateForMacro(list.elements[1]);
          if (test) {
            return this.evaluateForMacro(list.elements[2]);
          } else if (list.elements.length > 3) {
            return this.evaluateForMacro(list.elements[3]);
          }
          return null;
        }
        
        // Handle cond
        if (op === 'cond') {
          for (let i = 1; i < list.elements.length; i++) {
            const clause = list.elements[i];
            if (!isList(clause)) {
              throw new Error('cond clauses must be lists');
            }
            
            const clauseList = clause as SList;
            if (clauseList.elements.length !== 2) {
              throw new Error('cond clauses must have a test and a result');
            }
            
            const test = this.evaluateForMacro(clauseList.elements[0]);
            if (test) {
              return this.evaluateForMacro(clauseList.elements[1]);
            }
          }
          return null;
        }
        
        // Handle def (ignored during macro evaluation)
        if (op === 'def') {
          return null;
        }
        
        // Handle defn (ignored during macro evaluation)
        if (op === 'defn') {
          return null;
        }
        
        // Handle fn - create a JavaScript function
        if (op === 'fn') {
          // Not implemented for macro evaluation - just return null
          return null;
        }
        
        // Function call - lookup the function and call it
        const fn = this.lookup(op);
        if (typeof fn === 'function') {
          const args = list.elements.slice(1).map(arg => this.evaluateForMacro(arg));
          return fn(...args);
        }
      }
      
      // For other cases, evaluate as a function call
      const fnExpr = this.evaluateForMacro(first);
      if (typeof fnExpr === 'function') {
        const args = list.elements.slice(1).map(arg => this.evaluateForMacro(arg));
        return fnExpr(...args);
      }
      
      // Return list as is if not a function call
      return list.elements.map(elem => this.evaluateForMacro(elem));
    } 
    else {
      // For literals, return the value
      return (expr as any).value;
    }
  }
}