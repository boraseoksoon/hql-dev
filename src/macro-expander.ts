// src/macro-expander.ts

import { parse } from "./transpiler/parser.ts";
import { Env, initializeGlobalEnv, evaluateForMacro } from "./bootstrap.ts";
import { HQLNode, ListNode, SymbolNode } from "./transpiler/hql_ast.ts";

let globalEnv: Env | null = null;

/**
* Load core macros from lib/core.hql into the provided environment.
*/
async function loadCoreMacros(env: Env): Promise<void> {
  const coreSource = await Deno.readTextFile("./lib/core.hql");
  const coreAST = parse(coreSource);
  for (const node of coreAST) {
    try {
      evaluateForMacro(node, env);
    } catch (e) {
      throw new Error(`Error loading core macro ${JSON.stringify(node)}: ${e.message}`);
    }
  }
}

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
* Public function to expand macros in an array of HQL AST nodes.
*/
export async function expandMacros(nodes: HQLNode[]): Promise<HQLNode[]> {
  const env = await initMacroEnvironment();
  return nodes.map(node => expandNode(node, env));
}

/**
* Recursively expand macros in a given HQL AST node.
*/
function expandNode(node: HQLNode, env: Env): HQLNode {
  if (node.type === "list") {
    const list = node as ListNode;
    if (list.elements.length === 0) return list;
    const first = list.elements[0];
    if (first.type === "symbol") {
      const macroName = (first as SymbolNode).name;
      if (env.hasMacro(macroName)) {
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
      if (macroName === "quote") {
        // Do not expand inside a quote.
        return list;
      }
    }
    // Recursively expand each element in the list.
    return {
      type: "list",
      elements: list.elements.map(child => expandNode(child, env))
    } as ListNode;
  }
  // Literals and symbols pass through unchanged.
  return node;
}
