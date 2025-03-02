// src/macro.ts

import { HQLNode } from "./transpiler/hql_ast.ts";
import { read } from "./transpiler/reader.ts";

/**
 * Expands macros in HQL AST.
 * 
 * In the new implementation, we use the reader to transform JavaScript literals
 * to their canonical S-expression form (Clojure style), then perform other
 * macro expansions as needed.
 */
export function expandMacros(nodes: HQLNode[]): HQLNode[] {
  // First, transform JavaScript literals to canonical S-expressions
  const transformedNodes = read(nodes);
  
  // Then apply any other macro expansions (not needed for data structures anymore)
  return transformedNodes;
}