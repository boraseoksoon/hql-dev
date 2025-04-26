// core/src/s-exp/macro-registry.ts - Further cleanup of user-level macro references
import { Logger } from "../logger.ts";
import { MacroFn } from "../environment.ts";
import { MacroError } from "../common/error.ts";
import { globalSymbolTable } from "../transpiler/symbol_table.ts";

export class MacroRegistry {
  private systemMacros = new Map<string, MacroFn>();
  private processedFiles = new Set<string>();
  private logger: Logger;

  constructor(verbose: boolean = false) {
    this.logger = new Logger(verbose);
    this.logger.debug("MacroRegistry initialized");
  }

  private validateString(value: string, errorMessage: string, macroName: string, filePath?: string): void {
    if (!value) {
      this.logger.error(errorMessage);
      throw new MacroError(errorMessage, macroName, filePath);
    }
  }

  private validateNotNull(value: unknown, errorMessage: string, macroName: string, filePath?: string): void {
    if (!value) {
      this.logger.error(errorMessage);
      throw new MacroError(errorMessage, macroName, filePath);
    }
  }

  private safeExecute<T>(fn: () => T, errorPrefix: string, macroName: string, filePath?: string): T {
    try {
      return fn();
    } catch (error) {
      if (error instanceof MacroError) throw error;
      throw new MacroError(`${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`, macroName, filePath);
    }
  }

  private safeBoolean(fn: () => void, errorPrefix: string, _macroName: string, _filePath?: string): boolean {
    try {
      fn();
      return true;
    } catch (error) {
      if (error instanceof MacroError) {
        this.logger.warn(error.message);
        return false;
      }
      this.logger.warn(`${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private safe<T>(fn: () => T, fallback: T, context: string): T {
    try {
      return fn();
    } catch (error) {
      this.logger.warn(`${context}: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  }

  /**
   * Define a system-level macro
   */
  defineSystemMacro(name: string, macroFn: MacroFn): void {
    this.validateString(name, "Cannot define system macro with empty name", "system-macro");
    this.validateNotNull(macroFn, `Cannot define system macro ${name} with null function`, name);
    this.logger.debug(`Defining system macro: ${name}`);
    this.systemMacros.set(name, macroFn);
    const sanitizedName = name.replace(/-/g, "_");
    if (sanitizedName !== name) {
      this.logger.debug(`Also registering system macro with sanitized name: ${sanitizedName}`);
      this.systemMacros.set(sanitizedName, macroFn);
    }
    
    // Add to global symbol table
    globalSymbolTable.set({
      name: name,
      kind: 'macro',
      scope: 'global',
      meta: { isCore: true }
    });
  }

  /**
   * Check if a macro is a system-level macro
   */
  isSystemMacro(name: string): boolean {
    return this.systemMacros.has(name);
  }

  /**
   * Mark a file as processed
   */
  markFileProcessed(filePath: string): void {
    if (!filePath) {
      this.logger.warn("Cannot mark empty file path as processed");
      return;
    }
    try {
      this.processedFiles.add(filePath);
      this.logger.debug(`Marked file as processed: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Error marking file ${filePath} as processed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a file has been processed
   */
  hasProcessedFile(filePath: string): boolean {
    return this.processedFiles.has(filePath);
  }

  /**
   * Import a macro from another file (only supported for system macros)
   */
  importMacro(fromFile: string, macroName: string, toFile: string, aliasName?: string): boolean {
    return this.safeBoolean(() => {
      this.validateString(fromFile, "Source file path required for importing macro", macroName, toFile);
      this.validateString(macroName, "Cannot import macro with empty name", "import-macro", toFile);
      this.validateString(toFile, "Target file path required for importing macro", macroName, fromFile);
      
      if (fromFile === toFile) {
        this.logger.debug(`Skipping self-import of ${macroName} (same file)`);
        return;
      }
      
      // Try to find the macro in the system macros
      if (this.systemMacros.has(macroName)) {
        const importName = aliasName || macroName;
        this.logger.debug(`Importing system macro ${macroName}${aliasName ? ` as ${aliasName}` : ""}`);
        
        // Add to global symbol table
        globalSymbolTable.set({
          name: importName,
          kind: 'macro',
          scope: 'local',
          aliasOf: aliasName ? macroName : undefined,
          isImported: true,
          meta: { importedInFile: toFile, isSystemMacro: true }
        });
        
        return;
      }
      
      // If not a system macro, we can't import it
      this.logger.warn(`Cannot import macro ${macroName} - not a system macro`);
      throw new MacroError(`Macro ${macroName} is not a system macro and cannot be imported`, macroName, fromFile);
    }, `Failed to import macro ${macroName} from ${fromFile} to ${toFile}`, macroName, toFile);
  }

  /**
   * Check if a macro is defined
   */
  hasMacro(name: string): boolean {
    if (!name) return false;
    if (this.systemMacros.has(name)) {
      this.logger.debug(`Found system macro: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Get a macro function by name
   */
  getMacro(name: string): MacroFn | undefined {
    if (!name) {
      this.logger.warn("Cannot get macro with empty name");
      return undefined;
    }
    
    if (this.systemMacros.has(name)) {
      this.logger.debug(`Getting system macro: ${name}`);
      return this.systemMacros.get(name);
    }
    
    this.logger.debug(`Macro ${name} not found in system macros`);
    return undefined;
  }
}