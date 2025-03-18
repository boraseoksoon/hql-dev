// src/environment.ts - Updated with minimal core.hql macro loading

import { Logger } from './logger.ts';
import { parse } from './s-exp/parser.ts';
import { isDefMacro, SList } from './s-exp/types.ts';
import { defineMacro } from './s-exp/macro.ts';
import { resolve, dirname, readTextFile, existsFn } from './platform/platform.ts';

/**
* Type definition for macro functions
*/
export type MacroFn = (args: any[], env: Environment) => any;
``
/**
* Environment class for variable and macro scoping
*/
export class Environment {
  private variables = new Map<string, any>();
  private macros = new Map<string, MacroFn>();
  private parent: Environment | null;
  private logger: Logger;
  
  // ADDED: Flag to prevent infinite recursion during core loading
  private static coreLoaded = false;
  
  // Singleton instance and access methods
  private static instance: Environment | null = null;
  private static initializing: Promise<void> | null = null;
  
  /**
  * Get the singleton instance of the Environment
  */
  public static getInstance(options: { verbose?: boolean } = {}): Environment {
    // Create instance if it doesn't exist
    if (!Environment.instance) {
      const logger = new Logger(options.verbose || false);
      Environment.instance = new Environment(null, logger);
      
      // Initialize the instance (async)
      if (!Environment.initializing) {
        Environment.initializing = this.initializeInstance(options);
      }
    }
    
    return Environment.instance;
  }
  
  /**
  * Initialize the singleton instance - handles async operations
  */
  private static async initializeInstance(options: { verbose?: boolean }): Promise<void> {
    if (!Environment.instance) return;
    
    const env = Environment.instance;
    const logger = env.logger;
    
    logger.debug("Initializing singleton environment");
    
    // Initialize built-ins inline (no separate function)
    env.define('+', (...args: number[]) => args.reduce((a, b) => a + b, 0));
    env.define('-', (a: number, b: number) => a - b);
    env.define('*', (...args: number[]) => args.reduce((a, b) => a * b, 1));
    env.define('/', (a: number, b: number) => a / b);
    env.define('%', (a: number, b: number) => a % b);
    
    // Comparison operations
    env.define('=', (a: any, b: any) => a === b);
    env.define('!=', (a: any, b: any) => a !== b);
    env.define('<', (a: number, b: number) => a < b);
    env.define('>', (a: number, b: number) => a > b);
    env.define('<=', (a: number, b: number) => a <= b);
    env.define('>=', (a: number, b: number) => a >= b);
    
    // Collection operations
    env.define('get', (obj: any, prop: any) => {
      if (obj == null) return null;
      return obj[prop];
    });
    
    // Console operations
    env.define('console.log', console.log);
    env.define('console.warn', console.warn);
    env.define('console.error', console.error);
    
    // JS Interop
    env.define('js-get', (obj: any, prop: string) => obj[prop]);
    env.define('js-call', (obj: any, method: string, ...args: any[]) => obj[method](...args));
    
    // List operations
    env.define('list', (...items: any[]) => items);
    env.define('first', (list: any[]) => list.length > 0 ? list[0] : null);
    env.define('rest', (list: any[]) => list.slice(1));
    env.define('cons', (item: any, list: any[]) => [item, ...list]);
    env.define('length', (list: any[]) => list.length);
    
    // Load core macros
    await loadCoreMacros(env, logger);
    
    logger.debug("Singleton environment initialized");
  }
  
  /**
  * Private constructor to enforce singleton pattern
  */
  private constructor(parent: Environment | null, logger?: Logger) {
    this.parent = parent;
    this.logger = logger || new Logger(false);
  }
  
  /**
  * Define a variable in this environment
  */
  define(key: string, value: any): void {
    this.logger.debug(`Defining symbol: ${key}`);
    this.variables.set(key, value);
  }
  
  /**
  * Look up a variable in this environment or its parents
  */
  lookup(key: string): any {
    // Handle symbol name with dashes by replacing with underscores
    const sanitizedKey = key.replace(/-/g, '_');
    
    // Try with sanitized name first
    if (this.variables.has(sanitizedKey)) {
      this.logger.debug(`Found variable with sanitized name: ${sanitizedKey}`);
      return this.variables.get(sanitizedKey);
    }
    
    // Try with original name
    if (this.variables.has(key)) {
      this.logger.debug(`Found variable with original name: ${key}`);
      return this.variables.get(key);
    }
    
    // Try parent environment
    if (this.parent) {
      return this.parent.lookup(key);
    }
    
    throw new Error(`Symbol not found: ${key}`);
  }
  
  /**
  * Define a macro in this environment
  */
  defineMacro(key: string, macro: MacroFn): void {
    this.logger.debug(`Defining macro: ${key}`);
    this.macros.set(key, macro);
    
    // Tag the function as a macro for later identification
    Object.defineProperty(macro, 'isMacro', { value: true });
  }
  
  /**
  * Check if a macro exists
  */
  hasMacro(key: string): boolean {
    this.logger.debug(`Checking for macro: ${key}`);
    
    // Check direct macros
    if (this.macros.has(key)) {
      this.logger.debug(`Found direct macro: ${key}`);
      return true;
    }
    
    // Try parent environment
    return this.parent !== null && this.parent.hasMacro(key);
  }
  
  /**
  * Get a macro by name
  */
  getMacro(key: string): MacroFn | undefined {
    // Direct macro lookup
    if (this.macros.has(key)) {
      this.logger.debug(`Retrieved direct macro: ${key}`);
      return this.macros.get(key);
    }
    
    // Check parent environment
    return this.parent ? this.parent.getMacro(key) : undefined;
  }
  
  /**
  * Create a child environment with this one as parent
  */
  extend(): Environment {
    return new Environment(this, this.logger);
  }
  
  /**
  * Create a global environment initialized with standard bindings
  */
  static async initializeGlobalEnv(options: { verbose?: boolean } = {}): Promise<Environment> {
    const logger = new Logger(options.verbose || false);
    logger.debug("Initializing global environment");
    
    const env = new Environment(null, logger);
    
    // Initialize built-in functions
    env.define('+', (...args: number[]) => args.reduce((a, b) => a + b, 0));
    env.define('-', (a: number, b: number) => a - b);
    env.define('*', (...args: number[]) => args.reduce((a, b) => a * b, 1));
    env.define('/', (a: number, b: number) => a / b);
    env.define('%', (a: number, b: number) => a % b);
    
    // Comparison operations
    env.define('=', (a: any, b: any) => a === b);
    env.define('!=', (a: any, b: any) => a !== b);
    env.define('<', (a: number, b: number) => a < b);
    env.define('>', (a: number, b: number) => a > b);
    env.define('<=', (a: number, b: number) => a <= b);
    env.define('>=', (a: number, b: number) => a >= b);
    
    // Collection operations
    env.define('get', (obj: any, prop: any) => {
      if (obj == null) return null;
      return obj[prop];
    });
    
    // Console operations
    env.define('console.log', console.log);
    env.define('console.warn', console.warn);
    env.define('console.error', console.error);
    
    // JS Interop
    env.define('js-get', (obj: any, prop: string) => obj[prop]);
    env.define('js-call', (obj: any, method: string, ...args: any[]) => obj[method](...args));
    
    // List operations
    env.define('list', (...items: any[]) => items);
    env.define('first', (list: any[]) => list.length > 0 ? list[0] : null);
    env.define('rest', (list: any[]) => list.slice(1));
    env.define('cons', (item: any, list: any[]) => [item, ...list]);
    env.define('length', (list: any[]) => list.length);
    
    // CRITICAL NEW FEATURE: Load and process core.hql macros 
    // but with check to prevent infinite recursion
    if (!Environment.coreLoaded) {
      await loadCoreMacros(env, logger);
    }
    
    logger.debug("Global environment initialized");
    return env;
  }
}

/**
* Load and process core.hql macros - minimal implementation
* that avoids circular imports and infinite recursion
*/
async function loadCoreMacros(env: Environment, logger: Logger): Promise<void> {
  try {
    // CRITICAL: Mark core as loaded first thing to prevent infinite recursion
    Environment.coreLoaded = true;
    
    // Search for core.hql in several possible locations
    const possiblePaths = [
      "./lib/core.hql",
      "lib/core.hql",
      "../lib/core.hql",
      resolve(Deno.cwd(), "lib/core.hql"),
    ];
    
    let corePath: string | null = null;
    
    // Find the first path that exists
    for (const path of possiblePaths) {
      logger.debug(`Checking for core.hql at: ${path}`);
      if (await existsFn(path)) {
        corePath = path;
        logger.debug(`Found core.hql at: ${path}`);
        break;
      }
    }
    
    if (!corePath) {
      logger.warn("Could not find core.hql in any of the expected locations");
      return;
    }
    
    logger.debug(`Loading core macros from: ${corePath}`);
    
    // Read and parse core.hql
    const coreContent = await readTextFile(corePath);
    const coreSexps = parse(coreContent);
    
    // Skip imports processing to avoid circular dependency
    // Just process the macro definitions directly
    for (const expr of coreSexps) {
      if (isDefMacro(expr)) {
        try {
          // Extract macro name
          if (expr.type === 'list' && expr.elements.length > 1 && 
            expr.elements[1].type === 'symbol') {
              const macroName = expr.elements[1].name;
              
              // Define the macro in the environment
              defineMacro(expr as SList, env, logger);
              
              logger.debug(`Registered core macro: ${macroName}`);
            }
          } catch (error) {
            logger.error(`Error defining macro from core.hql: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      logger.debug(`Core macros loaded from ${corePath}`);
    } catch (error) {
      logger.error(`Error loading core macros: ${error instanceof Error ? error.message : String(error)}`);
    }
  }