import { HQLNode, LiteralNode, SymbolNode, ListNode, isDotNotationReference, isExportReference } from "./transpiler/hql_ast.ts";
import { Logger } from "./logger.ts";

/**
 * Convert expanded S-expressions back to complex AST format
 * for compatibility with the existing pipeline.
 */
export function convertToComplexAST(nodes: HQLNode[], logger: Logger = new Logger(false)): HQLNode[] {
  return nodes.map(node => convertNode(node, logger));
}

/**
 * Convert a single S-expression node to complex AST
 */
/**
 * Convert a single S-expression node to complex AST
 */
export function convertNode(node: HQLNode, logger: Logger): HQLNode {
    // Handle null or undefined
    if (node === null || node === undefined) {
      logger.debug("Null or undefined node received, returning null literal");
      return { type: "literal", value: null };
    }
    
    // Check for valid node with type property
    if (typeof node !== 'object' || !('type' in node)) {
      logger.error(`Invalid node without type property: ${JSON.stringify(node)}`);
      return { type: "literal", value: null };
    }
    
    // Handle primitive nodes
    if (node.type === "literal" || node.type === "symbol") {
      return node;
    }
    
    // Handle dot-notation-reference
    if (node.type === "dot-notation-reference") {
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "js-call" },
          { type: "symbol", name: (node as any).module },
          { type: "literal", value: (node as any).property },
          ...((node as any).args || []).map((arg: any) => convertNode(arg, logger))
        ]
      };
    }
    
    // Handle export-reference
    if (node.type === "export-reference") {
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "js-export" },
          { type: "literal", value: (node as any).name },
          convertNode((node as any).value, logger)
        ]
      };
    }
    
    // Handle list
    if (node.type === "list") {
      const list = node as ListNode;
      
      // Empty list
      if (list.elements.length === 0) {
        return { type: "list", elements: [] };
      }
      
      const first = list.elements[0];
      
      // Handle list starting with symbol
      if (first && first.type === "symbol") {
        const op = (first as SymbolNode).name;
        
        // Handle export-named-declaration specially
        if (op === "export-named-declaration") {
          return {
            type: "list",
            elements: [
              first,
              convertNode(list.elements[1], logger),
              list.elements[2] // name doesn't need conversion
            ]
          };
        }
        
        // Pass through special forms with recursively converted elements
        const specialForms = [
          "quote", "if", "fn", "def", 
          "js-import", "js-export", "js-call", "js-get", "js-get-invoke",
          "vector", "hash-map", "hash-set", "empty-array", "empty-map", "empty-set"
        ];
        
        if (specialForms.includes(op)) {
          return {
            type: "list",
            elements: list.elements.map(elem => convertNode(elem, logger))
          };
        }
        
        // Regular conversion for other list types
        return {
          type: "list",
          elements: list.elements.map(elem => convertNode(elem, logger))
        };
      }
      
      // Handle list starting with anything else
      return {
        type: "list",
        elements: list.elements.map(elem => convertNode(elem, logger))
      };
    }
    
    // Handle unknown types
    logger.error(`Unknown node type: ${String(node.type)}`);
    return { type: "literal", value: null };
  }

/**
 * Fix js-export to ensure correct export generation
 */
function fixJsExport(list: ListNode, logger: Logger): HQLNode {
  // Ensure we have the right number of arguments
  if (list.elements.length !== 3) {
    logger.error("Invalid js-export form, expected 3 elements");
    return list;
  }
  
  // Extract name and value
  const nameNode = list.elements[1];
  const valueNode = list.elements[2];
  
  // Convert to an export-named-declaration
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "export-named-declaration" },
      { type: "list", elements: [convertNode(valueNode, logger)] },
      nameNode
    ]
  };
}