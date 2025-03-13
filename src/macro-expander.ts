// src/macro-expander.ts - Refactored for better organization and clarity

import { parse } from "./transpiler/parser.ts";
import { Env, initializeGlobalEnv, evaluateForMacro } from "./bootstrap.ts";
import { HQLNode, ListNode, SymbolNode } from "./transpiler/hql_ast.ts";

// Singleton global environment for macros
let globalEnv: Env | null = null;

/**
 * Initialize the macro environment by creating a minimal environment and loading core macros.
 */
async function initMacroEnvironment(): Promise<Env> {
  if (!globalEnv) {
    globalEnv = await initializeGlobalEnv();
    await loadCoreMacros(globalEnv);
  }
  return globalEnv;
}

/**
 * Load core macros from lib/core.hql into the provided environment.
 */
export async function loadCoreMacros(env: Env): Promise<void> {
  const coreSource = await Deno.readTextFile("./lib/core.hql");
  const astNodes = parse(coreSource);

  const macroDefs = [];
  const otherForms = [];

  // Partition out defmacro forms first
  for (const node of astNodes) {
    if (isDefmacroForm(node)) macroDefs.push(node);
    else otherForms.push(node);
  }

  // 1) Register macros
  for (const m of macroDefs) {
    evaluateForMacro(m, env);
  }

  // 2) Evaluate other top-level forms
  for (const f of otherForms) {
    evaluateForMacro(f, env);
  }
}

function isDefmacroForm(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    node.elements.length > 0 &&
    node.elements[0].type === "symbol" &&
    node.elements[0].name === "defmacro"
  );
}

/**
 * Public function to expand macros in an array of HQL AST nodes.
 */
export async function expandMacros(nodes: HQLNode[]): Promise<HQLNode[]> {
  const env = await initMacroEnvironment();
  return nodes.map(node => expandNode(node, env));
}

/**
 * Process a quasiquoted expression, expanding unquotes and unquote-splicing.
 */
function processQuasiquote(node: HQLNode, env: Env): HQLNode {
  // Handle non-list nodes directly
  if (node.type !== "list") {
    return node;
  }
  
  const list = node as ListNode;
  if (list.elements.length === 0) return list;
  
  const first = list.elements[0];
  if (first.type === "symbol") {
    const symbolName = (first as SymbolNode).name;
    
    // Handle unquote
    if (symbolName === "unquote") {
      if (list.elements.length !== 2) {
        throw new Error("unquote requires exactly 1 argument");
      }
      // Expand the unquoted expression
      return expandNode(list.elements[1], env);
    }
    
    // Handle unquote-splicing
    if (symbolName === "unquote-splicing") {
      throw new Error("unquote-splicing not allowed in this context");
    }
  }
  
  return processListQuasiquote(list, env);
}

/**
 * Helper function to process quasiquote for list nodes.
 */
function processListQuasiquote(list: ListNode, env: Env): ListNode {
  const processedElements: HQLNode[] = [];
  
  for (let i = 0; i < list.elements.length; i++) {
    const elem = list.elements[i];
    
    // Handle unquote-splicing
    if (isUnquoteSplicing(elem)) {
      // Ensure we have exactly 2 elements in the unquote-splicing expression
      if ((elem as ListNode).elements.length !== 2) {
        throw new Error("unquote-splicing requires exactly 1 argument");
      }
      
      // Expand the unquote-splicing expression
      const expanded = expandNode((elem as ListNode).elements[1], env);
      if (expanded.type !== "list") {
        throw new Error("unquote-splicing requires a list result");
      }
      
      // Splice the result into the current list
      processedElements.push(...(expanded as ListNode).elements);
    } else {
      // Regular processing
      processedElements.push(processQuasiquote(elem, env));
    }
  }
  
  return {
    type: "list",
    elements: processedElements
  } as ListNode;
}

/**
 * Helper function to check if a node is an unquote-splicing expression.
 */
function isUnquoteSplicing(node: HQLNode): boolean {
  return node.type === "list" && 
         (node as ListNode).elements.length > 0 && 
         (node as ListNode).elements[0].type === "symbol" && 
         ((node as ListNode).elements[0] as SymbolNode).name === "unquote-splicing";
}

/**
 * Recursively expand macros in a given HQL AST node.
 */
function expandNode(node: HQLNode, env: Env): HQLNode {
  if (node.type !== "list") {
    // Literals and symbols pass through unchanged
    return node;
  }
  
  const list = node as ListNode;
  
  // Empty lists pass through unchanged
  if (list.elements.length === 0) return list;
  
  const first = list.elements[0];
  
  // Only lists that start with a symbol can be macro invocations
  if (first.type !== "symbol") {
    // Recursively expand each element in the list
    return {
      type: "list",
      elements: list.elements.map(child => expandNode(child, env))
    } as ListNode;
  }
  
  const symbolName = (first as SymbolNode).name;
  
  // Handle macro invocation
  if (env.hasMacro(symbolName)) {
    return expandMacroInvocation(list, symbolName, env);
  }
  
  // Handle special forms
  if (symbolName === "quote") {
    // Do not expand inside a quote
    return list;
  }
  
  if (symbolName === "quasiquote") {
    if (list.elements.length !== 2) {
      throw new Error("quasiquote requires exactly 1 argument");
    }
    // Process the quasiquoted expression
    return processQuasiquote(list.elements[1], env);
  }
  
  // Recursively expand each element in the list if it's not a special form
  return {
    type: "list",
    elements: list.elements.map(child => expandNode(child, env))
  } as ListNode;
}

/**
 * Helper function to expand a macro invocation.
 */
function expandMacroInvocation(list: ListNode, macroName: string, env: Env): HQLNode {
  const macroFn = env.getMacro(macroName)!;
  const args = list.elements.slice(1);
  
  try {
    const expanded = macroFn(args, env);
    // Recursively expand the result, in case it contains more macros.
    return expandNode(expanded, env);
  } catch (e) {
    throw new Error(
      `Error expanding macro '${macroName}' with args ${JSON.stringify(args)}: ${e.message}`
    );
  }
}