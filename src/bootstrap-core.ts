// src/bootstrap-core.ts - Minimal bootstrap core for HQL
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./transpiler/hql_ast.ts";
import { dirname, join, readTextFile } from "./platform/platform.ts";

// Core forms that can't be implemented as macros
export const CORE_FORMS = new Set(["quote", "if", "fn", "def"]);

// Primitive operations available in the core
export const PRIMITIVE_OPS = new Set([
  // Arithmetic
  "+", "-", "*", "/", "%",
  
  // Comparison
  "=", "!=", "<", ">", "<=", ">=", "eq?",
  
  // List operations
  "cons", "first", "rest", "list", "empty?", "count",
  
  // JS interop primitives
  "js-get", "js-call", "js-import", "js-export", "js-new"
]);

// Environment for evaluation during macro expansion
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

// Type definition for macro functions
export type MacroFunction = (args: HQLNode[], env: Env) => HQLNode;

// The global environment
export let globalEnv: Env | null = null;

// Utility functions to create HQL nodes
export function makeSymbol(name: string): SymbolNode {
  return { type: "symbol", name };
}

export function makeLiteral(value: any): LiteralNode {
  return { type: "literal", value };
}

export function makeList(...elements: HQLNode[]): ListNode {
  return { type: "list", elements };
}

// Helper to create AST nodes for quoting
export function createQuote(expr: HQLNode): ListNode {
  return makeList(makeSymbol("quote"), expr);
}

// Bootstrap primitive operators
function setupPrimitives(env: Env): void {
  // Arithmetic
  env.define("+", (...args: number[]) => args.reduce((a, b) => a + b, 0));
  env.define("-", (a: number, ...args: number[]) => 
    args.length === 0 ? -a : args.reduce((acc, val) => acc - val, a));
  env.define("*", (...args: number[]) => args.reduce((a, b) => a * b, 1));
  env.define("/", (a: number, ...args: number[]) => 
    args.length === 0 ? 1/a : args.reduce((acc, val) => acc / val, a));
  env.define("%", (a: number, b: number) => a % b);
  
  // Comparison
  env.define("=", (a: any, b: any) => a === b);
  env.define("!=", (a: any, b: any) => a !== b);
  env.define("<", (a: any, b: any) => a < b);
  env.define(">", (a: any, b: any) => a > b);
  env.define("<=", (a: any, b: any) => a <= b);
  env.define(">=", (a: any, b: any) => a >= b);
  env.define("eq?", (a: any, b: any) => a === b);
  
  // List operations
  env.define("cons", (item: any, list: any[]) => [item, ...list]);
  env.define("first", (list: any[]) => list[0]);
  env.define("rest", (list: any[]) => list.slice(1));
  env.define("list", (...args: any[]) => args);
  env.define("empty?", (list: any[]) => list.length === 0);
  env.define("count", (list: any[]) => list.length);
  
  // JS interop primitives
  env.define("js-get", (obj: any, prop: string) => obj[prop]);
  env.define("js-call", (obj: any, method: string, ...args: any[]) => obj[method](...args));
  env.define("js-import", (source: string) => `IMPORT:${source}`); // Placeholder for macro expansion
  env.define("js-export", (name: string, value: any) => `EXPORT:${name}`); // Placeholder
  env.define("js-new", (constructor: any, ...args: any[]) => `NEW:${constructor.name}`); // Placeholder
  
  // Add print for debugging
  env.define("print", console.log);
}

// Basic HQL evaluator for bootstrapping and macro expansion
export function evaluateForMacro(expr: HQLNode, env: Env): any {
  switch (expr.type) {
    case "literal":
      return (expr as LiteralNode).value;
      
    case "symbol": {
      const name = (expr as SymbolNode).name;
      
      // Handle special syntactic forms for symbols
      if (name.startsWith("'")) {
        // Quote shorthand: 'x is equivalent to (quote x)
        return name.substring(1);
      }
      
      return env.lookup(name);
    }
    
    case "list": {
      const list = expr as ListNode;
      if (list.elements.length === 0) {
        return [];  // Empty list evaluates to empty array
      }
      
      const first = list.elements[0];
      if (first.type !== "symbol") {
        // Function application with non-symbol in first position
        const fn = evaluateForMacro(first, env);
        const args = list.elements.slice(1).map(e => evaluateForMacro(e, env));
        return fn(...args);
      }
      
      const op = (first as SymbolNode).name;
      
      // Handle core forms
      if (op === "quote") {
        if (list.elements.length !== 2) {
          throw new Error("quote requires exactly one argument");
        }
        return list.elements[1]; // Return the unevaluated argument
      }
      
      if (op === "if") {
        if (list.elements.length < 3 || list.elements.length > 4) {
          throw new Error("if requires 2 or 3 arguments");
        }
        
        const condition = evaluateForMacro(list.elements[1], env);
        if (condition) {
          return evaluateForMacro(list.elements[2], env);
        } else if (list.elements.length > 3) {
          return evaluateForMacro(list.elements[3], env);
        }
        return null;
      }
      
      if (op === "fn") {
        if (list.elements.length < 3) {
          throw new Error("fn requires parameters and body");
        }
        
        const paramsNode = list.elements[1];
        if (paramsNode.type !== "list") {
          throw new Error("fn parameters must be a list");
        }
        
        const params = (paramsNode as ListNode).elements.map(p => {
          if (p.type !== "symbol") {
            throw new Error("fn parameters must be symbols");
          }
          return (p as SymbolNode).name;
        });
        
        const body = list.elements.slice(2);
        
        // Return a JavaScript function for the macro system
        return (...args: any[]) => {
          const localEnv = env.extend(params, args);
          let result = null;
          for (const expr of body) {
            result = evaluateForMacro(expr, localEnv);
          }
          return result;
        };
      }
      
      if (op === "def") {
        if (list.elements.length !== 3) {
          throw new Error("def requires exactly 2 arguments");
        }
        
        const nameNode = list.elements[1];
        if (nameNode.type !== "symbol") {
          throw new Error("def requires a symbol for the name");
        }
        
        const name = (nameNode as SymbolNode).name;
        const value = evaluateForMacro(list.elements[2], env);
        env.define(name, value);
        return value;
      }
      
      if (op === "defmacro") {
        if (list.elements.length < 4) {
          throw new Error("defmacro requires a name, parameters, and body");
        }
        
        const nameNode = list.elements[1];
        if (nameNode.type !== "symbol") {
          throw new Error("defmacro requires a symbol for the name");
        }
        
        const paramsNode = list.elements[2];
        if (paramsNode.type !== "list") {
          throw new Error("defmacro parameters must be a list");
        }
        
        const name = (nameNode as SymbolNode).name;
        const params = (paramsNode as ListNode).elements;
        const body = list.elements.slice(3);
        
        // Create the macro function
        const macroFn: MacroFunction = (args: HQLNode[], callEnv: Env) => {
          const macroEnv = new Env(env);
          
          // Process parameters (including rest parameter with &)
          let restParam: string | null = null;
          let paramIndex = 0;
          
          for (let i = 0; i < params.length; i++) {
            if (params[i].type !== "symbol") {
              throw new Error("Macro parameters must be symbols");
            }
            
            const paramName = (params[i] as SymbolNode).name;
            
            if (paramName === "&") {
              if (i + 1 >= params.length) {
                throw new Error("& must be followed by a rest parameter name");
              }
              
              const restParamNode = params[i + 1];
              if (restParamNode.type !== "symbol") {
                throw new Error("Rest parameter must be a symbol");
              }
              
              restParam = (restParamNode as SymbolNode).name;
              const restArgs = args.slice(paramIndex);
              macroEnv.define(restParam, makeList(...restArgs));
              break;
            } else {
              // Regular parameter
              const arg = paramIndex < args.length ? args[paramIndex] : makeLiteral(null);
              macroEnv.define(paramName, arg);
              paramIndex++;
            }
          }
          
          // Evaluate the macro body
          let result: HQLNode = makeLiteral(null);
          for (const expr of body) {
            result = evaluateForMacro(expr, macroEnv);
          }
          
          return result;
        };
        
        // Register the macro
        env.defineMacro(name, macroFn);
        
        // Return a placeholder node (will be ignored in expansion)
        return makeList(
          makeSymbol("comment"),
          makeLiteral(`Defined macro: ${name}`)
        );
      }
      
      // Check if it's a macro call
      if (env.hasMacro(op)) {
        const macroFn = env.getMacro(op)!;
        const args = list.elements.slice(1);
        return macroFn(args, env);
      }
      
      // Regular function call
      const fn = evaluateForMacro(first, env);
      if (typeof fn !== "function") {
        throw new Error(`${op} is not a function`);
      }
      
      const args = list.elements.slice(1).map(e => evaluateForMacro(e, env));
      return fn(...args);
    }
    
    default:
      throw new Error(`Unknown node type: ${expr.type}`);
  }
}

// Initialize the global environment
export async function initializeGlobalEnv(): Promise<Env> {
  if (globalEnv) return globalEnv;
  
  globalEnv = new Env();
  setupPrimitives(globalEnv);
  
  return globalEnv;
}

// Export a function to check if a node is a core form
export function isCoreForm(node: HQLNode): boolean {
  if (node.type !== "list") return false;
  
  const list = node as ListNode;
  if (list.elements.length === 0) return false;
  
  const first = list.elements[0];
  if (first.type !== "symbol") return false;
  
  return CORE_FORMS.has((first as SymbolNode).name);
}

// Export a function to check if a node is a primitive operation
export function isPrimitiveOp(node: HQLNode): boolean {
  if (node.type !== "list") return false;
  
  const list = node as ListNode;
  if (list.elements.length === 0) return false;
  
  const first = list.elements[0];
  if (first.type !== "symbol") return false;
  
  return PRIMITIVE_OPS.has((first as SymbolNode).name);
}