// src/transpiler/hql_ast.ts
export type HQLNode = LiteralNode | SymbolNode | ListNode | VectorNode | SetNode | MapNode;

export interface LiteralNode {
  type: "literal";
  value: string | number | boolean | null | object;  // Added object for JSON support
}

export interface SymbolNode {
  type: "symbol";
  name: string;
}

export interface ListNode {
  type: "list";
  elements: HQLNode[];
}

// New node types for Clojure-like data structures
export interface VectorNode {
  type: "vector";
  elements: HQLNode[];
}

export interface SetNode {
  type: "set";
  elements: HQLNode[];
}

export interface MapNode {
  type: "map";
  pairs: [HQLNode, HQLNode][];  // Key-value pairs
}