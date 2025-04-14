// src/transpiler/syntax/loop-recur.ts
// Module for handling loop and recur special forms

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError } from "../error/errors.ts";
import { sanitizeIdentifier } from "../../utils/utils.ts";
import { formatErrorMessage } from "../error/common-error-utils.ts";

// Stack to track the current loop context for recur targeting
const loopContextStack: string[] = [];

// Counter for generating unique loop names
let loopIdCounter = 0;

/**
 * Generate a unique loop identifier for proper recur targeting
 */
export function generateLoopId(): string {
  return `loop_${loopIdCounter++}`;
}

/**
 * Get the current loop context - used by recur to know which loop to target
 */
export function getCurrentLoopContext(): string | undefined {
  return loopContextStack.length > 0 ? loopContextStack[loopContextStack.length - 1] : undefined;
}

/**
 * Push a new loop context to the stack
 */
export function pushLoopContext(loopId: string): void {
  loopContextStack.push(loopId);
}

/**
 * Pop the most recent loop context from the stack
 */
export function popLoopContext(): string | undefined {
  return loopContextStack.pop();
}

/**
 * Check if there's an active loop context
 */
export function hasLoopContext(): boolean {
  return loopContextStack.length > 0;
}

/**
 * Transform a loop special form to its IR representation.
 */
export function transformLoop(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  try {
    // Verify loop syntax: (loop (bindings...) body...)
    if (list.elements.length < 3) {
      throw new ValidationError(
        "loop requires bindings and at least one body expression",
        "loop statement",
        "bindings and body",
        `${list.elements.length - 1} elements`
      );
    }

    const bindingsNode = list.elements[1];
    if (bindingsNode.type !== "list") {
      throw new ValidationError(
        "loop bindings must be a list",
        "loop bindings",
        "list",
        bindingsNode.type
      );
    }

    const bindings = bindingsNode as ListNode;
    if (bindings.elements.length % 2 !== 0) {
      throw new ValidationError(
        "loop bindings require an even number of forms",
        "loop bindings",
        "even number",
        String(bindings.elements.length)
      );
    }

    // Create a unique ID for this loop context
    const loopId = generateLoopId();
    pushLoopContext(loopId); // Push this loop onto the context stack

    try {
      // Extract parameter names and initial values
      const params: IR.IRIdentifier[] = [];
      const initialValues: IR.IRNode[] = [];

      for (let i = 0; i < bindings.elements.length; i += 2) {
        const nameNode = bindings.elements[i];
        if (nameNode.type !== "symbol") {
          throw new ValidationError(
            "loop binding names must be symbols",
            "loop binding name",
            "symbol",
            nameNode.type
          );
        }

        const paramName = (nameNode as SymbolNode).name;
        params.push({
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(paramName)
        });

        // Transform the initial value
        const valueNode = transformNode(bindings.elements[i + 1], currentDir);
        if (!valueNode) {
          throw new ValidationError(
            `Binding value for '${paramName}' transformed to null`,
            "loop binding value",
            "valid expression",
            "null"
          );
        }
        initialValues.push(valueNode);
      }

      // Transform the body expressions
      // For a loop, we'll wrap all body expressions in a single block statement
      // This ensures the recur call is properly tail-recursive
      let bodyBlock: IR.IRBlockStatement;

      // Special case: If there's only one expression in the body and it's an if/when
      // we'll transform it specially to ensure proper tail recursion
      if (list.elements.length === 3 && list.elements[2].type === "list") {
        const bodyExpr = list.elements[2] as ListNode;
        if (bodyExpr.elements.length > 0 && bodyExpr.elements[0].type === "symbol") {
          const op = (bodyExpr.elements[0] as SymbolNode).name;

          if (op === "if" || op === "when") {
            // Ensure we add a return statement for the if/when result
            // This is a critical fix to ensure the result is returned
            const transformed = transformIfForLoop(bodyExpr, currentDir, transformNode);
            if (transformed) {
              bodyBlock = {
                type: IR.IRNodeType.BlockStatement,
                body: [transformed]
              };
            } else {
              bodyBlock = {
                type: IR.IRNodeType.BlockStatement,
                body: []
              };
            }
          } else {
            // Regular case: transform all body expressions
            bodyBlock = transformLoopBody(list.elements.slice(2), currentDir, transformNode);
          }
        } else {
          // Regular case: transform all body expressions
          bodyBlock = transformLoopBody(list.elements.slice(2), currentDir, transformNode);
        }
      } else {
        // Regular case: transform all body expressions
        bodyBlock = transformLoopBody(list.elements.slice(2), currentDir, transformNode);
      }

      // Create the loop function declaration
      const loopFunc: IR.IRFunctionDeclaration = {
        type: IR.IRNodeType.FunctionDeclaration,
        id: {
          type: IR.IRNodeType.Identifier,
          name: loopId
        },
        params,
        body: bodyBlock
      };

      // Create initial function call with binding values
      const initialCall: IR.IRCallExpression = {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: loopId
        } as IR.IRIdentifier,
        arguments: initialValues
      };

      // Create IIFE to contain both the function declaration and initial call
      const iife: IR.IRCallExpression = {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.FunctionExpression,
          id: null,
          params: [],
          body: {
            type: IR.IRNodeType.BlockStatement,
            body: [
              loopFunc,
              {
                type: IR.IRNodeType.ReturnStatement,
                argument: initialCall
              } as IR.IRReturnStatement
            ]
          }
        } as IR.IRFunctionExpression,
        arguments: []
      };

      return iife;
    } finally {
      // Always pop the loop context, even on error
      popLoopContext();
    }
  } catch (error) {
    throw new TransformError(
      `Failed to transform loop: ${formatErrorMessage(error)}`,
      "loop transformation",
      "valid loop expression",
      list
    );
  }
}

/**
 * Transform if expression specifically for loop body
 * Ensures proper return statements for both branches
 */
export function transformIfForLoop(
  ifExpr: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  try {
    // Validate if syntax: (if test then else?)
    if (ifExpr.elements.length < 3) {
      throw new ValidationError(
        "if requires test and then clause",
        "if statement",
        "test and then clause",
        `${ifExpr.elements.length - 1} elements`
      );
    }

    // Transform test expression
    const test = transformNode(ifExpr.elements[1], currentDir);
    if (!test) {
      throw new ValidationError(
        "Test expression transformed to null",
        "if test",
        "valid expression",
        "null"
      );
    }

    // Transform consequent expression
    let consequent = transformNode(ifExpr.elements[2], currentDir);
    if (!consequent) {
      consequent = {
        type: IR.IRNodeType.ReturnStatement,
        argument: {
          type: IR.IRNodeType.NullLiteral
        }
      } as IR.IRReturnStatement;
    }

    // Handle 'else' expression if present, otherwise default to `return null`
    let alternate: IR.IRNode;
    if (ifExpr.elements.length > 3) {
      const transformed = transformNode(ifExpr.elements[3], currentDir);
      if (transformed) {
        // Wrap in return statement if not already
        if (transformed.type !== IR.IRNodeType.ReturnStatement) {
          alternate = {
            type: IR.IRNodeType.ReturnStatement,
            argument: transformed
          } as IR.IRReturnStatement;
        } else {
          alternate = transformed;
        }
      } else {
        alternate = {
          type: IR.IRNodeType.ReturnStatement,
          argument: {
            type: IR.IRNodeType.NullLiteral
          }
        } as IR.IRReturnStatement;
      }
    } else {
      // No else branch, default to returning null
      alternate = {
        type: IR.IRNodeType.ReturnStatement,
        argument: {
          type: IR.IRNodeType.NullLiteral
        }
      } as IR.IRReturnStatement;
    }

    // Create the IfStatement node
    const ifStatement: IR.IRIfStatement = {
      type: IR.IRNodeType.IfStatement,
      test,
      consequent,
      alternate
    };

    return ifStatement;
  } catch (error) {
    throw new TransformError(
      `Failed to transform if for loop: ${formatErrorMessage(error)}`,
      "if transformation for loop",
      "valid if expression",
      ifExpr
    );
  }
}

/**
 * Check if an expression is a recur form
 */
export function isRecurExpression(expr: any): boolean {
  return (
    expr?.type === "list" &&
    expr.elements?.length > 0 &&
    expr.elements[0]?.type === "symbol" &&
    expr.elements[0].name === "recur"
  );
}

/**
 * Transform a recur special form to its IR representation.
 */
export function transformRecur(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  try {
    // Verify we're inside a loop context
    const loopId = getCurrentLoopContext();
    if (!loopId) {
      throw new ValidationError(
        "recur used outside of loop context",
        "recur statement",
        "to be within a loop",
        "outside loop"
      );
    }

    // Transform the arguments
    const args: IR.IRNode[] = [];
    for (let i = 1; i < list.elements.length; i++) {
      const arg = transformNode(list.elements[i], currentDir);
      if (!arg) {
        throw new ValidationError(
          `Argument ${i} transformed to null`,
          "recur argument",
          "valid expression",
          "null"
        );
      }
      args.push(arg);
    }

    // Create a call to the loop function
    const loopCall: IR.IRCallExpression = {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: loopId
      } as IR.IRIdentifier,
      arguments: args
    };

    // Wrap in a return statement to ensure proper tail recursion
    const returnStmt: IR.IRReturnStatement = {
      type: IR.IRNodeType.ReturnStatement,
      argument: loopCall
    };

    return returnStmt;
  } catch (error) {
    throw new TransformError(
      `Failed to transform recur: ${formatErrorMessage(error)}`,
      "recur transformation",
      "valid recur expression",
      list
    );
  }
}

/**
 * Transform the body of a loop expression
 */
export function transformLoopBody(
  bodyExprs: any[], 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRBlockStatement {
  // Create a block to hold body statements
  const body: IR.IRNode[] = [];
  
  // Process all but the last expression as regular statements
  for (let i = 0; i < bodyExprs.length - 1; i++) {
    const expr = transformNode(bodyExprs[i], currentDir);
    if (expr) {
      body.push(expr);
    }
  }
  
  // Special handling for last expression - must be returned
  if (bodyExprs.length > 0) {
    const lastExpr = bodyExprs[bodyExprs.length - 1];
    
    // If the last expression is a recur, it already returns
    if (isRecurExpression(lastExpr)) {
      const transformedExpr = transformNode(lastExpr, currentDir);
      if (transformedExpr) {
        body.push(transformedExpr);
      }
    } else {
      // Otherwise, wrap in a return statement
      const transformedExpr = transformNode(lastExpr, currentDir);
      if (transformedExpr) {
        const returnStmt: IR.IRReturnStatement = {
          type: IR.IRNodeType.ReturnStatement,
          argument: transformedExpr
        };
        body.push(returnStmt);
      }
    }
  }
  
  return {
    type: IR.IRNodeType.BlockStatement,
    body
  };
}