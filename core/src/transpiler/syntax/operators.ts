import * as ts from "npm:typescript";
import { convertIRExpr } from "../pipeline/hql-ir-to-ts-ast.ts";
import { CodeGenError } from "../error/errors.ts";
import { execute } from "../pipeline/hql-ir-to-ts-ast.ts";
import * as IR from "../type/hql_ir.ts";

export function convertAssignmentExpression(node: IR.IRAssignmentExpression): ts.Expression {
    return execute(node, "assignment expression", () => {
      if (!node || !node.left || !node.right) {
        throw new CodeGenError(
          "Invalid assignment expression: missing left or right operand",
          "assignment expression",
          node
        );
      }
      return ts.factory.createBinaryExpression(
        convertIRExpr(node.left),
        ts.factory.createToken(ts.SyntaxKind.EqualsToken),
        convertIRExpr(node.right)
      )
    });
  }
  
export function convertBinaryExpression(node: IR.IRBinaryExpression): ts.BinaryExpression {
    return execute(node, "binary expression", () => {
      if (!node) {
        throw new CodeGenError(
          "Invalid binary expression: node is undefined",
          "binary expression",
          node
        );
      }

      if (!node.left || !node.right) {
        const left = node.left ? convertIRExpr(node.left) : ts.factory.createNumericLiteral("0");
        const right = node.right ? convertIRExpr(node.right)
          : node.operator === "+"
            ? ts.factory.createNumericLiteral("1")
            : ts.factory.createNumericLiteral("0");
        const operator = node.operator ? getBinaryOperator(node.operator) : ts.SyntaxKind.PlusToken;
        
        return ts.factory.createBinaryExpression(
          left,
          operator as any,
          right
        );
      }
      return ts.factory.createBinaryExpression(
        convertIRExpr(node.left),
        getBinaryOperator(node.operator) as any,
        convertIRExpr(node.right)
      );
    });
  }
  
  export function convertUnaryExpression(node: IR.IRUnaryExpression): ts.UnaryExpression {
    return execute(node, "unary expression", () => {
      if (!node || !node.operator || !node.argument) {
        throw new CodeGenError(
          "Invalid unary expression: missing operator or argument",
          "unary expression",
          node
        );
      }
      return ts.factory.createPrefixUnaryExpression(
        getUnaryOperator(node.operator), 
        convertIRExpr(node.argument)
      );
    });
  }
  
  function getUnaryOperator(op: string): ts.PrefixUnaryOperator {
    if (!op) {
      throw new CodeGenError(
        "Invalid unary operator: undefined",
        "unary expression operator",
        op
      );
    }
    
    switch (op) {
      case "+": return ts.SyntaxKind.PlusToken;
      case "-": return ts.SyntaxKind.MinusToken;
      case "!": return ts.SyntaxKind.ExclamationToken;
      case "~": return ts.SyntaxKind.TildeToken;
      default:
        throw new CodeGenError(`Unknown unary operator: ${op}`, "unary expression operator", op);
    }
  }
  
  function getBinaryOperator(op: string): ts.BinaryOperator {
    if (!op) {
      throw new CodeGenError(
        "Invalid binary operator: undefined",
        "binary expression operator",
        op
      );
    }
    
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