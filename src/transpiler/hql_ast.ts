// src/transpiler/hql_ast.ts - Simplified to focus on core forms
export type HQLNode = 
  LiteralNode | 
  SymbolNode | 
  ListNode;

export interface LiteralNode {
  type: "literal";
  value: string | number | boolean | null;
}

export interface SymbolNode {
  type: "symbol";
  name: string;
}

export interface ListNode {
  type: "list";
  elements: HQLNode[];
}