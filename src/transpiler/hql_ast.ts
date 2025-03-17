// src/transpiler/hql_ast.ts
export type HQLNode = LiteralNode | SymbolNode | ListNode | DotNotationReference | ExportReference;

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

export interface DotNotationReference {
  type: "dot-notation-reference";
  module: string;
  property: string;
  args: HQLNode[];
}

export interface ExportReference {
  type: "export-reference";
  name: string;
  value: any;
}

/**
 * Check if a node is a dot notation reference
 */
export function isDotNotationReference(node: HQLNode): node is DotNotationReference {
  return node && typeof node === "object" && node.type === "dot-notation-reference";
}

/**
 * Check if a node is an export reference
 */
export function isExportReference(node: HQLNode): node is ExportReference {
  return node && typeof node === "object" && node.type === "export-reference";
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
 * Detects if a node is a macro import
 */
export function isMacroImport(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    (node as ListNode).elements.length >= 3 &&
    (node as ListNode).elements[0].type === "symbol" &&
    ((node as ListNode).elements[0] as SymbolNode).name === "import"
  );
}

/**
 * Helper to extract import path from a node
 */
export function extractImportPath(node: HQLNode): string | null {
  if (node.type === "list" && 
      node.elements.length >= 3 && 
      node.elements[0].type === "symbol" && 
      ((node.elements[0] as SymbolNode).name === "import" || 
       (node.elements[0] as SymbolNode).name === "js-import") &&
      node.elements[2].type === "literal") {
    return String((node.elements[2] as LiteralNode).value);
  }
  return null;
}

/**
 * Check if a node is a macro definition
 */
export function isMacroDefinition(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    node.elements.length >= 4 &&
    node.elements[0].type === "symbol" &&
    (node.elements[0] as SymbolNode).name === "defmacro"
  );
}

/**
 * Check if a node is a def definition
 */
export function isDefDefinition(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    node.elements.length >= 3 &&
    node.elements[0].type === "symbol" &&
    (node.elements[0] as SymbolNode).name === "def"
  );
}

/**
 * Check if a node is a js-export statement
 */
export function isJsExport(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    node.elements.length >= 3 &&
    node.elements[0].type === "symbol" &&
    (node.elements[0] as SymbolNode).name === "js-export"
  );
}