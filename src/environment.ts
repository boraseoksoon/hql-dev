// src/environment.ts - With macro aliasing support
import { SExp, SList, SSymbol, isSymbol, isList, createSymbol, createList, createLiteral } from './s-exp/types.ts';
import { Logger } from './logger.ts';

/**
 * Type definition for macro functions
 */
export type MacroFn = (args: SExp[], env: Environment) => SExp;

/**
 * Unified Environment class that combines runtime and macro-expansion environments
 * Extended with module-level macro support
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
  
  // NEW: Track macro aliases - fileUri -> (aliasName -> originalName)
  public macroAliases = new Map<string, Map<string, string>>();
  
  // Track processed files (needed for core.hql loading)
  private processedFiles = new Set<string>();
  
  // Track the current file being processed
  private currentFilePath: string | null = null;

  // Variable lookup cache for performance
  private lookupCache = new Map<string, any>();

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
    
    // Clear lookup cache for this key
    this.lookupCache.delete(key);
    this.lookupCache.delete(key.replace(/-/g, '_'));
    
    // For functions, also register them with a metadata property
    // to indicate they can be used during macro expansion
    if (typeof value === 'function') {
      Object.defineProperty(value, 'isDefFunction', { value: true });
    }
  }

  /**
   * Look up a variable in the environment chain
   * Optimized implementation with caching
   */
  lookup(key: string): any {
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
      const value = this.parent.lookup(key);
      this.lookupCache.set(key, value);
      return value;
    }

    this.logger.debug(`Symbol not found: ${key}`);
    throw new Error(`Symbol not found: ${key}`);
  }

  /**
   * Look up a property using dot notation
   * Optimized to reduce redundant operations
   */
  private lookupDotNotation(key: string): any {
    const [moduleName, ...propertyParts] = key.split('.');
    const propertyPath = propertyParts.join('.');

    // First check if it's a registered module
    if (this.moduleExports.has(moduleName)) {
      const moduleObj = this.moduleExports.get(moduleName)!;
      return this.getPropertyFromPath(moduleObj, propertyPath);
    }

    // If not in moduleExports, try to get the module from variables
    try {
      const moduleValue = this.lookup(moduleName);
      return this.getPropertyFromPath(moduleValue, propertyPath);
    } catch (error) {
      throw new Error(`Module not found: ${moduleName}`);
    }
  }

  /**
   * Helper to get a property from an object via a path string
   */
  private getPropertyFromPath(obj: any, path: string): any {
    if (!path) return obj;
    
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
      
      throw new Error(`Property not found in path: ${path}`);
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
   * Set the current file being processed
   */
  setCurrentFile(filePath: string | null): void {
    if (filePath) {
      this.logger.debug(`Setting current file to: ${filePath}`);
    } else {
      this.logger.debug(`Clearing current file`);
    }
    this.currentFilePath = filePath;
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
    this.processedFiles.add(filePath);
  }
  
  /**
   * Check if a file has been processed
   */
  hasProcessedFile(filePath: string): boolean {
    return this.processedFiles.has(filePath);
  }
  
  /**
   * Define a module-scoped macro
   */
  defineModuleMacro(filePath: string, macroName: string, macroFn: MacroFn): void {
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
  }

  /**
   * Mark a macro as exported from a file
   */
  exportMacro(filePath: string, macroName: string): void {
    this.logger.debug(`Marking macro ${macroName} as exported from ${filePath}`);
    
    // Get or create the file's export registry
    if (!this.exportedMacros.has(filePath)) {
      this.exportedMacros.set(filePath, new Set<string>());
    }
    
    // Add the macro to the exports
    this.exportedMacros.get(filePath)!.add(macroName);
  }
  
/**
 * Import a macro from sourceFile into targetFile with optional alias
 */
importMacro(sourceFile: string, macroName: string, targetFile: string, aliasName?: string): boolean {
  const importName = aliasName || macroName;
  this.logger.debug(`Importing macro ${macroName}${aliasName ? ` as ${importName}` : ''} from ${sourceFile} into ${targetFile}`);
  
  // Check if the source file has this macro
  const sourceFileMacros = this.moduleMacros.get(sourceFile);
  if (!sourceFileMacros || !sourceFileMacros.has(macroName)) {
    this.logger.warn(`Macro ${macroName} not found in ${sourceFile}`);
    return false;
  }
  
  // Check if the macro is exported
  const exports = this.exportedMacros.get(sourceFile);
  if (!exports || !exports.has(macroName)) {
    this.logger.warn(`Macro ${macroName} is not exported from ${sourceFile}`);
    return false;
  }
  
  // NEW: Check for name shadowing
  if (this.importedMacros.has(targetFile)) {
    const existingImports = this.importedMacros.get(targetFile)!;
    
    if (existingImports.has(importName)) {
      const existingSource = existingImports.get(importName)!;
      
      // Only warn if importing from a different source
      if (existingSource !== sourceFile) {
        // Get original name if it's an alias
        let existingOriginal = importName;
        if (this.macroAliases.has(targetFile)) {
          const aliases = this.macroAliases.get(targetFile)!;
          if (aliases.has(importName)) {
            existingOriginal = aliases.get(importName)!;
          }
        }
        
        // error? warning? 
        this.logger.warn(
          `WARNING: Name conflict detected: '${importName}' from '${sourceFile}' ` +
          `shadows previously imported '${existingOriginal}' from '${existingSource}'`
        );
        
        // Option: Uncomment to make this an error instead of just a warning
        // throw new Error(`Import name conflict: '${importName}' is already imported from '${existingSource}'`);
      }
    }
  }
  
  // Get or create the target file's import registry
  if (!this.importedMacros.has(targetFile)) {
    this.importedMacros.set(targetFile, new Map<string, string>());
  }
  
  // Record the import (potentially overwriting previous import)
  this.importedMacros.get(targetFile)!.set(importName, sourceFile);
  
  // If an alias is provided, record the mapping from alias to original name
  if (aliasName && aliasName !== macroName) {
    if (!this.macroAliases.has(targetFile)) {
      this.macroAliases.set(targetFile, new Map<string, string>());
    }
    this.macroAliases.get(targetFile)!.set(aliasName, macroName);
    this.logger.debug(`Created alias ${aliasName} -> ${macroName} in ${targetFile}`);
  }
  
  this.logger.debug(`Successfully imported macro ${macroName}${aliasName ? ` as ${importName}` : ''} from ${sourceFile} to ${targetFile}`);
  return true;
}
  
  /**
   * Check if a macro exists in the environment or is visible in the current module
   * UPDATED: Added alias resolution support
   */
  hasMacro(key: string): boolean {
    // Check global macros first
    if (this.macros.has(key)) {
      return true;
    }
    
    // Check module-scoped macros if we have a current file
    if (this.currentFilePath) {
      // Check if defined in current file
      const currentFileMacros = this.moduleMacros.get(this.currentFilePath);
      if (currentFileMacros && currentFileMacros.has(key)) {
        return true;
      }
      
      // Check if imported into current file
      const imports = this.importedMacros.get(this.currentFilePath);
      if (imports && imports.has(key)) {
        const sourceFile = imports.get(key)!;
        
        // If key is an alias, look up the original name
        let sourceName = key;
        if (this.macroAliases.has(this.currentFilePath)) {
          const aliases = this.macroAliases.get(this.currentFilePath)!;
          if (aliases.has(key)) {
            sourceName = aliases.get(key)!;
          }
        }
        
        // Verify source has the macro and it's exported
        const sourceMacros = this.moduleMacros.get(sourceFile);
        const exports = this.exportedMacros.get(sourceFile);
        
        if (exports && exports.has(sourceName) && sourceMacros && sourceMacros.has(sourceName)) {
          return true;
        }
      }
    }
    
    // Check parent environment
    return this.parent !== null && this.parent.hasMacro(key);
  }

  /**
   * Get a macro from the environment if available in the current scope
   * UPDATED: Added alias resolution support
   */
  getMacro(key: string): MacroFn | undefined {
    // Check global macros first
    if (this.macros.has(key)) {
      return this.macros.get(key);
    }
    
    // Check module-scoped macros if we have a current file
    if (this.currentFilePath) {
      // Check if defined in current file
      const currentFileMacros = this.moduleMacros.get(this.currentFilePath);
      if (currentFileMacros && currentFileMacros.has(key)) {
        return currentFileMacros.get(key);
      }
      
      // Check if imported into current file
      const imports = this.importedMacros.get(this.currentFilePath);
      if (imports && imports.has(key)) {
        const sourceFile = imports.get(key)!;
        
        // If key is an alias, look up the original name
        let sourceName = key;
        if (this.macroAliases.has(this.currentFilePath)) {
          const aliases = this.macroAliases.get(this.currentFilePath)!;
          if (aliases.has(key)) {
            sourceName = aliases.get(key)!;
            this.logger.debug(`Resolved alias ${key} -> ${sourceName}`);
          }
        }
        
        // Verify source has the macro and it's exported
        const sourceMacros = this.moduleMacros.get(sourceFile);
        const exports = this.exportedMacros.get(sourceFile);
        
        if (exports && exports.has(sourceName) && sourceMacros && sourceMacros.has(sourceName)) {
          return sourceMacros.get(sourceName);
        }
      }
    }
    
    // Check parent environment
    return this.parent ? this.parent.getMacro(key) : undefined;
  }

  /**
   * Check if a symbol name is a user-level macro
   */
  isUserLevelMacro(symbolName: string, fromFile: string): boolean {
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
  }

  /**
   * Check if a module has a specified macro
   */
  hasModuleMacro(filePath: string, macroName: string): boolean {
    const moduleRegistry = this.moduleMacros.get(filePath);
    return moduleRegistry ? moduleRegistry.has(macroName) : false;
  }
  
  /**
   * Get all macros defined in a module
   */
  getModuleMacros(filePath: string): Map<string, MacroFn> | undefined {
    return this.moduleMacros.get(filePath);
  }
  
  /**
   * Get all macros exported from a module
   */
  getExportedMacros(filePath: string): Set<string> | undefined {
    return this.exportedMacros.get(filePath);
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
  
  /**
   * Clear the lookup cache - useful for testing
   */
  clearCache(): void {
    this.lookupCache.clear();
  }
}