// src/macro.ts
import { HQLNode } from "./ast.ts";
export function expandMacros(nodes: HQLNode[]): HQLNode[] {
  // In our simple case, no macros are defined.
  return nodes;
}
