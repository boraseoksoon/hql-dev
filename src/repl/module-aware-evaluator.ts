// src/repl/module-aware-evaluator.ts
// Enhanced REPL evaluator with module awareness and persistence

import { REPLEvaluator, REPLEvalOptions, REPLEvalResult } from "./repl-evaluator.ts";
import { Environment, Value } from "../environment.ts";
import { Logger } from "../logger.ts";
import { persistentStateManager } from "./persistent-state-manager.ts";
import { REPLEnvironment } from "./repl-environment.ts";
import { parse } from "../transpiler/pipeline/parser.ts";
import { moduleUtils } from "./repl-common.ts";
import { processImports, ImportProcessorOptions } from "../imports.ts";
import { SExp, SList, isImport, isSymbol, isLiteral, SSymbol, isSExpNamespaceImport, isSExpVectorImport } from "../s-exp/types.ts";
import { ImportError } from "../transpiler/error/errors.ts";

/**
 * Options for the module-aware evaluator
 */
export interface ModuleAwareEvalOptions extends REPLEvalOptions {
  saveState?: boolean;
}

/**
 * Extends the REPLEvaluator with module awareness and state persistence
 */
export class ModuleAwareEvaluator extends REPLEvaluator {
  // Use a different name to avoid conflict with the parent class
  private moduleLogger: Logger;
  private currentModule: string = "global";
  private initialized = false;
  
  constructor(env: Environment, options: ModuleAwareEvalOptions = {}) {
    super(env, options);
    this.moduleLogger = new Logger(options.verbose ?? false);
    
    // Initialize with default "global" module
    this.currentModule = "global";
  }
  
  /**
   * Initialize the module system
   * This must be called and awaited before using any module-aware functions
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await persistentStateManager.initialize();
      
      // Explicitly set current module to "global", then tell the state manager
      this.currentModule = "global";
      persistentStateManager.switchToModule("global");
      
      this.initialized = true;
      this.moduleLogger.debug(`Initialized module system with current module: ${this.currentModule}`);
      
      // Restore all module definitions from persistent storage
      await this.restoreAllModuleStates();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Failed to initialize module system: ${errorMessage}`);
      throw error; // Re-throw to notify caller of failure
    }
  }
  
  // Update all methods that check this.initialized to call this.initialize() if needed
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
  
  /**
   * Restore all module states from persistent storage
   */
  private async restoreAllModuleStates(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      // Get all available modules
      const moduleNames = persistentStateManager.getModuleNames();
      
      // Restore each module's state
      for (const moduleName of moduleNames) {
        await this.restoreModuleState(moduleName);
      }
      
      this.moduleLogger.debug(`Restored state for ${moduleNames.length} modules`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error restoring module states: ${errorMessage}`);
    }
  }
  
  /**
   * Get the current module name
   */
  async getCurrentModule(): Promise<string> {
    await this.ensureInitialized();
    return this.currentModule;
  }
  
  /**
   * Get current module name synchronously - only use when initialization is confirmed
   */
  getCurrentModuleSync(): string {
    if (!this.initialized) {
      // We're asking for the module before initialization is complete
      // Return the default in this case
      return "global";
    }
    return this.currentModule;
  }
  
  /**
   * Get all available module names
   */
  async getAvailableModules(): Promise<string[]> {
    await this.ensureInitialized();
    return persistentStateManager.getModuleNames();
  }
  
  /**
   * Switch to a different module
   */
  async switchModule(moduleName: string): Promise<void> {
    await this.ensureInitialized();
    
    this.currentModule = moduleName;
    persistentStateManager.switchToModule(moduleName);
    
    // Update the REPLEnvironment's current module
    const replEnv = this.getREPLEnvironment();
    replEnv.setCurrentModule(moduleName);
    
    this.moduleLogger.debug(`Switched to module: ${moduleName}`);
  }
  
  /**
   * Remove a module
   */
  async removeModule(moduleName: string): Promise<boolean> {
    await this.ensureInitialized();
    
    try {
      // Don't allow removing default modules
      if (moduleName === 'global' || moduleName === 'user') {
        this.moduleLogger.warn(`Cannot remove built-in module '${moduleName}'`);
        return false;
      }
      
      // Get the REPL environment
      const replEnv = this.getREPLEnvironment();
      
      // Check if module exists
      const availableModules = await this.getAvailableModules();
      if (!availableModules.includes(moduleName)) {
        this.moduleLogger.warn(`Module '${moduleName}' does not exist`);
        return false;
      }
      
      // Get all symbols in the module
      const symbols = await this.listModuleSymbols(moduleName);
      
      // Remove each symbol from the REPL environment
      for (const symbol of symbols) {
        try {
          replEnv.removeJsValue(symbol, moduleName);
          this.moduleLogger.debug(`Removed symbol '${symbol}' from module '${moduleName}'`);
        } catch (error) {
          this.moduleLogger.warn(`Error removing symbol '${symbol}' from module '${moduleName}': ${error}`);
        }
      }
      
      // Now remove the module from persistent state
      const removed = persistentStateManager.removeModule(moduleName);
      
      if (removed) {
        this.moduleLogger.debug(`Successfully removed module '${moduleName}'`);
      } else {
        this.moduleLogger.warn(`Failed to remove module '${moduleName}' from persistent state`);
      }
      
      return removed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error removing module: ${errorMessage}`);
      return false;
    }
  }
  
  /**
   * List the symbols in a module
   */
  async listModuleSymbols(moduleName?: string): Promise<string[]> {
    await this.ensureInitialized();
    
    const targetModule = moduleName || this.currentModule;
    const moduleState = persistentStateManager.getModuleState(targetModule);
    
    if (!moduleState) {
      return [];
    }
    
    // Combine all symbols from all types
    const symbols: string[] = [];
    
    for (const type of ['variables', 'functions', 'macros'] as const) {
      symbols.push(...Object.keys(moduleState.definitions[type]));
    }
    
    return symbols;
  }
  
  /**
   * Remove a symbol from the current module
   */
  removeSymbol(name: string): boolean {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
    const removed = persistentStateManager.removeDefinition(name);
    
    if (removed) {
      // Also remove it from the environment
      const replEnv = this.getREPLEnvironment();
      
      // Make sure the environment is synchronized with the correct module
      replEnv.setCurrentModule(this.currentModule);
      
      // First clean up any references to this symbol
      replEnv.removeJsValue(name);
      
      // Force a refresh of the environment data
      const keys = replEnv.getDefinedSymbols(this.currentModule);
      this.moduleLogger.debug(`After removal, remaining symbols in module ${this.currentModule}: ${keys.join(', ')}`);
      
      this.moduleLogger.debug(`Removed symbol '${name}' from environment`);
    }
    
    return removed;
  }
  
  /**
   * Force define a symbol, overwriting any existing definition
   */
  override async forceDefine(code: string): Promise<any> {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
    // First attempt to remove any existing symbol that might conflict
    const funcMatch = code.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    const varMatch = code.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
    const hqlFuncMatch = code.match(/\(\s*(?:fn|defn)\s+([a-zA-Z_$][a-zA-Z0-9_$-]*)/);
    
    if (funcMatch && funcMatch[1]) {
      this.removeSymbol(funcMatch[1]);
    } else if (varMatch && varMatch[1]) {
      this.removeSymbol(varMatch[1]);
    } else if (hqlFuncMatch && hqlFuncMatch[1]) {
      this.removeSymbol(hqlFuncMatch[1]);
    }
    
    // Now evaluate normally
    return this.evaluate(code, {
      verbose: this.moduleLogger.isVerbose,
    });
  }
  
  /**
   * Handle tracking of definitions from an evaluation
   */
  private trackDefinitions(input: string, result: Value, generatedJs: string): void {
    if (!this.initialized) return;
    
    try {
      // Preserve original formatting and indentation
      const originalSource = input.trim();
      
      // Get the REPL environment to access definitions
      const replEnv = this.getREPLEnvironment();
      
      // Extract defined symbols from the generated JS
      const definedSymbols = replEnv.extractDefinitions(generatedJs);
      
      // Skip if no definitions found
      if (!definedSymbols.length) return;
      
      // Track each defined symbol
      for (const symbol of definedSymbols) {
        // First check if symbol exists in current environment
        if (!replEnv.hasJsValue(symbol, this.currentModule)) {
          this.moduleLogger.debug(`Symbol ${symbol} not found in environment, skipping tracking`);
          continue;
        }
        
        const value = replEnv.getJsValue(symbol, this.currentModule);
        
        // Skip if no value found
        if (value === undefined) continue;
        
        // Determine the type of definition more accurately
        let type: 'variable' | 'function' | 'macro' = 'variable';
        
        // Check for function type
        if (typeof value === 'function') {
          type = 'function';
          this.moduleLogger.debug(`Detected ${symbol} as a function`);
        } 
        // Check for macro type
        else if (value && typeof value === 'object' && 'transformSExp' in value) {
          type = 'macro';
          this.moduleLogger.debug(`Detected ${symbol} as a macro`);
        }
        // All other types are variables
        else {
          this.moduleLogger.debug(`Detected ${symbol} as a variable with type: ${typeof value}`);
        }
        
        // Store the definition with both source code and JS output
        this.storeDefinition(symbol, value, originalSource, generatedJs, type);
        this.moduleLogger.debug(`Tracked ${type} definition: ${symbol}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.warn(`Error tracking definitions: ${errorMessage}`);
    }
  }
  
  /**
   * Override evaluate to track definitions
   */
  override async evaluate(input: string, options: ModuleAwareEvalOptions = {}): Promise<REPLEvalResult> {
    await this.ensureInitialized(); // Ensure initialized first

    // Ensure REPLEnvironment is synced with current module
    const replEnv = this.getREPLEnvironment();
    replEnv.setCurrentModule(this.currentModule);

    // --- Import Handling ---
    try {
      const expressions = await parse(input);
      if (expressions && expressions.length > 0) {
        const firstExpr = expressions[0];
        if (firstExpr.type === 'list' && isImport(firstExpr)) {
          const importExpr = firstExpr as SList;
          this.moduleLogger.debug(`Detected HQL import statement: ${input}`);

          // Store the import statement for later restoration if saveState option is not explicitly false
          if (options.saveState !== false) {
            await this.storeImportStatement(input);
          }

          const importOptions: ImportProcessorOptions = {
            verbose: this.moduleLogger.isVerbose,
            baseDir: Deno.cwd(), // Use current working directory for relative paths in REPL
            processedFiles: new Set<string>(), // Use transient sets for REPL context
            inProgressFiles: new Set<string>(),
            importMap: new Map<string, string>(),
            currentFile: undefined, // REPL context doesn't have a definitive 'current file'
          };

          try {
            // Use processImports, passing the base environment
            await processImports([importExpr], this.getEnvironment(), importOptions);
            this.moduleLogger.debug(`Successfully processed import: ${input}`);

            // --- Track imported definitions ---
            try {
              const importedSymbols = this.extractImportedSymbols(importExpr);
              const baseEnv = this.getEnvironment(); // Get base environment

              for (const symbolName of importedSymbols) {
                try {
                  // Try looking up the symbol in the base environment first
                  const value = baseEnv.lookup(symbolName);
                  
                  // If lookup succeeded, define it in REPL env and track
                  let type: 'variable' | 'function' | 'macro' = 'variable';
                  if (typeof value === 'function') {
                    type = 'function';
                  } else if (value && typeof value === 'object' && 'transformSExp' in value) {
                    type = 'macro';
                  }
                  
                  // Define in REPL environment for immediate use
                  replEnv.setJsValue(symbolName, value);
                  this.moduleLogger.debug(`Defined imported symbol '${symbolName}' in REPL environment.`);

                  // Store in persistent state for :ls etc.
                  this.storeDefinition(symbolName, value, input, `// Imported via: ${input}`, type);
                  this.moduleLogger.debug(`Tracked imported symbol: ${symbolName} (type: ${type})`);

                } catch (lookupError) {
                  // Lookup failed, log the original warning
                  this.moduleLogger.warn(`Symbol '${symbolName}' from import not found via lookup after processing.`);
                }
              }
            } catch (error) {
              this.moduleLogger.warn(`Failed to track import definitions: ${error}`);
            }
            
            // Import successful, return a neutral result including required fields
            return {
              value: null,
              jsCode: `// Successfully processed import: ${input}`,
              parsedExpressions: [importExpr], // Include the parsed import expression
              expandedExpressions: [], // No specific expansion for imports in this context
            };
          } catch (importError) {
            const errorMessage = importError instanceof Error ? importError.message : String(importError);
            this.moduleLogger.error(`Failed to process import: ${errorMessage}`);
            // Propagate the error to the REPL UI
            throw new ImportError(
              `Failed to process import: ${errorMessage}`,
              input, // Use the input as the "path" for context
              undefined,
              importError instanceof Error ? importError : undefined,
            );
          }
        }
      }
    } catch (parseError) {
      // If parsing fails, let the standard evaluation handle it (it will likely fail too, but consistently)
      this.moduleLogger.warn(`Parsing error during import check, falling back to standard evaluation: ${parseError}`);
    }

    // If not an import or parsing failed, proceed with standard evaluation
    const result = await super.evaluate(input, options);

    // Track definitions after successful *standard* evaluation
    // We might need a way to track definitions brought in by imports if not handled by processImport
    if (options.saveState !== false) {
      this.trackDefinitions(input, result.value, result.jsCode);
    }

    return result;
  }
  
  /**
   * Store a symbol definition with source information in persistent storage
   */
  private storeDefinition(
    symbolName: string, 
    value: any, 
    source: string, 
    jsSource: string, 
    type: 'variable' | 'function' | 'macro' = 'variable'
  ): void {
    // Skip if not initialized
    if (!this.initialized) return;
    
    try {
      // Auto-detect type based on value if not specified
      let detectedType = type;
      
      if (type === 'variable' && typeof value === 'function') {
        detectedType = 'function';
      } else if (value && typeof value === 'object' && 'transformSExp' in value) {
        detectedType = 'macro';
      }
      
      // Create metadata object for source tracking
      const metadata = {
        source,
        jsSource,
        timestamp: new Date().toISOString(),
        created: new Date().toISOString()
      };
      
      // Store in persistent state manager
      persistentStateManager.addDefinition(
        symbolName, 
        value, 
        detectedType, 
        metadata
      );
      
      this.moduleLogger.debug(`Stored ${detectedType} '${symbolName}' definition in module '${this.currentModule}'`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.warn(`Error storing definition: ${errorMessage}`);
    }
  }

  /**
   * Extracts the symbol names that should be defined by an import expression.
   * Handles namespace and vector imports.
   */
  private extractImportedSymbols(importExpr: SList): string[] {
    const elements = importExpr.elements;
    const importedNames: string[] = [];

    // Check for namespace import: (import namespace from "...")
    if (isSExpNamespaceImport(elements)) {
      if (isSymbol(elements[1])) {
        importedNames.push((elements[1] as SSymbol).name);
      }
    } 
    // Check for vector import: (import [a b as c] from "...")
    else if (isSExpVectorImport(elements)) {
      if (elements[1].type === 'list') {
        const vector = elements[1] as SList;
        let i = 0;
        while (i < vector.elements.length) {
          const item = vector.elements[i];
          if (isSymbol(item)) {
            // Check for alias: symbol as alias
            if (
              i + 2 < vector.elements.length &&
              isSymbol(vector.elements[i + 1]) &&
              (vector.elements[i + 1] as SSymbol).name === 'as' &&
              isSymbol(vector.elements[i + 2])
            ) {
              importedNames.push((vector.elements[i + 2] as SSymbol).name); // Use alias name
              i += 3;
            } else {
              importedNames.push((item as SSymbol).name); // Use original name
              i += 1;
            }
          } else {
            i += 1; // Skip non-symbols (e.g., commas, although they shouldn't be there)
          }
        }
      }
    } 
    // NOTE: Simple import (import "...") does not introduce bindings in the current scope,
    // so it doesn't add names to this list.
    
    return importedNames;
  }
  
  /**
   * Get the REPLEnvironment from the parent class
   */
  getREPLEnvironment(): REPLEnvironment {
    const env = this.getEnvironment();
    // This is a bit of a hack to access the private replEnv member
    // of the parent class, but it's necessary for our implementation
    // @ts-ignore
    return (this as any).replEnv;
  }
  
  /**
   * Restore module definitions from persistent storage
   */
  async restoreModuleState(moduleName: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
    try {
      const moduleState = persistentStateManager.getModuleState(moduleName);
      if (!moduleState) {
        this.moduleLogger.warn(`Module '${moduleName}' not found in persistent storage`);
        return;
      }
      
      // Re-import any stored import statements first
      await this.restoreImports(moduleName);
      
      // Get the REPL environment
      const replEnv = this.getREPLEnvironment();
      
      // Loop through each type of definition and restore
      for (const [type, items] of Object.entries(moduleState.definitions)) {
        for (const [name, rawValue] of Object.entries(items)) {
          // Skip if already defined
          if (replEnv.hasJsValue(name)) continue;
          
          // Handle special types that need reconstruction
          let value: Value;
          
          // Check if this is a serialized function
          if (typeof rawValue === 'object' && rawValue !== null && '_type' in rawValue) {
            if (rawValue._type === 'function' && 'source' in rawValue) {
              try {
                // Recreate the function from its source
                const functionSource = String(rawValue.source);
                
                // Create a safe eval environment
                const evalFn = new Function('return ' + functionSource);
                value = evalFn();
                
                this.moduleLogger.debug(`Restored function '${name}' from source`);
              } catch (fnError) {
                this.moduleLogger.error(`Failed to restore function '${name}': ${fnError instanceof Error ? fnError.message : String(fnError)}`);
                continue; // Skip this function if we can't restore it
              }
            } else if (rawValue._type === 'external_object') {
              // This is an external object reference (like from an import)
              // We've already re-imported it above, so just look it up in the environment
              value = replEnv.getJsValue(name);
              if (value === undefined) {
                this.moduleLogger.warn(`External object '${name}' not found in environment after imports`);
                continue;
              }
            } else {
              // Other serialized types we don't know how to handle yet
              value = rawValue as unknown as Value;
            }
          } else {
            // Regular value, just use it directly
            value = rawValue as unknown as Value;
          }
          
          // Register in the REPL environment
          replEnv.setJsValue(name, value);
          this.moduleLogger.debug(`Restored ${type} '${name}' from module '${moduleName}'`);
        }
      }
      
      this.moduleLogger.debug(`Restored module state for '${moduleName}'`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error restoring module state: ${errorMessage}`);
    }
  }
  
  /**
   * Restore imports for a module from the persistent state
   */
  private async restoreImports(moduleName: string): Promise<void> {
    try {
      // Get stored import statements for this module
      const importStatements = persistentStateManager.getModuleMetadata(moduleName, 'importStatements') as string[];
      
      if (!importStatements || importStatements.length === 0) {
        return;
      }
      
      this.moduleLogger.debug(`Restoring ${importStatements.length} imports for module ${moduleName}`);
      
      // Execute each import statement
      for (const importStmt of importStatements) {
        try {
          // Evaluate the import statement
          await this.evaluate(importStmt, { 
            verbose: this.moduleLogger.isVerbose,
            saveState: false // Don't save state again while restoring
          });
          this.moduleLogger.debug(`Re-imported: ${importStmt}`);
        } catch (importError) {
          this.moduleLogger.error(`Failed to restore import: ${importStmt} - ${importError}`);
        }
      }
    } catch (error) {
      this.moduleLogger.error(`Error restoring imports: ${error}`);
    }
  }
  
  /**
   * Override resetEnvironment to maintain module awareness
   */
  override resetEnvironment(keepModules = false): void {
    if (keepModules) {
      // Save current module name
      const currentModule = this.currentModule;
      // Call parent reset
      super.resetEnvironment();
      // Restore module name
      this.currentModule = currentModule;
      // Reset just the content of all modules, keeping their structure
      persistentStateManager.resetAllModules(true);
      persistentStateManager.switchToModule(currentModule);
    } else {
      // Reset to default module
      this.currentModule = "global";
      // Call parent reset
      super.resetEnvironment();
      // Reset all modules and return to default
      persistentStateManager.resetAllModules(false);
      // Tell the state manager we're back to the default module
      persistentStateManager.switchToModule("global");
    }
  }
  
  /**
   * Detect module switch in input
   * This allows commands like (module math) to switch modules
   */
  async detectModuleSwitch(input: string): Promise<boolean> {
    try {
      // Check for module switch syntax
      if (!(input.startsWith("(module ") || input.startsWith("(in-module "))) {
        return false;
      }
      
      // Parse the input
      const sexps = await parse(input);
      if (!sexps || sexps.length === 0) return false;
      
      // Get the first S-expression
      const sexp = sexps[0];
      
      // Check if it's a module switch
      if (sexp.type !== 'list' || !sexp.elements || sexp.elements.length !== 2) {
        return false;
      }
      
      // Check the first element is 'module' or 'in-module' symbol
      const firstElement = sexp.elements[0];
      if (firstElement.type !== 'symbol' || 
          (firstElement.name !== 'module' && firstElement.name !== 'in-module')) {
        return false;
      }
      
      // Get the module name from the second element
      const secondElement = sexp.elements[1];
      if (secondElement.type !== 'symbol' && secondElement.type !== 'literal') {
        return false;
      }
      
      // Extract module name
      const moduleName = secondElement.type === 'symbol' 
        ? secondElement.name 
        : String(secondElement.value);
      
      // Switch to the module
      this.switchModule(moduleName);
      
      return true;
    } catch (error: unknown) {
      return false;
    }
  }
  
  /**
   * Get the definition and source information for a symbol
   */
  async getSymbolDefinition(symbolName: string, moduleName?: string): Promise<{ 
    value: any; 
    source?: string; 
    jsSource?: string;
    metadata?: Record<string, any>;
  } | null> {
    await this.ensureInitialized();
    
    // Use the provided module name or current module
    const targetModule = moduleName || this.currentModule;
    
    try {
      // First, try to get definition from persistent state manager
      const moduleState = persistentStateManager.getModuleState(targetModule);
      if (!moduleState) return null;
      
      // Search for the symbol in different definition types
      for (const type of ['functions', 'variables', 'macros'] as const) {
        if (symbolName in moduleState.definitions[type]) {
          const definition = moduleState.definitions[type][symbolName];
          
          // Get the actual value from the environment
          const replEnv = this.getREPLEnvironment();
          const value = replEnv.hasJsValue(symbolName) ? replEnv.getJsValue(symbolName) : undefined;
          
          // Check if definition has metadata where source might be stored
          if (definition && typeof definition === 'object' && '_metadata' in definition) {
            const metadata = definition._metadata;
            return {
              value,
              source: metadata.source,
              jsSource: metadata.jsSource,
              metadata: {
                type,
                module: targetModule,
                ...(metadata || {})
              }
            };
          }
          
          // Handle serialized functions
          if (typeof definition === 'object' && definition !== null && '_type' in definition) {
            if (definition._type === 'function' && 'source' in definition) {
              return {
                value,
                jsSource: definition.source,
                metadata: {
                  type,
                  module: targetModule
                }
              };
            }
          }
          
          // For regular values
          return {
            value,
            jsSource: typeof definition === 'object' && definition !== null 
                    ? JSON.stringify(definition, null, 2) 
                    : String(definition),
            metadata: {
              type,
              module: targetModule
            }
          };
        }
      }
      
      // If we're here, we didn't find the symbol in definitions
      // Check if it exists in the environment but not in persistent storage
      const replEnv = this.getREPLEnvironment();
      if (replEnv.hasJsValue(symbolName)) {
        const value = replEnv.getJsValue(symbolName);
        return {
          value,
          jsSource: typeof value === 'function' ? value.toString() : undefined,
          metadata: {
            module: targetModule,
            note: "This symbol exists in the runtime environment but has no stored definition"
          }
        };
      }
      
      return null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error getting symbol definition: ${errorMessage}`);
      return null;
    }
  }
  
  /**
   * Import a symbol from another module into the current module
   * Format: :import symbol from module
   */
  importFromModule(symbolName: string, fromModule: string): boolean {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
    try {
      // Check if source module exists
      const moduleState = persistentStateManager.getModuleState(fromModule);
      if (!moduleState) {
        this.moduleLogger.error(`Module '${fromModule}' not found`);
        return false;
      }
      
      // Check if symbol exists in source module
      let found = false;
      let symbolValue = undefined;
      let symbolType: 'variable' | 'function' | 'macro' = 'variable';
      
      for (const type of ['variables', 'functions', 'macros'] as const) {
        if (symbolName in moduleState.definitions[type]) {
          found = true;
          
          // Determine symbol type for definition
          switch (type) {
            case 'functions': symbolType = 'function'; break;
            case 'macros': symbolType = 'macro'; break;
            default: symbolType = 'variable';
          }
          
          // Get the value from the environment
          symbolValue = this.getEnvironment().lookup(`${fromModule}.${symbolName}`);
          break;
        }
      }
      
      if (!found || symbolValue === undefined) {
        this.moduleLogger.error(`Symbol '${symbolName}' not found in module '${fromModule}'`);
        return false;
      }
      
      // Add the imported symbol to the current module
      persistentStateManager.addDefinition(symbolName, symbolValue, symbolType);
      
      // Also add it to the imports list for tracking
      persistentStateManager.addImport(`${fromModule}.${symbolName}`);
      
      // Define it in the REPL environment
      const replEnv = this.getREPLEnvironment();
      replEnv.setJsValue(symbolName, symbolValue);
      
      this.moduleLogger.debug(`Imported '${symbolName}' from module '${fromModule}'`);
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error importing symbol: ${errorMessage}`);
      return false;
    }
  }
  
  /**
   * Export a symbol from the current module
   * Makes it available to other modules
   */
  exportSymbol(symbolName: string): boolean {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
    try {
      // Check if symbol exists in current module
      const moduleState = persistentStateManager.getCurrentModuleState();
      let found = false;
      
      for (const type of ['variables', 'functions', 'macros'] as const) {
        if (symbolName in moduleState.definitions[type]) {
          found = true;
          break;
        }
      }
      
      if (!found) {
        this.moduleLogger.error(`Symbol '${symbolName}' not found in current module`);
        return false;
      }
      
      // Add to exports list
      if (!moduleState.exports.includes(symbolName)) {
        moduleState.exports.push(symbolName);
        // Save changes by calling a public method
        persistentStateManager.forceSync();
      }
      
      this.moduleLogger.debug(`Exported '${symbolName}' from module '${this.currentModule}'`);
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error exporting symbol: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Store an import statement for a module
   */
  async storeImportStatement(importStatement: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Parse the import statement to ensure it's valid
    try {
      const parsed = await parse(importStatement);
      if (parsed.length === 0 || !isImport(parsed[0])) return;
      
      // Store the import statement in the persistent state
      persistentStateManager.addModuleMetadata('importStatements', importStatement);
      this.moduleLogger.debug(`Stored import statement: ${importStatement}`);
    } catch (error) {
      this.moduleLogger.error(`Failed to store import statement: ${error}`);
    }
  }
}