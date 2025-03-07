// src/bootstrap-core.ts - Aligned with the "macro everywhere" philosophy
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./transpiler/hql_ast.ts";
import { jsImport, jsExport, jsGet, jsCall } from "./interop.ts";
import { gensym } from "./gensym.ts";

/**
 * KERNEL_PRIMITIVES are irreducible forms that cannot be defined in terms of each other.
 * These represent the absolute minimal core of the language.
 */
export const KERNEL_PRIMITIVES = new Set(["quote", "if", "fn", "def"]);

/**
 * DERIVED_FORMS are forms that could theoretically be implemented as macros,
 * but are currently handled directly by the evaluator for bootstrap purposes.
 */
export const DERIVED_FORMS = new Set(["defmacro"]);

/**
 * CORE_FORMS includes both kernel primitives and bootstrap derived forms.
 */
export const CORE_FORMS = new Set([...KERNEL_PRIMITIVES, ...DERIVED_FORMS]);

/**
 * LIST_PRIMITIVES are the minimal set of list operations needed for macros to work.
 * These are inspired by Scheme's car/cdr/cons but with more intuitive names.
 */
export const LIST_PRIMITIVES = new Set(["first", "rest", "cons", "=", "length"]);

/**
 * PRIMITIVE_OPS are primitive operations that are provided directly
 * in the environment for efficiency and implementation simplicity.
 */
export const PRIMITIVE_OPS = new Set([
  // Arithmetic operators
  "+", "-", "*", "/", 
  
  // Comparison operators
  "=", "!=", "<", ">", "<=", ">=", "eq?",
  
  // JS interop
  "js-import", "js-export", "js-get", "js-call",
  
  // List operations
  ...LIST_PRIMITIVES
]);

// Export primitive implementations for code generation
export const PRIMITIVE_IMPLEMENTATIONS = {
  // List primitives
  list: "function list(...args) { return args; }",
  first: "function first(list) { if (!Array.isArray(list)) throw new Error('first requires a list'); return list[0]; }",
  rest: "function rest(list) { if (!Array.isArray(list)) throw new Error('rest requires a list'); return list.slice(1); }",
  cons: "function cons(item, list) { if (!Array.isArray(list)) throw new Error('cons requires a list'); return [item, ...list]; }",
  length: "function length(list) { if (!Array.isArray(list)) throw new Error('length requires a list'); return list.length; }"
};

export class Env {
  bindings = new Map<string, any>();
  macros = new Map<string, MacroFunction>();
  parent: Env | null = null;

  constructor(parent: Env | null = null) {
    this.parent = parent;
  }

  lookup(symbol: string): any {
    if (this.bindings.has(symbol)) {
      return this.bindings.get(symbol);
    }
    if (this.parent) {
      return this.parent.lookup(symbol);
    }
    throw new Error(`Symbol not found: ${symbol}`);
  }

  define(symbol: string, value: any): void {
    this.bindings.set(symbol, value);
  }

  defineMacro(name: string, fn: MacroFunction): void {
    this.macros.set(name, fn);
  }

  hasMacro(name: string): boolean {
    return this.macros.has(name) || (this.parent?.hasMacro(name) || false);
  }

  getMacro(name: string): MacroFunction | null {
    if (this.macros.has(name)) {
      return this.macros.get(name)!;
    }
    if (this.parent) {
      return this.parent.getMacro(name);
    }
    return null;
  }

  extend(params: string[], args: any[]): Env {
    const env = new Env(this);
    for (let i = 0; i < params.length; i++) {
      env.define(params[i], args[i]);
    }
    return env;
  }
}

export type MacroFunction = (args: HQLNode[], env: Env) => HQLNode;

export let globalEnv: Env | null = null;

export function makeSymbol(name: string): SymbolNode {
  return { type: "symbol", name };
}

export function makeLiteral(value: any): LiteralNode {
  return { type: "literal", value };
}

export function makeList(...elements: HQLNode[]): ListNode {
  return { type: "list", elements };
}

function setupPrimitives(env: Env): void {
  // Arithmetic primitives
  env.define("+", (...args: number[]) => args.reduce((a, b) => a + b, 0));
  env.define("-", (a: number, b: number) => a - b);
  env.define("*", (...args: number[]) => args.reduce((a, b) => a * b, 1));
  env.define("/", (a: number, b: number) => a / b);
  env.define("=", (a: any, b: any) => a === b);

  // JS interop primitives now delegate to our interop module.
  env.define("js-import", jsImport);
  env.define("js-export", jsExport);
  env.define("js-get", jsGet);
  env.define("js-call", jsCall);

  // Register gensym for macro hygiene.
  env.define("gensym", gensym);

  // Helper "list" primitive for constructing list nodes.
  env.define("list", (...args: any[]) => {
    return { type: "list", elements: args };
  });
  
  // Minimal list operations for macros
  env.define("first", (list: any) => {
    if (list.type === "list" && list.elements.length > 0) {
      return list.elements[0];
    }
    throw new Error("first requires a non-empty list");
  });
  
  env.define("second", (list: any) => {
    if (list.type === "list" && list.elements.length > 1) {
      return list.elements[1];
    }
    throw new Error("second requires a list with at least 2 elements");
  });
  
  env.define("rest", (list: any) => {
    if (list.type === "list") {
      return { type: "list", elements: list.elements.slice(1) };
    }
    throw new Error("rest requires a list");
  });
  
  env.define("cons", (item: any, list: any) => {
    if (list.type === "list") {
      return { type: "list", elements: [item, ...list.elements] };
    }
    throw new Error("cons requires a list as second argument");
  });
  
  env.define("length", (list: any) => {
    if (list.type === "list") {
      return list.elements.length;
    }
    throw new Error("length requires a list");
  });
}

export async function initializeGlobalEnv(): Promise<Env> {
  if (globalEnv) return globalEnv;
  globalEnv = new Env();
  setupPrimitives(globalEnv);
  return globalEnv;
}

/**
 * evaluateForMacro: A minimal evaluator for bootstrapping macro expansion.
 * It handles literals, symbols, and lists with special forms:
 *  - quote: returns its argument without evaluation (KERNEL PRIMITIVE).
 *  - if: performs conditional evaluation (KERNEL PRIMITIVE)
 *  - defmacro: registers a macro in the environment (DERIVED FORM).
 *  - Otherwise, treats the list as a function application.
 */
export function evaluateForMacro(expr: HQLNode, env: Env): any {
  if (!expr || typeof expr !== 'object' || !('type' in expr)) {
    throw new Error(`Invalid expression: ${JSON.stringify(expr)}`);
  }
  
  switch (expr.type) {
    case "literal":
      return (expr as LiteralNode).value;
    case "symbol":
      return env.lookup((expr as SymbolNode).name);
    case "list": {
      const list = expr as ListNode;
      if (list.elements.length === 0) return [];
      const first = list.elements[0];
      if (first.type === "symbol") {
        const op = (first as SymbolNode).name;
        
        // Handle kernel primitives
        if (op === "quote") {
          if (list.elements.length !== 2) {
            throw new Error("quote requires exactly one argument");
          }
          return list.elements[1];
        }
        
        // Handle if special form for macro expansion
        if (op === "if") {
          if (list.elements.length < 3 || list.elements.length > 4) {
            throw new Error("if requires 2 or 3 arguments");
          }
          const test = evaluateForMacro(list.elements[1], env);
          if (test) {
            return evaluateForMacro(list.elements[2], env);
          } else if (list.elements.length > 3) {
            return evaluateForMacro(list.elements[3], env);
          } else {
            return null;
          }
        }
        
        if (op === "defmacro") {
          if (list.elements.length < 4) {
            throw new Error("defmacro requires a name, parameters, and body");
          }
          const nameNode = list.elements[1];
          if (nameNode.type !== "symbol") {
            throw new Error("defmacro requires a symbol for the name");
          }
          const macroName = (nameNode as SymbolNode).name;
          const paramsNode = list.elements[2];
          if (paramsNode.type !== "list") {
            throw new Error("defmacro parameters must be a list");
          }
          const paramNames = (paramsNode as ListNode).elements.map(n => {
            if (n.type !== "symbol") {
              throw new Error("Macro parameters must be symbols");
            }
            return (n as SymbolNode).name;
          });
          const body = list.elements.slice(3);
          const macroFn: MacroFunction = (args: HQLNode[], callEnv: Env): HQLNode => {
            const macroEnv = callEnv.extend(paramNames, args);
            let result: HQLNode = makeLiteral(null);
            for (const e of body) {
              result = evaluateForMacro(e, macroEnv);
            }
            return result;
          };
          env.defineMacro(macroName, macroFn);
          return makeLiteral(null);
        }
        
        // Fallback: treat as function application.
        const func = evaluateForMacro(first, env);
        const args = list.elements.slice(1).map(e => evaluateForMacro(e, env));
        if (typeof func !== "function") {
          throw new Error(`${op} is not a function`);
        }
        return func(...args);
      }
      throw new Error("List does not start with a symbol");
    }
    default:
      throw new Error(`Unknown node type: ${(expr as any).type || JSON.stringify(expr)}`);
  }
}