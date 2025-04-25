// src/transpiler/syntax/universal-access.ts
// Module for handling universal collection access across different data structures

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError, perform } from "../../common/error-pipeline.ts";
import { globalLogger as logger } from "../../logger.ts";
import { globalSymbolTable } from "../pipeline/syntax-transformer.ts";
import {
  createList,
  createSymbol,
  createLiteral,
  isSymbol
} from "../../s-exp/types.ts";

/**
 * Check if a list represents a collection access expression: (collection index)
 */
export function isCollectionAccess(list: ListNode): boolean {
  // Must have at least two elements: the collection and the index
  if (list.elements.length < 2) return false;
  
  // The first element must be a symbol (the collection name)
  if (!isSymbol(list.elements[0])) return false;
  
  // Get the symbol name
  const symbolName = (list.elements[0] as SymbolNode).name;
  
  // Check if this symbol is registered as a collection in the symbol table
  return globalSymbolTable.isCollection(symbolName);
}

/**
 * Transform collection access expressions like (collection index) to the appropriate access method
 * based on the collection type stored in the symbol table.
 */
export function transformCollectionAccess(
  list: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 2) {
        throw new ValidationError(
          "Collection access requires a collection and an index",
          "collection access",
          "collection and index",
          `${list.elements.length} elements`
        );
      }
      
      // The first element should be a symbol representing the collection
      const collectionSymbol = list.elements[0];
      if (!isSymbol(collectionSymbol)) {
        throw new ValidationError(
          "Collection should be a symbol",
          "collection access",
          "symbol",
          collectionSymbol.type
        );
      }
      
      const collectionName = (collectionSymbol as SymbolNode).name;
      
      // Get the access type from the symbol table
      const accessType = globalSymbolTable.getCollectionAccessType(collectionName);
      logger.debug(`Collection access for ${collectionName}: ${accessType}`);
      
      // Transform the index argument
      const indexArg = list.elements[1];
      
      // For a Set, we need a special runtime helper that combines Array.from and indexing
      if (accessType === 'has') {
        // Transform a set access like (my-set 2) into a runtime helper that
        // does the equivalent of Array.from(my-set)[2]
        return createList(
          createSymbol("js-call"),
          createList(
            createSymbol("js-call"),
            createSymbol("Array"),
            createLiteral("from"),
            collectionSymbol
          ),
          createLiteral("at"),  // Using .at() which will work with negative indices too
          indexArg
        );
      } 
      // For Maps, use .get
      else if (accessType === 'get') {
        return createList(
          createSymbol("js-call"),
          collectionSymbol,
          createLiteral("get"),
          indexArg
        );
      }
      // For Arrays and everything else, use standard indexing
      else {
        return createList(
          createSymbol("js-get"),
          collectionSymbol,
          indexArg
        );
      }
    },
    "transformCollectionAccess",
    TransformError,
    [list]
  );
}