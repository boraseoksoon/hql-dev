// src/transpiler/syntax/get.ts
// Module for handling get operations that replace the runtime get function

import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { ListNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError, perform } from "../../common/error-pipeline.ts";
import { convertIRExpr, execute } from "../pipeline/hql-ir-to-ts-ast.ts";
import { globalLogger as logger } from "../../logger.ts";

/**
 * Transform collection 'get' operation to IR.
 * This is the entry point from hql-ast-to-hql-ir.ts
 */
export function transformGet(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          "get operation requires a collection and an index/key",
          "get operation",
          "2 arguments (collection, index/key)",
          `${list.elements.length - 1} arguments`,
        );
      }

      const collection = transformNode(list.elements[1], currentDir);
      if (!collection) {
        throw new ValidationError(
          "Collection transformed to null",
          "get operation",
          "valid collection expression",
          "null",
        );
      }

      const index = transformNode(list.elements[2], currentDir);
      if (!index) {
        throw new ValidationError(
          "Index transformed to null",
          "get operation",
          "valid index expression",
          "null",
        );
      }

      // Create the IR node for a get operation
      return createGetOperation(collection, index);
    },
    "transformGet",
    TransformError,
    [list],
  );
}

/**
 * Create a special node to represent a get operation
 * This will be transformed into appropriate TypeScript during code generation
 */
export function createGetOperation(
    collection: IR.IRNode,
    key: IR.IRNode,
  ): IR.IRNode {
    return {
      type: IR.IRNodeType.MemberExpression,
      object: collection,
      property: key,
      computed: true,
    } as IR.IRMemberExpression;
  }


/**
 * Convert a get() call directly to property access or function call
 * This simplifies the approach by analyzing the object and key at compile time
 * when possible, and falling back to runtime checks when needed
 */
export function convertGetCallExpression(
    node: IR.IRCallExpression
  ): ts.Expression {
    console.log("convertGetCallExpression!!")
    return execute(node, "get call expression", () => {
      // Make sure this is actually a get call
      if (node.callee.type !== IR.IRNodeType.Identifier || 
          (node.callee as IR.IRIdentifier).name !== "get") {
        throw new Error("Not a get call expression");
      }
      
      // Extract the arguments
      const args = node.arguments;
      if (args.length < 2) {
        logger.warn("get call with insufficient arguments", args.length);
        return ts.factory.createIdentifier("undefined");
      }
      
      // Extract object and key
      const objArg = args[0];
      const keyArg = args[1];
      const obj = convertIRExpr(objArg);
      const key = convertIRExpr(keyArg);
      
      // Get the default value (null if not provided)
      const notFound = args.length > 2 
        ? convertIRExpr(args[2])
        : ts.factory.createNull();
      
      // If the key is a string literal, we can statically determine if this should be
      // property access or not in many cases
      if (keyArg.type === IR.IRNodeType.StringLiteral) {
        const keyValue = (keyArg as IR.IRStringLiteral).value;
        
        // For object access with string literal key, generate direct property access
        return ts.factory.createElementAccessExpression(obj, ts.factory.createStringLiteral(keyValue));
      }
      
      // For numeric literals, also use direct property access
      if (keyArg.type === IR.IRNodeType.NumericLiteral) {
        const keyValue = (keyArg as IR.IRNumericLiteral).value;
        return ts.factory.createElementAccessExpression(obj, ts.factory.createNumericLiteral(keyValue));
      }
      
      // For other cases where we can't statically determine the right approach,
      // use a conditional at runtime to choose between property access and function call
      
      // Generate a conditional expression that checks if the object is a function
      // and if so, calls it with the key; otherwise accesses the property
      return ts.factory.createConditionalExpression(
        // Condition: typeof obj === "function"
        ts.factory.createBinaryExpression(
          ts.factory.createTypeOfExpression(obj),
          ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
          ts.factory.createStringLiteral("function")
        ),
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        // Then: obj(key) - function call
        ts.factory.createCallExpression(obj, undefined, [key]),
        ts.factory.createToken(ts.SyntaxKind.ColonToken),
        // Else: obj[key] - property access
        ts.factory.createElementAccessExpression(obj, key)
      );
    });
  }