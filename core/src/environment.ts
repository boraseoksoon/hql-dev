// core/src/environment.ts - Final cleanup of user macro references

import { SExp } from "./s-exp/types.ts";
import { Logger } from "./logger.ts";
import { MacroRegistry } from "./s-exp/macro-registry.ts";
import {
  MacroError,
  TranspilerError,
  ValidationError,
} from "./common/error.ts";
import { LRUCache } from "./common/lru-cache.ts";
import { globalLogger as logger } from "./logger.ts";
import { globalSymbolTable } from "./transpiler/symbol_table.ts";
import { createBasicSymbolInfo, enrichSymbolInfoWithValueType } from "./transpiler/utils/symbol_info_utils.ts";

export type Value =
  | string
  | number
  | boolean
  | null
  | SExp
  | Function
  | Record<string, unknown>
  | unknown[];

export type MacroFn = ((args: SExp[], env: Environment) => SExp) & {
  isMacro?: boolean;
  macroName?: string;
  sourceFile?: string;
};

export class Environment {
  public variables = new Map<string, Value>();
  public macros = new Map<string, MacroFn>();
  public moduleExports = new Map<string, Record<string, Value>>();
  public importedMacros = new Map<string, Map<string, string>>();
  public macroAliases = new Map<string, Map<string, string>>();

  private parent: Environment | null;
  private static globalEnv: Environment | null = null;
  private processedFiles = new Set<string>();
  private lookupCache = new LRUCache<string, Value>(500);
  private macroRegistry: MacroRegistry;
  private currentFilePath: string | null = null;
  private currentMacroContext: string | null = null;
  public logger: Logger;

  static initializeGlobalEnv(): Promise<Environment> {
    return new Promise((resolve) => {
      logger.debug("Starting global environment initialization");
      if (Environment.globalEnv) {
        logger.debug("Reusing existing global environment");
        resolve(Environment.globalEnv);
        return;
      }
      try {
        const env = new Environment(null, logger);
        env.initializeBuiltins();
        logger.debug("Global environment initialized successfully");
        Environment.globalEnv = env;
        resolve(env);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to initialize global environment: ${msg}`);
        if (!(error instanceof TranspilerError)) {
          throw new TranspilerError(`Global environment initialization failed: ${msg}`);
        }
        throw error;
      }
    });
  }

  static getGlobalEnv(): Environment | null {
    return Environment.globalEnv;
  }

  constructor(parent: Environment | null = null, logger?: Logger) {
    this.parent = parent;
    this.logger = logger || new Logger(false);
    this.macroRegistry = parent
      ? parent.macroRegistry
      : new MacroRegistry(this.logger.enabled);
  }

  initializeBuiltins(): void {
    try {
      this.define("+", (...args: number[]) => args.reduce((a, b) => a + b, 0));
      this.define("-", (a: number, b?: number) => (b === undefined ? -a : a - b));
      this.define("*", (...args: number[]) => args.reduce((a, b) => a * b, 1));
      this.define("/", (a: number, b: number) => {
        if (b === 0) {
          throw new ValidationError("Division by zero", "arithmetic operation", "number", "zero");
        }
        return a / b;
      });
      this.define("%", (a: number, b: number) => {
        if (b === 0) {
          throw new ValidationError("Modulo by zero", "arithmetic operation", "number", "zero");
        }
        return a % b;
      });
      this.define("=", (a: Value, b: Value) => a === b);
      this.define("eq?", (a: Value, b: Value) => a === b);
      this.define("!=", (a: Value, b: Value) => a !== b);
      this.define("<", (a: number, b: number) => a < b);
      this.define(">", (a: number, b: number) => a > b);
      this.define("<=", (a: number, b: number) => a <= b);
      this.define(">=", (a: number, b: number) => a >= b);
      this.define("get", (coll: unknown, key: string | number, notFound: Value = null) => {
        if (coll == null) return notFound;
        if (Array.isArray(coll)) {
          return typeof key === "number" && key >= 0 && key < coll.length
            ? coll[key]
            : notFound;
        }
        return typeof coll === "object" && key in (coll as Record<string, unknown>)
          ? (coll as Record<string, unknown>)[key]
          : notFound;
      });
      this.define("js-get", (obj: unknown, prop: string) => {
        if (obj === null || obj === undefined) {
          throw new ValidationError(
            "Cannot access property on null or undefined",
            "js-get operation",
            "object",
            obj === null ? "null" : "undefined",
          );
        }
        return (obj as Record<string, unknown>)[prop];
      });
      this.define("js-call", (obj: unknown, method: string, ...args: unknown[]) => {
        if (obj === null || obj === undefined) {
          throw new ValidationError(
            "Cannot call method on null or undefined",
            "js-call operation",
            "object",
            obj === null ? "null" : "undefined",
          );
        }
        const o = obj as Record<string, unknown>;
        if (typeof o[method] !== "function") {
          throw new ValidationError(
            `${method} is not a function on the given object`,
            "js-call operation",
            "function",
            typeof o[method],
          );
        }
        return (o[method] as Function)(...args);
      });
      this.define("throw", (message: string) => {
        throw new TranspilerError(message);
      });
      
      // Register all builtins in the symbol table
      this.registerBuiltinsInSymbolTable();
      
      this.logger.debug("Built-in functions initialized successfully");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize built-in functions: ${msg}`);
      throw new ValidationError(`Failed to initialize built-in functions: ${msg}`, "environment");
    }
  }
  
  /**
   * Register all builtin functions in the global symbol table
   */
  private registerBuiltinsInSymbolTable(): void {
    const builtins = ['+', '-', '*', '/', '%', '=', 'eq?', '!=', '<', '>', '<=', '>=', 'get', 'js-get', 'js-call', 'throw'];
    
    for (const name of builtins) {
      globalSymbolTable.set({
        name,
        kind: 'builtin',
        scope: 'global',
        type: 'Function',
        meta: { isCore: true }
      });
    }
  }

  define(key: string, value: Value): void {
    try {
      this.logger.debug(`Defining symbol: ${key}`);
      this.variables.set(key, value);
      this.lookupCache.delete(key);
      if (typeof value === "function") {
        Object.defineProperty(value, "isDefFunction", { value: true });
      }
      
      // Create a basic symbol info and enrich it with type information
      const scope = this.currentFilePath ? 'local' : 'global';
      const filePath = this.currentFilePath || undefined; // Convert null to undefined
      const symbolInfo = createBasicSymbolInfo(key, scope, filePath);
      
      // Use the utility function to enrich with value type information
      const enrichedSymbolInfo = enrichSymbolInfoWithValueType(symbolInfo, value);
      
      // Pass the properly typed SymbolInfo object to the symbol table
      globalSymbolTable.set(enrichedSymbolInfo);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`Failed to define symbol ${key}: ${msg}`, "environment");
    }
  }

  lookup(key: string): Value {
    try {
      const cachedValue = this.lookupCache.get(key);
      if (cachedValue !== undefined) return cachedValue;
      if (key.includes(".")) {
        const result = this.lookupDotNotation(key);
        this.lookupCache.set(key, result);
        return result;
      }
      const sanitizedKey = key.replace(/-/g, "_");
      if (this.variables.has(sanitizedKey)) {
        const v = this.variables.get(sanitizedKey);
        this.lookupCache.set(key, v!);
        this.lookupCache.set(sanitizedKey, v!);
        return v!;
      }
      if (this.variables.has(key)) {
        const v = this.variables.get(key);
        this.lookupCache.set(key, v!);
        return v!;
      }
      if (this.parent) {
        try {
          const v = this.parent.lookup(key);
          this.lookupCache.set(key, v);
          return v;
        } catch {
          // Parent lookup failed, continue with local lookup
        }
      }
      this.logger.debug(`Symbol not found: ${key}`);
      throw new ValidationError(
        `Symbol not found: ${key}`,
        "variable lookup",
        "defined symbol",
        "undefined symbol",
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(`Error looking up symbol ${key}: ${msg}`, "variable lookup");
    }
  }

  private lookupDotNotation(key: string): Value {
    const [moduleName, ...propertyParts] = key.split(".");
    const propertyPath = propertyParts.join(".");
    if (this.moduleExports.has(moduleName)) {
      const moduleObj = this.moduleExports.get(moduleName)!;
      try {
        return this.getPropertyFromPath(moduleObj, propertyPath);
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError(
          `Property '${propertyPath}' not found in module '${moduleName}'`,
          "module property lookup",
          "defined property",
          "undefined property",
        );
      }
    }
    try {
      const moduleValue = this.lookup(moduleName);
      return this.getPropertyFromPath(moduleValue, propertyPath);
    } catch (error) {
      if (error instanceof ValidationError) {
        if (error.message.includes("Symbol not found")) {
          throw new ValidationError(
            `Module not found: ${moduleName}`,
            "module lookup",
            "defined module",
            "undefined module",
          );
        }
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`Error accessing ${key}: ${msg}`, "dot notation lookup");
    }
  }

  private getPropertyFromPath(obj: unknown, path: string): Value {
    if (!path) return obj as Value;
    if (obj === null || obj === undefined) {
      throw new ValidationError(
        `Cannot access property '${path}' of ${obj === null ? "null" : "undefined"}`,
        "property access",
        "object",
        obj === null ? "null" : "undefined",
      );
    }
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        throw new ValidationError(
          `Cannot access property '${part}' of ${typeof current}`,
          "property path access",
          "object",
          typeof current,
        );
      }
      const c = current as Record<string, unknown>;
      if (part in c) {
        current = c[part];
        continue;
      }
      const sanitizedPart = part.replace(/-/g, "_");
      if (sanitizedPart !== part && sanitizedPart in c) {
        current = c[sanitizedPart];
        continue;
      }
      throw new ValidationError(
        `Property '${part}' not found in path: ${path}`,
        "property path access",
        "defined property",
        "undefined property",
      );
    }
    return current as Value;
  }

  importModule(moduleName: string, exports: Record<string, Value>): void {
    try {
      this.logger.debug(`Importing module: ${moduleName}`);
      // Use a single stable object per module to support circular/live bindings
      let targetObj: Record<string, Value> | undefined = undefined;
      if (this.moduleExports.has(moduleName)) {
        targetObj = this.moduleExports.get(moduleName)!;
      } else {
        // Check if already defined as a variable (from a prior pre-registration)
        const existing = this.variables.get(moduleName);
        if (existing && typeof existing === 'object' && existing !== null) {
          targetObj = existing as Record<string, Value>;
        } else {
          targetObj = {} as Record<string, Value>;
        }
        // Ensure the environment maps point to the same object
        this.moduleExports.set(moduleName, targetObj);
        // Define the module symbol if not already defined
        if (!existing) {
          this.define(moduleName, targetObj);
        }
      }
      // Merge/overwrite exports into the stable object (live binding semantics)
      for (const [k, v] of Object.entries(exports)) {
        (targetObj as Record<string, Value>)[k] = v;
      }
      
      // Register module in symbol table
      globalSymbolTable.set({
        name: moduleName,
        kind: 'module',
        scope: 'global',
        isImported: true,
        meta: { importPath: this.currentFilePath || 'unknown' }
      });
      
      for (const [exportName, exportValue] of Object.entries(exports)) {
        if (typeof exportValue === "function") {
          if ("isMacro" in exportValue) {
            this.macros.set(`${moduleName}.${exportName}`, exportValue as MacroFn);
            if (moduleName === "core" || moduleName === "lib/core") {
              this.defineMacro(exportName, exportValue as MacroFn);
            }
            
            // Register macro in symbol table
            globalSymbolTable.set({
              name: `${moduleName}.${exportName}`,
              kind: 'macro',
              scope: 'module',
              parent: moduleName,
              definition: { type: 'macro', name: exportName } as any,
              isImported: true,
              sourceModule: moduleName
            });
          } else if ("isDefFunction" in exportValue) {
            this.define(`${moduleName}.${exportName}`, exportValue);
            
            // Register function in symbol table
            globalSymbolTable.set({
              name: `${moduleName}.${exportName}`,
              kind: 'function',
              scope: 'module',
              parent: moduleName,
              type: 'Function',
              isImported: true,
              sourceModule: moduleName
            });
          }
        } else {
          // Register other exported values in symbol table
          let type = typeof exportValue;
          if (type === 'object') {
            if (exportValue === null) type = 'null';
            else if (Array.isArray(exportValue)) type = 'Array';
          }
          
          globalSymbolTable.set({
            name: `${moduleName}.${exportName}`,
            kind: 'variable',
            scope: 'module',
            parent: moduleName,
            type: type.charAt(0).toUpperCase() + type.slice(1),
            isImported: true,
            sourceModule: moduleName
          });
        }
      }
      this.logger.debug(`Module ${moduleName} imported with exports`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (error instanceof ValidationError || error instanceof MacroError) throw error;
      throw new ValidationError(`Failed to import module ${moduleName}: ${msg}`, "module import");
    }
  }

  private tagMacroFunction(macro: MacroFn, name: string, sourceFile?: string) {
    try {
      Object.defineProperty(macro, "isMacro", { value: true });
      Object.defineProperty(macro, "macroName", { value: name });
      if (sourceFile) {
        Object.defineProperty(macro, "sourceFile", { value: sourceFile });
      }
    } catch (error) {
      this.logger.warn(
        `Could not tag macro function ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  defineMacro(key: string, macro: MacroFn): void {
    try {
      this.logger.debug(`Defining macro: ${key}`);
      this.tagMacroFunction(macro, key);
      this.macroRegistry.defineSystemMacro(key, macro);
      this.macros.set(key, macro);
      const sanitizedKey = key.replace(/-/g, "_");
      if (sanitizedKey !== key) {
        this.macros.set(sanitizedKey, macro);
      }
      
      // Register in symbol table
      globalSymbolTable.set({
        name: key,
        kind: 'macro',
        scope: 'global',
        meta: { isSystemMacro: true }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new MacroError(`Failed to define macro ${key}: ${msg}`, key, this.currentFilePath || undefined);
    }
  }

  importMacro(sourceFile: string, macroName: string, targetFile: string, aliasName?: string): boolean {
    try {
      const success = this.macroRegistry.importMacro(sourceFile, macroName, targetFile, aliasName);
      if (success) {
        const importName = aliasName || macroName;
        if (!this.importedMacros.has(targetFile)) {
          this.importedMacros.set(targetFile, new Map<string, string>());
        }
        this.importedMacros.get(targetFile)!.set(importName, sourceFile);
        if (aliasName && aliasName !== macroName) {
          if (!this.macroAliases.has(targetFile)) {
            this.macroAliases.set(targetFile, new Map<string, string>());
          }
          this.macroAliases.get(targetFile)!.set(aliasName, macroName);
        }
        
        // Register in symbol table
        globalSymbolTable.set({
          name: importName,
          kind: 'macro',
          scope: 'local',
          aliasOf: aliasName ? macroName : undefined,
          sourceModule: sourceFile,
          isImported: true,
          meta: { importedInFile: targetFile }
        });
      }
      return success;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new MacroError(`Failed to import macro ${macroName}: ${msg}`, macroName, sourceFile);
    }
  }

  hasMacro(key: string): boolean {
    return this.macroRegistry.hasMacro(key);
  }

  getMacro(key: string): MacroFn | undefined {
    return this.macroRegistry.getMacro(key);
  }

  isSystemMacro(symbolName: string): boolean {
    return this.macroRegistry.isSystemMacro(symbolName);
  }

  markFileProcessed(filePath: string): void {
    this.macroRegistry.markFileProcessed(filePath);
    this.processedFiles.add(filePath);
  }

  hasProcessedFile(filePath: string): boolean {
    if (this.macroRegistry.hasProcessedFile(filePath)) {
      return true;
    }
    return this.processedFiles.has(filePath);
  }

  setCurrentFile(filePath: string | null): void {
    try {
      if (filePath) this.logger.debug(`Setting current file to: ${filePath}`);
      else this.logger.debug(`Clearing current file`);
      this.currentFilePath = filePath;
    } catch (error) {
      this.logger.warn(
        `Error setting current file: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  getCurrentFile(): string {
    return this.currentFilePath ?? "";
  }

  getCurrentMacroContext(): string | null {
    return this.currentMacroContext;
  }

  setCurrentMacroContext(context: string | null): void {
    this.currentMacroContext = context;
  }

  extend(): Environment {
    return new Environment(this, this.logger);
  }

  clearCache(): void {
    this.lookupCache.clear();
    this.logger.debug("Lookup cache cleared");
  }

  /**
   * Get all defined symbols in the environment
   */
  getAllDefinedSymbols(): string[] {
    // Collect symbols from variables
    const variableSymbols = Array.from(this.variables.keys());
    
    // Collect symbols from imported modules
    const moduleSymbols: string[] = [];
    this.moduleExports.forEach((exports) => {
      Object.keys(exports).forEach(key => {
        moduleSymbols.push(key);
      });
    });
    
    // Return a unique set of symbols
    return [...new Set([...variableSymbols, ...moduleSymbols])];
  }

  /**
   * Get information about all imported modules
   */
  getAllImportedModules(): Map<string, string> {
    const result = new Map<string, string>();
    
    // Collect module names and their sources
    Array.from(this.moduleExports.entries()).forEach(([path]) => {
      // Extract module name from path
      const moduleName = path.split('/').pop()?.replace(/\.[^/.]+$/, '') || path;
      result.set(moduleName, path);
    });
    
    return result;
  }

  /**
   * Get all exported symbols from a specific module
   */
  getModuleExports(modulePath: string): string[] {
    const exports = this.moduleExports.get(modulePath);
    return exports ? Object.keys(exports) : [];
  }
}
