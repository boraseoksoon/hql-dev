// src/transpiler/hql_ast.ts - Updated with node types for raw syntax forms
export type HQLNode = 
  LiteralNode | 
  SymbolNode | 
  ListNode |
  JsonObjectLiteralNode |
  JsonArrayLiteralNode |
  ExtendedDefnNode;

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

/**
 * Node for raw JSON object literals, used before macro expansion
 * e.g., {"name": "Alice", "age": 30}
 */
export interface JsonObjectLiteralNode {
  type: "jsonObjectLiteral";
  properties: { [key: string]: HQLNode };
}

/**
 * Node for raw JSON array literals, used before macro expansion
 * e.g., [1, 2, 3, 4, 5]
 */
export interface JsonArrayLiteralNode {
  type: "jsonArrayLiteral";
  elements: HQLNode[];
}

/**
 * Parameter in an extended function definition
 */
export interface ExtendedParam {
  name: string;
  type?: string;
  defaultValue?: HQLNode;
  isNamed?: boolean;  // Added isNamed flag for named parameters
}

/**
 * Node for extended function definitions with type annotations and defaults
 * e.g., (fx add (x: Int y: Int = 0) -> Int (+ x y))
 */
export interface ExtendedDefnNode {
  type: "extendedDefn";
  name: string;
  params: ExtendedParam[];
  returnType?: HQLNode;
  body: HQLNode[];
}