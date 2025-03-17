import { dirname } from "https://deno.land/std@0.170.0/path/mod.ts";
import { HQLNode, ListNode, SymbolNode, LiteralNode } from "./transpiler/hql_ast.ts";
import { jsImport, jsExport, jsGet, jsCall } from "./interop.ts";
import { gensym } from "./gensym.ts";
import { parse } from "./transpiler/parser.ts";
import { Logger } from "./logger.ts";
import { Env } from "./environment.ts";
import { evaluateSExp } from "./s-expression-evaluator.ts";
import { readTextFile } from "./platform/platform.ts";

// Type definition for macro functions
export type MacroFunction = (args: HQLNode[], env: Env) => HQLNode;

// Constructor functions for creating HQL Nodes
export function makeSymbol(name: string): SymbolNode {
  return { type: "symbol", name };
}

export function makeLiteral(value: any): LiteralNode {
  return { type: "literal", value };
}

export function makeList(...elements: HQLNode[]): ListNode {
  return { type: "list", elements };
}

// Constants for special forms
export const KERNEL_PRIMITIVES = new Set([
  "quote", "if", "fn", "def", "quasiquote", "unquote", "unquote-splicing"
]);

export const DERIVED_FORMS = new Set(["defmacro"]);
export const CORE_FORMS = new Set([...KERNEL_PRIMITIVES, ...DERIVED_FORMS]);
export const LIST_PRIMITIVES = new Set(["first", "rest", "cons", "=", "length"]);
export const PRIMITIVE_OPS = new Set([
  "+", "-", "*", "/", "%",
  "=", "!=", "<", ">", "<=", ">=", "eq?",
  "js-import", "js-export", "js-get", "js-call",
  "first", "rest", "cons", "second", "length",
  "next", "seq", "empty?",
  "conj", "concat",
  "symbol?", "list?", "map?", "nil?"
]);
export const PRIMITIVE_CLASS = new Set(["new"]);
export const PRIMITIVE_DATA_STRUCTURE = new Set([
  "empty-array", "empty-map", "empty-set", "vector", "hash-map", "hash-set"
]);

// Initialize the global environment with primitives and core macros
export async function initializeGlobalEnv(options: { verbose?: boolean } = {}): Promise<Env> {
  const logger = new Logger(options.verbose);
  const env = new Env(null, logger);
  
  // Setup primitives
  setupPrimitives(env);
  logger.debug("Primitives set up successfully");
  
  // Log available symbols for debugging
  if (options.verbose) {
    logger.debug(`Available symbols: ${Array.from(env.bindings.keys()).join(', ')}`);
  }
  
  // Load core macros
  try {
    await loadCoreMacros(env, logger);
    logger.debug("Core macros loaded successfully");
  } catch (error) {
    logger.error(`Error loading core macros: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return env;
}

// Setup primitive operations
function setupPrimitives(env: Env): void {
  // Arithmetic operations
  env.define("+", (...args: number[]) => args.reduce((a, b) => a + b, 0));
  env.define("-", (a: number, b: number) => a - b);
  env.define("*", (...args: number[]) => args.reduce((a, b) => a * b, 1));
  env.define("/", (a: number, b: number) => a / b);
  env.define("%", (a: number, b: number) => a % b);
  
  // Comparison operations
  env.define("=", (a: any, b: any) => a === b);
  env.define("!=", (a: any, b: any) => a !== b);
  env.define("<", (a: number, b: number) => a < b);
  env.define(">", (a: number, b: number) => a > b);
  env.define("<=", (a: number, b: number) => a <= b);
  env.define(">=", (a: number, b: number) => a >= b);
  env.define("eq?", (a: any, b: any) => a === b);

  // JS interop functions
  env.define("js-import", jsImport);
  env.define("js-export", jsExport);
  env.define("js-get", jsGet);
  env.define("js-call", jsCall);

  // Utility functions
  env.define("gensym", gensym);
  
  // CRITICAL: list function - fixed to be available in all contexts
  env.define("list", function(...args: any[]) {
    // Special handling for module.method notation
    if (args.length > 0 && 
        typeof args[0] === 'string' && 
        args[0].includes('.') && 
        !args[0].startsWith('.')) {
      // Convert 'module.method' to a js-call form
      const [moduleName, methodName] = args[0].split('.');
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "js-call" },
          { type: "symbol", name: moduleName },
          { type: "literal", value: methodName },
          ...args.slice(1)
        ]
      };
    }
    return { type: "list", elements: args };
  });

  // List operations
  setupListOperations(env);
  
  // Predicate functions
  setupPredicateFunctions(env);
}

// Setup list operations
function setupListOperations(env: Env): void {
  env.define("map", (fn: any, coll: any) => {
    if (coll.type !== "list") {
      throw new Error("map requires a list as second argument");
    }
    
    const result: HQLNode[] = [];
    for (const item of coll.elements) {
      if (typeof fn === 'function') {
        result.push(fn(item));
      } else {
        throw new Error("map requires a function as first argument");
      }
    }
    
    return { type: "list", elements: result };
  });
  
  // Add butlast function (needed for do macro)
  env.define("butlast", (coll: any) => {
    if (coll.type !== "list") {
      throw new Error("butlast requires a list");
    }
    
    if (coll.elements.length <= 1) {
      return { type: "list", elements: [] };
    }
    
    return { type: "list", elements: coll.elements.slice(0, -1) };
  });
  
  // Add last function (needed for do macro)
  env.define("last", (coll: any) => {
    if (coll.type !== "list") {
      throw new Error("last requires a list");
    }
    
    if (coll.elements.length === 0) {
      return { type: "literal", value: null };
    }
    
    return coll.elements[coll.elements.length - 1];
  });
  
  env.define("first", (list: any) => {
    if (list.type === "list" && list.elements.length > 0) return list.elements[0];
    throw new Error("first requires a non-empty list");
  });
  
  env.define("second", (list: any) => {
    if (list.type === "list" && list.elements.length > 1) return list.elements[1];
    throw new Error("second requires a list with at least 2 elements");
  });
  
  env.define("rest", (list: any) => {
    if (list.type === "list") return { type: "list", elements: list.elements.slice(1) };
    throw new Error("rest requires a list");
  });
  
  env.define("cons", (item: any, list: any) => {
    if (list.type === "list") return { type: "list", elements: [item, ...list.elements] };
    throw new Error("cons requires a list as second argument");
  });
  
  env.define("length", (list: any) => {
    if (list.type === "list") return list.elements.length;
    throw new Error("length requires a list");
  });
  
  env.define("next", (list: any) => {
    if (list.type === "list" && list.elements.length > 1) {
      return { type: "list", elements: list.elements.slice(1) };
    }
    return { type: "literal", value: null };
  });
  
  env.define("seq", (coll: any) => {
    if (coll.type === "list") {
      return coll.elements.length > 0 ? coll : { type: "literal", value: null };
    }
    return { type: "literal", value: null };
  });
  
  env.define("conj", (coll: any, ...items: any[]) => {
    if (coll.type === "list") {
      return { type: "list", elements: [...coll.elements, ...items] };
    }
    throw new Error("conj requires a collection as first argument");
  });
  
  env.define("concat", (...lists: any[]) => {
    const allElements: any[] = [];
    for (const list of lists) {
      if (list.type === "list") {
        allElements.push(...list.elements);
      } else {
        throw new Error("concat requires list arguments");
      }
    }
    return { type: "list", elements: allElements };
  });
}

// Setup predicate functions
function setupPredicateFunctions(env: Env): void {
  env.define("symbol?", (value: any) => 
    ({ type: "literal", value: value && value.type === "symbol" }));
  
  env.define("list?", (value: any) => 
    ({ type: "literal", value: value && value.type === "list" }));
  
  env.define("map?", (value: any) => ({ 
    type: "literal", 
    value: value && value.type === "list" &&
           value.elements.length > 0 &&
           value.elements[0].type === "symbol" &&
           value.elements[0].name === "hash-map" 
  }));
  
  env.define("nil?", (value: any) => 
    ({ type: "literal", value: value && value.type === "literal" && value.value === null }));
  
  env.define("empty?", (coll: any) => {
    if (coll && coll.type === "list") {
      return { type: "literal", value: coll.elements.length === 0 };
    }
    if (coll && coll.type === "literal" && coll.value === null) {
      return { type: "literal", value: true };
    }
    return { type: "literal", value: false };
  });
}

// Load core macros from lib/core.hql
async function loadCoreMacros(env: Env, logger: Logger): Promise<void> {
  try {
    // Read core.hql content
    const coreSource = await readTextFile("./lib/core.hql");
    
    // Parse the core.hql file to get AST nodes
    const astNodes = parse(coreSource);
    const coreDir = dirname("./lib/core.hql");

    // Process each node in core.hql
    for (const node of astNodes) {
      try {
        evaluateSExp(node, env, logger);
      } catch (error) {
        logger.error(`Error evaluating core macro: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    logger.error(`Error loading core macros: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Function to create a macro function (used in defmacro)
export function createMacroFunction(
  paramNames: string[], 
  hasRestParam: boolean, 
  restParamName: string, 
  body: HQLNode[]
): MacroFunction {
  return (args: HQLNode[], callEnv: Env): HQLNode => {
    // Create a new environment for macro expansion
    const macroEnv = new Env(callEnv, callEnv?.logger);
    
    // CRITICAL FIX: Ensure list function is available in the macro environment
    macroEnv.define("list", function(...listArgs: any[]) {
      // Special handling for module.method notation in the first argument
      if (listArgs.length > 0 && 
          typeof listArgs[0] === 'string' && 
          listArgs[0].includes('.') && 
          !listArgs[0].startsWith('.')) {
        // Convert 'module.method' to a js-call form
        const [moduleName, methodName] = listArgs[0].split('.');
        return {
          type: "list",
          elements: [
            { type: "symbol", name: "js-call" },
            { type: "symbol", name: moduleName },
            { type: "literal", value: methodName },
            ...listArgs.slice(1)
          ]
        };
      }
      return { type: "list", elements: listArgs };
    });
    
    // Bind positional parameters
    for (let i = 0; i < paramNames.length; i++) {
      macroEnv.define(paramNames[i], i < args.length ? args[i] : makeLiteral(null));
    }
    
    // Bind rest parameter if present
    if (hasRestParam) {
      const restArgs = args.slice(paramNames.length);
      macroEnv.define(restParamName, { type: "list", elements: restArgs });
    }
    
    // Evaluate body expressions
    let result: HQLNode = makeLiteral(null);
    for (const e of body) {
      result = evaluateSExp(e, macroEnv, callEnv?.logger);
    }
    
    return result;
  };
}

// Evaluate for macro expansion
export function evaluateForMacro(expr: HQLNode, env: Env): any {
  return evaluateSExp(expr, env);
}