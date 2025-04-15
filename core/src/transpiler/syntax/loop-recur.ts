// src/transpiler/syntax/loop-recur.ts
// Module for handling loop and recur special forms

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError } from "../error/errors.ts";
import { sanitizeIdentifier } from "../../common/utils.ts";

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
        String(bindings.elements.length) // Convert to string to fix type error
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
        },
        arguments: initialValues
      };

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
          } as IR.IRBlockStatement
        },
        arguments: []
      };

      return iife;
    } finally {
      // Always pop the loop context, even on error
      popLoopContext();
    }
  } catch (error) {
    throw new TransformError(
      `Failed to transform loop: ${error instanceof Error ? error.message : String(error)}`,
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

    // Transform 'then' expression - wrap in return if not already a return or recur
    const thenExpr = ifExpr.elements[2];
    let consequent: IR.IRNode | null = null;
    
    if (isRecurExpression(thenExpr)) {
      // If it's recur, transform directly - recur generates its own return
      consequent = transformNode(thenExpr, currentDir);
      if (consequent === null) {
        throw new ValidationError(
          "Then clause (recur) transformed to null",
          "if consequent",
          "valid recur expression",
          "null"
        );
      }
    } else {
      // Otherwise ensure it's returned
      const transformed = transformNode(thenExpr, currentDir);
      if (!transformed) {
        throw new ValidationError(
          "Then clause transformed to null",
          "if consequent",
          "valid expression",
          "null"
        );
      }
      
      // Wrap in return if not already a return statement
      consequent = transformed.type === IR.IRNodeType.ReturnStatement
        ? transformed
        : {
            type: IR.IRNodeType.ReturnStatement,
            argument: transformed
          } as IR.IRReturnStatement;
    }

    // Transform 'else' expression if it exists
    let alternate: IR.IRNode | null = null;
    if (ifExpr.elements.length > 3) {
      const elseExpr = ifExpr.elements[3];
      
      if (isRecurExpression(elseExpr)) {
        // If it's recur, transform directly - recur generates its own return
        alternate = transformNode(elseExpr, currentDir);
      } else {
        // Otherwise ensure it's returned
        const transformed = transformNode(elseExpr, currentDir);
        if (transformed) {
          // Wrap in return if not already a return statement
          alternate = transformed.type === IR.IRNodeType.ReturnStatement
            ? transformed
            : {
                type: IR.IRNodeType.ReturnStatement,
                argument: transformed
              } as IR.IRReturnStatement;
        }
      }
    }

    // Create the if statement with proper return statements
    return {
      type: IR.IRNodeType.IfStatement,
      test,
      consequent,
      alternate
    } as IR.IRIfStatement;
  } catch (error) {
    throw new TransformError(
      `Failed to transform if for loop: ${error instanceof Error ? error.message : String(error)}`,
      "if in loop transformation",
      "valid if expression",
      ifExpr
    );
  }
}

/**
 * Check if a given expression is a recur expression
 */
export function isRecurExpression(expr: any): boolean {
  return expr.type === "list" &&
    expr.elements.length > 0 &&
    expr.elements[0].type === "symbol" &&
    (expr.elements[0] as SymbolNode).name === "recur";
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
    // Verify that we have at least the recur keyword
    if (list.elements.length < 1) {
      throw new ValidationError(
        "Invalid recur form",
        "recur statement",
        "recur with arguments",
        "incomplete recur form"
      );
    }

    // Get the current loop context (last item on the stack)
    if (!hasLoopContext()) {
      throw new ValidationError(
        "recur must be used inside a loop",
        "recur statement",
        "inside loop context",
        "outside loop context"
      );
    }

    const loopId = getCurrentLoopContext()!;

    // Transform all the argument expressions
    const args: IR.IRNode[] = [];
    for (let i = 1; i < list.elements.length; i++) {
      const transformedArg = transformNode(list.elements[i], currentDir);
      if (!transformedArg) {
        throw new ValidationError(
          `Argument ${i} in recur transformed to null`,
          "recur argument",
          "valid expression",
          "null"
        );
      }
      args.push(transformedArg);
    }

    // Create a direct function call to the loop function
    const loopCall: IR.IRCallExpression = {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: loopId
      } as IR.IRIdentifier,
      arguments: args
    };

    // Return a return statement with the loop call
    // This is essential for proper tail call optimization
    return {
      type: IR.IRNodeType.ReturnStatement,
      argument: loopCall
    } as IR.IRReturnStatement;
  } catch (error) {
    throw new TransformError(
      `Failed to transform recur: ${error instanceof Error ? error.message : String(error)}`,
      "recur transformation",
      "valid recur expression",
      list
    );
  }
}

/**
 * Helper function to transform a list of body expressions for a loop
 */
export function transformLoopBody(
  bodyExprs: any[], 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRBlockStatement {
  // If only one expression and it's not already a return, wrap it in return
  if (bodyExprs.length === 1 && !isRecurExpression(bodyExprs[0])) {
    const transformedExpr = transformNode(bodyExprs[0], currentDir);
    if (transformedExpr) {
      // If it's already a return or if statement, use it directly
      if (transformedExpr.type === IR.IRNodeType.ReturnStatement || 
          transformedExpr.type === IR.IRNodeType.IfStatement) {
        return {
          type: IR.IRNodeType.BlockStatement,
          body: [transformedExpr]
        };
      }
      
      // Otherwise wrap in return
      return {
        type: IR.IRNodeType.BlockStatement,
        body: [{
          type: IR.IRNodeType.ReturnStatement,
          argument: transformedExpr
        } as IR.IRReturnStatement]
      };
    }
  }

  // For multiple expressions, handle each one
  const bodyNodes: IR.IRNode[] = [];

  // Process all except the last one normally
  for (let i = 0; i < bodyExprs.length - 1; i++) {
    const transformedExpr = transformNode(bodyExprs[i], currentDir);
    if (transformedExpr) {
      bodyNodes.push(transformedExpr);
    }
  }

  // Handle the last expression specially - wrap in return if needed
  if (bodyExprs.length > 0) {
    const lastExpr = bodyExprs[bodyExprs.length - 1];
    
    if (isRecurExpression(lastExpr)) {
      // Recur already returns appropriately
      const transformedExpr = transformNode(lastExpr, currentDir);
      if (transformedExpr) {
        bodyNodes.push(transformedExpr);
      }
    } else {
      // Transform the last expression
      const transformedExpr = transformNode(lastExpr, currentDir);
      if (transformedExpr) {
        // If it's already a return or if statement, use it directly
        if (transformedExpr.type === IR.IRNodeType.ReturnStatement || 
            transformedExpr.type === IR.IRNodeType.IfStatement) {
          bodyNodes.push(transformedExpr);
        } else {
          // Otherwise wrap in return
          bodyNodes.push({
            type: IR.IRNodeType.ReturnStatement,
            argument: transformedExpr
          } as IR.IRReturnStatement);
        }
      }
    }
  }

  return {
    type: IR.IRNodeType.BlockStatement,
    body: bodyNodes
  };
}