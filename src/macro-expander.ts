// src/macro-expander.ts

import { parse } from "./transpiler/parser.ts";
import { 
  Env, 
  initializeGlobalEnv, 
  evaluateForMacro 
} from "./bootstrap-core.ts";
import { HQLNode, ListNode, SymbolNode } from "./transpiler/hql_ast.ts";

let globalEnv: Env | null = null;

async function loadCoreMacros(env: Env): Promise<void> {
  // Adjust the path if your core.hql is located elsewhere
  const coreSource = await Deno.readTextFile("./lib/core.hql");
  const coreAST = parse(coreSource);
  for (const node of coreAST) {
    evaluateForMacro(node, env);
  }
}

async function initMacroEnvironment(): Promise<Env> {
  if (!globalEnv) {
    globalEnv = await initializeGlobalEnv();
    await loadCoreMacros(globalEnv);
  }
  return globalEnv;
}

export async function expandMacros(nodes: HQLNode[]): Promise<HQLNode[]> {
  const env = await initMacroEnvironment();
  const expanded: HQLNode[] = [];
  for (const node of nodes) {
    expanded.push(expandNode(node, env));
  }
  return expanded;
}

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
        const expanded = macroFn(args, env);
        return expandNode(expanded, env);
      }
      if (macroName === "quote") return list; // do not expand inside quote
    }
    return {
      type: "list",
      elements: list.elements.map(child => expandNode(child, env))
    } as ListNode;
  }
  return node;
}
