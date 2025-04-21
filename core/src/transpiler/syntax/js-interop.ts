// src/transpiler/syntax/js-interop.ts
// Module for handling JavaScript interop operations

import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode, LiteralNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError, perform } from "../../common/error-pipeline.ts";
import { convertIRExpr, execute, convertStringLiteral } from "../pipeline/hql-ir-to-ts-ast.ts";

export function convertInteropIIFE(node: IR.IRInteropIIFE): ts.Expression {
  return execute(node, "interop IIFE", () => {
    const objVar = ts.factory.createIdentifier("_obj");
    const memberVar = ts.factory.createIdentifier("_member");
    const statements: ts.Statement[] = [
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(objVar, undefined, undefined, convertIRExpr(node.object))],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            memberVar,
            undefined,
            undefined,
            ts.factory.createElementAccessExpression(objVar, convertStringLiteral(node.property))
          )],
          ts.NodeFlags.Const
        )
      ),
      ts.factory.createReturnStatement(
        ts.factory.createConditionalExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createTypeOfExpression(memberVar),
            ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
            ts.factory.createStringLiteral("function")
          ),
          ts.factory.createToken(ts.SyntaxKind.QuestionToken),
          ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(memberVar, "call"),
            undefined,
            [objVar]
          ),
          ts.factory.createToken(ts.SyntaxKind.ColonToken),
          memberVar
        )
      ),
    ];
    return ts.factory.createCallExpression(
      ts.factory.createParenthesizedExpression(
        ts.factory.createFunctionExpression(undefined, undefined, undefined, undefined, [], undefined, ts.factory.createBlock(statements, true))
      ),
      undefined,
      []
    );
  });
}

/**
 * Extract a string literal from a node.
 */
export function extractStringLiteral(node: any): string {
  return perform(
    () => {
      if (node.type === "literal") {
        return String((node as LiteralNode).value);
      }

      if (node.type === "list") {
        const theList = node as ListNode;
        if (
          theList.elements.length === 2 &&
          theList.elements[0].type === "symbol" &&
          (theList.elements[0] as SymbolNode).name === "quote" &&
          theList.elements[1].type === "literal"
        ) {
          return String((theList.elements[1] as LiteralNode).value);
        }
      }

      throw new ValidationError(
        `Expected string literal but got: ${node.type}`,
        "string literal extraction",
        "string literal or quoted literal",
        node.type,
      );
    },
    "extractStringLiteral",
    TransformError,
    [node],
  );
}

/**
 * Transform JavaScript imports
 */
export function transformJsImport(
  list: ListNode, 
  currentDir: string
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length === 3) {
        const nameNode = list.elements[1];
        if (nameNode.type !== "symbol") {
          throw new ValidationError(
            "js-import module name must be a symbol",
            "js-import",
            "symbol",
            nameNode.type,
          );
        }

        const name = (nameNode as SymbolNode).name;
        const source = extractStringLiteral(list.elements[2]);
        return {
          type: IR.IRNodeType.JsImportReference,
          name,
          source,
        } as IR.IRJsImportReference;
      } else if (list.elements.length === 2) {
        const source = extractStringLiteral(list.elements[1]);
        const moduleParts = source.split("/");
        let defaultName = moduleParts[moduleParts.length - 1].replace(
          /\.(js|ts|mjs|cjs)$/,
          "",
        );
        defaultName = defaultName.replace(/[^a-zA-Z0-9_$]/g, "_");

        return {
          type: IR.IRNodeType.JsImportReference,
          name: defaultName,
          source,
        } as IR.IRJsImportReference;
      }

      throw new ValidationError(
        `js-import requires 1 or 2 arguments, got ${list.elements.length - 1}`,
        "js-import",
        "1 or 2 arguments",
        `${list.elements.length - 1} arguments`,
      );
    },
    "transformJsImport",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript exports
 */
export function transformJsExport(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-export requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-export",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const exportName = extractStringLiteral(list.elements[1]);
      const safeExportName = exportName.replace(/[^a-zA-Z0-9_$]/g, "_");
      const value = transformNode(list.elements[2], currentDir);
      if (!value) {
        throw new ValidationError(
          "Exported value transformed to null",
          "js-export",
          "valid expression",
          "null",
        );
      }

      if (value.type === IR.IRNodeType.Identifier) {
        return {
          type: IR.IRNodeType.ExportNamedDeclaration,
          specifiers: [
            {
              type: IR.IRNodeType.ExportSpecifier,
              local: value as IR.IRIdentifier,
              exported: {
                type: IR.IRNodeType.Identifier,
                name: safeExportName,
              } as IR.IRIdentifier,
            },
          ],
        } as IR.IRExportNamedDeclaration;
      }

      const tempId: IR.IRIdentifier = {
        type: IR.IRNodeType.Identifier,
        name: `export_${safeExportName}`,
      };

      return {
        type: IR.IRNodeType.ExportVariableDeclaration,
        declaration: {
          type: IR.IRNodeType.VariableDeclaration,
          kind: "const",
          declarations: [
            {
              type: IR.IRNodeType.VariableDeclarator,
              id: tempId,
              init: value,
            },
          ],
        },
        exportName: safeExportName,
      } as IR.IRExportVariableDeclaration;
    },
    "transformJsExport",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript "new" expressions
 */
export function transformJsNew(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 2) {
        throw new ValidationError(
          "js-new requires a constructor and optional arguments",
          "js-new",
          "at least 1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const constructor = transformNode(list.elements[1], currentDir);
      if (!constructor) {
        throw new ValidationError(
          "Constructor transformed to null",
          "js-new",
          "valid constructor expression",
          "null",
        );
      }

      let args: IR.IRNode[] = [];
      if (list.elements.length > 2) {
        const argsNode = list.elements[2];
        if (argsNode.type !== "list") {
          throw new ValidationError(
            "js-new arguments must be a list",
            "js-new",
            "list",
            argsNode.type,
          );
        }
        args = (argsNode as ListNode).elements.map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-new argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });
      }

      return {
        type: IR.IRNodeType.NewExpression,
        callee: constructor,
        arguments: args,
      } as IR.IRNewExpression;
    },
    "transformJsNew",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript property access
 */
export function transformJsGet(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-get requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-get",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-get",
          "valid object expression",
          "null",
        );
      }

      try {
        const property = extractStringLiteral(list.elements[2]);
        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property: {
            type: IR.IRNodeType.StringLiteral,
            value: property,
          } as IR.IRStringLiteral,
          computed: true,
        } as IR.IRMemberExpression;
      } catch {
        const propExpr = transformNode(list.elements[2], currentDir);
        if (!propExpr) {
          throw new ValidationError(
            "Property transformed to null",
            "js-get",
            "valid property expression",
            "null",
          );
        }
        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property: propExpr,
          computed: true,
        } as IR.IRMemberExpression;
      }
    },
    "transformJsGet",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript method calls
 */
export function transformJsCall(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 3) {
        throw new ValidationError(
          `js-call requires at least 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-call",
          "at least 2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-call",
          "valid object expression",
          "null",
        );
      }

      try {
        // Check if the second argument is a string literal
        const method = extractStringLiteral(list.elements[2]);
        const args = list.elements.slice(3).map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-call argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });

        // Create a CallExpression that accesses the method via bracket notation
        return {
          type: IR.IRNodeType.CallExpression,
          callee: {
            type: IR.IRNodeType.MemberExpression,
            object: object,
            property: { type: IR.IRNodeType.StringLiteral, value: method },
            computed: true,
          },
          arguments: args,
        };
      } catch {
        // If the second argument isn't a string literal, handle it differently
        const methodExpr = transformNode(list.elements[2], currentDir);
        if (!methodExpr) {
          throw new ValidationError(
            "Method transformed to null",
            "js-call",
            "valid method expression",
            "null",
          );
        }

        const args = list.elements.slice(3).map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-call argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });

        // If the method is a MemberExpression (e.g. from js-get), use it directly
        if (methodExpr.type === IR.IRNodeType.MemberExpression) {
          return {
            type: IR.IRNodeType.CallExpression,
            callee: methodExpr,
            arguments: args,
          };
        } else {
          // Otherwise create a member expression
          return {
            type: IR.IRNodeType.CallExpression,
            callee: {
              type: IR.IRNodeType.MemberExpression,
              object: object,
              property: methodExpr,
              computed: true,
            },
            arguments: args,
          };
        }
      }
    },
    "transformJsCall",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript property setting
 */
export function transformJsSet(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 4) {
        throw new ValidationError(
          "js-set requires exactly 3 arguments: object, key, and value",
          "js-set",
          "3 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const obj = transformNode(list.elements[1], currentDir);
      const key = transformNode(list.elements[2], currentDir);
      const value = transformNode(list.elements[3], currentDir);

      if (!obj || !key || !value) {
        throw new ValidationError(
          "js-set arguments cannot be null",
          "js-set",
          "valid arguments",
          "null arguments",
        );
      }

      // Create a property assignment directly, not a function call
      return {
        type: IR.IRNodeType.AssignmentExpression,
        operator: "=",
        left: {
          type: IR.IRNodeType.MemberExpression,
          object: obj,
          property: key,
          computed: true,
        },
        right: value,
      };
    },
    "transformJsSet",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript property access with optional invocation
 */
export function transformJsGetInvoke(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-get-invoke requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-get-invoke",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-get-invoke",
          "valid object expression",
          "null",
        );
      }

      // Get the property name
      let propertyName: string;
      try {
        if (list.elements[2].type === "literal") {
          propertyName = String((list.elements[2] as LiteralNode).value);
        } else if (list.elements[2].type === "symbol") {
          propertyName = (list.elements[2] as SymbolNode).name;
        } else {
          throw new ValidationError(
            "js-get-invoke property must be a string literal or symbol",
            "js-get-invoke",
            "string literal or symbol",
            list.elements[2].type,
          );
        }
      } catch (err) {
        throw new ValidationError(
          `js-get-invoke property must be a string literal or symbol: ${
            err instanceof Error ? err.message : String(err)
          }`,
          "js-get-invoke",
          "string literal or symbol",
          "other expression type",
        );
      }

      // Create the IR node for the js-get-invoke operation
      // This transforms to an IIFE that checks if the property is a method at runtime
      return {
        type: IR.IRNodeType.InteropIIFE,
        object,
        property: {
          type: IR.IRNodeType.StringLiteral,
          value: propertyName,
        } as IR.IRStringLiteral,
      } as IR.IRInteropIIFE;
    },
    "transformJsGetInvoke",
    TransformError,
    [list],
  );
}

/**
 * Handle the special case for js-get-invoke.
 */
export function transformJsGetInvokeSpecialCase(
  list: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode | null {
  return perform(
    () => {
      if (
        list.elements.length === 3 &&
        list.elements[0].type === "symbol" &&
        (list.elements[0] as SymbolNode).name === "js-get-invoke"
      ) {
        const object = transformNode(list.elements[1], currentDir);
        if (!object) {
          throw new ValidationError(
            "Object expression in js-get-invoke resulted in null",
            "js-get-invoke",
            "valid object expression",
            "null",
          );
        }

        const property = transformNode(list.elements[2], currentDir);
        if (!property) {
          throw new ValidationError(
            "Property expression in js-get-invoke resulted in null",
            "js-get-invoke",
            "valid property expression",
            "null",
          );
        }

        if (property.type === IR.IRNodeType.StringLiteral) {
          return {
            type: IR.IRNodeType.MemberExpression,
            object,
            property: {
              type: IR.IRNodeType.Identifier,
              name: (property as IR.IRStringLiteral).value,
            } as IR.IRIdentifier,
            computed: false,
          } as IR.IRMemberExpression;
        }

        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property,
          computed: true,
        } as IR.IRMemberExpression;
      }
      return null;
    },
    "transformJsGetInvokeSpecialCase",
    TransformError,
    [list],
  );
}

/**
 * Check if a string represents dot notation (obj.prop)
 */
export function isDotNotation(op: string): boolean {
  return op.includes(".") && !op.startsWith("js/");
}

/**
 * Transform dot notation expressions to IR
 */
export function transformDotNotation(
  list: ListNode,
  op: string,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      const parts = op.split(".");
      const objectName = parts[0];
      const property = parts.slice(1).join(".");

      const objectExpr = {
        type: IR.IRNodeType.Identifier,
        name: objectName,
      } as IR.IRIdentifier;

      if (list.elements.length === 1) {
        return {
          type: IR.IRNodeType.MemberExpression,
          object: objectExpr,
          property: {
            type: IR.IRNodeType.Identifier,
            name: property,
          } as IR.IRIdentifier,
          computed: false,
        } as IR.IRMemberExpression;
      }

      const args = list.elements.slice(1).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Method argument transformed to null: ${JSON.stringify(arg)}`,
            "method argument",
            "valid argument expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.MemberExpression,
          object: objectExpr,
          property: {
            type: IR.IRNodeType.Identifier,
            name: property,
          } as IR.IRIdentifier,
          computed: false,
        } as IR.IRMemberExpression,
        arguments: args,
      } as IR.IRCallExpression;
    },
    `transformDotNotation '${op}'`,
    TransformError,
    [list],
  );
}