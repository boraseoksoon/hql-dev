// src/transpiler/hql_ast.ts
export type HQLNode = LiteralNode | SymbolNode | ListNode | DotAccessNode;

export interface LiteralNode {
  type: "literal";
  value: string | number;
}

export interface SymbolNode {
  type: "symbol";
  name: string;
}

export interface ListNode {
  type: "list";
  elements: HQLNode[];
}

export interface DotAccessNode {
  type: "dot-access";
  object: string;
  property: string;
}
