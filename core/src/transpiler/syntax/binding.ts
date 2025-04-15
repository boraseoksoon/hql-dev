// src/transpiler/syntax/binding.ts
// Module for handling variable binding expressions (let and var)

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError } from "../error/errors.ts";
import { sanitizeIdentifier } from "../../common/utils.ts";
import { perform } from "../error/index.ts";

/**
 * Transform a 'let' expression (immutable binding).
 * Handles both forms:
 * 1. (let name value) - Global immutable binding
 * 2. (let (name1 value1 name2 value2...) body...) - Local immutable binding block
 */
export function transformLet(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  // Handle global binding form: (let name value)
  if (list.elements.length === 3 && list.elements[1].type === "symbol") {
    const nameNode = list.elements[1] as SymbolNode;
    const id = {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(nameNode.name),
    } as IR.IRIdentifier;
    
    const init = transformNode(list.elements[2], currentDir);

    if (!init) {
      throw new ValidationError(
        "Let value transformed to null",
        "let value",
        "valid expression",
        "null",
      );
    }

    return {
      type: IR.IRNodeType.VariableDeclaration,
      kind: "const", // Use 'const' for immutable bindings
      declarations: [
        {
          type: IR.IRNodeType.VariableDeclarator,
          id,
          init,
        },
      ],
    } as IR.IRVariableDeclaration;
  }

  // Handle the specific case (let (name value) body...)
  // This is a specific pattern in some files
  if (list.elements.length >= 2 &&
      list.elements[1].type === "list" &&
      (list.elements[1] as ListNode).elements.length === 2) {

    const bindingList = list.elements[1] as ListNode;
    // Extract name and value
    const nameNode = bindingList.elements[0];
    const valueNode = bindingList.elements[1];

    if (nameNode.type !== "symbol") {
      throw new ValidationError(
        "Binding name must be a symbol",
        "let binding name",
        "symbol",
        nameNode.type
      );
    }

    const name = (nameNode as SymbolNode).name;
    const valueExpr = transformNode(valueNode, currentDir);

    if (!valueExpr) {
      throw new ValidationError(
        `Binding value for '${name}' transformed to null`,
        "let binding value",
        "valid expression",
        "null",
      );
    }

    // Create a variable declaration
    const variableDecl: IR.IRVariableDeclaration = {
      type: IR.IRNodeType.VariableDeclaration,
      kind: "const",
      declarations: [
        {
          type: IR.IRNodeType.VariableDeclarator,
          id: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(name),
          } as IR.IRIdentifier,
          init: valueExpr,
        },
      ],
    };

    // If there are body expressions
    if (list.elements.length > 2) {
      const bodyExprs = list.elements.slice(2);
      const bodyNodes: IR.IRNode[] = [];

      for (const expr of bodyExprs) {
        const node = transformNode(expr, currentDir);
        if (node) bodyNodes.push(node);
      }

      // Create an IIFE to contain our block of code
      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.FunctionExpression,
          id: null,
          params: [],
          body: {
            type: IR.IRNodeType.BlockStatement,
            body: [variableDecl, ...bodyNodes],
          } as IR.IRBlockStatement,
        } as IR.IRFunctionExpression,
        arguments: [],
      } as IR.IRCallExpression;
    }

    return variableDecl;
  }

  // Handle standard local binding form: (let (name1 value1 name2 value2...) body...)
  if (list.elements.length >= 2 && list.elements[1].type === "list") {
    const bindingsNode = list.elements[1] as ListNode;
    const bodyExprs = list.elements.slice(2);

    // Process bindings
    return processBindings(bindingsNode, bodyExprs, currentDir, transformNode, "const");
  }

  throw new ValidationError(
    "Invalid let form",
    "let expression",
    "(let name value) or (let (bindings...) body...)",
    "invalid form",
  );
}

/**
 * Transform a 'var' expression (mutable binding).
 * Handles both forms:
 * 1. (var name value) - Global mutable binding
 * 2. (var (name1 value1 name2 value2...) body...) - Local mutable binding block
 */
export function transformVar(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  // Handle global binding form: (var name value)
  if (list.elements.length === 3 && list.elements[1].type === "symbol") {
    const nameNode = list.elements[1] as SymbolNode;
    const id = {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(nameNode.name),
    } as IR.IRIdentifier;
    
    const init = transformNode(list.elements[2], currentDir);

    if (!init) {
      throw new ValidationError(
        "Var value transformed to null",
        "var value",
        "valid expression",
        "null",
      );
    }

    return {
      type: IR.IRNodeType.VariableDeclaration,
      kind: "let", // Use 'let' for mutable bindings
      declarations: [
        {
          type: IR.IRNodeType.VariableDeclarator,
          id,
          init,
        },
      ],
    } as IR.IRVariableDeclaration;
  }

  // Handle local binding form: (var (name1 value1 name2 value2...) body...)
  if (list.elements.length >= 2 && list.elements[1].type === "list") {
    const bindingsNode = list.elements[1] as ListNode;
    const bodyExprs = list.elements.slice(2);

    // Process bindings
    return processBindings(bindingsNode, bodyExprs, currentDir, transformNode, "let");
  }

  throw new ValidationError(
    "Invalid var form",
    "var expression",
    "(var name value) or (var (bindings...) body...)",
    "invalid form",
  );
}

/**
 * Process bindings for let/var expressions and create an IIFE containing the bindings and body
 */
function processBindings(
  bindingsNode: ListNode, 
  bodyExprs: any[], 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
  kind: "const" | "let"
): IR.IRNode {
  // Process bindings as pairs
  const bindings: Array<{ name: string; value: IR.IRNode }> = [];

  for (let i = 0; i < bindingsNode.elements.length; i += 2) {
    if (i + 1 >= bindingsNode.elements.length) {
      throw new ValidationError(
        `Incomplete binding pair in ${kind === "const" ? "let" : "var"}`,
        `${kind === "const" ? "let" : "var"} binding`,
        "name-value pair",
        "incomplete pair",
      );
    }

    const nameNode = bindingsNode.elements[i];
    if (nameNode.type !== "symbol") {
      throw new ValidationError(
        "Binding name must be a symbol",
        `${kind === "const" ? "let" : "var"} binding name`,
        "symbol",
        nameNode.type,
      );
    }

    const name = (nameNode as SymbolNode).name;
    const valueExpr = transformNode(bindingsNode.elements[i + 1], currentDir);

    if (!valueExpr) {
      throw new ValidationError(
        `Binding value for '${name}' transformed to null`,
        `${kind === "const" ? "let" : "var"} binding value`,
        "valid expression",
        "null",
      );
    }

    bindings.push({ name, value: valueExpr });
  }

  // Create variable declarations for all bindings
  const variableDeclarations: IR.IRNode[] = bindings.map((b) => ({
    type: IR.IRNodeType.VariableDeclaration,
    kind, // Use appropriate binding type
    declarations: [
      {
        type: IR.IRNodeType.VariableDeclarator,
        id: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(b.name),
        } as IR.IRIdentifier,
        init: b.value,
      },
    ],
  } as IR.IRVariableDeclaration));

  // Process body expressions
  const bodyStatements: IR.IRNode[] = [];

  // Process all body expressions
  for (const bodyExpr of bodyExprs) {
    const processedExpr = transformNode(bodyExpr, currentDir);
    if (processedExpr) {
      bodyStatements.push(processedExpr);
    }
  }

  // Create an IIFE to contain our block of code
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.FunctionExpression,
      id: null,
      params: [],
      body: {
        type: IR.IRNodeType.BlockStatement,
        body: [...variableDeclarations, ...bodyStatements],
      } as IR.IRBlockStatement,
    } as IR.IRFunctionExpression,
    arguments: [],
  } as IR.IRCallExpression;
}

/**
 * Transform a 'set!' expression (assignment)
 */
export function transformSet(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `set! requires exactly 2 arguments: target and value, got ${
            list.elements.length - 1
          }`,
          "set! expression",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const targetNode = list.elements[1];
      const valueNode = list.elements[2];

      if (targetNode.type !== "symbol") {
        throw new ValidationError(
          "Assignment target must be a symbol",
          "set! target",
          "symbol",
          targetNode.type,
        );
      }

      const target = {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier((targetNode as SymbolNode).name),
      } as IR.IRIdentifier;
      
      const value = transformNode(valueNode, currentDir);

      if (!value) {
        throw new ValidationError(
          "Assignment value transformed to null",
          "set! value",
          "valid expression",
          "null",
        );
      }

      // Create an assignment expression
      return {
        type: IR.IRNodeType.AssignmentExpression,
        operator: "=",
        left: target,
        right: value,
      } as IR.IRAssignmentExpression;
    },
    "transformSet",
    TransformError,
    [list],
  );
}