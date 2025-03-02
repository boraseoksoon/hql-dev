// src/transpiler/hql_ast.ts
export type HQLNode = LiteralNode | SymbolNode | ListNode;

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
  isArrayLiteral?: boolean;
}

// The following interfaces aren't directly part of the AST but represent 
// the JavaScript data structures that the forms will be transformed into
export interface VectorLike extends Array<any> {
  // A vector is just a JavaScript array
}

export interface MapLike {
  // A map is just a JavaScript object
  [key: string]: any;
}

export interface SetLike extends Set<any> {
  // A set is just a JavaScript Set
}