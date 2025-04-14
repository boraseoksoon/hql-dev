// src/transpiler/syntax/quote.ts
// Module for handling quoting and unquoting operations

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode, LiteralNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError } from "../error/errors.ts";
import { perform } from "../error/common-error-utils.ts";

/**
 * Transform a quoted expression.
 */
export function transformQuote(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 2) {
        throw new ValidationError(
          `quote requires exactly 1 argument, got ${list.elements.length - 1}`,
          "quote",
          "1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const quoted = list.elements[1];
      if (quoted.type === "literal") {
        // Create the appropriate literal based on the type
        const value = (quoted as LiteralNode).value;
        if (value === null) {
          return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
        } else if (typeof value === "boolean") {
          return {
            type: IR.IRNodeType.BooleanLiteral,
            value,
          } as IR.IRBooleanLiteral;
        } else if (typeof value === "number") {
          return {
            type: IR.IRNodeType.NumericLiteral,
            value,
          } as IR.IRNumericLiteral;
        }
        return {
          type: IR.IRNodeType.StringLiteral,
          value: String(value),
        } as IR.IRStringLiteral;
      } else if (quoted.type === "symbol") {
        return {
          type: IR.IRNodeType.StringLiteral,
          value: (quoted as SymbolNode).name,
        } as IR.IRStringLiteral;
      } else if (quoted.type === "list") {
        if ((quoted as ListNode).elements.length === 0) {
          return {
            type: IR.IRNodeType.ArrayExpression,
            elements: [],
          } as IR.IRArrayExpression;
        }

        const elements: IR.IRNode[] = (quoted as ListNode).elements.map((
          elem,
        ) =>
          transformQuote(
            {
              type: "list",
              elements: [{ type: "symbol", name: "quote" }, elem],
            },
            currentDir,
            transformNode
          )
        );
        return {
          type: IR.IRNodeType.ArrayExpression,
          elements,
        } as IR.IRArrayExpression;
      }

      throw new ValidationError(
        `Unsupported quoted expression: ${(quoted as any).type}`,
        "quote",
        "literal, symbol, or list",
        (quoted as any).type,
      );
    },
    "transformQuote",
    TransformError,
    [list],
  );
}

/**
 * Transform quasiquoted expressions
 */
export function transformQuasiquote(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 2) {
        throw new ValidationError(
          `quasiquote requires exactly one argument, got ${
            list.elements.length - 1
          }`,
          "quasiquote",
          "1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const transformed = transformNode(list.elements[1], currentDir);
      if (!transformed) {
        throw new ValidationError(
          "Quasiquoted expression transformed to null",
          "quasiquote",
          "valid expression",
          "null",
        );
      }
      return transformed;
    },
    "transformQuasiquote",
    TransformError,
    [list],
  );
}

/**
 * Transform unquote expressions
 */
export function transformUnquote(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 2) {
        throw new ValidationError(
          `unquote requires exactly one argument, got ${
            list.elements.length - 1
          }`,
          "unquote",
          "1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const transformed = transformNode(list.elements[1], currentDir);
      if (!transformed) {
        throw new ValidationError(
          "Unquoted expression transformed to null",
          "unquote",
          "valid expression",
          "null",
        );
      }
      return transformed;
    },
    "transformUnquote",
    TransformError,
    [list],
  );
}

/**
 * Transform unquote-splicing expressions
 */
export function transformUnquoteSplicing(
  list: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 2) {
        throw new ValidationError(
          `unquote-splicing requires exactly one argument, got ${
            list.elements.length - 1
          }`,
          "unquote-splicing",
          "1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const transformed = transformNode(list.elements[1], currentDir);
      if (!transformed) {
        throw new ValidationError(
          "Unquote-spliced expression transformed to null",
          "unquote-splicing",
          "valid expression",
          "null",
        );
      }
      return transformed;
    },
    "transformUnquoteSplicing",
    TransformError,
    [list],
  );
}