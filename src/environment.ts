// src/environment.ts - Refactored
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
  
  // Parent environment for lexical scoping
  private parent: Environment | null;
  
  // Logger for debugging
  public logger: Logger;
  
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
    // Define built-in functions by category
    this.defineArithmeticOperators();
    this.defineComparisonOperators();
    this.defineListOperations();
    this.defineTypePredicates();
    this.defineConsoleOperations();
    this.defineJsInterop();
    
    this.logger.debug("Built-in functions initialized");
  }
  
  /**
   * Define arithmetic operators
   */
  private defineArithmeticOperators(): void {
    this.define('+', (...args: number[]) => args.reduce((a, b) => a + b, 0));
    this.define('-', (a: number, b: number) => a - b);
    this.define('*', (...args: number[]) => args.reduce((a, b) => a * b, 1));
    this.define('/', (a: number, b: number) => a / b);
    this.define('%', (a: number, b: number) => a % b);
  }
  
  /**
   * Define comparison operators
   */
  private defineComparisonOperators(): void {
    this.define('=', (a: any, b: any) => a === b);
    this.define('!=', (a: any, b: any) => a !== b);
    this.define('<', (a: number, b: number) => a < b);
    this.define('>', (a: number, b: number) => a > b);
    this.define('<=', (a: number, b: number) => a <= b);
    this.define('>=', (a: number, b: number) => a >= b);
  }
  
  /**
   * Define list operations
   */
  private defineListOperations(): void {
    this.define('list', (...items: any[]) => items);
    this.define('first', (list: any[]) => list.length > 0 ? list[0] : null);
    this.define('second', (list: any[]) => list.length > 1 ? list[1] : null);
    this.define('rest', (list: any[]) => list.slice(1));
    this.define('length', (list: any[]) => list.length);
    this.define('get', (coll, key, notFound = null) => {
      if (coll == null) return notFound;
      if (Array.isArray(coll)) {
        return (typeof key === 'number' && key >= 0 && key < coll.length) 
          ? coll[key] 
          : notFound;
      }
      return (key in coll) ? coll[key] : notFound;
    });
    this.define('nth', (coll, index) => this.lookup('get')(coll, index, null));
  }
  
  /**
   * Define type predicates
   */
  private defineTypePredicates(): void {
    this.define('nil?', (x: any) => x === null || x === undefined);
    this.define('list?', (x: any) => Array.isArray(x));
    this.define('map?', (x: any) => x !== null && typeof x === 'object' && !Array.isArray(x));
    this.define('symbol?', (x: any) => typeof x === 'string');
  }
  
  /**
   * Define console operations
   */
  private defineConsoleOperations(): void {
    this.define('console.log', console.log);
  }
  
  /**
   * Define JS interop functions
   */
  private defineJsInterop(): void {
    this.define('js-get', (obj: any, prop: string) => obj[prop]);
    this.define('js-call', (obj: any, method: string, ...args: any[]) => obj[method](...args));
    
    // Enhanced throw for better error handling
    this.define('throw', (message: string) => {
      throw new Error(message);
    });
  }

  /**
   * Define a variable in this environment
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
   * Look up a variable in the environment chain
   */
  lookup(key: string): any {
    // Handle dot notation for module property access
    if (key.includes('.')) {
      return this.lookupDotNotation(key);
    }

    // Check with sanitized name (underscores instead of dashes)
    const sanitizedKey = key.replace(/-/g, '_');
    
    if (this.variables.has(sanitizedKey)) {
      this.logger.debug(`Found variable with sanitized name: ${sanitizedKey}`);
      return this.variables.get(sanitizedKey);
    }
    
    // Check with original name
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

    // First try to get the module object from variables
    let moduleValue: any;
    try {
      moduleValue = this.lookup(moduleName);
    } catch (error) {
      // Check if it's a registered module
      if (this.moduleExports.has(moduleName)) {
        moduleValue = this.moduleExports.get(moduleName);
      } else {
        this.logger.debug(`Module not found for dot notation: ${moduleName}`);
        throw new Error(`Module not found: ${moduleName}`);
      }
    }

    // Navigate the property path
    if (propertyParts.length === 0) {
      return moduleValue;
    }

    let current = moduleValue;
    
    // Handle single property access
    if (propertyParts.length === 1) {
      const prop = propertyParts[0];
      
      if (current && typeof current === 'object') {
        // Try direct property access
        if (prop in current) {
          return current[prop];
        }
        
        // Try sanitized property name
        const sanitizedProp = prop.replace(/-/g, '_');
        if (sanitizedProp !== prop && sanitizedProp in current) {
          return current[sanitizedProp];
        }
        
        this.logger.debug(`Property "${prop}" not found in module "${moduleName}"`);
        throw new Error(`Property "${prop}" not found in module "${moduleName}"`);
      } else {
        throw new Error(`Cannot access property "${prop}" of non-object: ${current}`);
      }
    }
    
    // For multi-part property paths, navigate through each part
    for (const part of propertyParts) {
      if (current && typeof current === 'object') {
        // Try direct property access
        if (part in current) {
          current = current[part];
          continue;
        }
        
        // Try sanitized property name
        const sanitizedPart = part.replace(/-/g, '_');
        if (sanitizedPart !== part && sanitizedPart in current) {
          current = current[sanitizedPart];
          continue;
        }
      }
      
      this.logger.debug(`Property "${part}" not found in path: ${key}`);
      throw new Error(`Property not found in path: ${key}`);
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
    // Store the original name for reference
    Object.defineProperty(macro, 'macroName', { value: key });
    
    // Also register with sanitized name if different
    const sanitizedKey = key.replace(/-/g, '_');
    if (sanitizedKey !== key) {
      this.logger.debug(`Also registering macro with sanitized name: ${sanitizedKey}`);
      this.macros.set(sanitizedKey, macro);
    }
  }

  /**
   * Check if a macro exists in the environment chain
   */
  hasMacro(key: string): boolean {
    // Direct lookup
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
    
    // Check for qualified macro names (module.macroName)
    if (key.includes('.')) {
      const [moduleName, macroName] = key.split('.');
      
      if (this.moduleExports.has(moduleName)) {
        const moduleExports = this.moduleExports.get(moduleName)!;
        if (typeof moduleExports[macroName] === 'function' && 
            'isMacro' in moduleExports[macroName]) {
          return true;
        }
        
        // Try with sanitized macro name
        const sanitizedMacroName = macroName.replace(/-/g, '_');
        if (sanitizedMacroName !== macroName &&
            typeof moduleExports[sanitizedMacroName] === 'function' &&
            'isMacro' in moduleExports[sanitizedMacroName]) {
          return true;
        }
      }
    }
    
    // Check parent environment
    return this.parent !== null && this.parent.hasMacro(key);
  }

  /**
   * Get a macro from the environment chain
   */
  getMacro(key: string): MacroFn | undefined {
    // Direct lookup
    if (this.macros.has(key)) {
      return this.macros.get(key);
    }
    
    // Try with sanitized name
    const sanitizedKey = key.replace(/-/g, '_');
    if (sanitizedKey !== key && this.macros.has(sanitizedKey)) {
      return this.macros.get(sanitizedKey);
    }
    
    // Check for qualified macro names
    if (key.includes('.')) {
      const [moduleName, macroName] = key.split('.');
      
      if (this.moduleExports.has(moduleName)) {
        const moduleExports = this.moduleExports.get(moduleName)!;
        
        // Try direct macro name
        if (typeof moduleExports[macroName] === 'function' && 
            'isMacro' in moduleExports[macroName]) {
          return moduleExports[macroName] as MacroFn;
        }
        
        // Try sanitized macro name
        const sanitizedMacroName = macroName.replace(/-/g, '_');
        if (sanitizedMacroName !== macroName && 
            typeof moduleExports[sanitizedMacroName] === 'function' && 
            'isMacro' in moduleExports[sanitizedMacroName]) {
          return moduleExports[sanitizedMacroName] as MacroFn;
        }
      }
    }
    
    // Check parent environment
    return this.parent ? this.parent.getMacro(key) : undefined;
  }

  /**
   * Import a module into the environment
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
          // Register direct macros with qualified name
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
}