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
 * Create a special node to represent a numeric access/call operation
 * This will attempt array indexing first, then fall back to function call if that returns undefined
 */
export function createNumericAccessOperation(
    collection: IR.IRNode,
    key: IR.IRNode,
  ): IR.IRNode {
    // Create a call to getNumeric helper function
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: "getNumeric"
      } as IR.IRIdentifier,
      arguments: [collection, key]
    } as IR.IRCallExpression;
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
    });
  }

/**
 * Convert a getNumeric() call to a runtime helper that tries array access first, then function call
 * This resolves the ambiguity between array indexing and function calls at runtime
 */
export function convertNumericCallExpression(
    node: IR.IRCallExpression
  ): ts.Expression {
    return execute(node, "numeric access/call expression", () => {
      // Make sure this is actually a getNumeric call
      if (node.callee.type !== IR.IRNodeType.Identifier || 
          (node.callee as IR.IRIdentifier).name !== "getNumeric") {
        throw new Error("Not a getNumeric call expression");
      }
      
      // Extract the arguments
      const args = node.arguments;
      if (args.length < 2) {
        logger.warn("getNumeric call with insufficient arguments", args.length);
        return ts.factory.createIdentifier("undefined");
      }
      
      // Extract object and key
      const objArg = args[0];
      const keyArg = args[1];
      const obj = convertIRExpr(objArg);
      const key = convertIRExpr(keyArg);
      
      // Generate runtime code that tries array indexing first, then function call
      // (o, k) => { try { const result = o[k]; return result !== undefined ? result : o(k); } catch { return o(k); } }
      return ts.factory.createCallExpression(
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock([
            // Try to use array indexing first
            ts.factory.createTryStatement(
              ts.factory.createBlock([
                // const result = o[k];
                ts.factory.createVariableStatement(
                  undefined,
                  ts.factory.createVariableDeclarationList(
                    [ts.factory.createVariableDeclaration(
                      "result",
                      undefined,
                      undefined,
                      ts.factory.createElementAccessExpression(obj, key)
                    )],
                    ts.NodeFlags.Const
                  )
                ),
                // return result !== undefined ? result : o(k);
                ts.factory.createReturnStatement(
                  ts.factory.createConditionalExpression(
                    ts.factory.createBinaryExpression(
                      ts.factory.createIdentifier("result"),
                      ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                      ts.factory.createIdentifier("undefined")
                    ),
                    ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                    ts.factory.createIdentifier("result"),
                    ts.factory.createToken(ts.SyntaxKind.ColonToken),
                    ts.factory.createCallExpression(obj, undefined, [key])
                  )
                )
              ]),
              ts.factory.createCatchClause(
                ts.factory.createVariableDeclaration("_", undefined, undefined, undefined),
                ts.factory.createBlock([
                  // If array access fails, try function call
                  ts.factory.createReturnStatement(
                    ts.factory.createCallExpression(obj, undefined, [key])
                  )
                ])
              ),
              undefined
            )
          ], true)
        ),
        undefined,
        []
      );
    });
  }
