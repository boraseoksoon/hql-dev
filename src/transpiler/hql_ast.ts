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
}

/**
 * Check if a node is an import statement
 */
export function isImportNode(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    node.elements.length >= 3 &&
    node.elements[0].type === "symbol" &&
    ((node.elements[0] as SymbolNode).name === "import" || 
     (node.elements[0] as SymbolNode).name === "js-import")
  );
}

/**
 * Detects if a node is an import statement
 */
export function isMacroImport(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    (node as ListNode).elements.length >= 3 &&
    (node as ListNode).elements[0].type === "symbol" &&
    ((node as ListNode).elements[0] as SymbolNode).name === "import"
  );
}