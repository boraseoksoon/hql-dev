// src/bootstrap.ts - Refactored for improved modularity and controlled logging
import { dirname } from "https://deno.land/std@0.170.0/path/mod.ts";
import { HQLNode, LiteralNode, SymbolNode, ListNode, isMacroImport } from "./transpiler/hql_ast.ts";
import { jsImport, jsExport, jsGet, jsCall } from "./interop.ts";
import { gensym } from "./gensym.ts";
import { parse } from "./transpiler/parser.ts";
import { processImportNode } from "./macro-expander.ts";
import { Logger } from "./logger.ts";
import { Env } from "./environment.ts"

/* -------------------- Constants -------------------- */

/**
 * Primitive language forms that are built into the kernel
 */
export const KERNEL_PRIMITIVES = new Set([
  "quote", "if", "fn", "def", "quasiquote", "unquote", "unquote-splicing"
]);

/**
 * Forms derived from kernel primitives (implemented as macros)
 */
export const DERIVED_FORMS = new Set(["defmacro"]);

/**
 * Combined set of all core language forms
 */
export const CORE_FORMS = new Set([...KERNEL_PRIMITIVES, ...DERIVED_FORMS]);

/**
 * Primitive list operations
 */
export const LIST_PRIMITIVES = new Set(["first", "rest", "cons", "=", "length"]);

/**
 * Primitive operations available in the language
 */
export const PRIMITIVE_OPS = new Set([
  "+", "-", "*", "/", "%",
  "=", "!=", "<", ">", "<=", ">=", "eq?",
  "js-import", "js-export", "js-get", "js-call",
  "first", "rest", "cons", "second", "length",
  "next", "seq", "empty?",
  "conj", "concat",
  "symbol?", "list?", "map?", "nil?"
]);

/**
 * Primitive class operations
 */
export const PRIMITIVE_CLASS = new Set(["new"]);

/**
 * Primitive data structure operations
 */
export const PRIMITIVE_DATA_STRUCTURE = new Set([
  "empty-array", "empty-map", "empty-set", "vector", "hash-map", "hash-set"
]);

/**
 * Type definition for macro functions
 */
export type MacroFunction = (args: HQLNode[], env: Env) => HQLNode;

/**
 * Create a symbol node with the given name
 */
export function makeSymbol(name: string): SymbolNode {
  return { type: "symbol", name };
}

/**
 * Create a literal node with the given value
 */
export function makeLiteral(value: any): LiteralNode {
  return { type: "literal", value };
}

/**
 * Create a list node with the given elements
 */
export function makeList(...elements: HQLNode[]): ListNode {
  return { type: "list", elements };
}

/* -------------------- Primitives Setup -------------------- */

/**
 * Set up primitive operations in the environment
 * @param env Environment to set up primitives in
 */
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
  
  // CRITICAL FIX: Ensure list function is defined
  env.define("list", (...args: any[]) => ({ type: "list", elements: args }));

  // List operations
  setupListOperations(env);
  
  // Predicate functions
  setupPredicateFunctions(env);
}

/**
 * Set up list manipulation operations in the environment
 * @param env Environment to set up list operations in
 */
function setupListOperations(env: Env): void {
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
    if (list.type === "list" && list.elements.length > 1) return { type: "list", elements: list.elements.slice(1) };
    return { type: "literal", value: null };
  });
  
  env.define("seq", (coll: any) => {
    if (coll.type === "list") return coll.elements.length > 0 ? coll : { type: "literal", value: null };
    return { type: "literal", value: null };
  });
  
  env.define("conj", (coll: any, ...items: any[]) => {
    if (coll.type === "list") return { type: "list", elements: [...coll.elements, ...items] };
    throw new Error("conj requires a collection as first argument");
  });
  
  env.define("concat", (...lists: any[]) => {
    const allElements = [];
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

/**
 * Set up predicate functions in the environment
 * @param env Environment to set up predicate functions in
 */
function setupPredicateFunctions(env: Env): void {
  env.define("symbol?", (value: any) => ({ type: "literal", value: value.type === "symbol" }));
  env.define("list?", (value: any) => ({ type: "literal", value: value.type === "list" }));
  env.define("map?", (value: any) => ({ 
    type: "literal", 
    value: value.type === "list" &&
           value.elements.length > 0 &&
           value.elements[0].type === "symbol" &&
           value.elements[0].name === "hash-map" 
  }));
  env.define("nil?", (value: any) => ({ type: "literal", value: value.type === "literal" && value.value === null }));
  
  env.define("empty?", (coll: any) => {
    if (coll.type === "list") return { type: "literal", value: coll.elements.length === 0 };
    if (coll.type === "literal" && coll.value === null) return { type: "literal", value: true };
    return { type: "literal", value: false };
  });
}

/* -------------------- Core Macro Loading -------------------- */

/**
 * Load core macros from lib/core.hql
 * @param env Environment to load macros into
 * @param logger Logger instance
 */
async function loadCoreMacros(env: Env, logger: Logger): Promise<void> {
  logger.debug("Loading core macros");
  const coreSource = await Deno.readTextFile("./lib/core.hql");
  const astNodes: HQLNode[] = parse(coreSource);
  const coreDir = dirname("./lib/core.hql");

  // First pass: Process all imports
  for (const node of astNodes) {
    try {
      if (isMacroImport(node)) {
        logger.debug("Processing import in core.hql");
        await processImportNode(node as ListNode, env, coreDir);
      }
    } catch (error) {
      // Log but continue processing
      logger.error(`Error processing import: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Second pass: Process all macro definitions
  for (const node of astNodes) {
    try {
      if (isMacroDefinition(node)) {
        logger.debug("Registering macro definition");
        evaluateForMacro(node, env);
      } else if (!isMacroImport(node)) {
        // For any other definitions that are not imports or macro definitions
        // We wrap this in a try/catch and continue on error
        try {
          evaluateForMacro(node, env);
        } catch (error) {
          // Just log the error and continue
          logger.error(`Error evaluating expression: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      // Log but continue processing other nodes
      logger.error(`Error processing core.hql node: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  logger.debug("Core macros loaded successfully");
}

/**
 * Check if a node is a macro definition
 * @param node Node to check
 * @returns True if node is a macro definition
 */
function isMacroDefinition(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    (node as ListNode).elements.length > 0 &&
    (node as ListNode).elements[0].type === "symbol" &&
    ((node as ListNode).elements[0] as SymbolNode).name === "defmacro"
  );
}

/* -------------------- Global Environment Initialization -------------------- */

/**
 * Initialize the global environment with primitives and core macros
 * @param options Options for initialization
 * @returns Initialized environment
 */
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
  
  try {
    await loadCoreMacros(env, logger);
    logger.debug("Core macros loaded successfully");
  } catch (error) {
    logger.error(`Error loading core macros: ${error instanceof Error ? error.message : String(error)}`);
    
    // The error is not fatal - we'll continue with what we have
    logger.debug("Continuing despite core macro loading error");
  }
  
  return env;
}

/* -------------------- Quasiquote Evaluation -------------------- */

/**
 * Evaluate a quasiquoted expression
 * @param expr Expression to evaluate
 * @param env Environment for evaluation
 * @returns Evaluated expression
 */
function evaluateQuasiquote(expr: HQLNode, env: Env): HQLNode {
  // Handle unquote
  if (expr.type === "list") {
    const listExpr = expr as ListNode;
    if (listExpr.elements.length > 0 && listExpr.elements[0].type === "symbol") {
      const firstSym = listExpr.elements[0] as SymbolNode;
      if (firstSym.name === "unquote") {
        if (listExpr.elements.length !== 2) throw new Error("unquote requires exactly one argument");
        return evaluateForMacro(listExpr.elements[1], env);
      }
    }
  }
  
  // Handle unquote-splicing and recursively process lists
  if (expr.type === "list") {
    const list = expr as ListNode;
    const result: HQLNode[] = [];
    for (const elem of list.elements) {
      if (elem.type === "list" && (elem as ListNode).elements.length > 0) {
        const inner = elem as ListNode;
        const firstElem = inner.elements[0];
        if (firstElem.type === "symbol" && (firstElem as SymbolNode).name === "unquote-splicing") {
          if (inner.elements.length !== 2) throw new Error("unquote-splicing requires exactly one argument");
          const spliced = evaluateForMacro(inner.elements[1], env);
          if (spliced && spliced.type === "list") {
            result.push(...(spliced as ListNode).elements);
            continue;
          } else {
            throw new Error("unquote-splicing requires a list result");
          }
        }
      }
      result.push(evaluateQuasiquote(elem, env));
    }
    return { type: "list", elements: result };
  }
  
  // Return other node types as-is
  return expr;
}

/* -------------------- Macro Evaluator -------------------- */

/**
 * Evaluate an expression for macro expansion
 * @param expr Expression to evaluate
 * @param env Environment for evaluation
 * @returns Evaluated expression
 */
export function evaluateForMacro(expr: HQLNode, env: Env): any {
  if (!expr || typeof expr !== "object" || !("type" in expr)) {
    throw new Error(`Invalid expression: ${JSON.stringify(expr)}`);
  }
  
  switch (expr.type) {
    case "literal":
      return (expr as LiteralNode).value;
      
    case "symbol": {
      const name = (expr as SymbolNode).name;
      // Special case for native functions like 'list'
      if (name === "list") {
        return (...args: any[]) => ({ type: "list", elements: args });
      }
      
      if (env.hasMacro(name)) return env.getMacro(name);
      return env.lookup(name);
    }
    
    case "list": {
      const list = expr as ListNode;
      if (list.elements.length === 0) return [];
      
      const first = list.elements[0];
      if (first.type === "symbol") {
        const op = (first as SymbolNode).name;
        
        // Handle special forms
        if (op === "js-import") {
          return handleJsImport(list, env);
        }
        if (op === "quote") {
          if (list.elements.length !== 2) throw new Error("quote requires exactly one argument");
          return list.elements[1];
        }
        if (op === "quasiquote") {
          if (list.elements.length !== 2) throw new Error("quasiquote requires exactly one argument");
          return evaluateQuasiquote(list.elements[1], env);
        }
        if (op === "if") {
          return handleIf(list, env);
        }
        if (op === "def") {
          return handleDef(list, env);
        }
        if (op === "defmacro") {
          return handleDefmacro(list, env);
        }
        
        // Handle list function specially
        if (op === "list") {
          const args = list.elements.slice(1).map(arg => evaluateForMacro(arg, env));
          return { type: "list", elements: args };
        }
        
        // Fallback: function application
        return handleFunctionCall(list, env);
      }
      throw new Error("List does not start with a symbol");
    }
    
    default:
      throw new Error(`Unknown node type: ${(expr as any).type || JSON.stringify(expr)}`);
  }
}

/**
 * Handle js-import special form
 * @param list List node containing js-import form
 * @param env Environment for evaluation
 * @returns Import reference object
 */
function handleJsImport(list: ListNode, env: Env): any {
  const quoted = list.elements[1];
  if (quoted.type !== "list") throw new Error("js-import: expected quoted name");
  const qlist = quoted as ListNode;
  if (qlist.elements.length !== 2 ||
      qlist.elements[0].type !== "symbol" ||
      (qlist.elements[0] as SymbolNode).name !== "quote" ||
      qlist.elements[1].type !== "symbol") {
    throw new Error("js-import: expected (quote name)");
  }
  const origName = (qlist.elements[1] as SymbolNode).name;
  // Append "Module" to the imported name as per test expectations.
  const moduleVar = origName + "Module";
  const pathExpr = list.elements[2];
  if (pathExpr.type !== "literal") throw new Error("js-import: module path must be a literal");
  const modulePath = (pathExpr as LiteralNode).value;
  return { type: "JsImportReference", name: moduleVar, source: modulePath };
}

/**
 * Handle if special form
 * @param list List node containing if form
 * @param env Environment for evaluation
 * @returns Result of if expression
 */
function handleIf(list: ListNode, env: Env): any {
  if (list.elements.length < 3 || list.elements.length > 4) throw new Error("if requires 2 or 3 arguments");
  const test = evaluateForMacro(list.elements[1], env);
  if (test) return evaluateForMacro(list.elements[2], env);
  else if (list.elements.length > 3) return evaluateForMacro(list.elements[3], env);
  else return null;
}

/**
 * Handle def special form
 * @param list List node containing def form
 * @param env Environment for evaluation
 * @returns Defined value
 */
function handleDef(list: ListNode, env: Env): any {
  if (list.elements.length !== 3) throw new Error("def requires exactly two arguments");
  const nameExpr = list.elements[1];
  if (nameExpr.type !== "symbol") throw new Error("def requires a symbol as its first argument");
  const varName = (nameExpr as SymbolNode).name;
  const value = evaluateForMacro(list.elements[2], env);
  env.define(varName, value);
  return value;
}

/**
 * Handle defmacro special form
 * @param list List node containing defmacro form
 * @param env Environment for evaluation
 * @returns Null value
 */
function handleDefmacro(list: ListNode, env: Env): any {
  if (list.elements.length < 4) throw new Error("defmacro requires a name, parameters, and body");
  
  const nameExpr = list.elements[1];
  if (nameExpr.type !== "symbol") throw new Error("defmacro requires a symbol for the name");
  const macroName = (nameExpr as SymbolNode).name;
  
  const paramsNode = list.elements[2];
  if (paramsNode.type !== "list") throw new Error("defmacro parameters must be a list");
  
  const { paramNames, hasRestParam, restParamName } = processDefmacroParams(paramsNode as ListNode);
  const body = list.elements.slice(3);
  
  // Create the macro function
  const macroFn = createMacroFunction(paramNames, hasRestParam, restParamName, body);
  env.defineMacro(macroName, macroFn);
  
  return makeLiteral(null);
}

/**
 * Process parameter list for defmacro
 * @param paramsNode List node containing parameters
 * @returns Processed parameter information
 */
function processDefmacroParams(paramsNode: ListNode): { 
  paramNames: string[], 
  hasRestParam: boolean, 
  restParamName: string 
} {
  const paramElements = paramsNode.elements;
  const paramNames: string[] = [];
  let hasRestParam = false;
  let restParamName = "";
  
  for (let i = 0; i < paramElements.length; i++) {
    const param = paramElements[i];
    if (param.type !== "symbol") throw new Error("Macro parameters must be symbols");
    
    if ((param as SymbolNode).name === "&") {
      if (i + 1 < paramElements.length && paramElements[i + 1].type === "symbol") {
        hasRestParam = true;
        restParamName = (paramElements[i + 1] as SymbolNode).name;
        i++;
      } else {
        throw new Error("& must be followed by a symbol in parameter list");
      }
    } else {
      paramNames.push((param as SymbolNode).name);
    }
  }
  
  return { paramNames, hasRestParam, restParamName };
}

/**
 * Create a macro function
 * @param paramNames Parameter names
 * @param hasRestParam Whether the macro has a rest parameter
 * @param restParamName Name of the rest parameter
 * @param body Body expressions
 * @returns Macro function
 */
function createMacroFunction(
  paramNames: string[], 
  hasRestParam: boolean, 
  restParamName: string, 
  body: HQLNode[]
): MacroFunction {
  return (args: HQLNode[], callEnv: Env): HQLNode => {
    // Create a new environment for macro evaluation
    // Use a safer approach to create the environment
    const macroEnv = new Env(callEnv, callEnv.logger);
    
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
      result = evaluateForMacro(e, macroEnv);
    }
    
    return result;
  };
}

/**
 * Handle function call
 * @param list List node containing function call
 * @param env Environment for evaluation
 * @returns Result of function call
 */
function handleFunctionCall(list: ListNode, env: Env): any {
  const func = evaluateForMacro(list.elements[0], env);
  const args = list.elements.slice(1).map(e => evaluateForMacro(e, env));
  
  if (typeof func !== "function") throw new Error(`${(list.elements[0] as SymbolNode).name} is not a function`);
  
  return func(...args);
}