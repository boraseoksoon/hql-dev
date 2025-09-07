import * as ts from "npm:typescript@^5.0.0";
import * as IR from "../type/hql_ir.ts";
import { execute, convertIRExpr } from "../pipeline/hql-ir-to-ts-ast.ts";

export function convertExpressionStatement(node: IR.IRExpressionStatement): ts.ExpressionStatement {
    return execute(node, "expression statement", () =>
      ts.factory.createExpressionStatement(convertIRExpr(node.expression))
    );
  }

export function createExpressionStatement(expr: ts.Expression): ts.ExpressionStatement {
    return execute(expr, "expression statement creation", () =>
      ts.factory.createExpressionStatement(expr)
    );
  }
  
  export function expressionStatement<T>(node: T, conv: (node: T) => ts.Expression): ts.ExpressionStatement {
    return createExpressionStatement(conv(node));
  }
  
  export function isExpressionNode(node: IR.IRNode): boolean {
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