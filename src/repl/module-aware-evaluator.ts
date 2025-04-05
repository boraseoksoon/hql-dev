// src/repl/module-aware-evaluator.ts
// Enhanced REPL evaluator with module awareness and persistence

import { REPLEvaluator, REPLEvalOptions, REPLEvalResult } from "./repl-evaluator.ts";
import { Environment, Value } from "../environment.ts";
import { Logger } from "../logger.ts";
import { persistentStateManager } from "./persistent-state-manager.ts";
import { REPLEnvironment } from "./repl-environment.ts";
import { parse } from "../transpiler/pipeline/parser.ts";

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
  private currentModule: string = "user";
  private initialized = false;
  
  constructor(env: Environment, options: ModuleAwareEvalOptions = {}) {
    super(env, options);
    this.moduleLogger = new Logger(options.verbose ?? false);
    
    // Initialize state manager
    this.initializeModuleSystem();
  }
  
  /**
   * Initialize the module system
   */
  private async initializeModuleSystem(): Promise<void> {
    try {
      await persistentStateManager.initialize();
      this.currentModule = persistentStateManager.getCurrentModule();
      this.initialized = true;
      this.moduleLogger.debug(`Initialized module system with current module: ${this.currentModule}`);
      
      // Restore all module definitions from persistent storage
      await this.restoreAllModuleStates();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.moduleLogger.error(`Failed to initialize module system: ${errorMessage}`);
    }
  }
  
  /**
   * Restore all module states from persistent storage
   */
  private async restoreAllModuleStates(): Promise<void> {
    if (!this.initialized) return;
    
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
  getCurrentModule(): string {
    return this.currentModule;
  }
  
  /**
   * Get all available module names
   */
  getAvailableModules(): string[] {
    return persistentStateManager.getModuleNames();
  }
  
  /**
   * Switch to a different module
   */
  switchModule(moduleName: string): void {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
    this.currentModule = moduleName;
    persistentStateManager.switchToModule(moduleName);
    this.moduleLogger.debug(`Switched to module: ${moduleName}`);
  }
  
  /**
   * Remove a module
   */
  removeModule(moduleName: string): boolean {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
    return persistentStateManager.removeModule(moduleName);
  }
  
  /**
   * List the symbols in a module
   */
  listModuleSymbols(moduleName?: string): string[] {
    if (!this.initialized) {
      throw new Error("Module system not initialized");
    }
    
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
      this.getREPLEnvironment().removeJsValue(name);
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
      // Get the REPL environment to access definitions
      const replEnv = this.getREPLEnvironment();
      
      // Extract defined symbols from the generated JS
      const definedSymbols = replEnv.extractDefinitions(generatedJs);
      
      // Skip if no definitions found
      if (!definedSymbols.length) return;
      
      // Track each defined symbol
      for (const symbol of definedSymbols) {
        const value = replEnv.getJsValue(symbol);
        
        // Skip if no value found
        if (value === undefined) continue;
        
        // Determine the type of definition
        let type: 'variable' | 'function' | 'macro' = 'variable';
        
        if (typeof value === 'function') {
          type = 'function';
        } else if (value && typeof value === 'object' && 'transformSExp' in value) {
          type = 'macro';
        }
        
        // Add to persistent state
        persistentStateManager.addDefinition(symbol, value, type);
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
      persistentStateManager.switchToModule(currentModule);
    } else {
      // Reset to default module
      this.currentModule = "user";
      super.resetEnvironment();
      // Tell the state manager we're back to the default module
      persistentStateManager.switchToModule("user");
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
} 