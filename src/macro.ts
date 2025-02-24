// src/macro.ts
import { HQLNode } from "./ast.ts";
export function expandMacros(nodes: HQLNode[]): HQLNode[] {
  // No macro expansion in this minimal version.
  return nodes;
}
