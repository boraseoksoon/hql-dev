import * as ts from "npm:typescript@^5.0.0";
import * as IR from "../type/hql_ir.ts";
import { sanitizeIdentifier } from "../../common/utils.ts";
import { CodeGenError } from "../../common/error.ts";
import { globalLogger as logger } from "../../logger.ts";
import { convertEnumDeclarationToJsObject } from "../syntax/enum.ts";
import { convertClassDeclaration, convertNewExpression } from "../syntax/class.ts";
import { convertConditionalExpression, convertIfStatement } from "../syntax/conditional.ts";
import { convertCallExpression, convertMemberExpression, convertCallMemberExpression } from "../syntax/class.ts";
import { createExpressionStatement, expressionStatement, convertExpressionStatement } from "../syntax/expression.ts";
import { convertBinaryExpression, convertUnaryExpression, convertAssignmentExpression } from "../syntax/operators.ts";
import { convertFunctionDeclaration, convertFxFunctionDeclaration, convertFnFunctionDeclaration, convertFunctionExpression } from "../syntax/function.ts";
import { convertImportDeclaration, convertExportNamedDeclaration, convertExportVariableDeclaration, convertJsImportReference } from "../syntax/import-export.ts";
import { convertInteropIIFE } from "../syntax/js-interop.ts";
import { isExpressionNode } from "../syntax/expression.ts";
import { convertGetCallExpression, convertNumericCallExpression } from "../syntax/get.ts";

export function convertIRExpr(node: IR.IRNode): ts.Expression {
  return execute(node, "IR expression", () => {
    switch (node.type) {
      case IR.IRNodeType.JsMethodAccess:
  return convertJsMethodAccess(node as IR.IRJsMethodAccess);
      case IR.IRNodeType.ObjectExpression:
        return convertObjectExpression(node as IR.IRObjectExpression);
      case IR.IRNodeType.StringLiteral:
        return convertStringLiteral(node as IR.IRStringLiteral);
      case IR.IRNodeType.NumericLiteral:
        return convertNumericLiteral(node as IR.IRNumericLiteral);
      case IR.IRNodeType.BooleanLiteral:
        return convertBooleanLiteral(node as IR.IRBooleanLiteral);
      case IR.IRNodeType.NullLiteral:
        return convertNullLiteral();
      case IR.IRNodeType.Identifier:
        return convertIdentifier(node as IR.IRIdentifier);
      case IR.IRNodeType.CallExpression: {
        const callExpr = node as IR.IRCallExpression;
        if (callExpr.callee.type === IR.IRNodeType.Identifier) {
          const calleeName = (callExpr.callee as IR.IRIdentifier).name;
          // Don't convert get() calls - let them be runtime calls
          // The runtime get() function will handle both property access and function calls
          if (calleeName === "getNumeric") {
            return convertNumericCallExpression(callExpr);
          }
        }
        return convertCallExpression(callExpr);
      }
      case IR.IRNodeType.MemberExpression:
        return convertMemberExpression(node as IR.IRMemberExpression);
      case IR.IRNodeType.CallMemberExpression:
        return convertCallMemberExpression(node as IR.IRCallMemberExpression);
      case IR.IRNodeType.NewExpression:
        return convertNewExpression(node as IR.IRNewExpression);
      case IR.IRNodeType.BinaryExpression:
        return convertBinaryExpression(node as IR.IRBinaryExpression);
      case IR.IRNodeType.UnaryExpression:
        return convertUnaryExpression(node as IR.IRUnaryExpression);
      case IR.IRNodeType.ConditionalExpression:
        return convertConditionalExpression(node as IR.IRConditionalExpression);
      case IR.IRNodeType.ArrayExpression:
        return convertArrayExpression(node as IR.IRArrayExpression);
      case IR.IRNodeType.FunctionExpression:
        return convertFunctionExpression(node as IR.IRFunctionExpression);
      case IR.IRNodeType.InteropIIFE:
        return convertInteropIIFE(node as IR.IRInteropIIFE);
      case IR.IRNodeType.AssignmentExpression:
        return convertAssignmentExpression(node as IR.IRAssignmentExpression);
      case IR.IRNodeType.GetAndCall:
        return convertGetAndCall(node as IR.IRGetAndCall);
      case IR.IRNodeType.ReturnStatement: {
        const irReturn = node as IR.IRReturnStatement;
        return ts.factory.createCallExpression(
          ts.factory.createParenthesizedExpression(
            ts.factory.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              irReturn.argument ? convertIRExpr(irReturn.argument) : ts.factory.createIdentifier("undefined")
            )
          ),
          undefined,
          []
        );
      }
      default:
        throw new CodeGenError(
          `Cannot convert node of type ${IR.IRNodeType[node.type] || node.type} to expression`,
          `IR node ${IR.IRNodeType[node.type] || node.type}`,
          node
        );
    }
  });
}

export function convertIRNode(
  node: IR.IRNode,
): ts.Statement | ts.Statement[] | null {
  return execute(node, "IR node", () => {
    if (!node) {
      throw new CodeGenError(
        "Cannot convert null or undefined node to TS AST",
        "unknown node type",
        node,
      );
    }
    logger.debug(`Converting IR node of type ${IR.IRNodeType[node.type]}`);
    switch (node.type) {
      case IR.IRNodeType.ObjectExpression:
        return expressionStatement(node as IR.IRObjectExpression, convertObjectExpression);
      case IR.IRNodeType.StringLiteral:
        return expressionStatement(node as IR.IRStringLiteral, convertStringLiteral);
      case IR.IRNodeType.NumericLiteral:
        return expressionStatement(node as IR.IRNumericLiteral, convertNumericLiteral);
      case IR.IRNodeType.BooleanLiteral:
        return expressionStatement(node as IR.IRBooleanLiteral, convertBooleanLiteral);
      case IR.IRNodeType.NullLiteral:
        return createExpressionStatement(convertNullLiteral());
      case IR.IRNodeType.Identifier:
        return expressionStatement(node as IR.IRIdentifier, convertIdentifier);
      case IR.IRNodeType.CallExpression:
        return expressionStatement(node as IR.IRCallExpression, convertCallExpression);
      case IR.IRNodeType.MemberExpression:
        return expressionStatement(node as IR.IRMemberExpression, convertMemberExpression);
      case IR.IRNodeType.CallMemberExpression:
        return expressionStatement(node as IR.IRCallMemberExpression, convertCallMemberExpression);
      case IR.IRNodeType.NewExpression:
        return expressionStatement(node as IR.IRNewExpression, convertNewExpression);
      case IR.IRNodeType.BinaryExpression:
        return expressionStatement(node as IR.IRBinaryExpression, convertBinaryExpression);
      case IR.IRNodeType.UnaryExpression:
        return expressionStatement(node as IR.IRUnaryExpression, convertUnaryExpression);
      case IR.IRNodeType.ConditionalExpression:
        return expressionStatement(node as IR.IRConditionalExpression, convertConditionalExpression);
      case IR.IRNodeType.ArrayExpression:
        return expressionStatement(node as IR.IRArrayExpression, convertArrayExpression);
      case IR.IRNodeType.FunctionExpression:
        return expressionStatement(node as IR.IRFunctionExpression, convertFunctionExpression);
      case IR.IRNodeType.VariableDeclaration:
        return convertVariableDeclaration(node as IR.IRVariableDeclaration);
      case IR.IRNodeType.FunctionDeclaration:
        return convertFunctionDeclaration(node as IR.IRFunctionDeclaration);
      case IR.IRNodeType.IfStatement:
        return convertIfStatement(node as IR.IRIfStatement);
      case IR.IRNodeType.BlockStatement:
        return convertBlockStatement(node as IR.IRBlockStatement);
      case IR.IRNodeType.ImportDeclaration:
        return convertImportDeclaration(node as IR.IRImportDeclaration);
      case IR.IRNodeType.ExportNamedDeclaration:
        return convertExportNamedDeclaration(node as IR.IRExportNamedDeclaration);
      case IR.IRNodeType.ExportVariableDeclaration:
        return convertExportVariableDeclaration(node as IR.IRExportVariableDeclaration);
      case IR.IRNodeType.InteropIIFE:
        return expressionStatement(node as IR.IRInteropIIFE, convertInteropIIFE);
      case IR.IRNodeType.AssignmentExpression:
        return expressionStatement(node as IR.IRAssignmentExpression, convertAssignmentExpression);
      case IR.IRNodeType.JsImportReference:
        return convertJsImportReference(node as IR.IRJsImportReference);
      case IR.IRNodeType.CommentBlock:
        return convertCommentBlock(node as IR.IRCommentBlock);
      case IR.IRNodeType.Raw:
        return convertRaw(node as IR.IRRaw);
      case IR.IRNodeType.ExpressionStatement:
        return convertExpressionStatement(node as IR.IRExpressionStatement);
      case IR.IRNodeType.FxFunctionDeclaration:
        return convertFxFunctionDeclaration(node as IR.IRFxFunctionDeclaration);
      case IR.IRNodeType.FnFunctionDeclaration:
        return convertFnFunctionDeclaration(node as IR.IRFnFunctionDeclaration);
      case IR.IRNodeType.ReturnStatement:
        return convertReturnStatement(node as IR.IRReturnStatement);
      case IR.IRNodeType.ClassDeclaration:
        return convertClassDeclaration(node as IR.IRClassDeclaration);
      case IR.IRNodeType.GetAndCall:
        return expressionStatement(node as IR.IRGetAndCall, convertGetAndCall);
      case IR.IRNodeType.EnumDeclaration:
        return convertEnumDeclarationToJsObject(node as IR.IREnumDeclaration);
      case IR.IRNodeType.EnumCase:
        logger.warn(`EnumCase node encountered outside EnumDeclaration. This should not happen.`);
        return null;
      default:
        logger.warn(
          `Cannot convert node of type ${node.type} (${IR.IRNodeType[node.type]}) to expression`
        );
        throw new CodeGenError(
          `Unsupported IR node type: ${IR.IRNodeType[node.type] || node.type}`,
          `IR node ${IR.IRNodeType[node.type] || node.type}`,
          node,
        );
    }
  });
}

/**
 * Convert a JsMethodAccess node to a TypeScript expression
 * This handles the runtime check to see if a property is a method that should be called
 */
export function convertJsMethodAccess(node: IR.IRJsMethodAccess): ts.Expression {
  return execute(node, "js method access", () => {
    const object = convertIRExpr(node.object);
    const methodName = node.method;
    
    // Create property access or element access based on method name
    let propertyAccess: ts.Expression;
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(methodName)) {
      // Valid identifier - use property access
      propertyAccess = ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier("_obj"),
        methodName
      );
    } else {
      // Not a valid identifier - use element access
      propertyAccess = ts.factory.createElementAccessExpression(
        ts.factory.createIdentifier("_obj"),
        ts.factory.createStringLiteral(methodName)
      );
    }
    
    // Generate an IIFE that checks if the property is a function and calls it if so
    return ts.factory.createCallExpression(
      ts.factory.createParenthesizedExpression(
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock([
            // Create temporary variable _obj to hold the object
            ts.factory.createVariableStatement(
              undefined,
              ts.factory.createVariableDeclarationList(
                [ts.factory.createVariableDeclaration(
                  ts.factory.createIdentifier("_obj"),
                  undefined,
                  undefined,
                  object
                )],
                ts.NodeFlags.Const
              )
            ),
            // Create temporary variable _prop to hold the property/method
            ts.factory.createVariableStatement(
              undefined,
              ts.factory.createVariableDeclarationList(
                [ts.factory.createVariableDeclaration(
                  ts.factory.createIdentifier("_prop"),
                  undefined,
                  undefined,
                  propertyAccess
                )],
                ts.NodeFlags.Const
              )
            ),
            // Return the result based on runtime type check
            ts.factory.createReturnStatement(
              ts.factory.createConditionalExpression(
                ts.factory.createBinaryExpression(
                  ts.factory.createTypeOfExpression(ts.factory.createIdentifier("_prop")),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  ts.factory.createStringLiteral("function")
                ),
                ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                // If it's a function, call it with the object as 'this'
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("_prop"),
                    ts.factory.createIdentifier("call")
                  ),
                  undefined,
                  [ts.factory.createIdentifier("_obj")]
                ),
                ts.factory.createToken(ts.SyntaxKind.ColonToken),
                // If it's not a function, just return the property value
                ts.factory.createIdentifier("_prop")
              )
            )
          ], true)
        )
      ),
      undefined,
      []
    );
  });
}

export function convertObjectExpression(node: IR.IRObjectExpression): ts.ObjectLiteralExpression {
  return execute(node, "object expression", () => {
    const objectProperties: ts.ObjectLiteralElementLike[] = node.properties.map(prop => {
      if (prop.type === IR.IRNodeType.ObjectProperty) {
        return ts.factory.createPropertyAssignment(
          convertObjectPropertyKey(prop.key),
          convertIRExpr(prop.value)
        );
      } else if (prop.type === IR.IRNodeType.SpreadAssignment) {
        return ts.factory.createSpreadAssignment(convertIRExpr(prop.expression));
      }
      throw new CodeGenError("Unsupported property type in object expression", "object expression", prop);
    });
    return ts.factory.createObjectLiteralExpression(objectProperties, true);
  });
}

export function convertObjectPropertyKey(node: IR.IRNode): ts.PropertyName {
  return execute(node, "property key conversion", () => {
    switch (node.type) {
      case IR.IRNodeType.StringLiteral: {
        const literal = node as IR.IRStringLiteral;
        return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(literal.value)
          ? ts.factory.createIdentifier(literal.value)
          : ts.factory.createStringLiteral(literal.value);
      }
      case IR.IRNodeType.Identifier:
        return ts.factory.createIdentifier((node as IR.IRIdentifier).name);
      default:
        return ts.factory.createComputedPropertyName(convertIRExpr(node));
    }
  });
}

export function convertStringLiteral(node: IR.IRStringLiteral): ts.StringLiteral {
  return execute(node, "string literal", () =>
    ts.factory.createStringLiteral(node.value)
  );
}

export function convertNumericLiteral(node: IR.IRNumericLiteral): ts.Expression {
  return execute(node, "numeric literal", () =>
    node.value < 0
      ? ts.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          ts.factory.createNumericLiteral(Math.abs(node.value).toString())
        )
      : ts.factory.createNumericLiteral(node.value.toString())
  );
}

export function convertBooleanLiteral(node: IR.IRBooleanLiteral): ts.BooleanLiteral {
  return execute(node, "boolean literal", () =>
    node.value ? ts.factory.createTrue() : ts.factory.createFalse()
  );
}

export function convertNullLiteral(): ts.NullLiteral {
  return execute({ type: "NullLiteral" }, "null literal", () =>
    ts.factory.createNull()
  );
}

export function convertIdentifier(node: IR.IRIdentifier): ts.Identifier {
  return execute(node, "identifier", () =>
    ts.factory.createIdentifier(sanitizeIdentifier(node.name))
  );
}

export function convertArrayExpression(node: IR.IRArrayExpression): ts.ArrayLiteralExpression {
  return execute(node, "array expression", () =>
    ts.factory.createArrayLiteralExpression(node.elements.map(elem => convertIRExpr(elem)), false)
  );
}

export function convertVariableDeclaration(node: IR.IRVariableDeclaration): ts.VariableStatement {
  return execute(node, "variable declaration", () => {
    const declarations = node.declarations.map(decl =>
      ts.factory.createVariableDeclaration(
        convertIdentifier(decl.id),
        undefined,
        undefined,
        convertIRExpr(decl.init)
      )
    );
    let flags: ts.NodeFlags | undefined;
    switch (node.kind) {
      case "const":
        flags = ts.NodeFlags.Const;
        break;
      case "let":
        flags = ts.NodeFlags.Let;
        break;
      case "var":
      default:
        flags = undefined;
    }
    return ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(declarations, flags)
    );
  });
}

export function convertReturnStatement(node: IR.IRReturnStatement): ts.ReturnStatement {
  return execute(node, "return statement", () =>
    ts.factory.createReturnStatement(node.argument ? convertIRExpr(node.argument) : undefined)
  );
}

export function convertBlockStatement(node: IR.IRBlockStatement): ts.Block {
  return execute(node, "block statement", () => {
    const statements: ts.Statement[] = [];
    for (let i = 0; i < node.body.length; i++) {
      const stmt = node.body[i];
      if (stmt.type === IR.IRNodeType.ReturnStatement) {
        statements.push(convertReturnStatement(stmt as IR.IRReturnStatement));
        break;
      } else {
        const converted = convertIRNode(stmt);
        if (Array.isArray(converted)) {
          statements.push(...converted);
        } else if (converted) {
          statements.push(converted);
        }
      }
    }
    if (
      statements.length === 0 ||
      !ts.isReturnStatement(statements[statements.length - 1])
    ) {
      if (node.body.length > 0 && isExpressionNode(node.body[node.body.length - 1])) {
        statements.push(ts.factory.createReturnStatement(convertIRExpr(node.body[node.body.length - 1])));
      }
    }
    const filteredStatements = statements.filter(statement => {
      if (
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression)
      ) {
        const callExpr = statement.expression;
        if (
          ts.isIdentifier(callExpr.expression) &&
          callExpr.expression.text === "get" &&
          callExpr.arguments.length === 2 &&
          ts.isIdentifier(callExpr.arguments[0]) &&
          callExpr.arguments[0].text === "_"
        ) {
          return false;
        }
      }
      return true;
    });
    return ts.factory.createBlock(filteredStatements, true);
  });
}

export function convertCommentBlock(node: IR.IRCommentBlock): ts.EmptyStatement {
  return execute(node, "comment block", () => {
    const statement = ts.factory.createEmptyStatement();
    ts.addSyntheticLeadingComment(
      statement,
      ts.SyntaxKind.MultiLineCommentTrivia,
      node.value,
      true
    );
    return statement;
  });
}

export function convertRaw(node: IR.IRRaw): ts.ExpressionStatement {
  return execute(node, "raw code", () =>
    ts.factory.createExpressionStatement(ts.factory.createIdentifier(node.code))
  );
}

export function convertGetAndCall(node: IR.IRGetAndCall): ts.Expression {
  return execute(node, "GetAndCall", () => {
    const object = convertIRExpr(node.object);
    const methodName = node.method.value;
    const args = node.arguments.map(arg => convertIRExpr(arg));
    return ts.factory.createCallExpression(
      ts.factory.createParenthesizedExpression(
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock([
            ts.factory.createVariableStatement(
              undefined,
              ts.factory.createVariableDeclarationList(
                [
                  ts.factory.createVariableDeclaration(
                    ts.factory.createIdentifier("_obj"),
                    undefined,
                    undefined,
                    object
                  )
                ],
                ts.NodeFlags.Const
              )
            ),
            ts.factory.createVariableStatement(
              undefined,
              ts.factory.createVariableDeclarationList(
                [
                  ts.factory.createVariableDeclaration(
                    ts.factory.createIdentifier("_method"),
                    undefined,
                    undefined,
                    ts.factory.createCallExpression(
                      ts.factory.createIdentifier("get"),
                      undefined,
                      [
                        ts.factory.createIdentifier("_obj"),
                        ts.factory.createStringLiteral(methodName)
                      ]
                    )
                  )
                ],
                ts.NodeFlags.Const
              )
            ),
            ts.factory.createReturnStatement(
              ts.factory.createConditionalExpression(
                ts.factory.createBinaryExpression(
                  ts.factory.createTypeOfExpression(
                    ts.factory.createIdentifier("_method")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  ts.factory.createStringLiteral("function")
                ),
                ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("_method"),
                    ts.factory.createIdentifier("call")
                  ),
                  undefined,
                  [ts.factory.createIdentifier("_obj"), ...args]
                ),
                ts.factory.createToken(ts.SyntaxKind.ColonToken),
                ts.factory.createIdentifier("_method")
              )
            )
          ], true)
        )
      ),
      undefined,
      []
    );
  });
}

export function execute<T>(node: IR.IRNode | any, context: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CodeGenError) throw error;
    throw new CodeGenError(
      `Failed to convert ${context}: ${error instanceof Error ? error.message : String(error)}`,
      context,
      node,
    );
  }
}