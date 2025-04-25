import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { Logger } from "../logger.ts";
import { MacroFn } from "../environment.ts";
import { MacroError } from "../common/error-pipeline.ts";

export class MacroRegistry {
  private systemMacros = new Map<string, MacroFn>();
  private logger: Logger;
  private persistentExports = new Map<string, Set<string>>();

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
  }

  isSystemMacro(name: string): boolean {
    return this.systemMacros.has(name);
  }

  exportMacro(filePath: string, macroName: string): void {
    this.safeExecute(() => {
      this.validateString(filePath, "File path required for exporting macro", macroName, filePath);
      this.validateString(macroName, "Cannot export macro with empty name", "export-macro", filePath);
      const absolutePath = this.resolveFullPath(filePath);
      if (!this.persistentExports.has(absolutePath)) {
        this.persistentExports.set(absolutePath, new Set<string>());
      }
      this.persistentExports.get(absolutePath)!.add(macroName);
      this.logger.debug(`Registered persistent export: ${macroName} from ${absolutePath}`);
    }, `Failed to export macro ${macroName}`, macroName, filePath);
  }

  private resolveFullPath(filePath: string): string {
    try {
      return filePath.startsWith("/") ? filePath : path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), filePath);
    } catch {
      return filePath;
    }
  }

  hasProcessedFile(filePath: string): boolean {
    return this.processedFiles.has(filePath);
  }

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

  getSystemMacro(name: string): MacroFn | undefined {
    if (!name) {
      this.logger.warn("Cannot get system macro with empty name");
      return undefined;
    }
    return this.safe(() => this.systemMacros.get(name), undefined, `Error getting system macro ${name}`);
  }

  hasMacro(name: string, currentFile: string | null = null): boolean {
    if (!name) return false;
    if (this.systemMacros.has(name)) {
      this.logger.debug(`Found system macro: ${name}`);
      return true;
    }
    if (!currentFile) return false;
    if (this.(currentFile, name)) {
      this.logger.debug(`Found local module macro: ${name} in ${currentFile}`);
      return true;
    }
    if (this.isImported(currentFile, name)) {
      const sourceFile = this.getImportSource(currentFile, name)!;
      const originalName = this.resolveAlias(currentFile, name);
      const exists = this.(sourceFile, originalName);
      const exported = this.isExported(sourceFile, originalName);
      if (exists && exported) {
        this.logger.debug(`Found imported macro: ${name} from ${sourceFile}`);
        return true;
      } else {
        if (!exists) {
          this.logger.warn(`Imported macro ${originalName} does not exist in source module ${sourceFile}`);
        } else if (!exported) {
          this.logger.warn(`Imported macro ${originalName} exists but is not exported from ${sourceFile}`);
        }
      }
    }
    return false;
  }

  getMacro(name: string, currentFile: string | null = null): MacroFn | undefined {
    if (!name) {
      this.logger.warn("Cannot get macro with empty name");
      return undefined;
    }
    if (this.systemMacros.has(name)) {
      this.logger.debug(`Getting system macro: ${name}`);
      return this.systemMacros.get(name);
    }
    if (!currentFile) {
      this.logger.debug(`No current file context to look up module macro: ${name}`);
      return undefined;
    }
    if (this.(currentFile, name)) {
      this.logger.debug(`Getting local module macro: ${name} from ${currentFile}`);
      return this.getModuleMacro(currentFile, name);
    }
    if (this.isImported(currentFile, name)) {
      const sourceFile = this.getImportSource(currentFile, name)!;
      const originalName = this.resolveAlias(currentFile, name);
      if (this.(sourceFile, originalName) && this.isExported(sourceFile, originalName)) {
        this.logger.debug(`Getting imported macro: ${name} (${originalName}) from ${sourceFile}`);
        return this.getModuleMacro(sourceFile, originalName);
      } else {
        if (!this.(sourceFile, originalName)) {
          this.logger.warn(`Imported macro ${originalName} not found in source module ${sourceFile}`);
        } else if (!this.isExported(sourceFile, originalName)) {
          this.logger.warn(`Imported macro ${originalName} exists but is not exported from ${sourceFile}`);
        }
      }
    }
    this.logger.debug(`Macro ${name} not found in current context`);
    return undefined;
  }
}
