import { MacroFunction } from "./bootstrap.ts";
import { Logger } from "./logger.ts"

/* -------------------- Environment -------------------- */

/**
 * Environment class for variable and macro lookup
 */
export class Env {
  bindings = new Map<string, any>();
  macros = new Map<string, MacroFunction>();
  moduleImports = new Map<string, string>(); // Track module import paths
  parent: Env | null = null;
  logger: Logger;
  
  /**
   * Create a new environment
   * @param parent Parent environment for lookup chain
   * @param logger Logger instance for debug output
   */
  constructor(parent: Env | null = null, logger?: Logger) {
    this.parent = parent;
    this.logger = logger || new Logger();
  }
  
  /**
   * Look up a symbol in the environment
   * @param symbol Symbol name to look up
   * @returns Value bound to the symbol
   * @throws Error if symbol not found
   */
  lookup(symbol: string): any {
    this.logger.debug(`Looking up symbol: ${symbol}`);
    
    // First try direct lookup
    if (this.bindings.has(symbol)) {
      this.logger.debug(`Found symbol in current environment: ${symbol}`);
      return this.bindings.get(symbol);
    }
    
    // Handle dot notation for module access
    if (symbol.includes('.')) {
      const [moduleName, memberName] = symbol.split('.');
      this.logger.debug(`Looking up module.member: ${moduleName}.${memberName}`);
      
      // Try direct lookup of fully qualified name first
      if (this.bindings.has(symbol)) {
        this.logger.debug(`Found fully qualified name in environment: ${symbol}`);
        return this.bindings.get(symbol);
      }
      
      // Try module-based lookup
      if (this.bindings.has(moduleName)) {
        const module = this.bindings.get(moduleName);
        this.logger.debug(`Found module: ${moduleName}, looking for member: ${memberName}`);
        
        if (typeof module === 'object' && module !== null && memberName in module) {
          this.logger.debug(`Found member in module: ${memberName}`);
          return module[memberName];
        } else {
          this.logger.debug(`Member not found in module: ${memberName}`);
        }
      } else {
        this.logger.debug(`Module not found: ${moduleName}`);
      }
    }
    
    // Try parent environment with safety check
    if (this.parent && typeof this.parent.lookup === 'function') {
      this.logger.debug(`Looking in parent environment for: ${symbol}`);
      try {
        return this.parent.lookup(symbol);
      } catch (err) {
        // If parent throws "not found", continue with our own "not found"
      }
    }
    
    // Not found
    this.logger.debug(`Symbol not found: ${symbol}`);
    throw new Error(`Symbol not found: ${symbol}`);
  }
  
  /**
   * Define a symbol in the current environment
   * @param symbol Symbol name to define
   * @param value Value to bind to the symbol
   */
  define(symbol: string, value: any): void {
    this.logger.debug(`Defining symbol: ${symbol}`);
    this.bindings.set(symbol, value);
  }
  
  /**
   * Define a macro in the current environment
   * @param name Macro name
   * @param fn Macro function implementation
   */
  defineMacro(name: string, fn: MacroFunction): void {
    this.logger.debug(`Defining macro: ${name}`);
    this.macros.set(name, fn);
  }
  
  /**
   * Check if a macro exists
   * @param name Macro name to check
   * @returns True if macro exists, false otherwise
   */
  hasMacro(name: string): boolean {
    this.logger.debug(`Checking for macro: ${name}`);
    
    // Direct lookup in this environment
    if (this.macros.has(name)) {
      this.logger.debug(`Found macro in current environment: ${name}`);
      return true;
    }
    
    // Handle dot notation for module access
    if (name.includes('.')) {
      const [moduleName, macroName] = name.split('.');
      this.logger.debug(`Checking for module.macro: ${moduleName}.${macroName}`);
      
      // First check if the fully qualified name is registered directly
      if (this.macros.has(name)) {
        this.logger.debug(`Found fully qualified macro: ${name}`);
        return true;
      }
      
      // Try module-based lookup
      try {
        if (this.bindings.has(moduleName)) {
          const module = this.bindings.get(moduleName);
          this.logger.debug(`Found module: ${moduleName}, checking for macro: ${macroName}`);
          
          if (module && typeof module === 'object' && macroName in module) {
            const member = module[macroName];
            this.logger.debug(`Found member in module: ${macroName}, is function: ${typeof member === 'function'}`);
            return typeof member === 'function';
          }
        }
      } catch (error) {
        this.logger.debug(`Error in module lookup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Try parent environment with safety check
    if (this.parent && typeof this.parent.hasMacro === 'function') {
      this.logger.debug(`Checking parent environment for macro: ${name}`);
      try {
        return this.parent.hasMacro(name);
      } catch (err) {
        this.logger.debug(`Error checking parent for macro ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    this.logger.debug(`Macro not found: ${name}`);
    return false;
  }
  
  /**
   * Get a macro function by name
   * @param name Macro name
   * @returns Macro function or null if not found
   */
  getMacro(name: string): MacroFunction | null {
    this.logger.debug(`Getting macro: ${name}`);
    
    // Direct lookup
    if (this.macros.has(name)) {
      this.logger.debug(`Found macro in current environment: ${name}`);
      return this.macros.get(name)!;
    }
    
    // Handle dot notation for module access
    if (name.includes('.')) {
      const [moduleName, macroName] = name.split('.');
      this.logger.debug(`Getting module.macro: ${moduleName}.${macroName}`);
      
      // Try fully qualified name first
      if (this.macros.has(name)) {
        this.logger.debug(`Found fully qualified macro: ${name}`);
        return this.macros.get(name)!;
      }
      
      // Try module-based lookup
      try {
        if (this.bindings.has(moduleName)) {
          const module = this.bindings.get(moduleName);
          this.logger.debug(`Found module: ${moduleName}, looking for macro: ${macroName}`);
          
          if (module && typeof module === 'object' && macroName in module) {
            const member = module[macroName];
            this.logger.debug(`Found member in module: ${macroName}, is function: ${typeof member === 'function'}`);
            
            if (typeof member === 'function') {
              return member;
            }
          }
        }
      } catch (error) {
        this.logger.debug(`Error in module lookup: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Try parent environment with safety check
    if (this.parent && typeof this.parent.getMacro === 'function') {
      this.logger.debug(`Checking parent environment for macro: ${name}`);
      try {
        return this.parent.getMacro(name);
      } catch (err) {
        this.logger.debug(`Error getting macro from parent: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    this.logger.debug(`Macro not found: ${name}`);
    return null;
  }
  
  /**
   * Create a new environment extending this one with new bindings
   * @param params Parameter names to bind
   * @param args Values to bind to parameters
   * @returns New extended environment
   */
  extend(params: string[], args: any[]): Env {
    this.logger.debug(`Extending environment with ${params.length} parameters`);
    // Create a new environment with this as the parent
    const env = new Env(this, this.logger);
    
    // Bind parameters to arguments
    for (let i = 0; i < params.length; i++) {
      env.define(params[i], i < args.length ? args[i] : null);
    }
    
    return env;
  }
}