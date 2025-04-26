import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { convertIRExpr } from "../pipeline/hql-ir-to-ts-ast.ts";
import { CodeGenError } from "../../common/error.ts";
import { execute } from "../pipeline/hql-ir-to-ts-ast.ts";

export function convertAssignmentExpression(node: IR.IRAssignmentExpression): ts.Expression {
  return execute(node, "assignment expression", () =>
    ts.factory.createBinaryExpression(
      convertIRExpr(node.left),
      ts.SyntaxKind.EqualsToken,
      convertIRExpr(node.right)
    )
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
      return ts.factory.createBinaryExpression(left, operator, right);
    }
    return ts.factory.createBinaryExpression(
      convertIRExpr(node.left),
      getBinaryOperator(node.operator),
      convertIRExpr(node.right)
    );
  });
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

function getBinaryOperator(op: string): ts.BinaryOperatorToken {
  switch (op) {
    case "+": return ts.factory.createToken(ts.SyntaxKind.PlusToken);
    case "-": return ts.factory.createToken(ts.SyntaxKind.MinusToken);
    case "*": return ts.factory.createToken(ts.SyntaxKind.AsteriskToken);
    case "/": return ts.factory.createToken(ts.SyntaxKind.SlashToken);
    case "%": return ts.factory.createToken(ts.SyntaxKind.PercentToken);
    case "===":
    case "==": return ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken);
    case "!==":
    case "!=": return ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken);
    case ">": return ts.factory.createToken(ts.SyntaxKind.GreaterThanToken);
    case "<": return ts.factory.createToken(ts.SyntaxKind.LessThanToken);
    case ">=": return ts.factory.createToken(ts.SyntaxKind.GreaterThanEqualsToken);
    case "<=": return ts.factory.createToken(ts.SyntaxKind.LessThanEqualsToken);
    case "&&": return ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken);
    case "||": return ts.factory.createToken(ts.SyntaxKind.BarBarToken);
    default:
      throw new CodeGenError(`Unknown binary operator: ${op}`, "binary expression operator", op);
  }
}