// src/transpiler/syntax/data-structure.ts
// Module for handling data structure operations (vector, hash-map, etc.)

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode, LiteralNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError, perform } from "../../common/error.ts";
import { globalLogger as logger } from "../../logger.ts";
import { transformGet, createGetOperation } from "./get.ts";

// Export the get function to make it available through the module
export { transformGet, createGetOperation };

/**
 * Process elements in a vector, handling vector keyword and commas
 */
export function processVectorElements(elements: any[]): any[] {
  return perform(
    () => {
      let startIndex = 0;
      if (
        elements.length > 0 &&
        elements[0].type === "symbol" &&
        (elements[0] as SymbolNode).name === "vector"
      ) {
        startIndex = 1;
      }
      return elements.slice(startIndex).filter(
        (elem) =>
          !(elem.type === "symbol" && (elem as SymbolNode).name === ","),
      );
    },
    "processVectorElements",
    TransformError,
    [elements],
  );
}

/**
 * Transform vector literals
 */
export function transformVector(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      const elements = list.elements.slice(1).map((elem) => {
        const transformed = transformNode(elem, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Vector element transformed to null: ${JSON.stringify(elem)}`,
            "vector element",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements,
      } as IR.IRArrayExpression;
    },
    "transformVector",
    TransformError,
    [list],
  );
}

/**
 * Transform an empty list into an empty array expression.
 */
export function transformEmptyList(): IR.IRArrayExpression {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements: [],
      } as IR.IRArrayExpression;
    },
    "transformEmptyList",
    TransformError,
  );
}

/**
 * Transform empty array literals
 */
export function transformEmptyArray(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements: [],
      } as IR.IRArrayExpression;
    },
    "transformEmptyArray",
    TransformError,
  );
}

/**
 * Transform hash-map literals
 */
export function transformHashMap(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      const properties: IR.IRObjectProperty[] = [];
      const args = list.elements.slice(1);

      for (let i = 0; i < args.length; i += 2) {
        if (i + 1 >= args.length) {
          logger.warn(
            `Incomplete key-value pair in hash-map at index ${i}, skipping`,
          );
          break;
        }
        const keyNode = args[i];
        const valueNode = args[i + 1];

        let keyExpr: IR.IRNode;
        if (keyNode.type === "literal") {
          const val = (keyNode as LiteralNode).value;
          keyExpr = {
            type: IR.IRNodeType.StringLiteral,
            value: String(val),
          } as IR.IRStringLiteral;
        } else if (keyNode.type === "symbol") {
          keyExpr = {
            type: IR.IRNodeType.StringLiteral,
            value: (keyNode as SymbolNode).name,
          } as IR.IRStringLiteral;
        } else {
          const transformed = transformNode(keyNode, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Map key transformed to null: ${JSON.stringify(keyNode)}`,
              "hash-map key",
              "valid expression",
              "null",
            );
          }
          keyExpr = transformed;
        }

        const valueExpr = transformNode(valueNode, currentDir);
        if (!valueExpr) {
          throw new ValidationError(
            `Map value transformed to null: ${JSON.stringify(valueNode)}`,
            "hash-map value",
            "valid expression",
            "null",
          );
        }

        const objectProperty: IR.IRObjectProperty = {
          type: IR.IRNodeType.ObjectProperty,
          key: keyExpr,
          value: valueExpr,
        };
        properties.push(objectProperty);
      }

      return {
        type: IR.IRNodeType.ObjectExpression,
        properties,
      } as IR.IRObjectExpression;
    },
    "transformHashMap",
    TransformError,
    [list],
  );
}

/**
 * Transform empty map literals
 */
export function transformEmptyMap(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ObjectExpression,
        properties: [],
      } as IR.IRObjectExpression;
    },
    "transformEmptyMap",
    TransformError,
  );
}

/**
 * Transform hash-set literals
 */
export function transformHashSet(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      const elements = list.elements.slice(1).map((elem) => {
        const transformed = transformNode(elem, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Set element transformed to null: ${JSON.stringify(elem)}`,
            "hash-set element",
            "valid expression",
            "null",
          );
          }
          return transformed;
        });

      return {
        type: IR.IRNodeType.NewExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "Set",
        } as IR.IRIdentifier,
        arguments: [
          {
            type: IR.IRNodeType.ArrayExpression,
            elements,
          } as IR.IRArrayExpression,
        ],
      } as IR.IRNewExpression;
    },
    "transformHashSet",
    TransformError,
    [list],
  );
}

/**
 * Transform empty set literals
 */
export function transformEmptySet(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.NewExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "Set",
        } as IR.IRIdentifier,
        arguments: [],
      } as IR.IRNewExpression;
    },
    "transformEmptySet",
    TransformError,
  );
}

/**
 * Transform "new" constructor.
 */
export function transformNew(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 2) {
        throw new ValidationError(
          "'new' requires a constructor",
          "new constructor",
          "at least 1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const constructor = transformNode(list.elements[1], currentDir);
      if (!constructor) {
        throw new ValidationError(
          "Constructor transformed to null",
          "new constructor",
          "valid constructor expression",
          "null",
        );
      }

      const args = list.elements.slice(2).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Constructor argument transformed to null: ${JSON.stringify(arg)}`,
            "new constructor argument",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.NewExpression,
        callee: constructor,
        arguments: args,
      } as IR.IRNewExpression;
    },
    "transformNew",
    TransformError,
    [list],
  );
}

/**
 * Transform collection access syntax: (myList 2) => (get myList 2)
 * This handles accessing elements from collections like arrays, maps, and sets.
 */
export function transformCollectionAccess(
  list: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
  transformedCollection?: IR.IRNode
): IR.IRNode {
  return perform(
    () => {
      // Validate list has at least collection and index
      if (list.elements.length < 2) {
        throw new ValidationError(
          "Not enough elements for collection access",
          "collection access",
          "at least 2 elements (collection and index)",
          `${list.elements.length} elements`,
        );
      }

      // Use the provided transformed collection if available, otherwise transform it
      const collection = transformedCollection || transformNode(list.elements[0], currentDir);
      if (!collection) {
        throw new ValidationError(
          "Collection transformed to null",
          "collection access",
          "valid collection expression",
          "null",
        );
      }

      const index = transformNode(list.elements[1], currentDir);
      if (!index) {
        throw new ValidationError(
          "Index transformed to null",
          "collection access",
          "valid index expression",
          "null",
        );
      }

      // Specific handling for different collection types
      
      // For sets, use the 'has' method if we're checking for existence
      if (collection.type === IR.IRNodeType.NewExpression) {
        const callee = (collection as IR.IRNewExpression).callee;
        if (callee.type === IR.IRNodeType.Identifier && 
            (callee as IR.IRIdentifier).name === "Set") {
          // For Set objects, convert (mySet 2) to (mySet.has(2))
          return {
            type: IR.IRNodeType.CallExpression,
            callee: {
              type: IR.IRNodeType.MemberExpression,
              object: collection,
              property: {
                type: IR.IRNodeType.Identifier,
                name: "has",
              } as IR.IRIdentifier,
              computed: false,
            } as IR.IRMemberExpression,
            arguments: [index],
          } as IR.IRCallExpression;
        }
      }

      // Use our createGetOperation function to create a get call
      return createGetOperation(collection, index);
    },
    "transformCollectionAccess",
    TransformError,
    [list],
  );
}