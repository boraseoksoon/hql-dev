// src/macro-registry.ts - A dedicated class for macro management
// This centralizes macro handling to reduce duplicated code and enhance maintainability

import { Logger } from './logger.ts';
import { MacroFn } from './environment.ts';

/**
 * MacroRegistry provides centralized management of both system-wide and module-scoped macros.
 * This improves performance by reducing redundant operations and enhances modularity.
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
  
  // Cache to track which files have been processed to avoid duplication
  private processedFiles = new Set<string>();
  
  // Logger for debugging
  private logger: Logger;
  
  /**
   * Create a new MacroRegistry
   */
  constructor(verbose: boolean = false) {
    this.logger = new Logger(verbose);
  }
  
  /**
   * Define a system-wide macro
   */
  defineSystemMacro(name: string, macroFn: MacroFn): void {
    this.logger.debug(`Defining system macro: ${name}`);
    this.systemMacros.set(name, macroFn);
    
    // Tag the function with metadata
    Object.defineProperty(macroFn, 'isMacro', { value: true });
    Object.defineProperty(macroFn, 'macroName', { value: name });
    
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
    Object.defineProperty(macroFn, 'isMacro', { value: true });
    Object.defineProperty(macroFn, 'macroName', { value: name });
    Object.defineProperty(macroFn, 'sourceFile', { value: filePath });
    Object.defineProperty(macroFn, 'isUserMacro', { value: true });
  }
  
  /**
   * Export a macro from a module
   */
  exportMacro(filePath: string, name: string): void {
    // Verify the macro exists
    if (!this.hasModuleMacro(filePath, name)) {
      this.logger.warn(`Cannot export non-existent macro ${name} from ${filePath}`);
      return;
    }
    
    this.logger.debug(`Exporting macro ${name} from ${filePath}`);
    
    // Get or create the file's export registry
    if (!this.exportedMacros.has(filePath)) {
      this.exportedMacros.set(filePath, new Set<string>());
    }
    
    // Mark the macro as exported
    this.exportedMacros.get(filePath)!.add(name);
  }
  
  /**
   * Import a macro from one module to another
   */
  importMacro(fromFile: string, macroName: string, toFile: string): boolean {
    // Check if source and target files are the same
    if (fromFile === toFile) {
      this.logger.debug(`Skipping self-import of ${macroName} (same file)`);
      return true;
    }
    
    // Check the macro exists in source file
    if (!this.hasModuleMacro(fromFile, macroName)) {
      this.logger.warn(`Cannot import non-existent macro ${macroName} from ${fromFile}`);
      return false;
    }
    
    // Check the macro is exported
    if (!this.isExported(fromFile, macroName)) {
      this.logger.warn(`Cannot import non-exported macro ${macroName} from ${fromFile}`);
      return false;
    }
    
    // Skip if already imported to avoid redundancy
    if (this.isImported(toFile, macroName)) {
      this.logger.debug(`Macro ${macroName} already imported into ${toFile}, skipping duplicate`);
      return true;
    }
    
    this.logger.debug(`Importing macro ${macroName} from ${fromFile} into ${toFile}`);
    
    // Get or create the import registry for the target file
    if (!this.importedMacros.has(toFile)) {
      this.importedMacros.set(toFile, new Map<string, string>());
    }
    
    // Record the import
    this.importedMacros.get(toFile)!.set(macroName, fromFile);
    return true;
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
    this.processedFiles.add(filePath);
  }
  
  /**
   * Check if a module has a specific macro
   */
  hasModuleMacro(filePath: string, name: string): boolean {
    const moduleMacros = this.moduleMacros.get(filePath);
    return !!moduleMacros && moduleMacros.has(name);
  }
  
  /**
   * Check if a macro is exported from a module
   */
  isExported(filePath: string, name: string): boolean {
    const exports = this.exportedMacros.get(filePath);
    return !!exports && exports.has(name);
  }
  
  /**
   * Check if a macro is imported into a module
   */
  isImported(filePath: string, name: string): boolean {
    const imports = this.importedMacros.get(filePath);
    return !!imports && imports.has(name);
  }
  
  /**
   * Get the source file for an imported macro
   */
  getImportSource(filePath: string, name: string): string | null {
    const imports = this.importedMacros.get(filePath);
    return imports?.get(name) || null;
  }
  
  /**
   * Get a system macro by name
   */
  getSystemMacro(name: string): MacroFn | undefined {
    return this.systemMacros.get(name);
  }
  
  /**
   * Get a module macro by name and file
   */
  getModuleMacro(filePath: string, name: string): MacroFn | undefined {
    const moduleMacros = this.moduleMacros.get(filePath);
    return moduleMacros?.get(name);
  }
  
  /**
   * Check if a macro (system or module-level) is available in the current context
   */
  hasMacro(name: string, currentFile: string | null = null): boolean {
    // Check system macros first
    if (this.systemMacros.has(name)) {
      return true;
    }
    
    // If no current file, we can't check module-scoped macros
    if (!currentFile) {
      return false;
    }
    
    // Check if defined in current file
    if (this.hasModuleMacro(currentFile, name)) {
      return true;
    }
    
    // Check if imported into current file
    if (this.isImported(currentFile, name)) {
      const sourceFile = this.getImportSource(currentFile, name)!;
      // Verify it exists and is exported from source
      return this.hasModuleMacro(sourceFile, name) && 
             this.isExported(sourceFile, name);
    }
    
    return false;
  }
  
  /**
   * Get a macro (system or module-level) for the current context
   */
  getMacro(name: string, currentFile: string | null = null): MacroFn | undefined {
    // Check system macros first
    if (this.systemMacros.has(name)) {
      return this.systemMacros.get(name);
    }
    
    // If no current file, we can't access module-scoped macros
    if (!currentFile) {
      return undefined;
    }
    
    // Check if defined in current file
    if (this.hasModuleMacro(currentFile, name)) {
      return this.getModuleMacro(currentFile, name);
    }
    
    // Check if imported into current file
    if (this.isImported(currentFile, name)) {
      const sourceFile = this.getImportSource(currentFile, name)!;
      // Verify it exists and is exported from source
      if (this.hasModuleMacro(sourceFile, name) && 
          this.isExported(sourceFile, name)) {
        return this.getModuleMacro(sourceFile, name);
      }
    }
    
    return undefined;
  }
  
  /**
   * Get all macro names available in the current context
   */
  getAvailableMacroNames(currentFile: string | null = null): string[] {
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
        // Verify macro still exists and is exported
        if (this.hasModuleMacro(sourceFile, name) && 
            this.isExported(sourceFile, name)) {
          names.add(name);
        }
      }
    }
    
    return Array.from(names);
  }
}