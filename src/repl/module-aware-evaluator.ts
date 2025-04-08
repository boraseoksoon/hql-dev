// src/repl/module-aware-evaluator.ts
// Enhanced REPL evaluator with module awareness and persistence

import { REPLEvaluator, REPLEvalOptions, REPLEvalResult } from "./repl-evaluator.ts";
import { Environment, Value } from "../environment.ts";
import { Logger } from "../logger.ts";
import { persistentStateManager } from "./persistent-state-manager.ts";
import { REPLEnvironment } from "./repl-environment.ts";
import { parse } from "../transpiler/pipeline/parser.ts";
import { moduleUtils } from "./repl-common.ts";
import { processImports } from "../imports.ts";
import { transformSyntax } from "../transpiler/pipeline/syntax-transformer.ts";

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
    // Ensure REPLEnvironment is synced with current module
    const replEnv = this.getREPLEnvironment();
    replEnv.setCurrentModule(this.currentModule);
    
    const result = await super.evaluate(input, options);
    
    // Track definitions after successful evaluation
    if (options.saveState !== false) {
      this.trackDefinitions(input, result.value, result.jsCode);
    }
    
    return result;
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
   * Get a symbol definition
   */
  async getSymbolDefinition(symbolName: string, moduleName?: string): Promise<any> {
    await this.ensureInitialized();
    
    try {
      const targetModule = moduleName || this.currentModule;
      
      // First check if it exists in the persistent storage
      const moduleState = persistentStateManager.getModuleState(targetModule);
      if (!moduleState) {
        return null;
      }
      
      // Normalize symbol name for comparison - handle case where symbol
      // might be different in capitalization or formatting
      const normalizedSymbolName = symbolName.toLowerCase();
      
      // Look in all definition types
      for (const type of ['variables', 'functions', 'macros'] as const) {
        // First try exact match
        if (symbolName in moduleState.definitions[type]) {
          const definition = moduleState.definitions[type][symbolName];
          // Get the value from the REPL environment
          const replEnv = this.getREPLEnvironment();
          
          // Get the symbol's value from the environment
          let value = replEnv.getJsValue(symbolName, targetModule);
          
          // If value not found with the exact name, try using target module prefix
          if (value === undefined) {
            value = replEnv.getJsValue(`${targetModule}.${symbolName}`, targetModule);
          }
          
          // Return definition info
          if (typeof definition === 'function') {
            return {
              value: definition,
              source: definition.toString(),
              metadata: {
                type,
                module: targetModule
              }
            };
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
        
        // If exact match not found, try case-insensitive lookup
        for (const definedSymbol in moduleState.definitions[type]) {
          if (definedSymbol.toLowerCase() === normalizedSymbolName) {
            const definition = moduleState.definitions[type][definedSymbol];
            // Get the value from the REPL environment
            const replEnv = this.getREPLEnvironment();
            
            // Get the symbol's value from the environment
            let value = replEnv.getJsValue(definedSymbol, targetModule);
            
            // If value not found with the exact name, try using target module prefix
            if (value === undefined) {
              value = replEnv.getJsValue(`${targetModule}.${definedSymbol}`, targetModule);
            }
            
            // Return definition info
            if (typeof definition === 'function') {
              return {
                value: definition,
                source: definition.toString(),
                metadata: {
                  type,
                  module: targetModule
                }
              };
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
      }
      
      // If we're here, we didn't find the symbol in definitions
      // Try directly looking up in the environment
      const env = this.getEnvironment();
      let value;
      
      // Try different ways to find the value
      try {
        // Try just the symbol name
        value = env.lookup(symbolName);
      } catch (e) {
        // Not found directly
      }
      
      if (value === undefined) {
        try {
          // Try with module prefix
          value = env.lookup(`${targetModule}.${symbolName}`);
        } catch (e) {
          // Not found with prefix
        }
      }
      
      // Also check direct global access (for external modules)
      if (value === undefined) {
        try {
          const global = globalThis as Record<string, unknown>;
          if (global[symbolName] !== undefined) {
            value = global[symbolName];
          }
        } catch (e) {
          // Not found in global
        }
      }
      
      // If we have a value now, return it
      if (value !== undefined) {
        return {
          value,
          jsSource: typeof value === 'function' ? value.toString() : undefined,
          metadata: {
            module: targetModule,
            note: "Symbol found in runtime environment"
          }
        };
      }
      
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
   * Get all exports from a module
   */
  async getModuleExports(moduleName?: string): Promise<string[]> {
    await this.ensureInitialized();
    
    const targetModule = moduleName || this.currentModule;
    const moduleState = persistentStateManager.getModuleState(targetModule);
    
    if (!moduleState) {
      return [];
    }
    
    return [...moduleState.exports];
  }
  
  /**
   * Detect and handle any special HQL expressions before normal evaluation
   */
  async detectSpecialHqlExpressions(input: string): Promise<boolean> {
    // Check for imports
    const isImport = await this.detectAndHandleImport(input);
    if (isImport) return true;
    
    // Check for exports
    const isExport = await this.detectAndHandleExport(input);
    if (isExport) return true;
    
    // Check for module switch (may be handled elsewhere)
    const isModuleSwitch = await this.detectModuleSwitch(input);
    return isModuleSwitch;
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
   * Remove a symbol from a specific module
   * @param symbolName The name of the symbol to remove
   * @param moduleName The name of the module to remove from
   * @returns True if the symbol was removed, false otherwise
   */
  async removeSymbolFromModule(symbolName: string, moduleName: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
    try {
      // First check if the module exists
      const modules = await this.getAvailableModules();
      if (!modules.includes(moduleName)) {
        this.moduleLogger.warn(`Module '${moduleName}' does not exist`);
        return false;
      }
      
      // Switch to the module temporarily to remove the symbol
      const currentModule = this.currentModule;
      const replEnv = this.getREPLEnvironment();
      
      // Save current module to switch back to
      try {
        // Temporarily switch to target module
        await this.switchModule(moduleName);
        
        // Update REPLEnvironment to match the current module
        replEnv.setCurrentModule(moduleName);
        
        // Try to remove the symbol
        const removed = persistentStateManager.removeDefinition(symbolName);
        
        if (removed) {
          // Also clean up from the environment
          replEnv.removeJsValue(symbolName, moduleName);
          
          // Log remaining symbols for debugging
          const remainingSymbols = replEnv.getDefinedSymbols(moduleName);
          this.moduleLogger.debug(`After removal, remaining symbols in module ${moduleName}: ${remainingSymbols.join(', ')}`);
        }
        
        // Switch back to original module
        await this.switchModule(currentModule);
        replEnv.setCurrentModule(currentModule);
        
        return removed;
      } catch (error) {
        // Make sure we switch back even if there's an error
        await this.switchModule(currentModule);
        replEnv.setCurrentModule(currentModule);
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error removing symbol from module: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Check if a symbol exists in a specific module
   * This is module-aware and doesn't rely on global environment checks
   */
  async symbolExistsInModule(symbolName: string, moduleName: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const moduleState = persistentStateManager.getModuleState(moduleName);
    if (!moduleState) return false;
    
    // Check all definition types
    for (const type of ['variables', 'functions', 'macros'] as const) {
      if (symbolName in moduleState.definitions[type]) {
        return true;
      }
    }
    
    return false;
  }

  async detectAndHandleImport(input: string): Promise<boolean> {
    if (!this.initialized) return false;
    
    // Simple regex to detect import expressions
    // More sophisticated parsing would be handled by the main evaluator
    const importRegex = /\(\s*import\s+(\[.+?\]|\S+)\s+from\s+["']([^"']+)["']\s*\)/;
    const match = input.match(importRegex);
    
    if (!match) return false;
    
    // Extract the symbols and module
    let symbols: string[] = [];
    const symbolsPart = match[1];
    const moduleName = match[2];
    
    // Check if it's an array of symbols or a single module import
    if (symbolsPart.startsWith('[')) {
      // Parse the array of symbols
      const symbolsString = symbolsPart.slice(1, -1).trim();
      symbols = symbolsString.split(/\s*,\s*/).map(s => s.trim());
    } else {
      // It's a full module import
      symbols = [`*${symbolsPart}`]; // Prefix with * to indicate full module
    }
    
    // Log the import intent
    this.moduleLogger.debug(`Detected import from ${moduleName}: ${symbols.join(', ')}`);
    
    // Check if this is an npm, jsr, or http import that needs special handling
    if (moduleName.startsWith('npm:') || moduleName.startsWith('jsr:') || 
        moduleName.startsWith('http:') || moduleName.startsWith('https:')) {
      try {
        // Use the regular REPL evaluator's import handling
        const evalOptions = { verbose: true, baseDir: Deno.cwd() };
        const result = await this.processExternalImport(input, moduleName, symbols[0].replace(/^\*/, ''), evalOptions);
        
        if (result.success) {
          const moduleNameOnly = symbols[0].replace(/^\*/, '');
          console.log(`[Imported module from ${moduleName}]`);
          console.log(`Module '${moduleNameOnly}' is now available in your environment.`);
          console.log(`Try using it: (${moduleNameOnly}.methodName ...)`);
          
          // Add to the module imports list for tracking
          persistentStateManager.addImport(`${moduleName}`);
          return true;
        } else {
          console.error(`❌ Module '${moduleName}' not found`);
          console.log(`No symbols were imported from ${moduleName}`);
          return true;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Import error: ${errorMessage}`);
        console.log(`No symbols were imported from ${moduleName}`);
        return true;
      }
    }
    
    // Process imports for local modules
    let importedCount = 0;
    for (const symbol of symbols) {
      if (symbol.startsWith('*')) {
        // Full module import
        const success = this.importEntireModule(symbol.substring(1), moduleName);
        if (success) importedCount++;
      } else {
        // Single symbol import
        const success = this.importFromModule(symbol, moduleName);
        if (success) importedCount++;
      }
    }
    
    // Display a helpful confirmation message for the user
    if (importedCount > 0) {
      console.log(`[${importedCount} ${importedCount === 1 ? 'symbol' : 'symbols'} imported from ${moduleName}]`);
    } else {
      console.log(`No symbols were imported from ${moduleName}`);
    }
    
    return true;
  }
  
  /**
   * Process an external import (npm, jsr, http)
   */
  private async processExternalImport(
    input: string, 
    modulePath: string, 
    namespaceAlias: string,
    options: { verbose?: boolean, baseDir?: string } = {}
  ): Promise<{ success: boolean, message: string }> {
    try {
      // Parse the input to get S-expressions
      const parsed = await parse(input);
      
      if (!parsed || parsed.length === 0) {
        return { 
          success: false, 
          message: 'Invalid import expression' 
        };
      }
      
      // Get the REPL environment
      const replEnv = this.getREPLEnvironment();
      
      // Record original current file to restore later
      const originalFile = replEnv.hqlEnv.getCurrentFile();
      
      // Set current file in the environment
      const baseDir = (this as any).baseDir || Deno.cwd();
      replEnv.hqlEnv.setCurrentFile(baseDir);
      
      // Convert sexps to transformedSexps using syntax transformer
      const transformedSexps = await transformSyntax(parsed, { verbose: this.moduleLogger.isVerbose });
      
      // Manually extract import information before processing
      let importInfo = {
        moduleName: namespaceAlias,
        modulePath: modulePath
      };
      
      try {
        // Check if the first expression is an import expression
        if (transformedSexps[0].type === 'list' && 
            transformedSexps[0].elements && 
            transformedSexps[0].elements[0].type === 'symbol' && 
            transformedSexps[0].elements[0].name === 'import') {
          // It's an import expression, try to extract more precise info
          const fromIndex = transformedSexps[0].elements.findIndex(e => e.type === 'symbol' && e.name === 'from');
          if (fromIndex > 0 && fromIndex + 1 < transformedSexps[0].elements.length) {
            // Extract module path from the 'from' clause
            const modulePathElement = transformedSexps[0].elements[fromIndex + 1];
            if (modulePathElement.type === 'literal' && typeof modulePathElement.value === 'string') {
              importInfo.modulePath = modulePathElement.value;
            }
            
            // Extract module name/symbols being imported
            const importTarget = transformedSexps[0].elements[1];
            if (importTarget.type === 'symbol') {
              importInfo.moduleName = importTarget.name;
            }
          }
        }
      } catch (e) {
        this.moduleLogger.debug(`Error extracting import info: ${e}`);
        // Use default import info from function parameters
      }
      
      if (!importInfo.moduleName || !importInfo.modulePath) {
        return { 
          success: false, 
          message: `Invalid import statement format for ${modulePath}` 
        };
      }
      
      // Process the import directly using the imports.ts module
      await processImports(transformedSexps, replEnv.hqlEnv, {
        verbose: this.moduleLogger.isVerbose,
        baseDir: baseDir
      });
      
      // Get the imported module reference from the environment
      const importedModule = replEnv.hqlEnv.lookup(importInfo.moduleName);
      
      // Critical step: Save the imported module in the REPL JS environment
      // This ensures the module is accessible in future evaluations
      if (importedModule !== undefined) {
        // Register in our REPL environment
        replEnv.setJsValue(importInfo.moduleName, importedModule);
        
        // Create a global reference to make it accessible in the REPL
        const evalCode = `globalThis.${importInfo.moduleName} = replEnv.getJsValue("${importInfo.moduleName}");`;
        // Use the parent class's evaluateJs method through type assertion
        await (this as any).evaluateJs(evalCode);
        
        // For JSR modules, analyze the module structure to provide better usage guidance
        if (modulePath.startsWith('jsr:')) {
          const moduleInfo = this.analyzeExternalModule(importedModule, importInfo.moduleName);
          this.moduleLogger.debug(`Module analysis for ${importInfo.moduleName}: ${JSON.stringify(moduleInfo)}`);
          
          // If module has a default property that appears to be the main export,
          // also make it directly accessible
          if (moduleInfo.hasDefaultExport) {
            // Create a helper function to access the default export
            const defaultAccessCode = `
              // Create a direct accessor function for the default export
              if (${importInfo.moduleName}.default) {
                // Define a function property to maintain a reference to the module
                const defaultFn = function(...args) {
                  return ${importInfo.moduleName}.default(...args);
                };
                
                // Copy all properties from default export to the wrapper function
                Object.assign(defaultFn, ${importInfo.moduleName}.default);
                
                // Add the function as a property on the module object
                ${importInfo.moduleName}.__defaultAccess = defaultFn;
                
                // Also add the actual default export back as a reference
                ${importInfo.moduleName}.__default = ${importInfo.moduleName}.default;
              }
            `;
            await (this as any).evaluateJs(defaultAccessCode);
            this.moduleLogger.debug(`Added default export accessor for ${importInfo.moduleName}`);
          }
        }
        
        this.moduleLogger.debug(`Registered "${importInfo.moduleName}" in REPL environment`);
      } else {
        this.moduleLogger.error(`Module "${importInfo.moduleName}" was processed but not found in environment`);
      }
      
      // Restore the original current file
      replEnv.hqlEnv.setCurrentFile(originalFile);
      
      // Register this successful import in our tracking
      if (!(this as any).importedModules) {
        (this as any).importedModules = new Map();
      }
      (this as any).importedModules.set(importInfo.moduleName, importInfo.modulePath);
      
      return {
        success: true,
        message: `Successfully imported ${importInfo.moduleName} from "${importInfo.modulePath}"`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error importing external module: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Analyze an external module to understand its structure
   * This helps with providing better usage guidance
   */
  private analyzeExternalModule(moduleValue: any, moduleName: string): {
    name: string;
    type: string;
    hasDefaultExport: boolean;
    isClass: boolean;
    hasNamedExports: boolean;
    colorMethods: string[];
    properties: string[];
    isColorModule?: boolean;
    defaultType?: string;
    isDefaultClass?: boolean;
  } {
    const moduleInfo: {
      name: string;
      type: string;
      hasDefaultExport: boolean;
      isClass: boolean;
      hasNamedExports: boolean;
      colorMethods: string[];
      properties: string[];
      isColorModule?: boolean;
      defaultType?: string;
      isDefaultClass?: boolean;
    } = {
      name: moduleName,
      type: typeof moduleValue,
      hasDefaultExport: false,
      isClass: false,
      hasNamedExports: false,
      colorMethods: [] as string[],
      properties: [] as string[]
    };
    
    try {
      if (moduleValue === null || moduleValue === undefined) {
        return moduleInfo;
      }
      
      // Check if module has a default export
      if (moduleValue.default !== undefined) {
        moduleInfo.hasDefaultExport = true;
        moduleInfo.defaultType = typeof moduleValue.default;
        
        // Check if default is a constructor function/class
        if (typeof moduleValue.default === 'function') {
          moduleInfo.isDefaultClass = /^class\s/.test(moduleValue.default.toString()) ||
                                     (moduleValue.default.prototype && 
                                      Object.getOwnPropertyNames(moduleValue.default.prototype).length > 0);
        }
      }
      
      // Check if the module itself is a class
      if (typeof moduleValue === 'function') {
        moduleInfo.isClass = /^class\s/.test(moduleValue.toString()) ||
                            (moduleValue.prototype && 
                             Object.getOwnPropertyNames(moduleValue.prototype).length > 0);
      }
      
      // Collect properties
      moduleInfo.properties = Object.getOwnPropertyNames(moduleValue)
        .filter(name => name !== 'default' && name !== 'constructor');
      
      moduleInfo.hasNamedExports = moduleInfo.properties.length > 0;
      
      // Special handling for chalk-like modules
      if (moduleName.toLowerCase().includes('chalk') || 
          (moduleValue.colors && Array.isArray(moduleValue.colors))) {
        moduleInfo.isColorModule = true;
        
        // Collect color methods
        if (moduleValue.colors && Array.isArray(moduleValue.colors)) {
          moduleInfo.colorMethods = moduleValue.colors;
        } else if (moduleValue.default && moduleValue.default.colors) {
          moduleInfo.colorMethods = moduleValue.default.colors;
        }
      }
      
      return moduleInfo;
    } catch (error) {
      this.moduleLogger.warn(`Error analyzing module: ${error}`);
      return moduleInfo;
    }
  }
  
  /**
   * Import an entire module as a namespace
   */
  importEntireModule(namespaceAlias: string, fromModule: string): boolean {
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
      
      // Create a namespace object with all exported symbols
      const namespaceObj: Record<string, any> = {};
      
      // Add exported symbols to the namespace
      for (const exportedSymbol of moduleState.exports) {
        // Find the symbol in the module's definitions
        for (const type of ['variables', 'functions', 'macros'] as const) {
          if (exportedSymbol in moduleState.definitions[type]) {
            // Get the value from the environment
            const value = this.getEnvironment().lookup(`${fromModule}.${exportedSymbol}`);
            if (value !== undefined) {
              namespaceObj[exportedSymbol] = value;
            }
            break;
          }
        }
      }
      
      // Register the namespace in the current module
      const replEnv = this.getREPLEnvironment();
      replEnv.setJsValue(namespaceAlias, namespaceObj);
      
      // Add it to the definitions
      persistentStateManager.addDefinition(namespaceAlias, namespaceObj, 'variable');
      
      // Add to imports list for tracking
      persistentStateManager.addImport(`${fromModule}.*`);
      
      this.moduleLogger.debug(`Imported module '${fromModule}' as namespace '${namespaceAlias}'`);
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Error importing module: ${errorMessage}`);
      return false;
    }
  }
  
  /**
   * Detect if this is a native HQL export expression and process it
   * This handles HQL syntax like: (export [symbol1, symbol2])
   */
  async detectAndHandleExport(input: string): Promise<boolean> {
    if (!this.initialized) return false;
    
    // Simple regex to detect export expressions
    const exportRegex = /\(\s*export\s+(?:default\s+(\S+)|(\[.+?\]))\s*\)/;
    const match = input.match(exportRegex);
    
    if (!match) return false;
    
    const defaultExport = match[1];
    const symbolsArray = match[2];
    
    if (defaultExport) {
      // Handle default export
      const success = this.exportSymbol(defaultExport);
      if (success) {
        console.log(`${defaultExport} exported as default`);
      } else {
        console.error(`Failed to export ${defaultExport}`);
      }
      return true;
    }
    
    if (symbolsArray) {
      // Handle array of exports
      const symbolsString = symbolsArray.slice(1, -1).trim();
      const symbols = symbolsString.split(/\s*,\s*/).map(s => s.trim());
      
      let exportedCount = 0;
      for (const symbol of symbols) {
        const success = this.exportSymbol(symbol);
        if (success) {
          console.log(`${symbol} exported`);
          exportedCount++;
        } else {
          console.error(`Failed to export ${symbol}`);
        }
      }
      
      if (exportedCount > 0) {
        this.moduleLogger.debug(`Exported ${exportedCount} symbols from module '${this.currentModule}'`);
      }
      
      return true;
    }
    
    return false;
  }
}