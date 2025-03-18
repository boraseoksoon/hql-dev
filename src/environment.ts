// src/environment.ts - A complete unified environment implementation

import { Logger } from './logger.ts';

/**
 * Type definition for macro functions
 */
export type MacroFn = (args: any[], env: Environment) => any;

/**
 * Unified Environment class 
 */
export class Environment {
  private variables = new Map<string, any>();
  private macros = new Map<string, MacroFn>();
  private moduleExports = new Map<string, Record<string, any>>();
  private importedMacros = new Map<string, MacroFn>();
  private parent: Environment | null;
  private logger: Logger;

  private static globalEnv: Environment | null = null;

  static async initializeGlobalEnv(options: { verbose?: boolean } = {}): Promise<Environment> {
    if (Environment.globalEnv) {
      return Environment.globalEnv;
    }
    
    const env = new Environment(null, new Logger(options.verbose));
    
    // Math operations
    env.define('+', (...args: number[]) => args.reduce((a, b) => a + b, 0));
    env.define('-', (a: number, b: number) => a - b);
    env.define('*', (...args: number[]) => args.reduce((a, b) => a * b, 1));
    env.define('/', (a: number, b: number) => a / b);
    env.define('%', (a: number, b: number) => a % b);
    
    // Comparison operations
    env.define('=', (a: any, b: any) => a === b);
    env.define('!=', (a: any, b: any) => a !== b);
    env.define('<', (a: number, b: number) => a < b);
    env.define('>', (a: number, b: number) => a > b);
    env.define('<=', (a: number, b: number) => a <= b);
    env.define('>=', (a: number, b: number) => a >= b);
    
    // Console operations
    env.define('console.log', console.log);
    env.define('console.warn', console.warn);
    env.define('console.error', console.error);
    
    // JS Interop
    env.define('js-get', (obj: any, prop: string) => obj[prop]);
    env.define('js-call', (obj: any, method: string, ...args: any[]) => obj[method](...args));
    
    // List operations
    env.define('list', (...items: any[]) => items);
    env.define('first', (list: any[]) => list.length > 0 ? list[0] : null);
    env.define('rest', (list: any[]) => list.slice(1));
    env.define('cons', (item: any, list: any[]) => [item, ...list]);
    env.define('length', (list: any[]) => list.length);
    
    env.logger.debug("Global environment initialized");
    Environment.globalEnv = env;
    return env;
  }
  
  constructor(parent: Environment | null = null, logger?: Logger) {
    this.parent = parent;
    this.logger = logger || new Logger(false);
  }

  /**
   * Define a variable in this environment
   */
  define(key: string, value: any): void {
    this.logger.debug(`Defining symbol: ${key}`);
    this.variables.set(key, value);
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
      this.logger.debug(`Module not found for dot notation: ${moduleName}`);
      throw new Error(`Module not found: ${moduleName}`);
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
    this.logger.debug(`Checking for macro: ${key}`);
    
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
    
    // Check imported macros
    if (this.importedMacros.has(key)) {
      this.logger.debug(`Found imported macro: ${key}`);
      return true;
    }
    
    // Check for qualified name (module.macro)
    if (key.includes('.')) {
      const [moduleName, macroName] = key.split('.');
      
      // Check if we already have it
      if (this.importedMacros.has(key)) {
        return true;
      }
      
      // Check if the module exists and has the macro
      if (this.moduleExports.has(moduleName)) {
        const moduleExports = this.moduleExports.get(moduleName)!;
        const hasMacro = typeof moduleExports[macroName] === 'function' && 
                        'isMacro' in moduleExports[macroName];
        
        if (hasMacro) {
          // Cache for future lookups
          this.importedMacros.set(key, moduleExports[macroName] as MacroFn);
          return true;
        }
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
      this.logger.debug(`Retrieved direct macro: ${key}`);
      return this.macros.get(key);
    }
    
    // Try with sanitized name
    const sanitizedKey = key.replace(/-/g, '_');
    if (sanitizedKey !== key && this.macros.has(sanitizedKey)) {
      this.logger.debug(`Retrieved macro with sanitized name: ${sanitizedKey}`);
      return this.macros.get(sanitizedKey);
    }
    
    // Imported macro lookup
    if (this.importedMacros.has(key)) {
      this.logger.debug(`Retrieved imported macro: ${key}`);
      return this.importedMacros.get(key);
    }
    
    // Qualified name lookup (module.macro)
    if (key.includes('.')) {
      const [moduleName, macroName] = key.split('.');
      
      // Check module exports
      if (this.moduleExports.has(moduleName)) {
        const moduleExports = this.moduleExports.get(moduleName)!;
        if (typeof moduleExports[macroName] === 'function' && 
            'isMacro' in moduleExports[macroName]) {
          
          // Cache for future lookups
          const macroFn = moduleExports[macroName] as MacroFn;
          this.importedMacros.set(key, macroFn);
          return macroFn;
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

    // CRITICAL FIX: Register all macros from the module
    // and make them available directly as well
    for (const [exportName, exportValue] of Object.entries(exports)) {
      if (typeof exportValue === 'function' && 'isMacro' in exportValue) {
        // Register with qualified name (module.macro)
        const qualifiedName = `${moduleName}.${exportName}`;
        this.logger.debug(`Registering qualified macro: ${qualifiedName}`);
        this.importedMacros.set(qualifiedName, exportValue as MacroFn);
        
        // IMPORTANT: Also register with direct name for core modules
        if (moduleName === 'core' || moduleName === 'lib/core') {
          this.logger.debug(`Also registering direct macro: ${exportName}`);
          this.defineMacro(exportName, exportValue as MacroFn);
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