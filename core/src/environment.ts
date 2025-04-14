import { SExp } from "./s-exp/types.ts";
import { getLogger } from "./logger-init.ts";
import { Logger } from "./logger.ts";
import { MacroRegistry } from "./s-exp/macro-registry.ts";
import {
  MacroError,
  TranspilerError,
  ValidationError,
  CommonErrorUtils
} from "./transpiler/error/common-error-utils.ts";
import { LRUCache } from "./utils/lru-cache.ts";

export type Value =
  | string
  | number
  | boolean
  | null
  | SExp
  | /* eslint-disable-next-line @typescript-eslint/ban-types */
  Function
  | Record<string, unknown>
  | unknown[];

export type MacroFn = ((args: SExp[], env: Environment) => SExp) & {
  isMacro?: boolean;
  macroName?: string;
  sourceFile?: string;
  isUserMacro?: boolean;
};

export class Environment {
  public variables = new Map<string, Value>();
  public macros = new Map<string, MacroFn>();
  public moduleExports = new Map<string, Record<string, Value>>();
  public moduleMacros = new Map<string, Map<string, MacroFn>>();
  public exportedMacros = new Map<string, Set<string>>();
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

  static initializeGlobalEnv(
    options: { verbose?: boolean } = {},
  ): Promise<Environment> {
    return new Promise((resolve) => {
      const logger = getLogger(options);
      try {
        const env = new Environment(null, logger);
        env.initializeBuiltins();
        logger.debug("Global environment initialized successfully");
        Environment.globalEnv = env;
        resolve(env);
      } catch (error) {
        logger.error(`Failed to initialize global environment: ${CommonErrorUtils.formatErrorMessage(error)}`);
        if (!(error instanceof TranspilerError)) {
          throw new TranspilerError(`Global environment initialization failed: ${CommonErrorUtils.formatErrorMessage(error)}`);
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
    this.logger = logger || getLogger();
    this.macroRegistry = parent
      ? parent.macroRegistry
      : new MacroRegistry(this.logger.isVerbose);
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
        return (o[method] as /* eslint-disable-next-line @typescript-eslint/ban-types */ Function)(...args);
      });
      this.define("throw", (message: string) => {
        throw new TranspilerError(message);
      });
      this.logger.debug("Built-in functions initialized successfully");
    } catch (error) {
      this.logger.error(`Failed to initialize built-in functions: ${CommonErrorUtils.formatErrorMessage(error)}`);
      throw new ValidationError(`Failed to initialize built-in functions: ${CommonErrorUtils.formatErrorMessage(error)}`, "environment");
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
    } catch (error) {
      throw new ValidationError(`Failed to define symbol ${key}: ${CommonErrorUtils.formatErrorMessage(error)}`, "environment");
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
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(`Error looking up symbol ${key}: ${CommonErrorUtils.formatErrorMessage(error)}`, "variable lookup");
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
      throw new ValidationError(`Error accessing ${key}: ${CommonErrorUtils.formatErrorMessage(error)}`, "dot notation lookup");
    }
  }

  private getPropertyFromPath(obj: unknown, path: string): Value {
    try {
      if (obj === null || obj === undefined) {
        throw new ValidationError(
          `Cannot access property '${path}' on ${obj === null ? "null" : "undefined"}`,
          "property access",
          "object",
          obj === null ? "null" : "undefined",
        );
      }
      const parts = path.split(".");
      let current: unknown = obj;
      for (const part of parts) {
        if (current === null || current === undefined) {
          throw new ValidationError(
            `Cannot access property '${part}' on ${current === null ? "null" : "undefined"}`,
            "property access",
            "object",
            current === null ? "null" : "undefined",
          );
        }
        if (typeof current !== "object" && typeof current !== "function") {
          throw new ValidationError(
            `Cannot access property '${part}' on non-object type: ${typeof current}`,
            "property access",
            "object",
            typeof current,
          );
        }
        current = (current as Record<string, unknown>)[part];
      }
      return current as Value;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(`Error accessing property '${path}': ${CommonErrorUtils.formatErrorMessage(error)}`, "property access");
    }
  }

  importModule(moduleName: string, exports: Record<string, Value>): void {
    try {
      this.logger.debug(`Importing module: ${moduleName} with ${Object.keys(exports).length} exports`);
      this.moduleExports.set(moduleName, exports);
      // Add individual exports to the current scope for easier access
      for (const [key, value] of Object.entries(exports)) {
        const fullName = `${moduleName}.${key}`;
        // Don't override existing variables
        if (!this.variables.has(fullName)) {
          this.define(fullName, value);
        }
      }
    } catch (error) {
      throw new ValidationError(`Failed to import module '${moduleName}': ${CommonErrorUtils.formatErrorMessage(error)}`, "module import");
    }
  }

  private tagMacroFunction(macro: MacroFn, name: string, sourceFile?: string) {
    try {
      Object.defineProperty(macro, "isMacro", { value: true });
      Object.defineProperty(macro, "macroName", { value: name });
      if (sourceFile) {
        Object.defineProperty(macro, "sourceFile", { value: sourceFile });
        Object.defineProperty(macro, "isUserMacro", { value: true });
      }
    } catch (error) {
      this.logger.warn(
        `Could not tag macro function ${name}: ${
          CommonErrorUtils.formatErrorMessage(error)
        }`,
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
    } catch (error) {
      const msg = CommonErrorUtils.formatErrorMessage(error);
      throw new MacroError(`Failed to define macro ${key}: ${msg}`, key, this.currentFilePath || undefined);
    }
  }

  defineModuleMacro(filePath: string, macroName: string, macroFn: MacroFn): void {
    try {
      this.logger.debug(`Defining module macro: ${macroName} in ${filePath}`);
      this.tagMacroFunction(macroFn, macroName, filePath);
      this.macroRegistry.defineModuleMacro(filePath, macroName, macroFn);
      if (!this.moduleMacros.has(filePath)) {
        this.moduleMacros.set(filePath, new Map<string, MacroFn>());
      }
      this.moduleMacros.get(filePath)!.set(macroName, macroFn);
    } catch (error) {
      const msg = CommonErrorUtils.formatErrorMessage(error);
      throw new MacroError(`Failed to define module macro ${macroName}: ${msg}`, macroName, filePath);
    }
  }

  exportMacro(filePath: string, macroName: string): void {
    try {
      this.macroRegistry.exportMacro(filePath, macroName);
      if (!this.exportedMacros.has(filePath)) {
        this.exportedMacros.set(filePath, new Set<string>());
      }
      this.exportedMacros.get(filePath)!.add(macroName);
    } catch (error) {
      const msg = CommonErrorUtils.formatErrorMessage(error);
      throw new MacroError(`Failed to export macro ${macroName}: ${msg}`, macroName, filePath);
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
      }
      return success;
    } catch (error) {
      const msg = CommonErrorUtils.formatErrorMessage(error);
      throw new MacroError(`Failed to import macro ${macroName}: ${msg}`, macroName, sourceFile);
    }
  }

  hasMacro(key: string): boolean {
    return this.macroRegistry.hasMacro(key, this.currentFilePath);
  }

  getMacro(key: string): MacroFn | undefined {
    return this.macroRegistry.getMacro(key, this.currentFilePath);
  }

  hasModuleMacro(filePath: string, macroName: string): boolean {
    return this.macroRegistry.hasModuleMacro(filePath, macroName);
  }

  isUserLevelMacro(symbolName: string, fromFile: string): boolean {
    return this.macroRegistry.hasMacro(symbolName, fromFile) &&
      !this.macroRegistry.isSystemMacro(symbolName);
  }

  getExportedMacros(filePath: string): Set<string> | undefined {
    return this.macroRegistry.getExportedMacros(filePath);
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
          CommonErrorUtils.formatErrorMessage(error)
        }`,
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

  // Add these methods to Environment class in src/environment.ts

  /**
   * Get all defined symbols in the environment
   */
  getAllDefinedSymbols(): string[] {
    // Collect symbols from variables
    const variableSymbols = Array.from(this.variables.keys());
    
    // Collect symbols from imported modules
    const moduleSymbols: string[] = [];
    this.moduleExports.forEach((exports, modulePath) => {
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
    Array.from(this.moduleExports.entries()).forEach(([path, exports]) => {
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
