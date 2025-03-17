import { MacroFunction } from "./bootstrap.ts";
import { Logger } from "./logger.ts";

export class Env {
  bindings = new Map<string, any>();
  macros = new Map<string, MacroFunction>();
  moduleImports = new Map<string, string>();
  parent: Env | null = null;
  logger: Logger;
  
  constructor(parent: Env | null = null, logger?: Logger) {
    this.parent = parent;
    this.logger = logger || new Logger();
  }
  
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
      
      if (this.bindings.has(moduleName)) {
        const module = this.bindings.get(moduleName);
        
        if (module && typeof module === 'object' && memberName in module) {
          return module[memberName];
        }
      }
    }
    
    // Try parent environment
    if (this.parent) {
      try {
        return this.parent.lookup(symbol);
      } catch {
        // Continue with "not found" if parent throws
      }
    }
    
    throw new Error(`Symbol not found: ${symbol}`);
  }
  
  define(symbol: string, value: any): void {
    this.logger.debug(`Defining symbol: ${symbol}`);
    this.bindings.set(symbol, value);
  }
  
  defineMacro(name: string, fn: MacroFunction): void {
    this.logger.debug(`Defining macro: ${name}`);
    this.macros.set(name, fn);
  }
  
  hasMacro(name: string): boolean {
    // Direct lookup
    if (this.macros.has(name)) {
      return true;
    }
    
    // Handle dot notation for qualified macros
    if (name.includes('.')) {
      const [moduleName, macroName] = name.split('.');
      
      // First try with fully qualified name
      if (this.macros.has(name)) {
        return true;
      }
      
      // Then try through module object
      if (this.bindings.has(moduleName)) {
        const module = this.bindings.get(moduleName);
        
        if (module && typeof module === 'object' && macroName in module) {
          return typeof module[macroName] === 'function';
        }
      }
    }
    
    // Check parent environment
    if (this.parent) {
      return this.parent.hasMacro(name);
    }
    
    return false;
  }
  
  getMacro(name: string): MacroFunction | null {
    // Direct lookup
    if (this.macros.has(name)) {
      return this.macros.get(name)!;
    }
    
    // Handle dot notation for qualified macros
    if (name.includes('.')) {
      const [moduleName, macroName] = name.split('.');
      
      // First try with fully qualified name
      if (this.macros.has(name)) {
        return this.macros.get(name)!;
      }
      
      // Then try through module object
      if (this.bindings.has(moduleName)) {
        const module = this.bindings.get(moduleName);
        
        if (module && typeof module === 'object' && macroName in module) {
          const fn = module[macroName];
          
          if (typeof fn === 'function') {
            return fn;
          }
        }
      }
    }
    
    // Check parent environment
    if (this.parent) {
      return this.parent.getMacro(name);
    }
    
    return null;
  }
  
  extend(params: string[], args: any[]): Env {
    const extendedEnv = new Env(this, this.logger);
    
    // CRITICAL: Ensure list function is available in the extended environment
    extendedEnv.define("list", function(...listArgs: any[]) {
      return { type: "list", elements: listArgs };
    });
    
    for (let i = 0; i < params.length; i++) {
      extendedEnv.define(params[i], i < args.length ? args[i] : null);
    }
    
    return extendedEnv;
  }
}