// src/transpiler/hql_ast.ts

/**
 * Simplified AST types - focusing only on core S-expression components
 */
export type HQLNode = 
  | LiteralNode 
  | SymbolNode 
  | ListNode;

export interface LiteralNode {
  type: "literal";
  value: string | number | boolean | null | object;  // Object covers JS objects, arrays, etc.
}

export interface SymbolNode {
  type: "symbol";
  name: string;
}

export interface ListNode {
  type: "list";
  elements: HQLNode[];
}