// src/bootstrap.ts

import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./transpiler/hql_ast.ts";
import { jsImport, jsExport, jsGet, jsCall } from "./interop.ts";
import { gensym } from "./gensym.ts";
import { parse } from "./transpiler/parser.ts";
import { resolve, dirname } from "https://deno.land/std@0.170.0/path/mod.ts";

/* -------------------- Constants -------------------- */

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

/* -------------------- Environment -------------------- */

// Enhanced Env class with detailed logging for debugging

export class Env {
  bindings = new Map<string, any>();
  macros = new Map<string, MacroFunction>();
  parent: Env | null = null;
  
  constructor(parent: Env | null = null) {
    this.parent = parent;
  }
  
  lookup(symbol: string): any {
    console.log(`[Env.lookup] Looking up symbol: ${symbol}`);
    
    // First try direct lookup
    if (this.bindings.has(symbol)) {
      console.log(`[Env.lookup] Found symbol in current environment: ${symbol}`);
      return this.bindings.get(symbol);
    }
    
    // Handle dot notation for module access
    if (symbol.includes('.')) {
      const [moduleName, memberName] = symbol.split('.');
      console.log(`[Env.lookup] Looking up module.member: ${moduleName}.${memberName}`);
      
      // Try direct lookup of fully qualified name first
      if (this.bindings.has(symbol)) {
        console.log(`[Env.lookup] Found fully qualified name in environment: ${symbol}`);
        return this.bindings.get(symbol);
      }
      
      // Try module-based lookup
      if (this.bindings.has(moduleName)) {
        const module = this.bindings.get(moduleName);
        console.log(`[Env.lookup] Found module: ${moduleName}, looking for member: ${memberName}`);
        
        if (typeof module === 'object' && module !== null && memberName in module) {
          console.log(`[Env.lookup] Found member in module: ${memberName}`);
          return module[memberName];
        } else {
          console.log(`[Env.lookup] Member not found in module: ${memberName}`);
        }
      } else {
        console.log(`[Env.lookup] Module not found: ${moduleName}`);
      }
    }
    
    // Try parent environment
    if (this.parent) {
      console.log(`[Env.lookup] Looking in parent environment for: ${symbol}`);
      return this.parent.lookup(symbol);
    }
    
    // Not found
    console.log(`[Env.lookup] Symbol not found: ${symbol}`);
    throw new Error(`Symbol not found: ${symbol}`);
  }
  
  define(symbol: string, value: any): void {
    console.log(`[Env.define] Defining symbol: ${symbol}`);
    this.bindings.set(symbol, value);
  }
  
  defineMacro(name: string, fn: MacroFunction): void {
    console.log(`[Env.defineMacro] Defining macro: ${name}`);
    this.macros.set(name, fn);
  }
  
  hasMacro(name: string): boolean {
    console.log(`[Env.hasMacro] Checking for macro: ${name}`);
    
    // Direct lookup in this environment
    if (this.macros.has(name)) {
      console.log(`[Env.hasMacro] Found macro in current environment: ${name}`);
      return true;
    }
    
    // Handle dot notation for module access
    if (name.includes('.')) {
      const [moduleName, macroName] = name.split('.');
      console.log(`[Env.hasMacro] Checking for module.macro: ${moduleName}.${macroName}`);
      
      // First check if the fully qualified name is registered directly
      if (this.macros.has(name)) {
        console.log(`[Env.hasMacro] Found fully qualified macro: ${name}`);
        return true;
      }
      
      // Try module-based lookup
      try {
        if (this.bindings.has(moduleName)) {
          const module = this.bindings.get(moduleName);
          console.log(`[Env.hasMacro] Found module: ${moduleName}, checking for macro: ${macroName}`);
          
          if (module && typeof module === 'object' && macroName in module) {
            const member = module[macroName];
            console.log(`[Env.hasMacro] Found member in module: ${macroName}, is function: ${typeof member === 'function'}`);
            return typeof member === 'function';
          }
        }
      } catch (error) {
        console.log(`[Env.hasMacro] Error in module lookup: ${error.message}`);
      }
    }
    
    // Try parent environment
    if (this.parent) {
      console.log(`[Env.hasMacro] Checking parent environment for macro: ${name}`);
      return this.parent.hasMacro(name);
    }
    
    console.log(`[Env.hasMacro] Macro not found: ${name}`);
    return false;
  }
  
  getMacro(name: string): MacroFunction | null {
    console.log(`[Env.getMacro] Getting macro: ${name}`);
    
    // Direct lookup
    if (this.macros.has(name)) {
      console.log(`[Env.getMacro] Found macro in current environment: ${name}`);
      return this.macros.get(name)!;
    }
    
    // Handle dot notation for module access
    if (name.includes('.')) {
      const [moduleName, macroName] = name.split('.');
      console.log(`[Env.getMacro] Getting module.macro: ${moduleName}.${macroName}`);
      
      // Try fully qualified name first
      if (this.macros.has(name)) {
        console.log(`[Env.getMacro] Found fully qualified macro: ${name}`);
        return this.macros.get(name)!;
      }
      
      // Try module-based lookup
      try {
        if (this.bindings.has(moduleName)) {
          const module = this.bindings.get(moduleName);
          console.log(`[Env.getMacro] Found module: ${moduleName}, looking for macro: ${macroName}`);
          
          if (module && typeof module === 'object' && macroName in module) {
            const member = module[macroName];
            console.log(`[Env.getMacro] Found member in module: ${macroName}, is function: ${typeof member === 'function'}`);
            
            if (typeof member === 'function') {
              return member;
            }
          }
        }
      } catch (error) {
        console.log(`[Env.getMacro] Error in module lookup: ${error.message}`);
      }
    }
    
    // Try parent environment
    if (this.parent) {
      console.log(`[Env.getMacro] Checking parent environment for macro: ${name}`);
      return this.parent.getMacro(name);
    }
    
    console.log(`[Env.getMacro] Macro not found: ${name}`);
    return null;
  }
  
  extend(params: string[], args: any[]): Env {
    console.log(`[Env.extend] Extending environment with ${params.length} parameters`);
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

/* -------------------- Primitives Setup -------------------- */

function setupPrimitives(env: Env): void {
  env.define("+", (...args: number[]) => args.reduce((a, b) => a + b, 0));
  env.define("-", (a: number, b: number) => a - b);
  env.define("*", (...args: number[]) => args.reduce((a, b) => a * b, 1));
  env.define("/", (a: number, b: number) => a / b);
  env.define("%", (a: number, b: number) => a % b);
  env.define("=", (a: any, b: any) => a === b);
  env.define("!=", (a: any, b: any) => a !== b);
  env.define("<", (a: number, b: number) => a < b);
  env.define(">", (a: number, b: number) => a > b);
  env.define("<=", (a: number, b: number) => a <= b);
  env.define(">=", (a: number, b: number) => a >= b);
  env.define("eq?", (a: any, b: any) => a === b);

  env.define("js-import", jsImport);
  env.define("js-export", jsExport);
  env.define("js-get", jsGet);
  env.define("js-call", jsCall);

  env.define("gensym", gensym);
  env.define("list", (...args: any[]) => ({ type: "list", elements: args }));

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
  
  env.define("empty?", (coll: any) => {
    if (coll.type === "list") return { type: "literal", value: coll.elements.length === 0 };
    if (coll.type === "literal" && coll.value === null) return { type: "literal", value: true };
    return { type: "literal", value: false };
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
  
  env.define("symbol?", (value: any) => ({ type: "literal", value: value.type === "symbol" }));
  env.define("list?", (value: any) => ({ type: "literal", value: value.type === "list" }));
  env.define("map?", (value: any) => ({ type: "literal", value: value.type === "list" &&
           value.elements.length > 0 &&
           value.elements[0].type === "symbol" &&
           value.elements[0].name === "hash-map" }));
  env.define("nil?", (value: any) => ({ type: "literal", value: value.type === "literal" && value.value === null }));
}

/* -------------------- Core Macro Loading -------------------- */

/*
  loadCoreMacros loads the core macros defined in lib/core.hql using a two-pass approach:
  First, register all defmacro forms.
  Then, evaluate all non-defmacro forms.
*/
export async function loadCoreMacros(env: Env): Promise<void> {
  console.log("[bootstrap] Loading core macros");
  const coreSource = await Deno.readTextFile("./lib/core.hql");
  const astNodes = parse(coreSource);
  
  const coreDir = dirname("./lib/core.hql");
  
  // First pass: process all imports
  for (const node of astNodes) {
    if (isImportNode(node)) {
      console.log("[bootstrap] Processing import in core.hql");
      await processImportNode(node as ListNode, env, coreDir);
    }
  }
  
  // Second pass: register all macros
  for (const node of astNodes) {
    if (isMacroDefinition(node)) {
      console.log("[bootstrap] Registering macro definition");
      evaluateForMacro(node, env);
    }
  }
  
  // Third pass: evaluate other definitions
  for (const node of astNodes) {
    if (!isImportNode(node) && !isMacroDefinition(node)) {
      evaluateForMacro(node, env);
    }
  }
  
  console.log("[bootstrap] Core macros loaded successfully");
}

async function processImportNode(
  importNode: ListNode,
  env: Env,
  currentDir: string
): Promise<void> {
  if (importNode.elements.length < 3) {
    throw new Error("Import requires a name and a path");
  }
  
  const nameNode = importNode.elements[1];
  const pathNode = importNode.elements[2];
  
  if (nameNode.type !== "symbol") {
    throw new Error("Import name must be a symbol");
  }
  const importName = (nameNode as SymbolNode).name;
  
  if (pathNode.type !== "literal") {
    throw new Error("Import path must be a string literal");
  }
  const importPath = String((pathNode as LiteralNode).value);
  
  console.log(`[bootstrap] Processing import: ${importName} from ${importPath}`);
  
  // Only handle HQL files specially
  if (importPath.endsWith('.hql')) {
    await processHqlImport(importName, importPath, env, currentDir);
  } else {
    console.log(`[bootstrap] Skipping non-HQL import: ${importPath}`);
  }
}

function isImportNode(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    (node as ListNode).elements.length > 0 &&
    (node as ListNode).elements[0].type === "symbol" &&
    ((node as ListNode).elements[0] as SymbolNode).name === "import"
  );
}

// Helper to identify macro definition nodes
function isMacroDefinition(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    (node as ListNode).elements.length > 0 &&
    (node as ListNode).elements[0].type === "symbol" &&
    ((node as ListNode).elements[0] as SymbolNode).name === "defmacro"
  );
}

/**
 * Process an import statement during core macro loading
 */
async function processImport(node: ListNode, env: Env, currentDir: string): Promise<void> {
  if (node.elements.length < 3) {
    throw new Error("Import requires at least 2 arguments: name and path");
  }
  
  const nameNode = node.elements[1];
  const pathNode = node.elements[2];
  
  if (nameNode.type !== "symbol") {
    throw new Error("Import name must be a symbol");
  }
  const importName = (nameNode as SymbolNode).name;
  
  if (pathNode.type !== "literal") {
    throw new Error("Import path must be a string literal");
  }
  const importPath = String((pathNode as LiteralNode).value);
  
  console.log(`[bootstrap] Processing import: ${importName} from ${importPath}`);
  
  // Check if it's an HQL import
  if (importPath.endsWith('.hql')) {
    await processHqlImport(importName, importPath, env, currentDir);
  } else {
    console.log(`[bootstrap] Non-HQL import (skipping): ${importPath}`);
    // Note: Non-HQL imports would usually be handled by the transpiler later
  }
}

/**
 * Process an HQL file import during core macro loading
 */
async function processHqlImport(
  moduleName: string,
  modulePath: string,
  env: Env,
  currentDir: string
): Promise<void> {
  try {
    // Resolve path relative to current directory
    const resolvedPath = resolve(currentDir, modulePath);
    console.log(`[bootstrap] Resolved import path: ${resolvedPath}`);
    
    // Read and parse the file
    const source = await Deno.readTextFile(resolvedPath);
    const importedAst = parse(source);
    console.log(`[bootstrap] Parsed imported file: ${importedAst.length} nodes`);
    
    // Create module object to store exports
    const moduleExports: Record<string, any> = {};
    
    // Process any nested imports first
    for (const node of importedAst) {
      if (isImportNode(node)) {
        const importDir = dirname(resolvedPath);
        await processImportNode(node as ListNode, env, importDir);
      }
    }
    
    // Register all macro definitions from the imported file
    for (const node of importedAst) {
      if (isMacroDefinition(node)) {
        const macroNode = node as ListNode;
        if (macroNode.elements.length >= 3 && macroNode.elements[1].type === "symbol") {
          const macroName = (macroNode.elements[1] as SymbolNode).name;
          console.log(`[bootstrap] Found macro in imported file: ${macroName}`);
          
          // Evaluate the macro
          evaluateForMacro(node, env);
          
          // Get the macro function from the environment
          const macroFn = env.getMacro(macroName);
          if (macroFn) {
            // Store in module exports
            moduleExports[macroName] = macroFn;
            
            // CRITICAL: Register the macro with a qualified name
            const qualifiedName = `${moduleName}.${macroName}`;
            env.defineMacro(qualifiedName, macroFn);
            console.log(`[bootstrap] Registered qualified macro: ${qualifiedName}`);
          }
        }
      }
    }
    
    // Register all other definitions
    for (const node of importedAst) {
      if (!isImportNode(node) && !isMacroDefinition(node)) {
        if (
          node.type === "list" && 
          (node as ListNode).elements.length > 0 &&
          (node as ListNode).elements[0].type === "symbol" &&
          ((node as ListNode).elements[0] as SymbolNode).name === "def"
        ) {
          const defNode = node as ListNode;
          if (defNode.elements.length >= 3 && defNode.elements[1].type === "symbol") {
            const defName = (defNode.elements[1] as SymbolNode).name;
            console.log(`[bootstrap] Found definition in imported file: ${defName}`);
            
            // Evaluate the definition
            const value = evaluateForMacro(node, env);
            
            // Store in module exports
            moduleExports[defName] = value;
            
            // Register with qualified name
            const qualifiedName = `${moduleName}.${defName}`;
            env.define(qualifiedName, value);
            console.log(`[bootstrap] Registered qualified definition: ${qualifiedName}`);
          }
        }
      }
    }
    
    // Register the complete module
    env.define(moduleName, moduleExports);
    console.log(`[bootstrap] Registered module ${moduleName} with exports:`, Object.keys(moduleExports));
  } catch (error) {
    console.error(`[bootstrap] Error processing HQL import ${modulePath}:`, error);
    throw error;
  }
}

/* -------------------- Global Environment Initialization -------------------- */

export async function initializeGlobalEnv(): Promise<Env> {
  const env = new Env();
  setupPrimitives(env);
  await loadCoreMacros(env);
  return env;
}

/* -------------------- Quasiquote Evaluation -------------------- */

function evaluateQuasiquote(expr: HQLNode, env: Env): HQLNode {
  // If the expr is a list and its first element is the symbol "unquote", evaluate and return its argument.
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
  return expr;
}

/* -------------------- Macro Evaluator -------------------- */

export function evaluateForMacro(expr: HQLNode, env: Env): any {
  if (!expr || typeof expr !== "object" || !("type" in expr)) {
    throw new Error(`Invalid expression: ${JSON.stringify(expr)}`);
  }
  switch (expr.type) {
    case "literal":
      return (expr as LiteralNode).value;
    case "symbol": {
      const name = (expr as SymbolNode).name;
      if (env.hasMacro(name)) return env.getMacro(name);
      return env.lookup(name);
    }
    case "list": {
      const list = expr as ListNode;
      if (list.elements.length === 0) return [];
      const first = list.elements[0];
      if (first.type === "symbol") {
        const op = (first as SymbolNode).name;
        if (op === "js-import") {
          // Expect form: (js-import (quote name) path)
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
        if (op === "quote") {
          if (list.elements.length !== 2) throw new Error("quote requires exactly one argument");
          return list.elements[1];
        }
        if (op === "quasiquote") {
          if (list.elements.length !== 2) throw new Error("quasiquote requires exactly one argument");
          return evaluateQuasiquote(list.elements[1], env);
        }
        if (op === "if") {
          if (list.elements.length < 3 || list.elements.length > 4) throw new Error("if requires 2 or 3 arguments");
          const test = evaluateForMacro(list.elements[1], env);
          if (test) return evaluateForMacro(list.elements[2], env);
          else if (list.elements.length > 3) return evaluateForMacro(list.elements[3], env);
          else return null;
        }
        if (op === "def") {
          if (list.elements.length !== 3) throw new Error("def requires exactly two arguments");
          const nameExpr = list.elements[1];
          if (nameExpr.type !== "symbol") throw new Error("def requires a symbol as its first argument");
          const varName = (nameExpr as SymbolNode).name;
          const value = evaluateForMacro(list.elements[2], env);
          env.define(varName, value);
          return value;
        }
        if (op === "defmacro") {
          if (list.elements.length < 4) throw new Error("defmacro requires a name, parameters, and body");
          const nameExpr = list.elements[1];
          if (nameExpr.type !== "symbol") throw new Error("defmacro requires a symbol for the name");
          const macroName = (nameExpr as SymbolNode).name;
          const paramsNode = list.elements[2];
          if (paramsNode.type !== "list") throw new Error("defmacro parameters must be a list");
          const paramElements = (paramsNode as ListNode).elements;
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
          const body = list.elements.slice(3);
          const macroFn = (args: HQLNode[], callEnv: Env): HQLNode => {
            const macroEnv = callEnv.extend([], []);
            for (let i = 0; i < paramNames.length; i++) {
              macroEnv.define(paramNames[i], i < args.length ? args[i] : makeLiteral(null));
            }
            if (hasRestParam) {
              const restArgs = args.slice(paramNames.length);
              macroEnv.define(restParamName, { type: "list", elements: restArgs });
            }
            let result: HQLNode = makeLiteral(null);
            for (const e of body) {
              result = evaluateForMacro(e, macroEnv);
            }
            return result;
          };
          env.defineMacro(macroName, macroFn);
          return makeLiteral(null);
        }
        // Fallback: function application.
        const func = evaluateForMacro(first, env);
        const args = list.elements.slice(1).map(e => evaluateForMacro(e, env));
        if (typeof func !== "function") throw new Error(`${(first as SymbolNode).name} is not a function`);
        return func(...args);
      }
      throw new Error("List does not start with a symbol");
    }
    default:
      throw new Error(`Unknown node type: ${(expr as any).type || JSON.stringify(expr)}`);
  }
}
