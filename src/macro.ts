// src/macro.ts - Connector to the macro system
import { HQLNode } from "./transpiler/hql_ast.ts";
import { expandMacros as internalExpandMacros } from "./macro-expander.ts";

export async function expandMacros(node: HQLNode): Promise<HQLNode> {
  // Handle arrays vs single nodes
  if (Array.isArray(node)) {
    const expanded = await internalExpandMacros(node);
    return expanded[0];
  }
  
  const expanded = await internalExpandMacros([node]);
  return expanded[0];
}