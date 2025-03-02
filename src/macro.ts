// src/macro.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode, VectorNode, SetNode, MapNode } from "./transpiler/hql_ast.ts";

/**
 * Expand macros in HQL nodes
 * This converts syntactic sugar like vectors and sets into core S-expressions
 */
export function expandMacros(nodes: HQLNode[]): HQLNode[] {
  return nodes.map(expandNode);
}

/**
 * Expand a single node, recursively expanding its children
 */
function expandNode(node: HQLNode): HQLNode {
  switch (node.type) {
    case "vector":
      // Convert [a b c] to (vector a b c)
      const vectorElements = (node as VectorNode).elements.map(expandNode);
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "vector" } as SymbolNode,
          ...vectorElements
        ]
      } as ListNode;
      
    case "set":
      // Convert #[a b c] to (hash-set a b c)
      const setElements = (node as SetNode).elements.map(expandNode);
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "hash-set" } as SymbolNode,
          ...setElements
        ]
      } as ListNode;
      
    case "map":
      // Convert map to (hash-map k1 v1 k2 v2 ...)
      const mapPairs = (node as MapNode).pairs;
      const mapElements: HQLNode[] = [{ type: "symbol", name: "hash-map" } as SymbolNode];
      
      for (const [key, value] of mapPairs) {
        mapElements.push(expandNode(key));
        mapElements.push(expandNode(value));
      }
      
      return {
        type: "list",
        elements: mapElements
      } as ListNode;
      
    case "list":
      // Recursively expand list elements
      return {
        type: "list",
        elements: (node as ListNode).elements.map(expandNode)
      } as ListNode;
      
    // For literals and symbols, no transformation needed
    default:
      return node;
  }
}