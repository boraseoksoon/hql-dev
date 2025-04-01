// src/transpiler/hql-ir-to-ts-ast.ts - Updated to generate JS enum simulation
import * as ts from "npm:typescript";
import * as IR from "./hql_ir.ts";
import { sanitizeIdentifier } from "../utils.ts";
import { CodeGenError } from "./errors.ts";
import { Logger } from "../logger.ts";

// Initialize logger for this module
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Helper that wraps conversion code with a try–catch to throw a standardized CodeGenError.
 */
function execute<T>(node: IR.IRNode | any, context: string, fn: () => T): T {
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

/**
 * Helper to create an expression statement.
 */
function createExpressionStatement(expr: ts.Expression): ts.ExpressionStatement {
  return execute(expr, "expression statement creation", () =>
    ts.factory.createExpressionStatement(expr)
  );
}

/**
 * Main entry point: Convert an IR node to a TypeScript AST statement.
 */
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
        return createExpressionStatement(convertObjectExpression(node as IR.IRObjectExpression));
      case IR.IRNodeType.StringLiteral:
        return createExpressionStatement(convertStringLiteral(node as IR.IRStringLiteral));
      case IR.IRNodeType.NumericLiteral:
        return createExpressionStatement(convertNumericLiteral(node as IR.IRNumericLiteral));
      case IR.IRNodeType.BooleanLiteral:
        return createExpressionStatement(convertBooleanLiteral(node as IR.IRBooleanLiteral));
      case IR.IRNodeType.NullLiteral:
        return createExpressionStatement(convertNullLiteral());
      case IR.IRNodeType.Identifier:
        return createExpressionStatement(convertIdentifier(node as IR.IRIdentifier));
      case IR.IRNodeType.CallExpression:
        return createExpressionStatement(convertCallExpression(node as IR.IRCallExpression));
      case IR.IRNodeType.MemberExpression:
        return createExpressionStatement(convertMemberExpression(node as IR.IRMemberExpression));
      case IR.IRNodeType.CallMemberExpression:
        return createExpressionStatement(convertCallMemberExpression(node as IR.IRCallMemberExpression));
      case IR.IRNodeType.NewExpression:
        return createExpressionStatement(convertNewExpression(node as IR.IRNewExpression));
      case IR.IRNodeType.BinaryExpression:
        return createExpressionStatement(convertBinaryExpression(node as IR.IRBinaryExpression));
      case IR.IRNodeType.UnaryExpression:
        return createExpressionStatement(convertUnaryExpression(node as IR.IRUnaryExpression));
      case IR.IRNodeType.ConditionalExpression:
        return createExpressionStatement(convertConditionalExpression(node as IR.IRConditionalExpression));
      case IR.IRNodeType.ArrayExpression:
        return createExpressionStatement(convertArrayExpression(node as IR.IRArrayExpression));
      case IR.IRNodeType.FunctionExpression:
        return createExpressionStatement(convertFunctionExpression(node as IR.IRFunctionExpression));
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
        return createExpressionStatement(convertInteropIIFE(node as IR.IRInteropIIFE));
      case IR.IRNodeType.AssignmentExpression:
        return createExpressionStatement(convertAssignmentExpression(node as IR.IRAssignmentExpression));
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
        return createExpressionStatement(convertGetAndCall(node as IR.IRGetAndCall));
      // Enum handling (UPDATED)
      case IR.IRNodeType.EnumDeclaration:
        // Convert IREnumDeclaration to a JS object simulation (const Enum = Object.freeze({...}))
        return convertEnumDeclarationToJsObject(node as IR.IREnumDeclaration);
      // Enum cases are handled within EnumDeclaration, so they don't produce top-level statements.
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

/* ────────────── Statement Converters ────────────── */

export function convertIfStatement(node: IR.IRIfStatement): ts.IfStatement {
  return execute(node, "if statement", () => {
    const test = convertIRExpr(node.test);
    const consequentStatement =
      node.consequent.type === IR.IRNodeType.ReturnStatement
        ? convertReturnStatement(node.consequent as IR.IRReturnStatement)
        : node.consequent.type === IR.IRNodeType.BlockStatement
          ? convertBlockStatement(node.consequent as IR.IRBlockStatement)
          : ts.factory.createExpressionStatement(convertIRExpr(node.consequent));
    let alternateStatement: ts.Statement | undefined;
    if (node.alternate) {
      alternateStatement =
        node.alternate.type === IR.IRNodeType.ReturnStatement
          ? convertReturnStatement(node.alternate as IR.IRReturnStatement)
          : node.alternate.type === IR.IRNodeType.BlockStatement
            ? convertBlockStatement(node.alternate as IR.IRBlockStatement)
            : ts.factory.createExpressionStatement(convertIRExpr(node.alternate));
    }
    return ts.factory.createIfStatement(test, consequentStatement, alternateStatement);
  });
}

export function convertFnFunctionDeclaration(
  node: IR.IRFnFunctionDeclaration,
): ts.FunctionDeclaration {
  return execute(node, "fn function declaration", () => {
    const parameters = node.params.map(param => {
      const paramName = param.name;
      return paramName.startsWith("...")
        ? ts.factory.createParameterDeclaration(
            undefined,
            ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
            ts.factory.createIdentifier(paramName.slice(3))
          )
        : ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            ts.factory.createIdentifier(paramName)
          );
    });
    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      convertIdentifier(node.id),
      undefined,
      parameters,
      undefined,
      convertBlockStatement(node.body)
    );
  });
}

export function convertFxFunctionDeclaration(
  node: IR.IRFxFunctionDeclaration
): ts.FunctionDeclaration {
  return execute(node, "fx function declaration", () => {
    const defaultValues = new Map(
      node.defaults.map((d) => [d.name, convertIRExpr(d.value)])
    );
    const parameters = [
      ts.factory.createParameterDeclaration(
        undefined,
        ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
        ts.factory.createIdentifier("args")
      ),
    ];
    const bodyStatements: ts.Statement[] = [];
    for (const param of node.params) {
      let defaultExpr: ts.Expression =
        defaultValues.get(param.name) ||
        (() => {
          const paramType = node.paramTypes.find(pt => pt.name === param.name)?.type;
          if (paramType === "Int" || paramType === "Double") return ts.factory.createNumericLiteral("0");
          if (paramType === "String") return ts.factory.createStringLiteral("");
          if (paramType === "Bool") return ts.factory.createFalse();
          return ts.factory.createIdentifier("undefined");
        })();
      bodyStatements.push(
        ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [ts.factory.createVariableDeclaration(
              convertIdentifier(param),
              undefined,
              undefined,
              defaultExpr
            )],
            ts.NodeFlags.Let
          )
        )
      );
    }
    if (node.params.length > 0) {
      bodyStatements.push(
        ts.factory.createIfStatement(
          ts.factory.createBinaryExpression(
            ts.factory.createBinaryExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createIdentifier("length")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  ts.factory.createNumericLiteral("1")
                ),
                ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                ts.factory.createBinaryExpression(
                  ts.factory.createTypeOfExpression(
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier("args"),
                      ts.factory.createNumericLiteral("0")
                    )
                  ),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  ts.factory.createStringLiteral("object")
                )
              ),
              ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
              ts.factory.createBinaryExpression(
                ts.factory.createElementAccessExpression(
                  ts.factory.createIdentifier("args"),
                  ts.factory.createNumericLiteral("0")
                ),
                ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                ts.factory.createNull()
              )
            ),
            ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
            ts.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.ExclamationToken,
              ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier("Array"),
                  ts.factory.createIdentifier("isArray")
                ),
                undefined,
                [
                  ts.factory.createElementAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createNumericLiteral("0")
                  )
                ]
              )
            )
          ),
          ts.factory.createBlock([
            ...node.params.map((param) =>
              ts.factory.createIfStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createElementAccessExpression(
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier("args"),
                      ts.factory.createNumericLiteral("0")
                    ),
                    ts.factory.createStringLiteral(param.name)
                  ),
                  ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                  ts.factory.createIdentifier("undefined")
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    convertIdentifier(param),
                    ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                    ts.factory.createElementAccessExpression(
                      ts.factory.createElementAccessExpression(
                        ts.factory.createIdentifier("args"),
                        ts.factory.createNumericLiteral("0")
                      ),
                      ts.factory.createStringLiteral(param.name)
                    )
                  )
                )
              )
            ),
            ts.factory.createIfStatement(
              ts.factory.createBinaryExpression(
                ts.factory.createBinaryExpression(
                  convertIdentifier(node.params[0]),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  defaultValues.get(node.params[0].name) || ts.factory.createIdentifier("undefined")
                ),
                ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createIdentifier("length")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.GreaterThanToken),
                  ts.factory.createNumericLiteral("0")
                )
              ),
              ts.factory.createExpressionStatement(
                ts.factory.createBinaryExpression(
                  convertIdentifier(node.params[0]),
                  ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                  ts.factory.createElementAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createNumericLiteral("0")
                  )
                )
              )
            )
          ], true),
          ts.factory.createBlock(
            node.params.map((param, index) =>
              ts.factory.createIfStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createIdentifier("length")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.GreaterThanToken),
                  ts.factory.createNumericLiteral(index.toString())
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    convertIdentifier(param),
                    ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier("args"),
                      ts.factory.createNumericLiteral(index.toString())
                    )
                  )
                )
              )
            ),
            true
          )
        )
      );
    }
    for (const param of node.params) {
      bodyStatements.push(
        ts.factory.createExpressionStatement(
          ts.factory.createBinaryExpression(
            convertIdentifier(param),
            ts.factory.createToken(ts.SyntaxKind.EqualsToken),
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createBinaryExpression(
                  ts.factory.createTypeOfExpression(convertIdentifier(param)),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  ts.factory.createStringLiteral("object")
                ),
                ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                ts.factory.createBinaryExpression(
                  convertIdentifier(param),
                  ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                  ts.factory.createNull()
                )
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier("JSON"),
                  ts.factory.createIdentifier("parse")
                ),
                undefined,
                [
                  ts.factory.createCallExpression(
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier("JSON"),
                      ts.factory.createIdentifier("stringify")
                    ),
                    undefined,
                    [convertIdentifier(param)]
                  )
                ]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              convertIdentifier(param)
            )
          )
        )
      );
    }
    const bodyBlock = convertBlockStatement(node.body);
    for (const statement of bodyBlock.statements) {
      bodyStatements.push(statement);
    }
    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      convertIdentifier(node.id),
      undefined,
      parameters,
      undefined,
      ts.factory.createBlock(bodyStatements, true)
    );
  });
}

export function convertExpressionStatement(node: IR.IRExpressionStatement): ts.ExpressionStatement {
  return execute(node, "expression statement", () =>
    ts.factory.createExpressionStatement(convertIRExpr(node.expression))
  );
}

/* ────────────── Expression Converters ────────────── */

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

export function convertCallExpression(node: IR.IRCallExpression): ts.CallExpression {
  return execute(node, "call expression", () => {
    if (
      node.callee.type === IR.IRNodeType.Identifier &&
      (node.callee as IR.IRIdentifier).name === "js-call" &&
      node.arguments.length >= 2
    ) {
      const object = convertIRExpr(node.arguments[0]);
      let methodNameExpr: ts.Expression;
      if (node.arguments[1].type === IR.IRNodeType.StringLiteral) {
        const methodName = (node.arguments[1] as IR.IRStringLiteral).value;
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(methodName)) {
          return ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
              object,
              ts.factory.createIdentifier(methodName)
            ),
            undefined,
            node.arguments.slice(2).map(arg => convertIRExpr(arg))
          );
        } else {
          methodNameExpr = ts.factory.createStringLiteral(methodName);
        }
      } else {
        methodNameExpr = convertIRExpr(node.arguments[1]);
      }
      const methodAccess = ts.factory.createElementAccessExpression(object, methodNameExpr);
      return ts.factory.createCallExpression(
        methodAccess,
        undefined,
        node.arguments.slice(2).map(arg => convertIRExpr(arg))
      );
    }
    if (node.callee.type === IR.IRNodeType.MemberExpression) {
      const memberExpr = node.callee as IR.IRMemberExpression;
      const object = convertIRExpr(memberExpr.object);
      let methodAccess: ts.Expression;
      if (memberExpr.property.type === IR.IRNodeType.Identifier) {
        methodAccess = ts.factory.createPropertyAccessExpression(
          object,
          ts.factory.createIdentifier((memberExpr.property as IR.IRIdentifier).name)
        );
      } else if (memberExpr.property.type === IR.IRNodeType.StringLiteral) {
        const propValue = (memberExpr.property as IR.IRStringLiteral).value;
        methodAccess = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propValue)
          ? ts.factory.createPropertyAccessExpression(
              object,
              ts.factory.createIdentifier(propValue)
            )
          : ts.factory.createElementAccessExpression(
              object,
              ts.factory.createStringLiteral(propValue)
            );
      } else {
        methodAccess = ts.factory.createElementAccessExpression(
          object,
          convertIRExpr(memberExpr.property)
        );
      }
      return ts.factory.createCallExpression(
        methodAccess,
        undefined,
        node.arguments.map(arg => convertIRExpr(arg))
      );
    }
    const callee = convertIRExpr(node.callee);
    const args = node.arguments.map(arg => convertIRExpr(arg));
    return ts.factory.createCallExpression(callee, undefined, args);
  });
}

export function convertMemberExpression(node: IR.IRMemberExpression): ts.Expression {
  return execute(node, "member expression", () => {
    const object = convertIRExpr(node.object);
    if (node.property.type === IR.IRNodeType.Identifier) {
      return ts.factory.createPropertyAccessExpression(
        object,
        ts.factory.createIdentifier((node.property as IR.IRIdentifier).name)
      );
    } else if (node.property.type === IR.IRNodeType.StringLiteral) {
      const propValue = (node.property as IR.IRStringLiteral).value;
      return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propValue)
        ? ts.factory.createPropertyAccessExpression(object, ts.factory.createIdentifier(propValue))
        : ts.factory.createElementAccessExpression(object, ts.factory.createStringLiteral(propValue));
    } else {
      return ts.factory.createElementAccessExpression(object, convertIRExpr(node.property));
    }
  });
}

export function convertCallMemberExpression(node: IR.IRCallMemberExpression): ts.CallExpression {
  return execute(node, "call member expression", () => {
    let memberExpr: ts.Expression;
    if (node.property.type === IR.IRNodeType.StringLiteral) {
      memberExpr = ts.factory.createPropertyAccessExpression(
        convertIRExpr(node.object),
        ts.factory.createIdentifier((node.property as IR.IRStringLiteral).value)
      );
    } else {
      const property = convertIRExpr(node.property);
      memberExpr = ts.isStringLiteral(property)
        ? ts.factory.createPropertyAccessExpression(
            convertIRExpr(node.object),
            ts.factory.createIdentifier(property.text)
          )
        : ts.isIdentifier(property)
          ? ts.factory.createPropertyAccessExpression(convertIRExpr(node.object), property)
          : ts.factory.createElementAccessExpression(convertIRExpr(node.object), property);
    }
    return ts.factory.createCallExpression(
      memberExpr,
      undefined,
      node.arguments.map(arg => convertIRExpr(arg))
    );
  });
}

export function convertNewExpression(node: IR.IRNewExpression): ts.NewExpression {
  return execute(node, "new expression", () =>
    ts.factory.createNewExpression(convertIRExpr(node.callee), undefined, node.arguments.map(arg => convertIRExpr(arg)))
  );
}

export function convertBinaryExpression(node: IR.IRBinaryExpression): ts.BinaryExpression {
  return execute(node, "binary expression", () => {
    if (!node.left || !node.right) {
      const left = node.left ? convertIRExpr(node.left) : ts.factory.createNumericLiteral("0");
      const right = node.right ? convertIRExpr(node.right)
        : node.operator === "+"
          ? ts.factory.createNumericLiteral("1")
          : ts.factory.createNumericLiteral("0");
      const operator = node.operator ? getBinaryOperator(node.operator) : ts.SyntaxKind.PlusToken;
      return ts.factory.createBinaryExpression(left, ts.factory.createToken(operator), right);
    }
    return ts.factory.createBinaryExpression(
      convertIRExpr(node.left),
      ts.factory.createToken(getBinaryOperator(node.operator)),
      convertIRExpr(node.right)
    );
  });
}

function getBinaryOperator(op: string): ts.BinaryOperator {
  switch (op) {
    case "+": return ts.SyntaxKind.PlusToken;
    case "-": return ts.SyntaxKind.MinusToken;
    case "*": return ts.SyntaxKind.AsteriskToken;
    case "/": return ts.SyntaxKind.SlashToken;
    case "%": return ts.SyntaxKind.PercentToken;
    case "===":
    case "==": return ts.SyntaxKind.EqualsEqualsEqualsToken;
    case "!==":
    case "!=": return ts.SyntaxKind.ExclamationEqualsEqualsToken;
    case ">": return ts.SyntaxKind.GreaterThanToken;
    case "<": return ts.SyntaxKind.LessThanToken;
    case ">=": return ts.SyntaxKind.GreaterThanEqualsToken;
    case "<=": return ts.SyntaxKind.LessThanEqualsToken;
    case "&&": return ts.SyntaxKind.AmpersandAmpersandToken;
    case "||": return ts.SyntaxKind.BarBarToken;
    default:
      throw new CodeGenError(`Unknown binary operator: ${op}`, "binary expression operator", op);
  }
}

export function convertUnaryExpression(node: IR.IRUnaryExpression): ts.UnaryExpression {
  return execute(node, "unary expression", () =>
    ts.factory.createPrefixUnaryExpression(getUnaryOperator(node.operator), convertIRExpr(node.argument))
  );
}

function getUnaryOperator(op: string): ts.PrefixUnaryOperator {
  switch (op) {
    case "+": return ts.SyntaxKind.PlusToken;
    case "-": return ts.SyntaxKind.MinusToken;
    case "!": return ts.SyntaxKind.ExclamationToken;
    case "~": return ts.SyntaxKind.TildeToken;
    default:
      throw new CodeGenError(`Unknown unary operator: ${op}`, "unary expression operator", op);
  }
}

export function convertConditionalExpression(node: IR.IRConditionalExpression): ts.ConditionalExpression {
  return execute(node, "conditional expression", () =>
    ts.factory.createConditionalExpression(
      convertIRExpr(node.test),
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      convertIRExpr(node.consequent),
      ts.factory.createToken(ts.SyntaxKind.ColonToken),
      convertIRExpr(node.alternate)
    )
  );
}

export function convertArrayExpression(node: IR.IRArrayExpression): ts.ArrayLiteralExpression {
  return execute(node, "array expression", () =>
    ts.factory.createArrayLiteralExpression(node.elements.map(elem => convertIRExpr(elem)), false)
  );
}

export function convertFunctionExpression(node: IR.IRFunctionExpression): ts.FunctionExpression {
  return execute(node, "function expression", () => {
    const parameters = node.params.map(param =>
      param.name.startsWith("...")
        ? ts.factory.createParameterDeclaration(
            undefined,
            ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
            ts.factory.createIdentifier(param.name.slice(3))
          )
        : ts.factory.createParameterDeclaration(undefined, undefined, convertIdentifier(param))
    );
    return ts.factory.createFunctionExpression(
      undefined,
      undefined,
      undefined,
      undefined,
      parameters,
      undefined,
      convertBlockStatement(node.body)
    );
  });
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

export function convertFunctionDeclaration(node: IR.IRFunctionDeclaration): ts.FunctionDeclaration {
  return execute(node, "function declaration", () => {
    const params = node.params.map(param =>
      ts.factory.createParameterDeclaration(undefined, undefined, convertIdentifier(param))
    );
    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      convertIdentifier(node.id),
      undefined,
      params,
      undefined,
      convertBlockStatement(node.body)
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

function isExpressionNode(node: IR.IRNode): boolean {
  const expressionTypes = [
    IR.IRNodeType.CallExpression,
    IR.IRNodeType.BinaryExpression,
    IR.IRNodeType.UnaryExpression,
    IR.IRNodeType.ConditionalExpression,
    IR.IRNodeType.MemberExpression,
    IR.IRNodeType.ArrayExpression,
    IR.IRNodeType.ObjectExpression,
    IR.IRNodeType.Identifier,
    IR.IRNodeType.StringLiteral,
    IR.IRNodeType.NumericLiteral,
    IR.IRNodeType.BooleanLiteral,
    IR.IRNodeType.NullLiteral,
  ];
  return expressionTypes.includes(node.type);
}

/* ────────────── Import / Export / Raw Converters ────────────── */

export function convertImportDeclaration(node: IR.IRImportDeclaration): ts.ImportDeclaration {
  return execute(node, "import declaration", () => {
    if (!node.specifiers || node.specifiers.length === 0) {
      const moduleName = createModuleVariableName(node.source);
      return ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamespaceImport(ts.factory.createIdentifier(moduleName))
        ),
        ts.factory.createStringLiteral(node.source)
      );
    }
    const namedImports = node.specifiers.map(spec =>
      ts.factory.createImportSpecifier(
        false,
        spec.imported.name !== spec.local.name ? ts.factory.createIdentifier(spec.imported.name) : undefined,
        ts.factory.createIdentifier(spec.local.name)
      )
    );
    return ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(false, undefined, ts.factory.createNamedImports(namedImports)),
      ts.factory.createStringLiteral(node.source)
    );
  });
}

export function convertJsImportReference(node: IR.IRJsImportReference): ts.Statement[] {
  return execute(node, "JS import reference", () => {
    const importName = sanitizeIdentifier(node.name);
    const internalModuleName = `${importName}Module`;
    const importDecl = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamespaceImport(ts.factory.createIdentifier(internalModuleName))
      ),
      ts.factory.createStringLiteral(node.source)
    );
    const functionBody = ts.factory.createBlock(
      [
        ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createIdentifier("wrapper"),
                undefined,
                undefined,
                ts.factory.createConditionalExpression(
                  ts.factory.createBinaryExpression(
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier(internalModuleName),
                      ts.factory.createIdentifier("default")
                    ),
                    ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                    ts.factory.createIdentifier("undefined")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier(internalModuleName),
                    ts.factory.createIdentifier("default")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.ColonToken),
                  ts.factory.createObjectLiteralExpression([], false)
                )
              ),
            ],
            ts.NodeFlags.Const
          )
        ),
        ts.factory.createForOfStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createArrayBindingPattern([
                  ts.factory.createBindingElement(undefined, undefined, ts.factory.createIdentifier("key")),
                  ts.factory.createBindingElement(undefined, undefined, ts.factory.createIdentifier("value")),
                ]),
                undefined,
                undefined,
                undefined
              ),
            ],
            ts.NodeFlags.Const
          ),
          ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier("Object"),
              ts.factory.createIdentifier("entries")
            ),
            undefined,
            [ts.factory.createIdentifier(internalModuleName)]
          ),
          ts.factory.createBlock(
            [
              ts.factory.createIfStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier("key"),
                  ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                  ts.factory.createStringLiteral("default")
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    ts.factory.createElementAccessExpression(ts.factory.createIdentifier("wrapper"), ts.factory.createIdentifier("key")),
                    ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                    ts.factory.createIdentifier("value")
                  )
                )
              ),
            ],
            true
          )
        ),
        ts.factory.createReturnStatement(ts.factory.createIdentifier("wrapper")),
      ],
      true
    );
    const iife = ts.factory.createCallExpression(
      ts.factory.createParenthesizedExpression(
        ts.factory.createFunctionExpression(undefined, undefined, undefined, undefined, [], undefined, functionBody)
      ),
      undefined,
      []
    );
    const defaultAssignment = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(importName),
            undefined,
            undefined,
            iife
          ),
        ],
        ts.NodeFlags.Const
      )
    );
    return [importDecl, defaultAssignment];
  });
}

export function convertExportNamedDeclaration(node: IR.IRExportNamedDeclaration): ts.ExportDeclaration {
  return execute(node, "export named declaration", () => {
    const specifiers = node.specifiers.map(spec =>
      ts.factory.createExportSpecifier(
        false,
        spec.local.name !== spec.exported.name ? ts.factory.createIdentifier(spec.local.name) : undefined,
        ts.factory.createIdentifier(spec.exported.name)
      )
    );
    return ts.factory.createExportDeclaration(
      undefined,
      false,
      ts.factory.createNamedExports(specifiers),
      undefined
    );
  });
}

export function convertExportVariableDeclaration(node: IR.IRExportVariableDeclaration): ts.Statement[] {
  return execute(node, "export variable declaration", () => {
    const varDecl = convertVariableDeclaration(node.declaration);
    const varName = node.declaration.declarations[0].id.name;
    const exportDecl = ts.factory.createExportDeclaration(
      undefined,
      false,
      ts.factory.createNamedExports([
        ts.factory.createExportSpecifier(
          false,
          ts.factory.createIdentifier(varName),
          ts.factory.createIdentifier(node.exportName)
        ),
      ]),
      undefined
    );
    return [varDecl, exportDecl];
  });
}

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

/* ────────────── IR Expression Converter ────────────── */

export function convertIRExpr(node: IR.IRNode): ts.Expression {
  return execute(node, "IR expression", () => {
    switch (node.type) {
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
      case IR.IRNodeType.CallExpression:
        return convertCallExpression(node as IR.IRCallExpression);
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
      case IR.IRNodeType.ReturnStatement:
        return ts.factory.createCallExpression(
          ts.factory.createParenthesizedExpression(
            ts.factory.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              node.argument ? convertIRExpr(node.argument) : ts.factory.createIdentifier("undefined")
            )
          ),
          undefined,
          []
        );
      default:
        throw new CodeGenError(
          `Cannot convert node of type ${IR.IRNodeType[node.type] || node.type} to expression`,
          `IR node ${IR.IRNodeType[node.type] || node.type}`,
          node
        );
    }
  });
}

export function convertGetAndCall(node: IR.IRGetAndCall): ts.Expression {
  return execute(node, "GetAndCall", () => {
    // Convert object and arguments
    const object = convertIRExpr(node.object);
    const methodName = node.method.value;
    const args = node.arguments.map(arg => convertIRExpr(arg));

    // Create an IIFE to contain the safe method call logic
    return ts.factory.createCallExpression(
      ts.factory.createParenthesizedExpression(
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          ts.factory.createBlock([
            // Store object in a temp variable
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

            // Get the method using runtime get function
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

            // Return conditional: if method is a function, call it with object as 'this'
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

function createModuleVariableName(source: string): string {
  return execute(source, "module variable name creation", () => {
    let cleanSource = source;
    if (cleanSource.startsWith("npm:")) {
      cleanSource = cleanSource.substring(4);
    } else if (cleanSource.startsWith("jsr:")) {
      cleanSource = cleanSource.substring(4);
    }
    if (cleanSource.includes("@") && cleanSource.includes("/")) {
      const parts = cleanSource.split("/");
      cleanSource = parts[parts.length - 1];
    } else if (cleanSource.includes("/")) {
      const parts = cleanSource.split("/");
      cleanSource = parts[parts.length - 1];
    }
    let baseName = cleanSource.replace(/\.(js|ts|mjs|cjs)$/, "");
    baseName = baseName.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
    baseName = baseName.replace(/^[^a-zA-Z_$]/, "_");
    return `${baseName}Module`;
  });
}

export function convertAssignmentExpression(node: IR.IRAssignmentExpression): ts.Expression {
  return execute(node, "assignment expression", () =>
    ts.factory.createBinaryExpression(
      convertIRExpr(node.left),
      ts.factory.createToken(ts.SyntaxKind.EqualsToken),
      convertIRExpr(node.right)
    )
  );
}

/* ────────────── Class Converters ────────────── */

export function convertClassMethod(node: IR.IRClassMethod): ts.MethodDeclaration {
  return execute(node, "class method", () => {
    const parameters = node.params.map(param => {
      const defaultValue = node.defaults?.find(d => d.name === param.name)
        ? convertIRExpr(node.defaults.find(d => d.name === param.name)!.value)
        : undefined;
      return ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        ts.factory.createIdentifier(param.name),
        undefined,
        undefined,
        defaultValue
      );
    });
    const bodyStatements: ts.Statement[] = [];
    if (node.body && node.body.type === IR.IRNodeType.BlockStatement) {
      node.body.body.forEach((stmt, i) => {
        const transformedStmt = replaceSelfWithThis(stmt);
        const tsStmt = convertIRNodeToStatement(
          i === node.body.body.length - 1 && transformedStmt.type !== IR.IRNodeType.ReturnStatement
            ? { type: IR.IRNodeType.ReturnStatement, argument: transformedStmt } as IR.IRReturnStatement
            : transformedStmt
        );
        if (tsStmt) {
          Array.isArray(tsStmt) ? bodyStatements.push(...tsStmt) : bodyStatements.push(tsStmt);
        }
      });
    }
    if (bodyStatements.length === 0) {
      bodyStatements.push(ts.factory.createReturnStatement(ts.factory.createNull()));
    }
    return ts.factory.createMethodDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(node.name),
      undefined,
      undefined,
      parameters,
      undefined,
      ts.factory.createBlock(bodyStatements, true)
    );
  });
}

export function convertClassDeclaration(node: IR.IRClassDeclaration): ts.ClassDeclaration {
  return execute(node, "class declaration", () => {
    const members: ts.ClassElement[] = [];
    node.fields.forEach(field => {
      try {
        members.push(convertClassField(field));
      } catch (e) {
        logger.error(`Error processing field ${field.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    if (node.constructor) {
      try {
        members.push(convertClassConstructor(node.constructor));
      } catch (e) {
        logger.error(`Error processing constructor: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    node.methods.forEach(method => {
      try {
        members.push(convertClassMethod(method));
      } catch (e) {
        logger.error(`Error processing method ${method.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    logger.debug(`Final class members count: ${members.length}`);
    // Remove export modifier as per the original comment
    return ts.factory.createClassDeclaration(
      [],
      ts.factory.createIdentifier(node.id.name),
      undefined,
      undefined,
      members
    );
  });
}

export function convertClassField(node: IR.IRClassField): ts.PropertyDeclaration {
  return execute(node, "class field", () => {
    const nameIdentifier = ts.factory.createIdentifier(node.name);
    const initializer = node.initialValue ? convertIRExpr(node.initialValue) : undefined;
    return ts.factory.createPropertyDeclaration(
      [],
      nameIdentifier,
      undefined,
      undefined,
      initializer
    );
  });
}

export function convertClassConstructor(node: IR.IRClassConstructor): ts.ConstructorDeclaration {
  return execute(node, "class constructor", () => {
    const parameters = node.params.map(param =>
      ts.factory.createParameterDeclaration(undefined, undefined, ts.factory.createIdentifier(param.name))
    );
    const bodyStatements: ts.Statement[] = [];
    if (node.body && node.body.type === IR.IRNodeType.BlockStatement) {
      node.body.body.forEach(stmt => {
        const transformedStmt = replaceSelfWithThis(stmt);
        const tsStmt = convertIRNodeToStatement(transformedStmt);
        if (tsStmt) {
          Array.isArray(tsStmt) ? bodyStatements.push(...tsStmt) : bodyStatements.push(tsStmt);
        }
      });
    }
    if (!hasExplicitReturnThis(bodyStatements)) {
      bodyStatements.push(ts.factory.createReturnStatement(ts.factory.createThis()));
    }
    return ts.factory.createConstructorDeclaration(
      undefined,
      parameters,
      ts.factory.createBlock(bodyStatements, true)
    );
  });
}

function hasExplicitReturnThis(statements: ts.Statement[]): boolean {
  return statements.some(
    stmt =>
      ts.isReturnStatement(stmt) &&
      stmt.expression &&
      ts.isExpression(stmt.expression)
  );
}

function convertIRNodeToStatement(node: IR.IRNode): ts.Statement | ts.Statement[] | null {
  const result = convertIRNode(node);
  if (!result) return null;
  if (Array.isArray(result)) return result;
  if (ts.isStatement(result)) return result;
  // If it's an expression, wrap it in an ExpressionStatement
  if (ts.isExpression(result)) {
    return ts.factory.createExpressionStatement(result);
  }
  // Handle cases where convertIRNode might return something unexpected
  logger.warn(`Unexpected result type from convertIRNode: ${result.kind}`);
  return null;
}

export function replaceSelfWithThis(node: IR.IRNode): IR.IRNode {
  switch (node.type) {
    case IR.IRNodeType.Identifier: {
      return (node as IR.IRIdentifier).name === "self"
        ? { ...node, name: "this" }
        : node;
    }
    case IR.IRNodeType.MemberExpression: {
      const memberExpr = node as IR.IRMemberExpression;
      return {
        ...memberExpr,
        object:
          memberExpr.object.type === IR.IRNodeType.Identifier &&
          (memberExpr.object as IR.IRIdentifier).name === "self"
            ? { type: IR.IRNodeType.Identifier, name: "this" }
            : replaceSelfWithThis(memberExpr.object),
        property: replaceSelfWithThis(memberExpr.property),
      };
    }
    case IR.IRNodeType.ReturnStatement: {
      return {
        ...node,
        argument: node.argument ? replaceSelfWithThis(node.argument) : null,
      };
    }
    case IR.IRNodeType.AssignmentExpression: {
      return {
        ...node,
        left: replaceSelfWithThis(node.left),
        right: replaceSelfWithThis(node.right),
      };
    }
    case IR.IRNodeType.CallExpression: {
      return {
        ...node,
        callee: replaceSelfWithThis(node.callee),
        arguments: node.arguments.map(arg => replaceSelfWithThis(arg)),
      };
    }
    case IR.IRNodeType.BlockStatement: {
      return { ...node, body: node.body.map(stmt => replaceSelfWithThis(stmt)) };
    }
    default: {
      return node;
    }
  }
}

/* ────────────── Enum Converters (UPDATED) ────────────── */

/**
 * Convert an IREnumDeclaration to a TypeScript VariableStatement
 * that simulates an enum using a frozen JavaScript object.
 * Example Output: export const OsType = Object.freeze({ macOS: "macOS", ... });
 */
export function convertEnumDeclarationToJsObject(node: IR.IREnumDeclaration): ts.VariableStatement {
  return execute(node, "enum declaration to JS object", () => {
    logger.debug(`Converting enum declaration to JS object: ${node.id.name}`);

    // Create object properties from enum cases
    const properties = node.cases.map(enumCase => {
      if (enumCase.type !== IR.IRNodeType.EnumCase) {
        throw new CodeGenError(
          `Expected EnumCase inside EnumDeclaration, got ${IR.IRNodeType[enumCase.type]}`,
          "enum case",
          enumCase
        );
      }
      const caseName = enumCase.id.name;
      logger.debug(`  Creating object property for case: ${caseName}`);

      // Create property assignment: CaseName: "CaseName"
      return ts.factory.createPropertyAssignment(
        ts.factory.createIdentifier(caseName), // Property name is the case name
        ts.factory.createStringLiteral(caseName) // Value is the case name as a string
      );
    });

    // Create the object literal: { macOS: "macOS", ... }
    const objectLiteral = ts.factory.createObjectLiteralExpression(
      properties,
      true // multiline
    );

    // Create the call to Object.freeze: Object.freeze({ ... })
    const freezeCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier("Object"),
        ts.factory.createIdentifier("freeze")
      ),
      undefined,
      [objectLiteral]
    );

    // Create the variable declaration: const EnumName = Object.freeze({...});
    const variableDeclaration = ts.factory.createVariableDeclaration(
      ts.factory.createIdentifier(node.id.name), // Enum name identifier
      undefined, // No explicit type annotation
      undefined, // No explicit type annotation
      freezeCall // Initializer is the Object.freeze call
    );

    // Create the variable statement with export keyword
    return ts.factory.createVariableStatement(
      [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)], // Add export keyword
      ts.factory.createVariableDeclarationList(
        [variableDeclaration],
        ts.NodeFlags.Const // Use const for immutability
      )
    );
  });
}
