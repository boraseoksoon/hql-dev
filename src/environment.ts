// src/environment.ts - With enhanced error handling and debugging
import { SExp } from './s-exp/types.ts';
import { Logger } from './logger.ts';
import { MacroRegistry } from './macro-registry.ts';
import { MacroError, ValidationError, TranspilerError } from './transpiler/errors.ts';

/**
 * Type definition for macro functions
 */
export type MacroFn = (args: SExp[], env: Environment) => SExp;

/**
 * Unified Environment class that combines runtime and macro-expansion environments
 * Extended with module-level macro support and enhanced error handling
 */
export class Environment {
  // Runtime variables store JavaScript values
  public variables = new Map<string, any>();
  
  // Macros store macro expansion functions (system-level)
  public macros = new Map<string, MacroFn>();
  
  // Imported modules store module exports
  public moduleExports = new Map<string, Record<string, any>>();
  
  // Parent environment for lexical scoping
  private parent: Environment | null;
  
  // Logger for debugging
  public logger: Logger;
  
  // Global environment singleton
  private static globalEnv: Environment | null = null;

  // Module-level macro registry - tracks macros and their source file
  public moduleMacros = new Map<string, Map<string, MacroFn>>();
  
  // Track which macros are exported from each file
  public exportedMacros = new Map<string, Set<string>>();
  
  // Track which macros are imported into each file
  public importedMacros = new Map<string, Map<string, string>>();
  
  // Track macro aliases - fileUri -> (aliasName -> originalName)
  public macroAliases = new Map<string, Map<string, string>>();
  
  // Track processed files (needed for core.hql loading)
  private processedFiles = new Set<string>();
  
  // Track the current file being processed
  private currentFilePath: string | null = null;

  // Variable lookup cache for performance
  private lookupCache = new Map<string, any>();

  // Centralized macro registry
  private macroRegistry: MacroRegistry;

  /**
   * Initialize a global unified environment
   */
  static async initializeGlobalEnv(options: { verbose?: boolean } = {}): Promise<Environment> {
    const logger = new Logger(options.verbose);
    logger.debug("Starting global environment initialization");
    
    if (Environment.globalEnv) {
      logger.debug("Reusing existing global environment");
      return Environment.globalEnv;
    }
    
    try {
      const env = new Environment(null, logger);
      
      // Initialize built-in functions and macros
      env.initializeBuiltins();
      
      logger.debug("Global environment initialized successfully");
      Environment.globalEnv = env;
      return env;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize global environment: ${errorMsg}`);
      
      // Convert to TranspilerError if it's not already
      if (!(error instanceof TranspilerError)) {
        throw new TranspilerError(`Global environment initialization failed: ${errorMsg}`);
      }
      throw error;
    }
  }
  
  /**
   * Get the global environment instance
   */
  static getGlobalEnv(): Environment | null {
    return Environment.globalEnv;
  }
  
  /**
   * Create a new environment
   */
  constructor(parent: Environment | null = null, logger?: Logger) {
    this.parent = parent;
    this.logger = logger || new Logger(false);
    this.macroRegistry = new MacroRegistry(this.logger.enabled);
  }

  /**
   * Initialize built-in functions and operators
   */
  initializeBuiltins(): void {
    try {
      // Define built-in functions by category
      this.defineArithmeticOperators();
      this.defineComparisonOperators();
      this.defineListOperations();
      this.defineTypePredicates();
      this.defineConsoleOperations();
      this.defineJsInterop();
      
      this.logger.debug("Built-in functions initialized successfully");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize built-in functions: ${errorMsg}`);
      throw new ValidationError(
        `Failed to initialize built-in functions: ${errorMsg}`,
        "environment initialization"
      );
    }
  }
  
  /**
   * Define arithmetic operators
   */
  private defineArithmeticOperators(): void {
    try {
      this.define('+', (...args: number[]) => args.reduce((a, b) => a + b, 0));
      this.define('-', (a: number, b: number) => a - b);
      this.define('*', (...args: number[]) => args.reduce((a, b) => a * b, 1));
      this.define('/', (a: number, b: number) => {
        if (b === 0) {
          throw new ValidationError("Division by zero", "arithmetic operation", "number", "zero");
        }
        return a / b;
      });
      this.define('%', (a: number, b: number) => {
        if (b === 0) {
          throw new ValidationError("Modulo by zero", "arithmetic operation", "number", "zero");
        }
        return a % b;
      });
      this.logger.debug("Arithmetic operators defined");
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to define arithmetic operators: ${error instanceof Error ? error.message : String(error)}`,
        "arithmetic operator definition"
      );
    }
  }
  
  /**
   * Define comparison operators
   */
  private defineComparisonOperators(): void {
    try {
      this.define('=', (a: any, b: any) => a === b);
      this.define('!=', (a: any, b: any) => a !== b);
      this.define('<', (a: number, b: number) => a < b);
      this.define('>', (a: number, b: number) => a > b);
      this.define('<=', (a: number, b: number) => a <= b);
      this.define('>=', (a: number, b: number) => a >= b);
      this.logger.debug("Comparison operators defined");
    } catch (error) {
      throw new ValidationError(
        `Failed to define comparison operators: ${error instanceof Error ? error.message : String(error)}`,
        "comparison operator definition"
      );
    }
  }
  
  /**
   * Define list operations
   */
  private defineListOperations(): void {
    try {
      this.define('list', (...items: any[]) => items);
      this.define('first', (list: any[]) => {
        if (!Array.isArray(list)) {
          throw new ValidationError(
            "first expects a list argument",
            "list operation",
            "array",
            typeof list
          );
        }
        return list.length > 0 ? list[0] : null;
      });
      this.define('second', (list: any[]) => {
        if (!Array.isArray(list)) {
          throw new ValidationError(
            "second expects a list argument",
            "list operation",
            "array",
            typeof list
          );
        }
        return list.length > 1 ? list[1] : null;
      });
      this.define('rest', (list: any[]) => {
        if (!Array.isArray(list)) {
          throw new ValidationError(
            "rest expects a list argument",
            "list operation",
            "array",
            typeof list
          );
        }
        return list.slice(1);
      });
      this.define('length', (list: any[]) => {
        if (!Array.isArray(list)) {
          throw new ValidationError(
            "length expects a list argument",
            "list operation",
            "array",
            typeof list
          );
        }
        return list.length;
      });
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
      this.logger.debug("List operations defined");
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to define list operations: ${error instanceof Error ? error.message : String(error)}`,
        "list operation definition"
      );
    }
  }
  
  /**
   * Define type predicates
   */
  private defineTypePredicates(): void {
    try {
      this.define('nil?', (x: any) => x === null || x === undefined);
      this.define('list?', (x: any) => Array.isArray(x));
      this.define('map?', (x: any) => x !== null && typeof x === 'object' && !Array.isArray(x));
      this.define('symbol?', (x: any) => typeof x === 'string');
      this.logger.debug("Type predicates defined");
    } catch (error) {
      throw new ValidationError(
        `Failed to define type predicates: ${error instanceof Error ? error.message : String(error)}`,
        "type predicate definition"
      );
    }
  }
  
  /**
   * Define console operations
   */
  private defineConsoleOperations(): void {
    try {
      this.define('console.log', console.log);
      this.logger.debug("Console operations defined");
    } catch (error) {
      throw new ValidationError(
        `Failed to define console operations: ${error instanceof Error ? error.message : String(error)}`,
        "console operation definition"
      );
    }
  }
  
  /**
   * Define JS interop functions
   */
  private defineJsInterop(): void {
    try {
      this.define('js-get', (obj: any, prop: string) => {
        if (obj === null || obj === undefined) {
          throw new ValidationError(
            "Cannot access property on null or undefined",
            "js-get operation",
            "object",
            obj === null ? "null" : "undefined"
          );
        }
        return obj[prop];
      });
      
      this.define('js-call', (obj: any, method: string, ...args: any[]) => {
        if (obj === null || obj === undefined) {
          throw new ValidationError(
            "Cannot call method on null or undefined",
            "js-call operation",
            "object",
            obj === null ? "null" : "undefined"
          );
        }
        
        if (typeof obj[method] !== 'function') {
          throw new ValidationError(
            `${method} is not a function on the given object`,
            "js-call operation",
            "function",
            typeof obj[method]
          );
        }
        
        return obj[method](...args);
      });
      
      // Enhanced throw for better error handling
      this.define('throw', (message: string) => {
        throw new TranspilerError(message);
      });
      
      this.logger.debug("JS interop functions defined");
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to define JS interop functions: ${error instanceof Error ? error.message : String(error)}`,
        "JS interop definition"
      );
    }
  }

  /**
   * Define a variable in this environment
   */
  define(key: string, value: any): void {
    try {
      this.logger.debug(`Defining symbol: ${key}`);
      this.variables.set(key, value);
      
      // Clear lookup cache for this key
      this.lookupCache.delete(key);
      this.lookupCache.delete(key.replace(/-/g, '_'));
      
      // For functions, also register them with a metadata property
      // to indicate they can be used during macro expansion
      if (typeof value === 'function') {
        Object.defineProperty(value, 'isDefFunction', { value: true });
      }
    } catch (error) {
      throw new ValidationError(
        `Failed to define symbol ${key}: ${error instanceof Error ? error.message : String(error)}`,
        "environment definition"
      );
    }
  }

  /**
   * Look up a variable in the environment chain
   * Optimized implementation with caching and enhanced error handling
   */
  lookup(key: string): any {
    try {
      // Check cache first for performance
      if (this.lookupCache.has(key)) {
        return this.lookupCache.get(key);
      }

      // Handle dot notation for module property access
      if (key.includes('.')) {
        const result = this.lookupDotNotation(key);
        this.lookupCache.set(key, result);
        return result;
      }

      // Check with sanitized name (underscores instead of dashes)
      const sanitizedKey = key.replace(/-/g, '_');
      
      if (this.variables.has(sanitizedKey)) {
        const value = this.variables.get(sanitizedKey);
        this.lookupCache.set(key, value);
        this.lookupCache.set(sanitizedKey, value);
        return value;
      }
      
      // Check with original name
      if (this.variables.has(key)) {
        const value = this.variables.get(key);
        this.lookupCache.set(key, value);
        return value;
      }

      // Try parent environment
      if (this.parent) {
        try {
          const value = this.parent.lookup(key);
          this.lookupCache.set(key, value);
          return value;
        } catch (error) {
          // Parent lookup failed, continue to throw our own error
        }
      }

      this.logger.debug(`Symbol not found: ${key}`);
      throw new ValidationError(
        `Symbol not found: ${key}`,
        "variable lookup",
        "defined symbol",
        "undefined symbol"
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new ValidationError(
        `Error looking up symbol ${key}: ${error instanceof Error ? error.message : String(error)}`,
        "variable lookup"
      );
    }
  }

  /**
   * Look up a property using dot notation
   * Enhanced with better error messages
   */
  private lookupDotNotation(key: string): any {
    const [moduleName, ...propertyParts] = key.split('.');
    const propertyPath = propertyParts.join('.');

    // First check if it's a registered module
    if (this.moduleExports.has(moduleName)) {
      const moduleObj = this.moduleExports.get(moduleName)!;
      try {
        return this.getPropertyFromPath(moduleObj, propertyPath);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new ValidationError(
          `Property '${propertyPath}' not found in module '${moduleName}'`,
          "module property lookup",
          "defined property",
          "undefined property"
        );
      }
    }

    // If not in moduleExports, try to get the module from variables
    try {
      const moduleValue = this.lookup(moduleName);
      return this.getPropertyFromPath(moduleValue, propertyPath);
    } catch (error) {
      // Add context to already-ValidationError errors
      if (error instanceof ValidationError) {
        if (error.message.includes("Symbol not found")) {
          throw new ValidationError(
            `Module not found: ${moduleName}`,
            "module lookup",
            "defined module",
            "undefined module"
          );
        }
        throw error;
      }
      
      throw new ValidationError(
        `Error accessing ${key}: ${error instanceof Error ? error.message : String(error)}`,
        "dot notation lookup"
      );
    }
  }

  /**
   * Helper to get a property from an object via a path string
   * Enhanced with better error messages
   */
  private getPropertyFromPath(obj: any, path: string): any {
    if (!path) return obj;
    
    if (obj === null || obj === undefined) {
      throw new ValidationError(
        `Cannot access property '${path}' of ${obj === null ? 'null' : 'undefined'}`,
        "property access",
        "object",
        obj === null ? "null" : "undefined"
      );
    }
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      // Try original property name
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
        continue;
      }
      
      // Try sanitized property name
      const sanitizedPart = part.replace(/-/g, '_');
      if (current && typeof current === 'object' && sanitizedPart !== part && sanitizedPart in current) {
        current = current[sanitizedPart];
        continue;
      }
      
      throw new ValidationError(
        `Property '${part}' not found in path: ${path}`,
        "property path access",
        "defined property",
        "undefined property"
      );
    }
    
    return current;
  }

  /**
   * Define a macro in this environment
   */
  defineMacro(key: string, macro: MacroFn): void {
    try {
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
      
      // Register with the macro registry as well
      this.macroRegistry.defineSystemMacro(key, macro);
    } catch (error) {
      throw new MacroError(
        `Failed to define macro ${key}: ${error instanceof Error ? error.message : String(error)}`,
        key,
        this.currentFilePath || undefined
      );
    }
  }

  /**
   * Set the current file being processed
   */
  setCurrentFile(filePath: string | null): void {
    try {
      if (filePath) {
        this.logger.debug(`Setting current file to: ${filePath}`);
      } else {
        this.logger.debug(`Clearing current file`);
      }
      this.currentFilePath = filePath;
    } catch (error) {
      this.logger.warn(`Error setting current file: ${error instanceof Error ? error.message : String(error)}`);
      // Not throwing here as this is a non-critical operation
    }
  }
  
  /**
   * Get the current file being processed
   */
  getCurrentFile(): string | null {
    return this.currentFilePath;
  }
  
  /**
   * Mark a file as processed
   */
  markFileProcessed(filePath: string): void {
    try {
      this.processedFiles.add(filePath);
      this.macroRegistry.markFileProcessed(filePath);
      this.logger.debug(`Marked file as processed: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Error marking file as processed: ${error instanceof Error ? error.message : String(error)}`);
      // Not throwing here as this is a non-critical operation
    }
  }
  
  /**
   * Check if a file has been processed
   */
  hasProcessedFile(filePath: string): boolean {
    return this.processedFiles.has(filePath) || this.macroRegistry.hasProcessedFile(filePath);
  }
  
  /**
   * Define a module-scoped macro
   */
  defineModuleMacro(filePath: string, macroName: string, macroFn: MacroFn): void {
    try {
      this.logger.debug(`Defining module macro: ${macroName} in ${filePath}`);
      
      // Get or create the file's macro registry
      if (!this.moduleMacros.has(filePath)) {
        this.moduleMacros.set(filePath, new Map<string, MacroFn>());
      }
      
      const moduleRegistry = this.moduleMacros.get(filePath)!;
      moduleRegistry.set(macroName, macroFn);
      
      // Tag the function with metadata
      Object.defineProperty(macroFn, 'isMacro', { value: true });
      Object.defineProperty(macroFn, 'macroName', { value: macroName });
      Object.defineProperty(macroFn, 'sourceFile', { value: filePath });
      Object.defineProperty(macroFn, 'isUserMacro', { value: true });
      
      // Register with the macro registry as well
      this.macroRegistry.defineModuleMacro(filePath, macroName, macroFn);
    } catch (error) {
      throw new MacroError(
        `Failed to define module macro ${macroName}: ${error instanceof Error ? error.message : String(error)}`,
        macroName,
        filePath
      );
    }
  }

  /**
   * Mark a macro as exported from a file
   */
  exportMacro(filePath: string, macroName: string): void {
    try {
      this.logger.debug(`Marking macro ${macroName} as exported from ${filePath}`);
      
      // Get or create the file's export registry
      if (!this.exportedMacros.has(filePath)) {
        this.exportedMacros.set(filePath, new Set<string>());
      }
      
      // Add the macro to the exports
      this.exportedMacros.get(filePath)!.add(macroName);
      
      // Register with the macro registry as well
      this.macroRegistry.exportMacro(filePath, macroName);
    } catch (error) {
      throw new MacroError(
        `Failed to export macro ${macroName}: ${error instanceof Error ? error.message : String(error)}`,
        macroName,
        filePath
      );
    }
  }
  
/**
 * Import a macro from sourceFile into targetFile with optional alias
 * Enhanced with better error handling
 */
importMacro(sourceFile: string, macroName: string, targetFile: string, aliasName?: string): boolean {
  const importName = aliasName || macroName;
  this.logger.debug(`Importing macro ${macroName}${aliasName ? ` as ${importName}` : ''} from ${sourceFile} into ${targetFile}`);
  
  try {
    // Use the macro registry to handle the import
    const success = this.macroRegistry.importMacro(sourceFile, macroName, targetFile, aliasName);
    
    if (success) {
      // Also update our local tracking for backward compatibility
      // Get or create the target file's import registry
      if (!this.importedMacros.has(targetFile)) {
        this.importedMacros.set(targetFile, new Map<string, string>());
      }
      
      // Record the import
      this.importedMacros.get(targetFile)!.set(importName, sourceFile);
      
      // If an alias is provided, record the mapping from alias to original name
      if (aliasName && aliasName !== macroName) {
        if (!this.macroAliases.has(targetFile)) {
          this.macroAliases.set(targetFile, new Map<string, string>());
        }
        this.macroAliases.get(targetFile)!.set(aliasName, macroName);
      }
    } else {
      this.logger.warn(`Failed to import macro ${macroName} from ${sourceFile} to ${targetFile}`);
    }
    
    return success;
  } catch (error) {
    throw new MacroError(
      `Failed to import macro ${macroName}: ${error instanceof Error ? error.message : String(error)}`,
      macroName,
      sourceFile
    );
  }
}
  
  /**
   * Check if a macro exists in the environment or is visible in the current module
   * Enhanced with better error messages
   */
  hasMacro(key: string): boolean {
    try {
      // Use the macro registry with the current file context
      return this.macroRegistry.hasMacro(key, this.currentFilePath);
    } catch (error) {
      this.logger.warn(`Error checking if macro exists: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Safer to return false on error
    }
  }

  /**
   * Get a macro from the environment if available in the current scope
   * Enhanced with better error handling
   */
  getMacro(key: string): MacroFn | undefined {
    try {
      // Use the macro registry with the current file context
      return this.macroRegistry.getMacro(key, this.currentFilePath);
    } catch (error) {
      this.logger.warn(`Error getting macro ${key}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined; // Return undefined on error
    }
  }

  /**
   * Check if a symbol name is a user-level macro
   */
  isUserLevelMacro(symbolName: string, fromFile: string): boolean {
    try {
      // Check if defined in the specified file
      const fileMacros = this.moduleMacros.get(fromFile);
      if (fileMacros && fileMacros.has(symbolName)) {
        return true;
      }
      
      // Check if imported into the specified file
      const imports = this.importedMacros.get(fromFile);
      if (imports && imports.has(symbolName)) {
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.warn(`Error checking if ${symbolName} is a user-level macro: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Safer to return false on error
    }
  }

  /**
   * Check if a module has a specified macro
   */
  hasModuleMacro(filePath: string, macroName: string): boolean {
    try {
      return this.macroRegistry.hasModuleMacro(filePath, macroName);
    } catch (error) {
      this.logger.warn(`Error checking if module ${filePath} has macro ${macroName}: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Safer to return false on error
    }
  }
  
  /**
   * Get all macros defined in a module
   */
  getModuleMacros(filePath: string): Map<string, MacroFn> | undefined {
    try {
      return this.moduleMacros.get(filePath);
    } catch (error) {
      this.logger.warn(`Error getting macros for module ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return new Map(); // Return empty map on error
    }
  }
  
  /**
   * Get all macros exported from a module
   */
  getExportedMacros(filePath: string): Set<string> | undefined {
    try {
      return this.exportedMacros.get(filePath);
    } catch (error) {
      this.logger.warn(`Error getting exported macros for module ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return new Set(); // Return empty set on error
    }
  }

  /**
   * Import a module into the environment
   * Enhanced with better error handling
   */
  importModule(moduleName: string, exports: Record<string, any>): void {
    try {
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
    } catch (error) {
      if (error instanceof ValidationError || error instanceof MacroError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to import module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
        "module import"
      );
    }
  }

  /**
   * Create a child environment with this one as parent
   */
  extend(): Environment {
    return new Environment(this, this.logger);
  }
  
  /**
   * Clear the lookup cache - useful for testing
   */
  clearCache(): void {
    this.lookupCache.clear();
    this.logger.debug("Lookup cache cleared");
  }
}