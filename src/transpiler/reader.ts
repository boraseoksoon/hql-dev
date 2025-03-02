// src/transpiler/reader.ts

import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";

/**
 * Read and transform HQL nodes to canonical S-expressions.
 * This is similar to Clojure's reader which transforms literal syntax to S-expressions.
 */
export function read(nodes: HQLNode[]): HQLNode[] {
  return nodes.map(readNode);
}

/**
 * Read a single HQL node and transform it if needed.
 */
function readNode(node: HQLNode): HQLNode {
  if (node.type === "literal") {
    return readLiteral(node as LiteralNode);
  } else if (node.type === "list") {
    // Transform the elements of the list
    const list = node as ListNode;
    return {
      type: "list",
      elements: list.elements.map(readNode)
    };
  }
  
  // Symbol nodes remain unchanged
  return node;
}

/**
 * Transform literal nodes based on their value type.
 */
function readLiteral(literal: LiteralNode): HQLNode {
  const value = literal.value;
  
  // Handle various JavaScript literal types
  if (Array.isArray(value)) {
    // Transform JavaScript arrays to (vector ...) form
    return createVectorExpression(value);
  } else if (value instanceof Set) {
    // Transform JavaScript Set objects to (hash-set ...) form
    return createSetExpression(Array.from(value));
  } else if (typeof value === "object" && value !== null) {
    // Transform JavaScript object literals to (hash-map ...) form
    return createMapExpression(value);
  }
  
  // Other literals remain unchanged
  return literal;
}

/**
 * Create a (vector ...) S-expression from a JavaScript array.
 */
function createVectorExpression(array: any[]): ListNode {
  const elements: HQLNode[] = [
    { type: "symbol", name: "vector" } as SymbolNode
  ];
  
  // Transform each array element recursively
  for (const item of array) {
    if (typeof item === "object" && item !== null) {
      elements.push(readLiteral({ type: "literal", value: item }));
    } else {
      // Fix the TypeScript error by handling undefined
      elements.push({ type: "literal", value: item ?? null });
    }
  }
  
  return { type: "list", elements };
}

/**
 * Create a (hash-set ...) S-expression from a JavaScript array.
 */
function createSetExpression(array: any[]): ListNode {
  const elements: HQLNode[] = [
    { type: "symbol", name: "hash-set" } as SymbolNode
  ];
  
  // Transform each array element recursively
  for (const item of array) {
    if (typeof item === "object" && item !== null) {
      elements.push(readLiteral({ type: "literal", value: item }));
    } else {
      // Fix the TypeScript error by handling undefined
      elements.push({ type: "literal", value: item ?? null });
    }
  }
  
  return { type: "list", elements };
}

/**
 * Create a (hash-map ...) S-expression from a JavaScript object.
 */
function createMapExpression(obj: object): ListNode {
  const elements: HQLNode[] = [
    { type: "symbol", name: "hash-map" } as SymbolNode
  ];
  
  // Add each key-value pair
  for (const [key, value] of Object.entries(obj)) {
    // Add the key
    elements.push({ type: "literal", value: key });
    
    // Add the value (transformed if needed)
    if (typeof value === "object" && value !== null) {
      elements.push(readLiteral({ type: "literal", value }));
    } else {
      // Fix the TypeScript error by handling undefined
      elements.push({ type: "literal", value: value ?? null });
    }
  }
  
  return { type: "list", elements };
}