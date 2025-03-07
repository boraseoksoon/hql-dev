// src/macro.ts
import { HQLNode } from "./transpiler/hql_ast.ts";

export function expandMacros(node: HQLNode): HQLNode {
  // No macro expansion in the minimal core
  return node;
}
