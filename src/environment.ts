// src/environment.ts

import { Logger } from "./logger.ts";
import { MacroFunction } from "./macroTypes.ts";

/**
 * Env represents the environment for macro expansion and symbol lookup.
 */
export class Env {
  bindings = new Map<string, any>();
  macros = new Map<string, MacroFunction>();
  parent: Env | null;
  logger: Logger;

  constructor(parent: Env | null = null, logger?: Logger) {
    this.parent = parent;
    this.logger = logger || new Logger();
  }

  define(key: string, value: any): void {
    this.logger.debug(`Defining symbol: ${key}`);
    this.bindings.set(key, value);
  }

  lookup(key: string): any {
    if (this.bindings.has(key)) {
      return this.bindings.get(key);
    }
    if (this.parent) {
      return this.parent.lookup(key);
    }
    throw new Error(`Symbol not found: ${key}`);
  }

  defineMacro(key: string, macro: MacroFunction): void {
    this.logger.debug(`Defining macro: ${key}`);
    this.macros.set(key, macro);
  }

  getMacro(key: string): MacroFunction | undefined {
    if (this.macros.has(key)) {
      return this.macros.get(key);
    }
    if (this.parent) {
      return this.parent.getMacro(key);
    }
    return undefined;
  }

  hasMacro(key: string): boolean {
    if (this.macros.has(key)) return true;
    if (this.parent) return this.parent.hasMacro(key);
    return false;
  }

  /**
   * Static initializer for a global environment.
   */
  static async initializeGlobalEnv(options: { verbose?: boolean } = {}): Promise<Env> {
    const logger = new Logger(options.verbose);
    const env = new Env(null, logger);

    // Example: register a built-in function.
    env.define("print", console.log);

    logger.debug("Global environment initialized");
    return env;
  }
}
