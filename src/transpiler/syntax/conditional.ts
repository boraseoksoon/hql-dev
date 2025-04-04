// src/transpiler/syntax/conditional.ts
// Module for handling conditional expressions (if, cond, etc.)

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError } from "../error/errors.ts";
import { perform } from "../error/error-utils.ts";

/**
 * Transform an if expression.
 */
export function transformIf(
  list: ListNode, 
  currentDir: string, 
  transformNode: (node: any, dir: string) => IR.IRNode | null,
  isInLoopContext: () => boolean
): IR.IRNode {
  try {
    if (list.elements.length < 3 || list.elements.length > 4) {
      throw new ValidationError(
        `if requires 2 or 3 arguments, got ${list.elements.length - 1}`,
        "if expression",
        "2 or 3 arguments",
        `${list.elements.length - 1} arguments`,
      );
    }

    const test = transformNode(list.elements[1], currentDir);
    if (!test) {
      throw new ValidationError(
        "Test condition transformed to null",
        "if test",
        "valid test expression",
        "null",
      );
    }

    const consequent = transformNode(list.elements[2], currentDir);
    if (!consequent) {
      throw new ValidationError(
        "Then branch transformed to null",
        "if consequent",
        "valid consequent expression",
        "null",
      );
    }

    const alternate = list.elements.length > 3
      ? transformNode(list.elements[3], currentDir)
      : ({ type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral);

    if (!alternate) {
      throw new ValidationError(
        "Else branch transformed to null",
        "if alternate",
        "valid alternate expression",
        "null",
      );
    }

    // If we're in a loop context, we need to handle this differently
    if (isInLoopContext()) {
      // Create an if statement rather than a conditional expression
      return {
        type: IR.IRNodeType.IfStatement,
        test,
        consequent,
        alternate,
      } as IR.IRIfStatement;
    }

    // Regular case - create conditional expression
    return {
      type: IR.IRNodeType.ConditionalExpression,
      test,
      consequent,
      alternate,
    } as IR.IRConditionalExpression;
  } catch (error) {
    throw new TransformError(
      `Failed to transform if: ${error instanceof Error ? error.message : String(error)}`,
      "if transformation",
      "valid if expression",
      list
    );
  }
}

/**
 * Transform a cond expression to nested conditional expressions
 */
export function transformCond(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      // Extract clauses (skip the 'cond' symbol)
      const clauses = list.elements.slice(1);

      // If no clauses, return nil
      if (clauses.length === 0) {
        return { type: IR.IRNodeType.NullLiteral };
      }

      // Process clauses from first to last
      for (let i = 0; i < clauses.length; i++) {
        const clause = clauses[i];

        // Validate clause format
        if (clause.type !== "list" || (clause as ListNode).elements.length < 2) {
          throw new ValidationError(
            "cond clause must be a list with test and result expressions",
            "cond clause",
            "list with test and result",
            clause.type
          );
        }

        const clauseList = clause as ListNode;
        const testExpr = clauseList.elements[0];

        // Handle 'else' or 'true' as the test condition
        if (testExpr.type === "symbol" && (testExpr as SymbolNode).name === "else") {
          const consequent = transformNode(clauseList.elements[1], currentDir);
          return consequent || { type: IR.IRNodeType.NullLiteral };
        }

        // Evaluate the condition
        const test = transformNode(testExpr, currentDir);
        if (!test) {
          throw new ValidationError(
            "Test condition transformed to null",
            "cond test",
            "valid test expression",
            "null"
          );
        }
        
        const consequent = transformNode(clauseList.elements[1], currentDir);
        if (!consequent) {
          throw new ValidationError(
            "Consequent expression transformed to null",
            "cond consequent",
            "valid consequent expression",
            "null"
          );
        }

        // If this is the last clause, it becomes the alternate for all previous conditions
        if (i === clauses.length - 1) {
          return {
            type: IR.IRNodeType.ConditionalExpression,
            test,
            consequent,
            alternate: { type: IR.IRNodeType.NullLiteral }
          };
        }

        // Build a nested conditional for each subsequent clause
        const restClauses = list.elements.slice(0, 1).concat(clauses.slice(i + 1));
        const alternate = transformCond({ type: "list", elements: restClauses }, currentDir, transformNode);

        return {
          type: IR.IRNodeType.ConditionalExpression,
          test,
          consequent,
          alternate
        };
      }

      // Default case if no clauses match (should not reach here)
      return { type: IR.IRNodeType.NullLiteral };
    },
    "transformCond",
    TransformError,
    [list]
  );
}

/**
 * Transform a lambda expression into a function expression
 */
export function transformLambda(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
  processFunctionBody: (body: any[], dir: string) => IR.IRNode[]
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 3) {
        throw new ValidationError(
          "lambda requires parameters and body",
          "lambda expression",
          "parameters and body",
          `${list.elements.length - 1} arguments`,
        );
      }

      const paramsNode = list.elements[1];
      if (paramsNode.type !== "list") {
        throw new ValidationError(
          "lambda parameters must be a list",
          "lambda parameters",
          "list",
          paramsNode.type,
        );
      }

      // Extract parameter names directly from the parameter list
      const paramList = paramsNode as ListNode;
      const params: IR.IRIdentifier[] = [];
      let restParam: IR.IRIdentifier | null = null;
      let restMode = false;

      for (const param of paramList.elements) {
        if (param.type === "symbol") {
          const paramName = (param as SymbolNode).name;

          if (paramName === "&") {
            restMode = true;
            continue;
          }

          if (restMode) {
            if (restParam !== null) {
              throw new ValidationError(
                `Multiple rest parameters not allowed: found '${
                  restParam.name.slice(3)
                }' and '${paramName}'`,
                "rest parameter",
                "single rest parameter",
                "multiple rest parameters",
              );
            }
            restParam = {
              type: IR.IRNodeType.Identifier,
              name: `...${paramName}`,
            } as IR.IRIdentifier;
          } else {
            params.push({
              type: IR.IRNodeType.Identifier,
              name: paramName,
            } as IR.IRIdentifier);
          }
        }
      }

      // Skip return type annotation if present
      let bodyStartIndex = 2;
      if (list.elements.length > 2 && list.elements[2].type === "list") {
        const possibleReturnType = list.elements[2] as ListNode;
        if (
          possibleReturnType.elements.length > 0 &&
          possibleReturnType.elements[0].type === "symbol" &&
          (possibleReturnType.elements[0] as SymbolNode).name === "->"
        ) {
          // This is a return type annotation, skip it
          bodyStartIndex = 3;
        }
      }

      // Process the body
      const bodyNodes = processFunctionBody(list.elements.slice(bodyStartIndex), currentDir);

      return {
        type: IR.IRNodeType.FunctionExpression,
        id: null,
        params: [...params, ...(restParam ? [restParam] : [])],
        body: { type: IR.IRNodeType.BlockStatement, body: bodyNodes },
      } as IR.IRFunctionExpression;
    },
    "transformLambda",
    TransformError,
    [list],
  );
}

/**
 * Transform a "return" statement
 */
export function transformReturn(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      // Verify we have at least one argument
      if (list.elements.length < 2) {
        throw new ValidationError(
          "return requires an expression to return",
          "return statement",
          "expression to return",
          "no expression provided",
        );
      }

      // Get the value to return
      const valueNode = transformNode(list.elements[1], currentDir);

      if (!valueNode) {
        throw new ValidationError(
          "Return value transformed to null",
          "return value",
          "valid expression",
          "null",
        );
      }

      // Create a return statement
      return {
        type: IR.IRNodeType.ReturnStatement,
        argument: valueNode,
      } as IR.IRReturnStatement;
    },
    "transformReturn",
    TransformError,
    [list],
  );
}

/**
 * Transform a "do" expression (execute multiple expressions and return the value of the last one)
 */
export function transformDo(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      // Get body expressions (skip the 'do' symbol)
      const bodyExprs = list.elements.slice(1);

      // If no body, return null
      if (bodyExprs.length === 0) {
        return { type: IR.IRNodeType.NullLiteral };
      }

      // If only one expression, just transform it directly
      if (bodyExprs.length === 1) {
        const expr = transformNode(bodyExprs[0], currentDir);
        return expr || { type: IR.IRNodeType.NullLiteral };
      }

      // Multiple expressions - create statements for IIFE body
      const bodyStatements: IR.IRNode[] = [];

      // Transform all except the last expression
      for (let i = 0; i < bodyExprs.length - 1; i++) {
        const transformedExpr = transformNode(bodyExprs[i], currentDir);
        if (transformedExpr) {
          bodyStatements.push(transformedExpr);
        }
      }

      // Transform the last expression - it's the return value
      const lastExpr = transformNode(bodyExprs[bodyExprs.length - 1], currentDir);

      if (lastExpr) {
        // Create a return statement for the last expression
        bodyStatements.push({
          type: IR.IRNodeType.ReturnStatement,
          argument: lastExpr
        });
      }

      // Return an IIFE (Immediately Invoked Function Expression)
      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.FunctionExpression,
          id: null,
          params: [],
          body: {
            type: IR.IRNodeType.BlockStatement,
            body: bodyStatements
          }
        },
        arguments: []
      };
    },
    "transformDo",
    TransformError,
    [list],
  );
}