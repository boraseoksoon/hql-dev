import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { Logger } from "../logger.ts";
import { MacroFn } from "../environment.ts";
import { MacroError } from "../transpiler/error/errors.ts";

export class MacroRegistry {
  private systemMacros = new Map<string, MacroFn>();
  private moduleMacros = new Map<string, Map<string, MacroFn>>();
  private exportedMacros = new Map<string, Set<string>>();
  private importedMacros = new Map<string, Map<string, string>>();
  private macroAliases = new Map<string, Map<string, string>>();
  private processedFiles = new Set<string>();
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

  defineModuleMacro(filePath: string, name: string, macroFn: MacroFn): void {
    this.safeExecute(() => {
      this.validateString(filePath, "File path required for module macro", name, filePath);
      this.validateString(name, "Cannot define module macro with empty name", "module-macro", filePath);
      this.validateNotNull(macroFn, `Cannot define module macro ${name} with null function`, name, filePath);
      if (this.hasModuleMacro(filePath, name)) {
        this.logger.debug(`Module macro ${name} already defined in ${filePath}, skipping duplicate`);
        return;
      }
      this.logger.debug(`Defining module macro: ${name} in ${filePath}`);
      if (!this.moduleMacros.has(filePath)) {
        this.moduleMacros.set(filePath, new Map<string, MacroFn>());
      }
      this.moduleMacros.get(filePath)!.set(name, macroFn);
    }, `Failed to define module macro ${name}`, name, filePath);
  }

  exportMacro(filePath: string, macroName: string): void {
    this.safeExecute(() => {
      this.validateString(filePath, "File path required for exporting macro", macroName, filePath);
      this.validateString(macroName, "Cannot export macro with empty name", "export-macro", filePath);
      if (!this.hasModuleMacro(filePath, macroName)) {
        this.logger.warn(`Cannot export non-existent macro ${macroName} from ${filePath}`);
        throw new MacroError(`Cannot export non-existent macro ${macroName}`, macroName, filePath);
      }
      this.logger.debug(`Exporting macro ${macroName} from ${filePath}`);
      if (!this.exportedMacros.has(filePath)) {
        this.exportedMacros.set(filePath, new Set<string>());
      }
      this.exportedMacros.get(filePath)!.add(macroName);
      this.persistExport(filePath, macroName);
    }, `Failed to export macro ${macroName}`, macroName, filePath);
  }

  private persistExport(filePath: string, exportName: string): void {
    const absolutePath = this.resolveFullPath(filePath);
    if (!this.persistentExports.has(absolutePath)) {
      this.persistentExports.set(absolutePath, new Set<string>());
    }
    this.persistentExports.get(absolutePath)!.add(exportName);
    this.logger.debug(`Registered persistent export: ${exportName} from ${absolutePath}`);
  }

  getExportedMacros(filePath: string): Set<string> | undefined {
    const directExports = this.exportedMacros.get(filePath);
    if (directExports && directExports.size > 0) return directExports;
    const absolutePath = this.resolveFullPath(filePath);
    const persistent = this.persistentExports.get(absolutePath);
    if (persistent && persistent.size > 0) return persistent;
    for (const [p, exports] of this.persistentExports.entries()) {
      if (p.endsWith(filePath) || filePath.endsWith(p)) return exports;
    }
    for (const [p, exports] of this.exportedMacros.entries()) {
      if (p.endsWith(filePath) || filePath.endsWith(p)) return exports;
    }
    return undefined;
  }

  private resolveFullPath(filePath: string): string {
    try {
      // Always resolve relative to macro-registry.ts location, not CWD
return filePath.startsWith("/") ? filePath : path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), filePath);
    } catch {
      return filePath;
    }
  }

  importMacro(fromFile: string, macroName: string, toFile: string, aliasName?: string): boolean {
    return this.safeBoolean(() => {
      this.validateString(fromFile, "Source file path required for importing macro", macroName, toFile);
      this.validateString(macroName, "Cannot import macro with empty name", "import-macro", toFile);
      this.validateString(toFile, "Target file path required for importing macro", macroName, fromFile);
      if (fromFile === toFile) {
        this.logger.debug(`Skipping self-import of ${macroName} (same file)`);
        return;
      }
      if (!this.hasModuleMacro(fromFile, macroName)) {
        this.logger.warn(`Cannot import non-existent macro ${macroName} from ${fromFile}`);
        throw new MacroError(`Macro ${macroName} not found in module ${fromFile}`, macroName, fromFile);
      }
      if (!this.isExported(fromFile, macroName)) {
        this.logger.warn(`Cannot import non-exported macro ${macroName} from ${fromFile}`);
        throw new MacroError(`Macro ${macroName} exists but is not exported from ${fromFile}`, macroName, fromFile);
      }
      const importName = aliasName || macroName;
      if (aliasName && aliasName !== macroName) {
        if (!this.macroAliases.has(toFile)) {
          this.macroAliases.set(toFile, new Map<string, string>());
        }
        this.macroAliases.get(toFile)!.set(aliasName, macroName);
        this.logger.debug(`Created alias ${aliasName} -> ${macroName} in ${toFile}`);
      }
      if (!this.importedMacros.has(toFile)) {
        this.importedMacros.set(toFile, new Map<string, string>());
      }
      this.importedMacros.get(toFile)!.set(importName, fromFile);
      this.logger.debug(`Successfully imported macro ${macroName}${aliasName ? ` as ${aliasName}` : ""} from ${fromFile} to ${toFile}`);
    }, `Failed to import macro ${macroName} from ${fromFile} to ${toFile}`, macroName, toFile);
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

  hasModuleMacro(filePath: string, name: string): boolean {
    return this.safe(() => {
      if (!filePath || !name) return false;
      const macros = this.moduleMacros.get(filePath);
      return !!macros && macros.has(name);
    }, false, `Error checking if module ${filePath} has macro ${name}`);
  }

  isExported(filePath: string, name: string): boolean {
    return this.safe(() => {
      if (!filePath || !name) return false;
      const exports = this.exportedMacros.get(filePath);
      return !!exports && exports.has(name);
    }, false, `Error checking if macro ${name} is exported from ${filePath}`);
  }

  isImported(filePath: string, name: string): boolean {
    return this.safe(() => {
      if (!filePath || !name) return false;
      const imports = this.importedMacros.get(filePath);
      return !!imports && imports.has(name);
    }, false, `Error checking if macro ${name} is imported into ${filePath}`);
  }

  getImportSource(filePath: string, name: string): string | null {
    return this.safe(() => {
      if (!filePath || !name) return null;
      const imports = this.importedMacros.get(filePath);
      return imports?.get(name) || null;
    }, null, `Error getting import source for macro ${name} in ${filePath}`);
  }

  resolveAlias(filePath: string, name: string): string {
    return this.safe(() => {
      if (!filePath || !name) return name;
      const aliases = this.macroAliases.get(filePath);
      return aliases?.get(name) || name;
    }, name, `Error resolving alias for ${name} in ${filePath}`);
  }

  getSystemMacro(name: string): MacroFn | undefined {
    if (!name) {
      this.logger.warn("Cannot get system macro with empty name");
      return undefined;
    }
    return this.safe(() => this.systemMacros.get(name), undefined, `Error getting system macro ${name}`);
  }

  getModuleMacro(filePath: string, name: string): MacroFn | undefined {
    return this.safe(() => {
      if (!filePath || !name) {
        this.logger.warn("Cannot get module macro with empty file path or name");
        return undefined;
      }
      const macros = this.moduleMacros.get(filePath);
      return macros?.get(name);
    }, undefined, `Error getting module macro ${name} from ${filePath}`);
  }

  hasMacro(name: string, currentFile: string | null = null): boolean {
    if (!name) return false;
    if (this.systemMacros.has(name)) {
      this.logger.debug(`Found system macro: ${name}`);
      return true;
    }
    if (!currentFile) return false;
    if (this.hasModuleMacro(currentFile, name)) {
      this.logger.debug(`Found local module macro: ${name} in ${currentFile}`);
      return true;
    }
    if (this.isImported(currentFile, name)) {
      const sourceFile = this.getImportSource(currentFile, name)!;
      const originalName = this.resolveAlias(currentFile, name);
      const exists = this.hasModuleMacro(sourceFile, originalName);
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
    if (this.hasModuleMacro(currentFile, name)) {
      this.logger.debug(`Getting local module macro: ${name} from ${currentFile}`);
      return this.getModuleMacro(currentFile, name);
    }
    if (this.isImported(currentFile, name)) {
      const sourceFile = this.getImportSource(currentFile, name)!;
      const originalName = this.resolveAlias(currentFile, name);
      if (this.hasModuleMacro(sourceFile, originalName) && this.isExported(sourceFile, originalName)) {
        this.logger.debug(`Getting imported macro: ${name} (${originalName}) from ${sourceFile}`);
        return this.getModuleMacro(sourceFile, originalName);
      } else {
        if (!this.hasModuleMacro(sourceFile, originalName)) {
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
