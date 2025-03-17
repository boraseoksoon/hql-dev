// src/s-exp/environment.ts - Environment for macro expansion and evaluation

import { SExp, SSymbol, SList, SLiteral, 
    isSymbol, isList, isLiteral,
    createSymbol, createList, createLiteral, createNilLiteral } from './types.ts';
import { Logger } from '../logger.ts'; // Using existing logger system

/**
* Type definition for macro functions
*/
export type MacroFn = (args: SExp[], env: SEnv) => SExp;

/**
* Environment class for storing and retrieving variables and macros
*/
export class SEnv {
private variables: Map<string, any>;
private macros: Map<string, MacroFn>;
private parent: SEnv | null;
private moduleExports: Map<string, Record<string, any>>;
private logger: Logger;

/**
* Create a new environment
* @param parent Parent environment (for variable lookup chain)
* @param logger Logger for debugging (optional)
*/
constructor(parent: SEnv | null = null, logger?: Logger) {
this.variables = new Map();
this.macros = new Map();
this.moduleExports = new Map();
this.parent = parent;
this.logger = logger || new Logger(false);
}

/**
* Define a variable in this environment
*/
define(name: string, value: any): void {
this.logger.debug(`Defining variable: ${name}`);
this.variables.set(name, value);
}

/**
* Define a macro in this environment
*/
defineMacro(name: string, fn: MacroFn): void {
this.logger.debug(`Defining macro: ${name}`);
this.macros.set(name, fn);
}

/**
* Import a module with all its exports
*/
importModule(moduleName: string, exports: Record<string, any>): void {
  this.logger.debug(`Importing module: ${moduleName} with exports: ${Object.keys(exports).join(', ')}`);

  // Create a module object that directly contains all exports
  const moduleObj: Record<string, any> = {...exports};

  // Store the module as a variable
  this.define(moduleName, moduleObj);

  // Keep track of module exports for qualified access
  this.moduleExports.set(moduleName, exports);

  // Register qualified macros if present
  for (const [exportName, exportValue] of Object.entries(exports)) {
    if (typeof exportValue === 'function' && 'isMacro' in exportValue) {
      const qualifiedName = `${moduleName}.${exportName}`;
      this.logger.debug(`Registering qualified macro: ${qualifiedName}`);
      this.defineMacro(qualifiedName, exportValue as MacroFn);
    }
  }

  this.logger.debug(`Module ${moduleName} imported with exports: ${Object.keys(moduleObj).join(', ')}`);
}

/**
 * Look up a variable in this environment or its parents
 */
lookup(name: string): any {
  // Check for dot notation (module.property access)
  if (name.includes('.')) {
    return this.lookupDotNotation(name);
  }

  // Handle symbol name with dashes by replacing with underscores
  const sanitizedName = name.replace(/-/g, '_');
  
  // Try with sanitized name first
  if (this.variables.has(sanitizedName)) {
    this.logger.debug(`Found variable with sanitized name: ${sanitizedName}`);
    return this.variables.get(sanitizedName);
  }
  
  // Try with original name
  if (this.variables.has(name)) {
    this.logger.debug(`Found variable with original name: ${name}`);
    return this.variables.get(name);
  }

  if (this.parent) {
    return this.parent.lookup(name);
  }

  this.logger.debug(`Variable not found: ${name} (or ${sanitizedName})`);
  throw new Error(`Variable not found: ${name}`);
}

/**
 * Look up a property via dot notation (module.property)
 */
private lookupDotNotation(name: string): any {
  const [moduleName, ...propertyParts] = name.split('.');
  const propertyPath = propertyParts.join('.');

  // Look up the module
  let moduleValue: any;

  try {
    moduleValue = this.lookup(moduleName);
  } catch (error) {
    this.logger.debug(`Module not found for dot notation: ${moduleName}`);
    throw new Error(`Module not found: ${moduleName}`);
  }

  // Navigate the property path
  let current = moduleValue;
  
  this.logger.debug(`Looking up property path "${propertyPath}" in module "${moduleName}"`);
  this.logger.debug(`Module value: ${JSON.stringify(current)}`);

  // For single property access with no further dots
  if (propertyParts.length === 1) {
    const part = propertyParts[0];
    
    // Try direct property access
    if (current && typeof current === 'object') {
      
      // Method 1: Try direct property access
      if (part in current) {
        this.logger.debug(`Found property "${part}" via direct access`);
        return current[part];
      }
      
      // Method 2: Try direct property access with object name sanitized (underscores for dashes)
      const sanitizedPart = part.replace(/-/g, '_');
      if (sanitizedPart in current) {
        this.logger.debug(`Found property "${sanitizedPart}" (from "${part}") via sanitized access`);
        return current[sanitizedPart];
      }
      
      // Method 3: Look for a property that exactly matches the export name
      for (const key of Object.keys(current)) {
        if (key === part) {
          this.logger.debug(`Found exact property match: "${key}"`);
          return current[key];
        }
      }
      
      // Method 4: If property is dash-separated, try underscore version as fallback
      const underscorePart = part.replace(/-/g, '_');
      if (underscorePart !== part && underscorePart in current) {
        this.logger.debug(`Found underscore version of property: "${underscorePart}"`);
        return current[underscorePart];
      }
      
      // Method 5: If nothing else works, try case-insensitive lookup
      for (const key of Object.keys(current)) {
        if (key.toLowerCase() === part.toLowerCase()) {
          this.logger.debug(`Found case-insensitive property match: "${key}"`);
          return current[key];
        }
      }
      
      // Debug available properties
      this.logger.debug(`Available properties in module: ${JSON.stringify(Object.keys(current))}`);
      
      this.logger.debug(`Property "${part}" not found in module "${moduleName}"`);
      throw new Error(`Property "${part}" not found in module "${moduleName}"`);
    } else {
      throw new Error(`Cannot access property "${part}" of non-object: ${current}`);
    }
  }
  
  // For multi-part property paths (a.b.c)
  for (const part of propertyParts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // Try with dashes converted to underscores
      const underscorePart = part.replace(/-/g, '_');
      if (current && typeof current === 'object' && underscorePart in current) {
        current = current[underscorePart];
      } else {
        this.logger.debug(`Property not found in path: ${name}`);
        throw new Error(`Property not found: ${name}`);
      }
    }
  }

  return current;
}

/**
* Check if a macro exists
*/
hasMacro(name: string): boolean {
// Check for dot notation (module.macro access)
if (name.includes('.')) {
 const [moduleName, macroName] = name.split('.');
 
 // Check if we have this as a qualified macro
 if (this.macros.has(name)) {
   return true;
 }
 
 // Check if the module exists and has the macro
 if (this.moduleExports.has(moduleName)) {
   const moduleExports = this.moduleExports.get(moduleName)!;
   return typeof moduleExports[macroName] === 'function' && 
          'isMacro' in moduleExports[macroName];
 }
 
 // Try parent environment
 return this.parent ? this.parent.hasMacro(name) : false;
}

// Regular macro lookup
return this.macros.has(name) || 
      (this.parent !== null && this.parent.hasMacro(name));
}

/**
* Get a macro by name
*/
getMacro(name: string): MacroFn | null {
// Check for dot notation (module.macro access)
if (name.includes('.')) {
 // First try direct lookup in qualified macros
 if (this.macros.has(name)) {
   return this.macros.get(name)!;
 }
 
 const [moduleName, macroName] = name.split('.');
 
 // Check if the module exists and has the macro
 if (this.moduleExports.has(moduleName)) {
   const moduleExports = this.moduleExports.get(moduleName)!;
   if (typeof moduleExports[macroName] === 'function' && 
       'isMacro' in moduleExports[macroName]) {
     return moduleExports[macroName] as MacroFn;
   }
 }
 
 // Try parent environment
 return this.parent ? this.parent.getMacro(name) : null;
}

// Regular macro lookup
if (this.macros.has(name)) {
 return this.macros.get(name)!;
}

return this.parent ? this.parent.getMacro(name) : null;
}

/**
* Create a new environment with bindings for function parameters
*/
extend(params: string[], args: any[]): SEnv {
const newEnv = new SEnv(this, this.logger);

// Process parameters, handling rest parameters
let restParamMode = false;
let restParamName = '';

for (let i = 0; i < params.length; i++) {
 const param = params[i];
 
 if (param === '&') {
   restParamMode = true;
   continue;
 }
 
 if (restParamMode) {
   // Handle rest parameter
   restParamName = param;
   const restArgs = args.slice(i - 1); // -1 to account for the & symbol
   newEnv.define(restParamName, restArgs);
   break;
 } else {
   // Regular parameter
   newEnv.define(param, i < args.length ? args[i] : null);
 }
}

return newEnv;
}
}

/**
* Initialize a global environment with core functions and macros
*/
export function initializeGlobalEnv(options: { verbose?: boolean } = {}): SEnv {
const env = new SEnv(null, new Logger(options.verbose || false));

// Define core math operations
env.define('+', (...args: number[]) => args.reduce((a, b) => a + b, 0));
env.define('-', (a: number, b: number) => a - b);
env.define('*', (...args: number[]) => args.reduce((a, b) => a * b, 1));
env.define('/', (a: number, b: number) => a / b);
env.define('%', (a: number, b: number) => a % b);

// Define comparison operations
env.define('=', (a: any, b: any) => a === b);
env.define('!=', (a: any, b: any) => a !== b);
env.define('<', (a: number, b: number) => a < b);
env.define('>', (a: number, b: number) => a > b);
env.define('<=', (a: number, b: number) => a <= b);
env.define('>=', (a: number, b: number) => a >= b);

// Define console methods
env.define('console.log', console.log);
env.define('console.warn', console.warn);
env.define('console.error', console.error);

// Define JavaScript interop functions
env.define('js-get', (obj: any, prop: string) => obj[prop]);
env.define('js-call', (obj: any, method: string, ...args: any[]) => obj[method](...args));

// Define list operations
env.define('list', (...items: any[]) => items);
env.define('first', (list: any[]) => list.length > 0 ? list[0] : null);
env.define('rest', (list: any[]) => list.slice(1));
env.define('cons', (item: any, list: any[]) => [item, ...list]);
env.define('length', (list: any[]) => list.length);

return env;
}