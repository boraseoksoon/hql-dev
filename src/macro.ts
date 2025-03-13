// src/macro.ts - Connector to the macro system with backward compatibility

import { HQLNode } from "./transpiler/hql_ast.ts";
import { expandMacros as internalExpandMacros } from "./macro-expander.ts";

/**
 * Public API for expanding macros in HQL AST nodes.
 * Supports both returning a single node and an array of nodes for backward compatibility.
 */
export async function expandMacros(node: HQLNode | HQLNode[]): Promise<HQLNode | HQLNode[]> {
  try {
    // Handle arrays vs single nodes
    if (Array.isArray(node)) {
      // If input is an array, return an array
      return await internalExpandMacros(node);
    }
    
    // For single nodes, handle the case where caller expects a single node back
    const expanded = await internalExpandMacros([node]);
    
    // Return the array if there are multiple nodes, otherwise return the first node
    // This ensures backward compatibility with code expecting a single node
    return expanded.length > 1 ? expanded : expanded[0];
  } catch (error) {
    console.error("Error in macro expansion:", error);
    throw error;
  }
}