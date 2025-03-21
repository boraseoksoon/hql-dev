// src/macro-registry.ts - Enhanced with better error handling and diagnostics
import { Logger } from './logger.ts';
import { MacroFn } from './environment.ts';
import { MacroError, TranspilerError } from './transpiler/errors.ts';

/**
 * MacroRegistry provides centralized management of both system-wide and module-scoped macros.
 * This improves performance by reducing redundant operations and enhances modularity.
 * Enhanced with better error handling and diagnostics.
 */
export class MacroRegistry {
  // System-wide macros (defined with defmacro)
  private systemMacros = new Map<string, MacroFn>();
  
  // Module-scoped macros (defined with macro in specific files)
  private moduleMacros = new Map<string, Map<string, MacroFn>>();
  
  // Track which macros are exported from each file
  private exportedMacros = new Map<string, Set<string>>();
  
  // Track which macros are imported into each file
  private importedMacros = new Map<string, Map<string, string>>();
  
  // Track macro aliases for improved import handling
  private macroAliases = new Map<string, Map<string, string>>();
  
  // Cache to track which files have been processed to avoid duplication
  private processedFiles = new Set<string>();
  
  // Logger for debugging
  private logger: Logger;
  
  /**
   * Create a new MacroRegistry
   */
  constructor(verbose: boolean = false) {
    this.logger = new Logger(verbose);
    this.logger.debug("MacroRegistry initialized");
  }
  
  /**
   * Define a system-wide macro
   */
  defineSystemMacro(name: string, macroFn: MacroFn): void {
    if (!name) {
      this.logger.error("Cannot define system macro with empty name");
      throw new MacroError("Cannot define system macro with empty name", "system-macro", undefined);
    }
    
    if (!macroFn) {
      this.logger.error(`Cannot define system macro ${name} with null function`);
      throw new MacroError(`Cannot define system macro ${name} with null function`, name, undefined);
    }
    
    this.logger.debug(`Defining system macro: ${name}`);
    this.systemMacros.set(name, macroFn);
    
    // Tag the function with metadata
    try {
      Object.defineProperty(macroFn, 'isMacro', { value: true });
      Object.defineProperty(macroFn, 'macroName', { value: name });
    } catch (error) {
      this.logger.warn(`Could not add metadata to macro ${name}: ${error instanceof Error ? error.message : String(error)}`);
      // Continue even if metadata tagging fails
    }
    
    // Also register with sanitized name if different
    const sanitizedName = name.replace(/-/g, '_');
    if (sanitizedName !== name) {
      this.logger.debug(`Also registering system macro with sanitized name: ${sanitizedName}`);
      this.systemMacros.set(sanitizedName, macroFn);
    }
  }
  
  /**
   * Define a module-scoped macro
   */
  defineModuleMacro(filePath: string, name: string, macroFn: MacroFn): void {
    try {
      // Validate inputs
      if (!filePath) {
        throw new MacroError("File path required for module macro", name, undefined);
      }
      
      if (!name) {
        throw new MacroError("Cannot define module macro with empty name", "module-macro", filePath);
      }
      
      if (!macroFn) {
        throw new MacroError(`Cannot define module macro ${name} with null function`, name, filePath);
      }
      
      // Skip if already defined to avoid redundant registrations
      if (this.hasModuleMacro(filePath, name)) {
        this.logger.debug(`Module macro ${name} already defined in ${filePath}, skipping duplicate`);
        return;
      }
      
      this.logger.debug(`Defining module macro: ${name} in ${filePath}`);
      
      // Get or create the file's macro registry
      if (!this.moduleMacros.has(filePath)) {
        this.moduleMacros.set(filePath, new Map<string, MacroFn>());
      }
      
      // Register the macro
      this.moduleMacros.get(filePath)!.set(name, macroFn);
      
      // Tag the function with metadata
      try {
        Object.defineProperty(macroFn, 'isMacro', { value: true });
        Object.defineProperty(macroFn, 'macroName', { value: name });
        Object.defineProperty(macroFn, 'sourceFile', { value: filePath });
        Object.defineProperty(macroFn, 'isUserMacro', { value: true });
      } catch (error) {
        this.logger.warn(`Could not add metadata to module macro ${name} in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        // Continue even if metadata tagging fails
      }
    } catch (error) {
      if (error instanceof MacroError) {
        throw error; // Re-throw MacroError directly
      }
      
      // Wrap other errors in a MacroError
      throw new MacroError(
        `Failed to define module macro ${name}: ${error instanceof Error ? error.message : String(error)}`,
        name,
        filePath
      );
    }
  }
  
  /**
   * Export a macro from a module
   */
  exportMacro(filePath: string, name: string): void {
    try {
      // Validate inputs
      if (!filePath) {
        throw new MacroError("File path required for exporting macro", name, undefined);
      }
      
      if (!name) {
        throw new MacroError("Cannot export macro with empty name", "export-macro", filePath);
      }
      
      // Verify the macro exists
      if (!this.hasModuleMacro(filePath, name)) {
        this.logger.warn(`Cannot export non-existent macro ${name} from ${filePath}`);
        throw new MacroError(`Cannot export non-existent macro ${name}`, name, filePath);
      }
      
      this.logger.debug(`Exporting macro ${name} from ${filePath}`);
      
      // Get or create the file's export registry
      if (!this.exportedMacros.has(filePath)) {
        this.exportedMacros.set(filePath, new Set<string>());
      }
      
      // Mark the macro as exported
      this.exportedMacros.get(filePath)!.add(name);
    } catch (error) {
      if (error instanceof MacroError) {
        throw error; // Re-throw MacroError directly
      }
      
      // Wrap other errors in a MacroError
      throw new MacroError(
        `Failed to export macro ${name}: ${error instanceof Error ? error.message : String(error)}`,
        name,
        filePath
      );
    }
  }
  
  /**
   * Import a macro from one module to another with optional aliasing
   */
  importMacro(fromFile: string, macroName: string, toFile: string, aliasName?: string): boolean {
    try {
      // Validate inputs
      if (!fromFile) {
        throw new MacroError("Source file path required for importing macro", macroName, toFile);
      }
      
      if (!macroName) {
        throw new MacroError("Cannot import macro with empty name", "import-macro", toFile);
      }
      
      if (!toFile) {
        throw new MacroError("Target file path required for importing macro", macroName, fromFile);
      }
      
      // Skip if source and target files are the same to avoid self-import
      if (fromFile === toFile) {
        this.logger.debug(`Skipping self-import of ${macroName} (same file)`);
        return true;
      }
      
      // Check the macro exists in source file
      if (!this.hasModuleMacro(fromFile, macroName)) {
        this.logger.warn(`Cannot import non-existent macro ${macroName} from ${fromFile}`);
        throw new MacroError(`Macro ${macroName} not found in module ${fromFile}`, macroName, fromFile);
      }
      
      // Check the macro is exported
      if (!this.isExported(fromFile, macroName)) {
        this.logger.warn(`Cannot import non-exported macro ${macroName} from ${fromFile}`);
        throw new MacroError(
          `Macro ${macroName} exists but is not exported from ${fromFile}`,
          macroName, 
          fromFile
        );
      }
      
      // The name that will be used in the target file (original or alias)
      const importName = aliasName || macroName;
      
      // Record the alias if provided
      if (aliasName && aliasName !== macroName) {
        if (!this.macroAliases.has(toFile)) {
          this.macroAliases.set(toFile, new Map<string, string>());
        }
        this.macroAliases.get(toFile)!.set(aliasName, macroName);
        this.logger.debug(`Created alias ${aliasName} -> ${macroName} in ${toFile}`);
      }
      
      // Get or create the import registry for the target file
      if (!this.importedMacros.has(toFile)) {
        this.importedMacros.set(toFile, new Map<string, string>());
      }
      
      // Record the import
      this.importedMacros.get(toFile)!.set(importName, fromFile);
      this.logger.debug(`Successfully imported macro ${macroName}${aliasName ? ` as ${aliasName}` : ''} from ${fromFile} to ${toFile}`);
      return true;
    } catch (error) {
      if (error instanceof MacroError) {
        // Don't wrap already specific errors
        this.logger.warn(error.message);
        return false;
      }
      
      this.logger.warn(`Failed to import macro ${macroName} from ${fromFile} to ${toFile}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Check if a file has been processed
   */
  hasProcessedFile(filePath: string): boolean {
    return this.processedFiles.has(filePath);
  }
  
  /**
   * Mark a file as processed
   */
  markFileProcessed(filePath: string): void {
    try {
      if (!filePath) {
        this.logger.warn("Cannot mark empty file path as processed");
        return;
      }
      
      this.processedFiles.add(filePath);
      this.logger.debug(`Marked file as processed: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Error marking file ${filePath} as processed: ${error instanceof Error ? error.message : String(error)}`);
      // Not throwing - this is a non-critical operation
    }
  }
  
  /**
   * Check if a module has a specific macro
   */
  hasModuleMacro(filePath: string, name: string): boolean {
    try {
      if (!filePath || !name) {
        return false;
      }
      
      const moduleMacros = this.moduleMacros.get(filePath);
      return !!moduleMacros && moduleMacros.has(name);
    } catch (error) {
      this.logger.warn(`Error checking if module ${filePath} has macro ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Safer to return false on error
    }
  }
  
  /**
   * Check if a macro is exported from a module
   */
  isExported(filePath: string, name: string): boolean {
    try {
      if (!filePath || !name) {
        return false;
      }
      
      const exports = this.exportedMacros.get(filePath);
      return !!exports && exports.has(name);
    } catch (error) {
      this.logger.warn(`Error checking if macro ${name} is exported from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Safer to return false on error
    }
  }
  
  /**
   * Check if a macro is imported into a module
   */
  isImported(filePath: string, name: string): boolean {
    try {
      if (!filePath || !name) {
        return false;
      }
      
      const imports = this.importedMacros.get(filePath);
      return !!imports && imports.has(name);
    } catch (error) {
      this.logger.warn(`Error checking if macro ${name} is imported into ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Safer to return false on error
    }
  }
  
  /**
   * Get the source file for an imported macro
   */
  getImportSource(filePath: string, name: string): string | null {
    try {
      if (!filePath || !name) {
        return null;
      }
      
      const imports = this.importedMacros.get(filePath);
      return imports?.get(name) || null;
    } catch (error) {
      this.logger.warn(`Error getting import source for macro ${name} in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return null; // Return null on error
    }
  }
  
  /**
   * Resolve a macro name to its original name if it's an alias
   */
  resolveAlias(filePath: string, name: string): string {
    try {
      if (!filePath || !name) {
        return name;
      }
      
      const aliases = this.macroAliases.get(filePath);
      return aliases?.get(name) || name;
    } catch (error) {
      this.logger.warn(`Error resolving alias for ${name} in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return name; // Return original name on error
    }
  }
  
  /**
   * Get a system macro by name
   */
  getSystemMacro(name: string): MacroFn | undefined {
    try {
      if (!name) {
        this.logger.warn("Cannot get system macro with empty name");
        return undefined;
      }
      
      return this.systemMacros.get(name);
    } catch (error) {
      this.logger.warn(`Error getting system macro ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined; // Return undefined on error
    }
  }
  
  /**
   * Get a module macro by name and file
   */
  getModuleMacro(filePath: string, name: string): MacroFn | undefined {
    try {
      if (!filePath || !name) {
        this.logger.warn("Cannot get module macro with empty file path or name");
        return undefined;
      }
      
      const moduleMacros = this.moduleMacros.get(filePath);
      return moduleMacros?.get(name);
    } catch (error) {
      this.logger.warn(`Error getting module macro ${name} from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined; // Return undefined on error
    }
  }
  
  /**
   * Check if a macro (system or module-level) is available in the current context
   */
  hasMacro(name: string, currentFile: string | null = null): boolean {
    try {
      if (!name) {
        return false;
      }
      
      // Check system macros first
      if (this.systemMacros.has(name)) {
        this.logger.debug(`Found system macro: ${name}`);
        return true;
      }
      
      // If no current file, we can't check module-scoped macros
      if (!currentFile) {
        return false;
      }
      
      // Check if defined in current file
      if (this.hasModuleMacro(currentFile, name)) {
        this.logger.debug(`Found local module macro: ${name} in ${currentFile}`);
        return true;
      }
      
      // Check if imported into current file
      if (this.isImported(currentFile, name)) {
        const sourceFile = this.getImportSource(currentFile, name)!;
        const originalName = this.resolveAlias(currentFile, name);
        
        // Verify it exists and is exported from source
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
    } catch (error) {
      this.logger.warn(`Error checking if macro ${name} exists: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Safer to return false on error
    }
  }
  
  /**
   * Get a macro (system or module-level) for the current context
   * Enhanced with better diagnostics
   */
  getMacro(name: string, currentFile: string | null = null): MacroFn | undefined {
    try {
      if (!name) {
        this.logger.warn("Cannot get macro with empty name");
        return undefined;
      }
      
      // Check system macros first
      if (this.systemMacros.has(name)) {
        this.logger.debug(`Getting system macro: ${name}`);
        return this.systemMacros.get(name);
      }
      
      // If no current file, we can't access module-scoped macros
      if (!currentFile) {
        this.logger.debug(`No current file context to look up module macro: ${name}`);
        return undefined;
      }
      
      // Check if defined in current file
      if (this.hasModuleMacro(currentFile, name)) {
        this.logger.debug(`Getting local module macro: ${name} from ${currentFile}`);
        return this.getModuleMacro(currentFile, name);
      }
      
      // Check if imported into current file
      if (this.isImported(currentFile, name)) {
        const sourceFile = this.getImportSource(currentFile, name)!;
        const originalName = this.resolveAlias(currentFile, name);
        
        // Verify it exists and is exported from source
        if (this.hasModuleMacro(sourceFile, originalName) && 
            this.isExported(sourceFile, originalName)) {
          this.logger.debug(`Getting imported macro: ${name} (${originalName}) from ${sourceFile}`);
          return this.getModuleMacro(sourceFile, originalName);
        } else {
          // Provide more detailed error messages
          if (!this.hasModuleMacro(sourceFile, originalName)) {
            this.logger.warn(`Imported macro ${originalName} not found in source module ${sourceFile}`);
          } else if (!this.isExported(sourceFile, originalName)) {
            this.logger.warn(`Imported macro ${originalName} exists but is not exported from ${sourceFile}`);
          }
        }
      }
      
      this.logger.debug(`Macro ${name} not found in current context`);
      return undefined;
    } catch (error) {
      this.logger.warn(`Error getting macro ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined; // Return undefined on error
    }
  }
  
  /**
   * Get all macro names available in the current context
   */
  getAvailableMacroNames(currentFile: string | null = null): string[] {
    try {
      const names = new Set<string>();
      
      // Add system macros
      for (const name of this.systemMacros.keys()) {
        // Skip sanitized duplicates for cleaner output
        if (!name.includes('_')) {
          names.add(name);
        }
      }
      
      // If no current file, return just system macros
      if (!currentFile) {
        this.logger.debug(`Returning ${names.size} system macros`);
        return Array.from(names);
      }
      
      // Add macros defined in current file
      const currentMacros = this.moduleMacros.get(currentFile);
      if (currentMacros) {
        for (const name of currentMacros.keys()) {
          names.add(name);
        }
      }
      
      // Add imported macros
      const imports = this.importedMacros.get(currentFile);
      if (imports) {
        for (const [name, sourceFile] of imports.entries()) {
          const originalName = this.resolveAlias(currentFile, name);
          
          // Verify macro still exists and is exported
          if (this.hasModuleMacro(sourceFile, originalName) && 
              this.isExported(sourceFile, originalName)) {
            names.add(name);
          } else {
            // Log detailed information about invalid imports
            if (!this.hasModuleMacro(sourceFile, originalName)) {
              this.logger.warn(`Import referencing non-existent macro ${originalName} in ${sourceFile}`);
            } else if (!this.isExported(sourceFile, originalName)) {
              this.logger.warn(`Import referencing non-exported macro ${originalName} in ${sourceFile}`);
            }
          }
        }
      }
      
      this.logger.debug(`Found ${names.size} available macros in context ${currentFile}`);
      return Array.from(names);
    } catch (error) {
      this.logger.warn(`Error getting available macro names: ${error instanceof Error ? error.message : String(error)}`);
      // Return just system macros on error, if possible
      try {
        return Array.from(this.systemMacros.keys()).filter(name => !name.includes('_'));
      } catch (e) {
        return []; // Return empty array if all else fails
      }
    }
  }
  
  /**
   * Debug method to print information about all registered macros
   */
  debugPrintMacroInfo(): void {
    try {
      console.log("=== System Macros ===");
      console.log(Array.from(this.systemMacros.keys()).join(", "));
      
      console.log("\n=== Module Macros ===");
      for (const [file, macros] of this.moduleMacros.entries()) {
        console.log(`File: ${file}`);
        console.log(`  Macros: ${Array.from(macros.keys()).join(", ")}`);
        
        const exports = this.exportedMacros.get(file);
        if (exports && exports.size > 0) {
          console.log(`  Exports: ${Array.from(exports).join(", ")}`);
        } else {
          console.log(`  Exports: none`);
        }
      }
      
      console.log("\n=== Imports ===");
      for (const [file, imports] of this.importedMacros.entries()) {
        console.log(`File: ${file}`);
        for (const [name, source] of imports.entries()) {
          const alias = this.resolveAlias(file, name);
          if (alias !== name) {
            console.log(`  ${name} (alias for ${alias}) from ${source}`);
          } else {
            console.log(`  ${name} from ${source}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error printing macro info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}