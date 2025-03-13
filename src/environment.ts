// src/environment.ts - Unified Environment for Runtime and Compile-time

import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./transpiler/hql_ast.ts";
import { gensym } from "./gensym.ts";

export type MacroFunction = (args: HQLNode[], env: Environment) => HQLNode;

/**
 * A unified environment that works for both runtime and compile-time.
 * This is the foundation of our homoiconic system where macros have
 * access to the same capabilities as runtime code.
 */
export class Environment {
  private bindings = new Map<string, any>();
  private macros = new Map<string, MacroFunction>();
  private parent: Environment | null = null;
  
  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }
  
  /**
   * Look up a symbol in the environment, traversing parent environments if needed.
   */
  lookup(symbol: string): any {
    if (this.bindings.has(symbol)) {
      return this.bindings.get(symbol);
    }
    if (this.parent) {
      return this.parent.lookup(symbol);
    }
    throw new Error(`Symbol not found: ${symbol}`);
  }
  
  /**
   * Check if a symbol exists in this environment chain.
   */
  has(symbol: string): boolean {
    return this.bindings.has(symbol) || (this.parent !== null && this.parent.has(symbol));
  }
  
  /**
   * Define a symbol in the current environment.
   */
  define(symbol: string, value: any): void {
    this.bindings.set(symbol, value);
  }
  
  /**
   * Define a macro in the current environment.
   */
  defineMacro(name: string, fn: MacroFunction): void {
    this.macros.set(name, fn);
  }
  
  /**
   * Check if a macro exists in the current or parent environments.
   */
  hasMacro(name: string): boolean {
    return this.macros.has(name) || (this.parent?.hasMacro(name) || false);
  }
  
  /**
   * Get a macro from the current or parent environments.
   */
  getMacro(name: string): MacroFunction | null {
    if (this.macros.has(name)) {
      return this.macros.get(name)!;
    }
    if (this.parent) {
      return this.parent.getMacro(name);
    }
    return null;
  }
  
  /**
   * Create a new environment with the current one as parent.
   */
  extend(): Environment {
    return new Environment(this);
  }
  
  /**
   * Create a new extended environment with bindings for parameters.
   */
  extendWithBindings(params: string[], args: any[]): Environment {
    const env = this.extend();
    for (let i = 0; i < params.length; i++) {
      if (i < args.length) {
        env.define(params[i], args[i]);
      } else {
        env.define(params[i], null);
      }
    }
    return env;
  }
  
  /**
   * Get all bindings as a map for debugging.
   */
  getAllBindings(): Map<string, any> {
    const result = new Map<string, any>();
    
    // Add parent bindings first (will be overridden by local bindings)
    if (this.parent) {
      for (const [key, value] of this.parent.getAllBindings()) {
        result.set(key, value);
      }
    }
    
    // Add local bindings
    for (const [key, value] of this.bindings) {
      result.set(key, value);
    }
    
    return result;
  }
}

/**
 * Create a symbol node with the given name.
 */
export function makeSymbol(name: string): SymbolNode {
  return { type: "symbol", name };
}

/**
 * Create a literal node with the given value.
 */
export function makeLiteral(value: any): LiteralNode {
  return { type: "literal", value };
}

/**
 * Create a list node with the given elements.
 */
export function makeList(...elements: HQLNode[]): ListNode {
  return { type: "list", elements };
}