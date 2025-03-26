// src/transpiler/hql-ir-to-ts-ast.ts
import * as ts from "npm:typescript";
import * as IR from "./hql_ir.ts";
import { sanitizeIdentifier } from "../utils.ts";
import { CodeGenError } from "./errors.ts";
import { Logger } from "../logger.ts";

// Initialize logger for this module
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Convert an IR node to a TypeScript statement with centralized error handling.
 */
export function convertIRNode(
  node: IR.IRNode,
): ts.Statement | ts.Statement[] | null {
  try {
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
        return createExpressionStatement(
          convertObjectExpression(node as IR.IRObjectExpression),
        );
      case IR.IRNodeType.StringLiteral:
        return createExpressionStatement(
          convertStringLiteral(node as IR.IRStringLiteral),
        );
      case IR.IRNodeType.NumericLiteral:
        return createExpressionStatement(
          convertNumericLiteral(node as IR.IRNumericLiteral),
        );
      case IR.IRNodeType.BooleanLiteral:
        return createExpressionStatement(
          convertBooleanLiteral(node as IR.IRBooleanLiteral),
        );
      case IR.IRNodeType.NullLiteral:
        return createExpressionStatement(convertNullLiteral());
      case IR.IRNodeType.Identifier:
        return createExpressionStatement(
          convertIdentifier(node as IR.IRIdentifier),
        );
      case IR.IRNodeType.CallExpression:
        return createExpressionStatement(
          convertCallExpression(node as IR.IRCallExpression),
        );
      case IR.IRNodeType.MemberExpression:
        return createExpressionStatement(
          convertMemberExpression(node as IR.IRMemberExpression),
        );
      case IR.IRNodeType.CallMemberExpression:
        return createExpressionStatement(
          convertCallMemberExpression(node as IR.IRCallMemberExpression),
        );
      case IR.IRNodeType.NewExpression:
        return createExpressionStatement(
          convertNewExpression(node as IR.IRNewExpression),
        );
      case IR.IRNodeType.BinaryExpression:
        return createExpressionStatement(
          convertBinaryExpression(node as IR.IRBinaryExpression),
        );
      case IR.IRNodeType.UnaryExpression:
        return createExpressionStatement(
          convertUnaryExpression(node as IR.IRUnaryExpression),
        );
      case IR.IRNodeType.ConditionalExpression:
        return createExpressionStatement(
          convertConditionalExpression(node as IR.IRConditionalExpression),
        );
      case IR.IRNodeType.ArrayExpression:
        return createExpressionStatement(
          convertArrayExpression(node as IR.IRArrayExpression),
        );
      case IR.IRNodeType.FunctionExpression:
        return createExpressionStatement(
          convertFunctionExpression(node as IR.IRFunctionExpression),
        );
      case IR.IRNodeType.VariableDeclaration:
        return convertVariableDeclaration(node as IR.IRVariableDeclaration);
      case IR.IRNodeType.FunctionDeclaration:
        return convertFunctionDeclaration(node as IR.IRFunctionDeclaration);
      case IR.IRNodeType.ReturnStatement:
        return convertReturnStatement(node as IR.IRReturnStatement);
      case IR.IRNodeType.BlockStatement:
        return convertBlockStatement(node as IR.IRBlockStatement);
      case IR.IRNodeType.ImportDeclaration:
        return convertImportDeclaration(node as IR.IRImportDeclaration);
      case IR.IRNodeType.ExportNamedDeclaration:
        return convertExportNamedDeclaration(
          node as IR.IRExportNamedDeclaration,
        );
      case IR.IRNodeType.ExportVariableDeclaration:
        return convertExportVariableDeclaration(
          node as IR.IRExportVariableDeclaration,
        );
      case IR.IRNodeType.InteropIIFE:
        return createExpressionStatement(
          convertInteropIIFE(node as IR.IRInteropIIFE),
        );
      case IR.IRNodeType.JsImportReference:
        return convertJsImportReference(node as IR.IRJsImportReference);
      case IR.IRNodeType.CommentBlock:
        return convertCommentBlock(node as IR.IRCommentBlock);
      case IR.IRNodeType.Raw:
        return convertRaw(node as IR.IRRaw);
      case IR.IRNodeType.LoopExpression:
        return convertLoopExpression(node as IR.IRLoopExpression);
      case IR.IRNodeType.WhileExpression:
        return convertWhileExpression(node as IR.IRWhileExpression);
      default:
        logger.warn(
          `Cannot convert node of type ${node.type} (${
            IR.IRNodeType[node.type]
          }) to expression`,
        );
        throw new CodeGenError(
          `Unsupported IR node type: ${IR.IRNodeType[node.type] || node.type}`,
          `IR node ${IR.IRNodeType[node.type] || node.type}`,
          node,
        );
    }
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error;
    }

    throw new CodeGenError(
      `Failed to convert IR node to TS AST: ${
        error instanceof Error ? error.message : String(error)
      }`,
      node ? IR.IRNodeType[node.type] || String(node.type) : "unknown",
      node,
    );
  }
}

// Counter for unique loop labels
let loopLabelCounter = 0;

/**
 * Convert a loop expression to TypeScript.
 */
function convertLoopExpression(node: IR.IRLoopExpression): ts.Statement {
  try {
    // Create unique label for this loop
    const labelName = `loop_${loopLabelCounter++}`;

    // Prepare variable declarations
    const variableDeclarations: ts.VariableDeclaration[] = [];
    const variableNames: ts.Identifier[] = [];

    for (const binding of node.bindings) {
      const id = convertIdentifier(binding.id);
      variableNames.push(id);
      variableDeclarations.push(
        ts.factory.createVariableDeclaration(
          id,
          undefined,
          undefined,
          convertIRExpr(binding.init),
        ),
      );
    }

    // Create variable statement
    const varStatement = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        variableDeclarations,
        ts.NodeFlags.Let,
      ),
    );

    // Process body for recur statements
    const loopBlock = processLoopBody(node.body.body, labelName, variableNames);

    // Create labeled loop statement
    const loopStatement = ts.factory.createLabeledStatement(
      ts.factory.createIdentifier(labelName),
      ts.factory.createWhileStatement(
        ts.factory.createTrue(),
        loopBlock,
      ),
    );

    // Return block with both declarations and loop
    return ts.factory.createBlock(
      [varStatement, loopStatement],
      true,
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert loop expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "loop expression",
      node,
    );
  }
}

/**
 * Process a loop body to handle recur statements specially.
 */
function processLoopBody(
  body: IR.IRNode[],
  labelName: string,
  variableNames: ts.Identifier[],
): ts.Block {
  const statements: ts.Statement[] = [];

  // Process all statements
  for (let i = 0; i < body.length; i++) {
    const node = body[i];
    const isLast = i === body.length - 1;

    // Special handling for recur in tail position
    if (isLast && node.type === IR.IRNodeType.RecurExpression) {
      const recurNode = node as IR.IRRecurExpression;

      // Validate arity
      if (recurNode.args.length !== variableNames.length) {
        throw new CodeGenError(
          `Recur arity mismatch: expected ${variableNames.length} arguments, got ${recurNode.args.length}`,
          "recur expression",
          recurNode,
        );
      }

      // Generate variable reassignments
      for (let j = 0; j < variableNames.length; j++) {
        statements.push(
          ts.factory.createExpressionStatement(
            ts.factory.createBinaryExpression(
              variableNames[j],
              ts.factory.createToken(ts.SyntaxKind.EqualsToken),
              convertIRExpr(recurNode.args[j]),
            ),
          ),
        );
      }

      // Continue the loop
      statements.push(
        ts.factory.createContinueStatement(
          ts.factory.createIdentifier(labelName),
        ),
      );
    } else {
      // Normal statement processing
      const statement = convertIRNode(node);
      if (statement) {
        if (Array.isArray(statement)) {
          statements.push(...statement);
        } else {
          statements.push(statement);
        }
      }

      // Add break for last non-recur statement
      if (isLast) {
        statements.push(
          ts.factory.createBreakStatement(
            ts.factory.createIdentifier(labelName),
          ),
        );
      }
    }
  }

  return ts.factory.createBlock(statements, true);
}

/**
 * Convert a while expression to TypeScript.
 */
function convertWhileExpression(node: IR.IRWhileExpression): ts.Statement {
  try {
    return ts.factory.createWhileStatement(
      convertIRExpr(node.test),
      convertBlockStatement(node.body),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert while expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "while expression",
      node,
    );
  }
}

/**
 * Convert an object expression.
 */
function convertObjectExpression(
  node: IR.IRObjectExpression,
): ts.ObjectLiteralExpression {
  try {
    const properties: ts.PropertyAssignment[] = [];
    for (const prop of node.properties) {
      const key = convertObjectPropertyKey(prop.key);
      const value = convertIRExpr(prop.value);
      properties.push(ts.factory.createPropertyAssignment(key, value));
    }
    return ts.factory.createObjectLiteralExpression(properties, true);
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert object expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "object expression",
      node,
    );
  }
}

/**
 * Convert an object property key.
 */
function convertObjectPropertyKey(node: IR.IRNode): ts.PropertyName {
  try {
    switch (node.type) {
      case IR.IRNodeType.StringLiteral: {
        const literal = node as IR.IRStringLiteral;
        const value = literal.value;
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
          return ts.factory.createIdentifier(value);
        } else {
          return ts.factory.createStringLiteral(value);
        }
      }
      case IR.IRNodeType.Identifier:
        return ts.factory.createIdentifier((node as IR.IRIdentifier).name);
      default:
        const computed = convertIRExpr(node);
        return ts.factory.createComputedPropertyName(computed);
    }
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert object property key: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "property key conversion",
      node,
    );
  }
}

/**
 * Helper to create expression statements.
 */
function createExpressionStatement(
  expr: ts.Expression,
): ts.ExpressionStatement {
  try {
    return ts.factory.createExpressionStatement(expr);
  } catch (error) {
    throw new CodeGenError(
      `Failed to create expression statement: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "expression statement creation",
      expr,
    );
  }
}

/**
 * Convert a string literal.
 */
function convertStringLiteral(node: IR.IRStringLiteral): ts.StringLiteral {
  try {
    return ts.factory.createStringLiteral(node.value);
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert string literal "${node.value}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      "string literal",
      node,
    );
  }
}

/**
 * Convert a numeric literal.
 */
function convertNumericLiteral(node: IR.IRNumericLiteral): ts.Expression {
  try {
    if (node.value < 0) {
      return ts.factory.createPrefixUnaryExpression(
        ts.SyntaxKind.MinusToken,
        ts.factory.createNumericLiteral(Math.abs(node.value).toString()),
      );
    }
    return ts.factory.createNumericLiteral(node.value.toString());
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert numeric literal ${node.value}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "numeric literal",
      node,
    );
  }
}

/**
 * Convert a boolean literal.
 */
function convertBooleanLiteral(node: IR.IRBooleanLiteral): ts.BooleanLiteral {
  try {
    return node.value ? ts.factory.createTrue() : ts.factory.createFalse();
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert boolean literal ${node.value}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "boolean literal",
      node,
    );
  }
}

/**
 * Convert a null literal.
 */
function convertNullLiteral(): ts.NullLiteral {
  try {
    return ts.factory.createNull();
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert null literal: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "null literal",
      null,
    );
  }
}

/**
 * Convert an identifier.
 */
function convertIdentifier(node: IR.IRIdentifier): ts.Identifier {
  try {
    const sanitizedName = sanitizeIdentifier(node.name);
    return ts.factory.createIdentifier(sanitizedName);
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert identifier "${node.name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      "identifier",
      node,
    );
  }
}

/**
 * Convert a call expression.
 */
function convertCallExpression(node: IR.IRCallExpression): ts.CallExpression {
  try {
    if (node.callee.type === IR.IRNodeType.MemberExpression) {
      return convertCallExpressionWithMemberCallee(node);
    }
    if (node.callee.type === IR.IRNodeType.CallExpression) {
      const innerCall = convertCallExpression(
        node.callee as IR.IRCallExpression,
      );
      return ts.factory.createCallExpression(
        innerCall,
        undefined,
        node.arguments.map((arg) => convertIRExpr(arg)),
      );
    }
    const callee = convertIRExpr(node.callee);
    const args = node.arguments.map((arg) => convertIRExpr(arg));
    return ts.factory.createCallExpression(callee, undefined, args);
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert call expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "call expression",
      node,
    );
  }
}

/**
 * Convert a call expression with a member callee.
 */
function convertCallExpressionWithMemberCallee(
  node: IR.IRCallExpression,
): ts.CallExpression {
  try {
    const memberExpr = node.callee as IR.IRMemberExpression;
    let tsPropertyAccessExpr: ts.Expression;
    if (memberExpr.property.type === IR.IRNodeType.Identifier) {
      const propName = (memberExpr.property as IR.IRIdentifier).name;
      tsPropertyAccessExpr = ts.factory.createPropertyAccessExpression(
        convertIRExpr(memberExpr.object),
        ts.factory.createIdentifier(propName),
      );
    } else {
      tsPropertyAccessExpr = ts.factory.createElementAccessExpression(
        convertIRExpr(memberExpr.object),
        convertIRExpr(memberExpr.property),
      );
    }
    return ts.factory.createCallExpression(
      tsPropertyAccessExpr,
      undefined,
      node.arguments.map((arg) => convertIRExpr(arg)),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert call expression with member callee: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "call expression with member",
      node,
    );
  }
}

/**
 * Convert a member expression.
 */
function convertMemberExpression(node: IR.IRMemberExpression): ts.Expression {
  try {
    const object = convertIRExpr(node.object);
    if (node.property.type === IR.IRNodeType.Identifier) {
      const propertyName = (node.property as IR.IRIdentifier).name;
      return ts.factory.createPropertyAccessExpression(
        object,
        ts.factory.createIdentifier(propertyName),
      );
    } else if (node.property.type === IR.IRNodeType.StringLiteral) {
      const propValue = (node.property as IR.IRStringLiteral).value;
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propValue)) {
        return ts.factory.createPropertyAccessExpression(
          object,
          ts.factory.createIdentifier(propValue),
        );
      } else {
        return ts.factory.createElementAccessExpression(
          object,
          ts.factory.createStringLiteral(propValue),
        );
      }
    } else {
      return ts.factory.createElementAccessExpression(
        object,
        convertIRExpr(node.property),
      );
    }
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert member expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "member expression",
      node,
    );
  }
}

/**
 * Convert a call member expression.
 */
function convertCallMemberExpression(
  node: IR.IRCallMemberExpression,
): ts.CallExpression {
  try {
    let memberExpr: ts.Expression;
    if (node.property.type === IR.IRNodeType.StringLiteral) {
      const propName = (node.property as IR.IRStringLiteral).value;
      memberExpr = ts.factory.createPropertyAccessExpression(
        convertIRExpr(node.object),
        ts.factory.createIdentifier(propName),
      );
    } else {
      const property = convertIRExpr(node.property);
      if (ts.isStringLiteral(property)) {
        memberExpr = ts.factory.createPropertyAccessExpression(
          convertIRExpr(node.object),
          ts.factory.createIdentifier(property.text),
        );
      } else if (ts.isIdentifier(property)) {
        memberExpr = ts.factory.createPropertyAccessExpression(
          convertIRExpr(node.object),
          property,
        );
      } else {
        memberExpr = ts.factory.createElementAccessExpression(
          convertIRExpr(node.object),
          property,
        );
      }
    }
    return ts.factory.createCallExpression(
      memberExpr,
      undefined,
      node.arguments.map((arg) => convertIRExpr(arg)),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert call member expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "call member expression",
      node,
    );
  }
}

/**
 * Convert a new expression.
 */
function convertNewExpression(node: IR.IRNewExpression): ts.NewExpression {
  try {
    return ts.factory.createNewExpression(
      convertIRExpr(node.callee),
      undefined,
      node.arguments.map((arg) => convertIRExpr(arg)),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert new expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "new expression",
      node,
    );
  }
}

/**
 * Convert a binary expression.
 */
function convertBinaryExpression(
  node: IR.IRBinaryExpression,
): ts.BinaryExpression {
  try {
    if (!node.left || !node.right) {
      const left = node.left
        ? convertIRExpr(node.left)
        : ts.factory.createNumericLiteral("0");
      const right = node.right
        ? convertIRExpr(node.right)
        : (node.operator === "+"
          ? ts.factory.createNumericLiteral("1")
          : ts.factory.createNumericLiteral("0"));
      const operator = node.operator
        ? getBinaryOperator(node.operator)
        : ts.SyntaxKind.PlusToken;
      return ts.factory.createBinaryExpression(
        left,
        ts.factory.createToken(operator),
        right,
      );
    }
    const operator = getBinaryOperator(node.operator);
    return ts.factory.createBinaryExpression(
      convertIRExpr(node.left),
      ts.factory.createToken(operator),
      convertIRExpr(node.right),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert binary expression with operator "${node.operator}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      "binary expression",
      node,
    );
  }
}

/**
 * Helper to get the TypeScript binary operator token.
 */
function getBinaryOperator(op: string): ts.BinaryOperator {
  switch (op) {
    case "+":
      return ts.SyntaxKind.PlusToken;
    case "-":
      return ts.SyntaxKind.MinusToken;
    case "*":
      return ts.SyntaxKind.AsteriskToken;
    case "/":
      return ts.SyntaxKind.SlashToken;
    case "%":
      return ts.SyntaxKind.PercentToken;
    case "===":
    case "==":
      return ts.SyntaxKind.EqualsEqualsEqualsToken;
    case "!==":
    case "!=":
      return ts.SyntaxKind.ExclamationEqualsEqualsToken;
    case ">":
      return ts.SyntaxKind.GreaterThanToken;
    case "<":
      return ts.SyntaxKind.LessThanToken;
    case ">=":
      return ts.SyntaxKind.GreaterThanEqualsToken;
    case "<=":
      return ts.SyntaxKind.LessThanEqualsToken;
    case "&&":
      return ts.SyntaxKind.AmpersandAmpersandToken;
    case "||":
      return ts.SyntaxKind.BarBarToken;
    default:
      throw new CodeGenError(
        `Unknown binary operator: ${op}`,
        "binary expression operator",
        op,
      );
  }
}

/**
 * Convert a unary expression.
 */
function convertUnaryExpression(
  node: IR.IRUnaryExpression,
): ts.UnaryExpression {
  try {
    const operator = getUnaryOperator(node.operator);
    return ts.factory.createPrefixUnaryExpression(
      operator,
      convertIRExpr(node.argument),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert unary expression with operator "${node.operator}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      "unary expression",
      node,
    );
  }
}

/**
 * Helper to get the TypeScript unary operator token.
 */
function getUnaryOperator(op: string): ts.PrefixUnaryOperator {
  switch (op) {
    case "+":
      return ts.SyntaxKind.PlusToken;
    case "-":
      return ts.SyntaxKind.MinusToken;
    case "!":
      return ts.SyntaxKind.ExclamationToken;
    case "~":
      return ts.SyntaxKind.TildeToken;
    default:
      throw new CodeGenError(
        `Unknown unary operator: ${op}`,
        "unary expression operator",
        op,
      );
  }
}

/**
 * Convert a conditional expression.
 */
function convertConditionalExpression(
  node: IR.IRConditionalExpression,
): ts.ConditionalExpression {
  try {
    return ts.factory.createConditionalExpression(
      convertIRExpr(node.test),
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      convertIRExpr(node.consequent),
      ts.factory.createToken(ts.SyntaxKind.ColonToken),
      convertIRExpr(node.alternate),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert conditional expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "conditional expression",
      node,
    );
  }
}

/**
 * Convert an array expression.
 */
function convertArrayExpression(
  node: IR.IRArrayExpression,
): ts.ArrayLiteralExpression {
  try {
    return ts.factory.createArrayLiteralExpression(
      node.elements.map((elem) => convertIRExpr(elem)),
      false,
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert array expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "array expression",
      node,
    );
  }
}

/**
 * Convert a function expression.
 */
function convertFunctionExpression(
  node: IR.IRFunctionExpression,
): ts.FunctionExpression {
  try {
    const parameters = node.params.map((param) => {
      if (param.name && param.name.startsWith("...")) {
        const paramName = param.name.slice(3);
        return ts.factory.createParameterDeclaration(
          undefined,
          ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
          ts.factory.createIdentifier(paramName),
        );
      }
      return ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        convertIdentifier(param),
      );
    });
    return ts.factory.createFunctionExpression(
      undefined,
      undefined,
      undefined,
      undefined,
      parameters,
      undefined,
      convertBlockStatement(node.body),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert function expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "function expression",
      node,
    );
  }
}

/**
 * Convert a variable declaration.
 */
function convertVariableDeclaration(
  node: IR.IRVariableDeclaration,
): ts.VariableStatement {
  try {
    const nodeFlags = getVariableNodeFlags(node.kind);
    const declarations = node.declarations.map((decl) => {
      return ts.factory.createVariableDeclaration(
        convertIdentifier(decl.id),
        undefined,
        undefined,
        convertIRExpr(decl.init),
      );
    });
    return ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(declarations, nodeFlags),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert variable declaration: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "variable declaration",
      node,
    );
  }
}

/**
 * Helper to get node flags for variable declarations.
 */
function getVariableNodeFlags(kind: string): ts.NodeFlags {
  switch (kind) {
    case "const":
      return ts.NodeFlags.Const;
    case "let":
      return ts.NodeFlags.Let;
    case "var":
      return ts.NodeFlags.None;
    default:
      throw new CodeGenError(
        `Unknown variable declaration kind: ${kind}`,
        "variable declaration kind",
        kind,
      );
  }
}

/**
 * Convert a function declaration.
 */
function convertFunctionDeclaration(
  node: IR.IRFunctionDeclaration,
): ts.FunctionDeclaration {
  try {
    const params = node.params.map((param) => {
      return ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        convertIdentifier(param),
      );
    });
    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      convertIdentifier(node.id),
      undefined,
      params,
      undefined,
      convertBlockStatement(node.body),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert function declaration: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "function declaration",
      node,
    );
  }
}

/**
 * Convert a return statement.
 */
function convertReturnStatement(
  node: IR.IRReturnStatement,
): ts.ReturnStatement {
  try {
    return ts.factory.createReturnStatement(
      node.argument ? convertIRExpr(node.argument) : undefined,
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert return statement: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "return statement",
      node,
    );
  }
}

/**
 * Convert a block statement.
 */
function convertBlockStatement(node: IR.IRBlockStatement): ts.Block {
  try {
    const statements: ts.Statement[] = [];
    for (const stmt of node.body) {
      const converted = convertIRNode(stmt);
      if (Array.isArray(converted)) {
        statements.push(...converted);
      } else if (converted) {
        statements.push(converted);
      }
    }
    return ts.factory.createBlock(statements, true);
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert block statement: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "block statement",
      node,
    );
  }
}

/**
 * Convert an import declaration.
 */
function convertImportDeclaration(
  node: IR.IRImportDeclaration,
): ts.ImportDeclaration {
  try {
    if (!node.specifiers || node.specifiers.length === 0) {
      const moduleName = createModuleVariableName(node.source);
      return ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamespaceImport(
            ts.factory.createIdentifier(moduleName),
          ),
        ),
        ts.factory.createStringLiteral(node.source),
      );
    }
    const namedImports = node.specifiers.map((spec) => {
      const importedName = spec.imported.name;
      const localName = spec.local.name;
      return ts.factory.createImportSpecifier(
        false,
        importedName !== localName
          ? ts.factory.createIdentifier(importedName)
          : undefined,
        ts.factory.createIdentifier(localName),
      );
    });
    return ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports(namedImports),
      ),
      ts.factory.createStringLiteral(node.source),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert import declaration: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "import declaration",
      node,
    );
  }
}

/**
 * Convert a JS import reference.
 */
function convertJsImportReference(
  node: IR.IRJsImportReference,
): ts.Statement[] {
  try {
    const importName = sanitizeIdentifier(node.name);
    const internalModuleName = `${importName}Module`;
    const importDecl = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamespaceImport(
          ts.factory.createIdentifier(internalModuleName),
        ),
      ),
      ts.factory.createStringLiteral(node.source),
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
                      ts.factory.createIdentifier("default"),
                    ),
                    ts.factory.createToken(
                      ts.SyntaxKind.ExclamationEqualsEqualsToken,
                    ),
                    ts.factory.createIdentifier("undefined"),
                  ),
                  ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier(internalModuleName),
                    ts.factory.createIdentifier("default"),
                  ),
                  ts.factory.createToken(ts.SyntaxKind.ColonToken),
                  ts.factory.createObjectLiteralExpression([], false),
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
        ts.factory.createForOfStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createArrayBindingPattern([
                  ts.factory.createBindingElement(
                    undefined,
                    undefined,
                    ts.factory.createIdentifier("key"),
                    undefined,
                  ),
                  ts.factory.createBindingElement(
                    undefined,
                    undefined,
                    ts.factory.createIdentifier("value"),
                    undefined,
                  ),
                ]),
                undefined,
                undefined,
                undefined,
              ),
            ],
            ts.NodeFlags.Const,
          ),
          ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier("Object"),
              ts.factory.createIdentifier("entries"),
            ),
            undefined,
            [ts.factory.createIdentifier(internalModuleName)],
          ),
          ts.factory.createBlock(
            [
              ts.factory.createIfStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier("key"),
                  ts.factory.createToken(
                    ts.SyntaxKind.ExclamationEqualsEqualsToken,
                  ),
                  ts.factory.createStringLiteral("default"),
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier("wrapper"),
                      ts.factory.createIdentifier("key"),
                    ),
                    ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                    ts.factory.createIdentifier("value"),
                  ),
                ),
                undefined,
              ),
            ],
            true,
          ),
        ),
        ts.factory.createReturnStatement(
          ts.factory.createIdentifier("wrapper"),
        ),
      ],
      true,
    );
    const iife = ts.factory.createCallExpression(
      ts.factory.createParenthesizedExpression(
        ts.factory.createFunctionExpression(
          undefined,
          undefined,
          undefined,
          undefined,
          [],
          undefined,
          functionBody,
        ),
      ),
      undefined,
      [],
    );
    const defaultAssignment = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(importName),
            undefined,
            undefined,
            iife,
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );
    return [importDecl, defaultAssignment];
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert JS import reference: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "JS import reference",
      node,
    );
  }
}

/**
 * Convert an export named declaration.
 */
function convertExportNamedDeclaration(
  node: IR.IRExportNamedDeclaration,
): ts.ExportDeclaration {
  try {
    const specifiers = node.specifiers.map((spec) => {
      return ts.factory.createExportSpecifier(
        false,
        spec.local.name !== spec.exported.name
          ? ts.factory.createIdentifier(spec.local.name)
          : undefined,
        ts.factory.createIdentifier(spec.exported.name),
      );
    });
    return ts.factory.createExportDeclaration(
      undefined,
      false,
      ts.factory.createNamedExports(specifiers),
      undefined,
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert export named declaration: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "export named declaration",
      node,
    );
  }
}

/**
 * Convert an export variable declaration.
 */
function convertExportVariableDeclaration(
  node: IR.IRExportVariableDeclaration,
): ts.Statement[] {
  try {
    const varDecl = convertVariableDeclaration(node.declaration);
    const varName = node.declaration.declarations[0].id.name;
    const exportDecl = ts.factory.createExportDeclaration(
      undefined,
      false,
      ts.factory.createNamedExports([
        ts.factory.createExportSpecifier(
          false,
          ts.factory.createIdentifier(varName),
          ts.factory.createIdentifier(node.exportName),
        ),
      ]),
      undefined,
    );
    return [varDecl, exportDecl];
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert export variable declaration: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "export variable declaration",
      node,
    );
  }
}

/**
 * Convert an interop IIFE.
 */
function convertInteropIIFE(node: IR.IRInteropIIFE): ts.Expression {
  try {
    const objVar = ts.factory.createIdentifier("_obj");
    const memberVar = ts.factory.createIdentifier("_member");
    const statements: ts.Statement[] = [
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            objVar,
            undefined,
            undefined,
            convertIRExpr(node.object),
          )],
          ts.NodeFlags.Const,
        ),
      ),
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            memberVar,
            undefined,
            undefined,
            ts.factory.createElementAccessExpression(
              objVar,
              convertStringLiteral(node.property),
            ),
          )],
          ts.NodeFlags.Const,
        ),
      ),
      ts.factory.createReturnStatement(
        ts.factory.createConditionalExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createTypeOfExpression(memberVar),
            ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
            ts.factory.createStringLiteral("function"),
          ),
          ts.factory.createToken(ts.SyntaxKind.QuestionToken),
          ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(memberVar, "call"),
            undefined,
            [objVar],
          ),
          ts.factory.createToken(ts.SyntaxKind.ColonToken),
          memberVar,
        ),
      ),
    ];
    return ts.factory.createCallExpression(
      ts.factory.createFunctionExpression(
        undefined,
        undefined,
        undefined,
        undefined,
        [],
        undefined,
        ts.factory.createBlock(statements, true),
      ),
      undefined,
      [],
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert interop IIFE: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "interop IIFE",
      node,
    );
  }
}

/**
 * Convert a comment block.
 */
function convertCommentBlock(node: IR.IRCommentBlock): ts.EmptyStatement {
  try {
    const statement = ts.factory.createEmptyStatement();
    ts.addSyntheticLeadingComment(
      statement,
      ts.SyntaxKind.MultiLineCommentTrivia,
      node.value,
      true,
    );
    return statement;
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert comment block: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "comment block",
      node,
    );
  }
}

/**
 * Convert a raw node.
 */
function convertRaw(node: IR.IRRaw): ts.ExpressionStatement {
  try {
    return ts.factory.createExpressionStatement(
      ts.factory.createIdentifier(node.code),
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert raw code: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "raw code",
      node,
    );
  }
}

/**
 * Convert an IR Node to a TypeScript Expression.
 */
function convertIRExpr(node: IR.IRNode): ts.Expression {
  try {
    if (!node) {
      console.warn("Null node passed to convertIRExpr, returning 'undefined'");
      return ts.factory.createIdentifier("undefined");
    }

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
        return convertConditionalExpression(
          node as IR.IRConditionalExpression,
        );
      case IR.IRNodeType.ArrayExpression:
        return convertArrayExpression(node as IR.IRArrayExpression);
      case IR.IRNodeType.FunctionExpression:
        return convertFunctionExpression(node as IR.IRFunctionExpression);
      case IR.IRNodeType.InteropIIFE:
        return convertInteropIIFE(node as IR.IRInteropIIFE);
      default:
        throw new CodeGenError(
          `Cannot convert node of type ${
            IR.IRNodeType[node.type] || node.type
          } to expression`,
          `IR node ${IR.IRNodeType[node.type] || node.type}`,
          node,
        );
    }
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert IR node to expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      node ? IR.IRNodeType[node.type] || String(node.type) : "unknown",
      node,
    );
  }
}

/**
 * Create a module variable name from the source path.
 */
function createModuleVariableName(source: string): string {
  try {
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
    baseName = baseName.replace(
      /[^a-zA-Z0-9]+(.)/g,
      (_, c) => c.toUpperCase(),
    );
    baseName = baseName.replace(/^[^a-zA-Z_$]/, "_");
    return `${baseName}Module`;
  } catch (error) {
    throw new CodeGenError(
      `Failed to create module variable name: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "module variable name creation",
      source,
    );
  }
}
