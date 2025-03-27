// src/environment.ts - Refactored with simplified caching and delegated macro handling

import { SExp } from "./s-exp/types.ts";
import { Logger } from "./logger.ts";
import { MacroRegistry } from "./macro-registry.ts";
import {
  MacroError,
  TranspilerError,
  ValidationError,
} from "./transpiler/errors.ts";
import { LRUCache } from "./utils/lru-cache.ts";

// Define a type for values that can be stored in the environment
export type Value =
  | string
  | number
  | boolean
  | null
  | SExp
  | Function
  | Record<string, unknown>
  | unknown[];

/**
 * Type definition for macro functions
 */
export type MacroFn = ((args: SExp[], env: Environment) => SExp) & {
  isMacro?: boolean;
  macroName?: string;
  sourceFile?: string;
  isUserMacro?: boolean;
};

/**
 * Unified Environment class that combines runtime and macro-expansion environments
 * Now delegates macro handling to MacroRegistry to eliminate duplication
 */
export class Environment {
  // Runtime variables store JavaScript values
  public variables = new Map<string, Value>();

  // Macros store macro expansion functions (system-level) - kept for backward compatibility
  public macros = new Map<string, MacroFn>();

  // Imported modules store module exports
  public moduleExports = new Map<string, Record<string, Value>>();

  // Parent environment for lexical scoping
  private parent: Environment | null;

  // Logger for debugging
  public logger: Logger;

  // Global environment singleton
  private static globalEnv: Environment | null = null;

  // Module-level macro registry - kept for backward compatibility
  public moduleMacros = new Map<string, Map<string, MacroFn>>();

  // Track which macros are exported from each file - kept for backward compatibility
  public exportedMacros = new Map<string, Set<string>>();

  // Track which macros are imported into each file - kept for backward compatibility
  public importedMacros = new Map<string, Map<string, string>>();

  // Track macro aliases - kept for backward compatibility
  public macroAliases = new Map<string, Map<string, string>>();

  // Track processed files (needed for core.hql loading) - kept for backward compatibility
  private processedFiles = new Set<string>();

  // Simplified variable lookup cache
  private lookupCache = new LRUCache<string, Value>(500);

  // Centralized macro registry - the single source of truth for macros
  private macroRegistry: MacroRegistry;

  // Track the current file being processed
  private currentFilePath: string | null = null;

  // Track the current macro expansion context
  private currentMacroContext: string | null = null;

  /**
   * Initialize a global unified environment
   */
  static initializeGlobalEnv(
    options: { verbose?: boolean } = {},
  ): Promise<Environment> {
    return new Promise((resolve) => {
      const logger = new Logger(options.verbose);
      logger.debug("Starting global environment initialization");

      if (Environment.globalEnv) {
        logger.debug("Reusing existing global environment");
        resolve(Environment.globalEnv);
        return;
      }

      try {
        const env = new Environment(null, logger);

        // Initialize built-in functions and macros
        env.initializeBuiltins();

        logger.debug("Global environment initialized successfully");
        Environment.globalEnv = env;
        resolve(env);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to initialize global environment: ${errorMsg}`);

        // Convert to TranspilerError if it's not already
        if (!(error instanceof TranspilerError)) {
          throw new TranspilerError(
            `Global environment initialization failed: ${errorMsg}`,
          );
        }
        throw error;
      }
    });
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
    // Create a new MacroRegistry for this environment, or use the parent's
    this.macroRegistry = parent
      ? parent.macroRegistry
      : new MacroRegistry(this.logger.enabled);
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
      this.defineJsInterop();

      this.logger.debug("Built-in functions initialized successfully");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize built-in functions: ${errorMsg}`);
      throw new ValidationError(
        `Failed to initialize built-in functions: ${errorMsg}`,
        "environment initialization",
      );
    }
  }

  /**
   * Define arithmetic operators
   */
  private defineArithmeticOperators(): void {
    try {
      this.define("+", (...args: number[]) => args.reduce((a, b) => a + b, 0));
      this.define("-", (a: number, b?: number) => {
        // Handle unary minus when only one argument
        if (b === undefined) return -a;
        return a - b;
      });
      this.define("*", (...args: number[]) => args.reduce((a, b) => a * b, 1));
      this.define("/", (a: number, b: number) => {
        if (b === 0) {
          throw new ValidationError(
            "Division by zero",
            "arithmetic operation",
            "number",
            "zero",
          );
        }
        return a / b;
      });
      this.define("%", (a: number, b: number) => {
        if (b === 0) {
          throw new ValidationError(
            "Modulo by zero",
            "arithmetic operation",
            "number",
            "zero",
          );
        }
        return a % b;
      });
      this.logger.debug("Arithmetic operators defined");
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to define arithmetic operators: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "arithmetic operator definition",
      );
    }
  }

  /**
   * Define comparison operators
   */
  private defineComparisonOperators(): void {
    try {
      this.define("=", (a: Value, b: Value) => a === b);
      this.define("eq?", (a: Value, b: Value) => a === b);
      this.define("!=", (a: Value, b: Value) => a !== b);
      this.define("<", (a: number, b: number) => a < b);
      this.define(">", (a: number, b: number) => a > b);
      this.define("<=", (a: number, b: number) => a <= b);
      this.define(">=", (a: number, b: number) => a >= b);
      this.logger.debug("Comparison operators defined");
    } catch (error) {
      throw new ValidationError(
        `Failed to define comparison operators: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "comparison operator definition",
      );
    }
  }

  /**
   * Define list operations
   */
  private defineListOperations(): void {
    try {
      this.define(
        "get",
        (coll: unknown, key: string | number, notFound: Value = null) => {
          if (coll == null) return notFound;
          if (Array.isArray(coll)) {
            return (typeof key === "number" && key >= 0 && key < coll.length)
              ? coll[key]
              : notFound;
          }
          return (typeof coll === "object" &&
              key in (coll as Record<string, unknown>))
            ? (coll as Record<string, unknown>)[key]
            : notFound;
        },
      );
      this.logger.debug("List operations defined");
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to define list operations: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "list operation definition",
      );
    }
  }

  /**
   * Define JS interop functions
   */
  private defineJsInterop(): void {
    try {
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

      this.define(
        "js-call",
        (obj: unknown, method: string, ...args: unknown[]) => {
          if (obj === null || obj === undefined) {
            throw new ValidationError(
              "Cannot call method on null or undefined",
              "js-call operation",
              "object",
              obj === null ? "null" : "undefined",
            );
          }

          const objWithMethods = obj as Record<string, unknown>;
          if (typeof objWithMethods[method] !== "function") {
            throw new ValidationError(
              `${method} is not a function on the given object`,
              "js-call operation",
              "function",
              typeof objWithMethods[method],
            );
          }

          return (objWithMethods[method] as Function)(...args);
        },
      );

      // Enhanced throw for better error handling
      this.define("throw", (message: string) => {
        throw new TranspilerError(message);
      });

      this.logger.debug("JS interop functions defined");
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to define JS interop functions: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "JS interop definition",
      );
    }
  }

  /**
   * Define a variable in this environment with simplified cache handling
   */
  define(key: string, value: Value): void {
    try {
      this.logger.debug(`Defining symbol: ${key}`);
      this.variables.set(key, value);

      // Clear lookup cache for this key
      this.lookupCache.delete(key);

      // For functions, also register them with a metadata property
      // to indicate they can be used during macro expansion
      if (typeof value === "function") {
        Object.defineProperty(value, "isDefFunction", { value: true });
      }
    } catch (error) {
      throw new ValidationError(
        `Failed to define symbol ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "environment definition",
      );
    }
  }

  /**
   * Look up a variable in the environment chain with simplified caching
   */
  lookup(key: string): Value {
    try {
      // Check cache first for performance
      const cachedValue = this.lookupCache.get(key);
      if (cachedValue !== undefined) {
        return cachedValue;
      }

      // Handle dot notation for module property access
      if (key.includes(".")) {
        const result = this.lookupDotNotation(key);
        this.lookupCache.set(key, result);
        return result;
      }

      // Check with sanitized name (underscores instead of dashes)
      const sanitizedKey = key.replace(/-/g, "_");

      if (this.variables.has(sanitizedKey)) {
        const value = this.variables.get(sanitizedKey);
        this.lookupCache.set(key, value!);
        this.lookupCache.set(sanitizedKey, value!);
        return value!;
      }

      // Check with original name
      if (this.variables.has(key)) {
        const value = this.variables.get(key);
        this.lookupCache.set(key, value!);
        return value!;
      }

      // Try parent environment
      if (this.parent) {
        try {
          const value = this.parent.lookup(key);
          this.lookupCache.set(key, value);
          return value;
        } catch (_error) {
          // Parent lookup failed, continue to throw our own error
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
      if (error instanceof ValidationError) {
        throw error;
      }

      throw new ValidationError(
        `Error looking up symbol ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "variable lookup",
      );
    }
  }

  /**
   * Look up a property using dot notation
   * Enhanced with better error messages
   */
  private lookupDotNotation(key: string): Value {
    const [moduleName, ...propertyParts] = key.split(".");
    const propertyPath = propertyParts.join(".");

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
          "undefined property",
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
            "undefined module",
          );
        }
        throw error;
      }

      throw new ValidationError(
        `Error accessing ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "dot notation lookup",
      );
    }
  }

  /**
   * Helper to get a property from an object via a path string
   * Enhanced with better error messages
   */
  private getPropertyFromPath(obj: unknown, path: string): Value {
    if (!path) return obj;

    if (obj === null || obj === undefined) {
      throw new ValidationError(
        `Cannot access property '${path}' of ${
          obj === null ? "null" : "undefined"
        }`,
        "property access",
        "object",
        obj === null ? "null" : "undefined",
      );
    }

    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (
        current === null || current === undefined || typeof current !== "object"
      ) {
        throw new ValidationError(
          `Cannot access property '${part}' of ${typeof current}`,
          "property path access",
          "object",
          typeof current,
        );
      }

      const currentObj = current as Record<string, unknown>;

      // Try original property name
      if (part in currentObj) {
        current = currentObj[part];
        continue;
      }

      // Try sanitized property name
      const sanitizedPart = part.replace(/-/g, "_");
      if (sanitizedPart !== part && sanitizedPart in currentObj) {
        current = currentObj[sanitizedPart];
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

  /**
   * Import a module into the environment
   * Enhanced with better error handling
   */
  importModule(moduleName: string, exports: Record<string, Value>): void {
    try {
      this.logger.debug(`Importing module: ${moduleName}`);

      // Create a module object with all exports
      const moduleObj: Record<string, Value> = { ...exports };

      // Store the module as a variable
      this.define(moduleName, moduleObj);

      // Store module exports for qualified access
      this.moduleExports.set(moduleName, exports);

      // Register all macros and functions from the module
      for (const [exportName, exportValue] of Object.entries(exports)) {
        if (typeof exportValue === "function") {
          if ("isMacro" in exportValue) {
            // Register direct macros with qualified name
            this.macros.set(
              `${moduleName}.${exportName}`,
              exportValue as MacroFn,
            );

            // For core modules, also register direct macros
            if (moduleName === "core" || moduleName === "lib/core") {
              this.defineMacro(exportName, exportValue as MacroFn);
            }
          } // Register functions for macro evaluation
          else if ("isDefFunction" in exportValue) {
            this.define(`${moduleName}.${exportName}`, exportValue);
          }
        }
      }

      this.logger.debug(
        `Module ${moduleName} imported with exports in Environment`,
      );
    } catch (error) {
      if (error instanceof ValidationError || error instanceof MacroError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to import module ${moduleName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "module import",
      );
    }
  }

  /**
   * === DELEGATED MACRO METHODS ===
   * The following methods delegate to MacroRegistry to eliminate duplication
   */

  /**
   * Helper to tag macro functions with metadata
   */
  private tagMacroFunction(
    macro: MacroFn,
    name: string,
    sourceFile?: string,
  ): void {
    try {
      Object.defineProperty(macro, "isMacro", { value: true });
      Object.defineProperty(macro, "macroName", { value: name });

      if (sourceFile) {
        Object.defineProperty(macro, "sourceFile", { value: sourceFile });
        Object.defineProperty(macro, "isUserMacro", { value: true });
      }
    } catch (error) {
      // Non-critical, just log the warning
      this.logger.warn(
        `Could not tag macro function ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Define a system-wide macro - delegates to MacroRegistry
   */
  defineMacro(key: string, macro: MacroFn): void {
    try {
      this.logger.debug(`Defining macro: ${key}`);
      this.tagMacroFunction(macro, key);
      this.macroRegistry.defineSystemMacro(key, macro);

      // Also store in the legacy macros map for backward compatibility
      this.macros.set(key, macro);

      // Also register with sanitized name if different for backward compatibility
      const sanitizedKey = key.replace(/-/g, "_");
      if (sanitizedKey !== key) {
        this.macros.set(sanitizedKey, macro);
      }
    } catch (error) {
      throw new MacroError(
        `Failed to define macro ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        key,
        this.currentFilePath || undefined,
      );
    }
  }

  /**
   * Define a module-scoped macro - delegates to MacroRegistry
   */
  defineModuleMacro(
    filePath: string,
    macroName: string,
    macroFn: MacroFn,
  ): void {
    try {
      this.logger.debug(`Defining module macro: ${macroName} in ${filePath}`);

      // Tag the function with metadata
      this.tagMacroFunction(macroFn, macroName, filePath);

      // Delegate to the registry
      this.macroRegistry.defineModuleMacro(filePath, macroName, macroFn);

      // Also store in legacy module macros map for backward compatibility
      if (!this.moduleMacros.has(filePath)) {
        this.moduleMacros.set(filePath, new Map<string, MacroFn>());
      }

      this.moduleMacros.get(filePath)!.set(macroName, macroFn);
    } catch (error) {
      throw new MacroError(
        `Failed to define module macro ${macroName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        macroName,
        filePath,
      );
    }
  }

  /**
   * Mark a macro as exported from a file - delegates to MacroRegistry
   */
  exportMacro(filePath: string, macroName: string): void {
    try {
      // Delegate to the registry
      this.macroRegistry.exportMacro(filePath, macroName);

      // Also update legacy exports map for backward compatibility
      if (!this.exportedMacros.has(filePath)) {
        this.exportedMacros.set(filePath, new Set<string>());
      }

      this.exportedMacros.get(filePath)!.add(macroName);
    } catch (error) {
      throw new MacroError(
        `Failed to export macro ${macroName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        macroName,
        filePath,
      );
    }
  }

  /**
   * Import a macro from one module to another - delegates to MacroRegistry
   */
  importMacro(
    sourceFile: string,
    macroName: string,
    targetFile: string,
    aliasName?: string,
  ): boolean {
    try {
      // Delegate to the registry
      const success = this.macroRegistry.importMacro(
        sourceFile,
        macroName,
        targetFile,
        aliasName,
      );

      if (success) {
        // Also update legacy import maps for backward compatibility
        const importName = aliasName || macroName;

        // Record the import
        if (!this.importedMacros.has(targetFile)) {
          this.importedMacros.set(targetFile, new Map<string, string>());
        }
        this.importedMacros.get(targetFile)!.set(importName, sourceFile);

        // Record alias if provided
        if (aliasName && aliasName !== macroName) {
          if (!this.macroAliases.has(targetFile)) {
            this.macroAliases.set(targetFile, new Map<string, string>());
          }
          this.macroAliases.get(targetFile)!.set(aliasName, macroName);
        }
      }

      return success;
    } catch (error) {
      throw new MacroError(
        `Failed to import macro ${macroName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        macroName,
        sourceFile,
      );
    }
  }

  /**
   * Check if a macro exists - delegates to MacroRegistry
   */
  hasMacro(key: string): boolean {
    return this.macroRegistry.hasMacro(key, this.currentFilePath);
  }

  /**
   * Get a macro if available - delegates to MacroRegistry
   */
  getMacro(key: string): MacroFn | undefined {
    return this.macroRegistry.getMacro(key, this.currentFilePath);
  }

  /**
   * Check if a module has a specific macro - delegates to MacroRegistry
   */
  hasModuleMacro(filePath: string, macroName: string): boolean {
    return this.macroRegistry.hasModuleMacro(filePath, macroName);
  }

  /**
   * Check if a symbol is a user-level macro - delegates to MacroRegistry
   */
  isUserLevelMacro(symbolName: string, fromFile: string): boolean {
    return this.macroRegistry.hasMacro(symbolName, fromFile) &&
      !this.macroRegistry.isSystemMacro(symbolName);
  }

  /**
   * Get exported macros from a file - delegates to MacroRegistry
   */
  getExportedMacros(filePath: string): Set<string> | undefined {
    return this.macroRegistry.getExportedMacros(filePath);
  }

  /**
   * Mark a file as processed - delegates to MacroRegistry
   */
  markFileProcessed(filePath: string): void {
    // Call registry method
    this.macroRegistry.markFileProcessed(filePath);

    // Also update legacy set for backward compatibility
    this.processedFiles.add(filePath);
  }

  /**
   * Check if a file has been processed - delegates to MacroRegistry
   */
  hasProcessedFile(filePath: string): boolean {
    // Check registry first
    if (this.macroRegistry.hasProcessedFile(filePath)) {
      return true;
    }

    // Fallback to legacy check
    return this.processedFiles.has(filePath);
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
      this.logger.warn(
        `Error setting current file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Not throwing here as this is a non-critical operation
    }
  }

  /**
   * Get the current file being processed
   */
  getCurrentFile(): string {
    return this.currentFilePath ?? "";
  }

  /**
   * Get the current macro context
   */
  getCurrentMacroContext(): string | null {
    return this.currentMacroContext;
  }

  /**
   * Set the current macro context
   */
  setCurrentMacroContext(context: string | null): void {
    this.currentMacroContext = context;
  }

  /**
   * Create a child environment with this one as parent
   */
  extend(): Environment {
    return new Environment(this, this.logger);
  }

  /**
   * Clear the lookup cache
   */
  clearCache(): void {
    this.lookupCache.clear();
    this.logger.debug("Lookup cache cleared");
  }
}
