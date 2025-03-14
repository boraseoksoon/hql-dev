// src/macro.ts - Connector to the macro system
import { HQLNode } from "./transpiler/hql_ast.ts";
import { expandMacros as internalExpandMacros } from "./macro-expander.ts";

export async function expandMacros(node: HQLNode | HQLNode[]): Promise<HQLNode | HQLNode[]> {
  if (Array.isArray(node)) {
    return await internalExpandMacros(node);
  }
  
  const expanded = await internalExpandMacros([node]);
  return expanded[0];
}