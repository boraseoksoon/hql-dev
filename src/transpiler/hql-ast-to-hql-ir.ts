////////////////////////////////////////////////////////////////////////////////
// src/transpiler/hql-ast-to-hql-ir.ts - Improved import handling with better organization
////////////////////////////////////////////////////////////////////////////////

import * as IR from "./hql_ir.ts";
import { HQLNode, ListNode, LiteralNode, SymbolNode } from "./hql_ast.ts";
import {
  KERNEL_PRIMITIVES,
  PRIMITIVE_CLASS,
  PRIMITIVE_DATA_STRUCTURE,
  PRIMITIVE_OPS,
} from "./primitives.ts";
import { sanitizeIdentifier } from "../utils.ts";
import { Environment } from "../environment.ts";
import * as path from "../platform/platform.ts";
import { TransformError, ValidationError } from "./errors.ts";
import { Logger } from "../logger.ts";
import { perform } from "./error-utils.ts";
import { macroCache, isUserLevelMacro } from "../s-exp/macro.ts";
import {
  isNamespaceImport,
  isVectorExport,
  isVectorImport,
} from "./hql_ast.ts";

// Initialize logger for this module
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Transform factory to map operators to handler functions
 */
const transformFactory = new Map<
  string,
  (list: ListNode, currentDir: string) => IR.IRNode | null
>();

/**
 * Transform an array of HQL AST nodes into an IR program.
 * Enhanced with better error handling and logging, now wrapped in `perform`.
 */
export function transformToIR(
  nodes: HQLNode[],
  currentDir: string,
): IR.IRProgram {
  return perform(
    () => {
      logger.debug(`Transforming ${nodes.length} HQL AST nodes to IR`);
      const startTime = performance.now();

      macroCache.clear();

      initializeTransformFactory();

      const body: IR.IRNode[] = [];
      const errors: { node: HQLNode; error: Error }[] = [];

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        try {
          const ir = perform(
            () => transformNode(node, currentDir),
            `transform node #${i + 1}`,
            TransformError,
            [node],
          );
          if (ir) body.push(ir);
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          logger.error(`Error transforming node #${i + 1}: ${errorMsg}`);
          errors.push({
            node: nodes[i],
            error: error instanceof Error ? error : new Error(errorMsg),
          });
        }
      }

      if (errors.length > 0 && body.length > 0) {
        logger.warn(
          `Transformed ${body.length} nodes successfully, but ${errors.length} nodes failed`,
        );
        const MAX_DETAILED_ERRORS = 3;
        errors.slice(0, MAX_DETAILED_ERRORS).forEach((err, index) => {
          logger.error(
            `Error ${index + 1}/${errors.length}: ${err.error.message}`,
          );
        });
        if (errors.length > MAX_DETAILED_ERRORS) {
          logger.error(
            `...and ${errors.length - MAX_DETAILED_ERRORS} more errors`,
          );
        }
      }

      if (errors.length > 0 && body.length === 0) {
        throw new TransformError(
          `Failed to transform any nodes (${errors.length} errors). First error: ${
            errors[0].error.message
          }`,
          `${nodes.length} AST nodes`,
          "AST to IR transformation",
          nodes,
        );
      }

      const endTime = performance.now();
      logger.debug(
        `Transformation completed in ${
          (endTime - startTime).toFixed(2)
        }ms with ${body.length} IR nodes`,
      );

      return { type: IR.IRNodeType.Program, body };
    },
    "transformToIR",
    TransformError,
    [nodes],
  );
}

/**
 * Initialize the transform factory with handlers for each operation
 */
function initializeTransformFactory(): void {
  perform(
    () => {
      logger.debug("Initializing transform factory");

      // Register kernel primitive handlers
      transformFactory.set("quote", transformQuote);
      transformFactory.set("if", transformIf);
      transformFactory.set("fn", transformFn);
      transformFactory.set("quasiquote", transformQuasiquote);
      transformFactory.set("unquote", transformUnquote);
      transformFactory.set("unquote-splicing", transformUnquoteSplicing);

      // Register JS interop primitive handlers
      transformFactory.set("js-import", transformJsImport);
      transformFactory.set("js-export", transformJsExport);
      transformFactory.set("js-new", transformJsNew);
      transformFactory.set("js-get", transformJsGet);
      transformFactory.set("js-call", transformJsCall);
      transformFactory.set("js-get-invoke", transformJsGetInvoke);

      // Register data structure handlers
      transformFactory.set("vector", transformVector);
      transformFactory.set("hash-map", transformHashMap);
      transformFactory.set("hash-set", transformHashSet);
      transformFactory.set("empty-array", transformEmptyArray);
      transformFactory.set("empty-map", transformEmptyMap);
      transformFactory.set("empty-set", transformEmptySet);

      // Register special operation handlers
      transformFactory.set("get", transformGet);
      transformFactory.set("new", transformNew);

      transformFactory.set("let", transformLet); // Add let
      transformFactory.set("var", transformVar); // Add var
      transformFactory.set("set!", transformSet); // Add set!

      // Register import/export handlers
      transformFactory.set("export", null);
      transformFactory.set("import", null);

      logger.debug(`Registered ${transformFactory.size} handler functions`);
    },
    "initializeTransformFactory",
    TransformError,
  );
}

/**
 * Transform a single HQL node to its IR representation.
 */
function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
  return perform(
    () => {
      if (!node) {
        throw new ValidationError(
          "Cannot transform null or undefined node",
          "node transformation",
          "valid HQL node",
          "null or undefined",
        );
      }

      logger.debug(`Transforming node of type: ${node.type}`);

      switch (node.type) {
        case "literal":
          return transformLiteral(node as LiteralNode);
        case "symbol":
          return transformSymbol(node as SymbolNode);
        case "list":
          return transformList(node as ListNode, currentDir);
        default:
          logger.warn(`Unknown node type: ${(node as any).type}`);
          return null;
      }
    },
    "transformNode",
    TransformError,
    [node],
  );
}

/**
 * Transform a literal node to its IR representation.
 */
function transformLiteral(lit: LiteralNode): IR.IRNode {
  return perform(
    () => {
      const value = lit.value;
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
    },
    "transformLiteral",
    TransformError,
    [lit],
  );
}

/**
 * Transform a symbol node to its IR representation.
 */
function transformSymbol(sym: SymbolNode): IR.IRNode {
  return perform(
    () => {
      let name = sym.name;
      let isJS = false;

      if (name.startsWith("js/")) {
        name = name.slice(3);
        isJS = true;
      }

      if (!isJS) {
        name = sanitizeIdentifier(name);
      } else {
        name = name.replace(/-/g, "_");
      }

      return { type: IR.IRNodeType.Identifier, name, isJS } as IR.IRIdentifier;
    },
    `transformSymbol '${sym.name}'`,
    TransformError,
    [sym],
  );
}

//-----------------------------------------------------------------------------
// Vector, List, and Collection Processing
//-----------------------------------------------------------------------------

/**
 * Process elements in a vector, handling vector keyword and commas
 */
function processVectorElements(elements: HQLNode[]): HQLNode[] {
  return perform(
    () => {
      let startIndex = 0;
      if (
        elements.length > 0 &&
        elements[0].type === "symbol" &&
        (elements[0] as SymbolNode).name === "vector"
      ) {
        startIndex = 1;
      }
      return elements.slice(startIndex).filter(
        (elem) =>
          !(elem.type === "symbol" && (elem as SymbolNode).name === ","),
      );
    },
    "processVectorElements",
    TransformError,
    [elements],
  );
}

/**
 * Check if a string represents dot notation
 */
function isDotNotation(op: string): boolean {
  return op.includes(".") && !op.startsWith("js/");
}

/**
 * Transform a list node to its IR representation.
 */
function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  return perform(
    () => {
      if (list.elements.length === 0) {
        return transformEmptyList();
      }

      const jsGetInvokeResult = transformJsGetInvokeSpecialCase(
        list,
        currentDir,
      );
      if (jsGetInvokeResult) return jsGetInvokeResult;

      const first = list.elements[0];

      if (first.type === "symbol") {
        const op = (first as SymbolNode).name;

        if (op === "defmacro" || op === "macro") {
          logger.debug(`Skipping macro definition: ${op}`);
          return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
        }

        // Handle special import/export forms
        if (isVectorExport(list)) {
          logger.debug("Transforming vector export");
          return transformVectorExport(list, currentDir);
        }

        if (isVectorImport(list)) {
          logger.debug("Transforming vector import");
          return transformVectorImport(list, currentDir);
        }

        if (isNamespaceImport(list)) {
          logger.debug("Transforming namespace import");
          return transformNamespaceImport(list, currentDir);
        }

        if (isDotNotation(op)) {
          logger.debug(`Transforming dot notation: ${op}`);
          return transformDotNotation(list, op, currentDir);
        }

        const handler = transformFactory.get(op);
        if (handler) {
          return perform(
            () => handler(list, currentDir),
            `handler for '${op}'`,
            TransformError,
            [list],
          );
        }

        if (PRIMITIVE_OPS.has(op)) {
          logger.debug(`Transforming primitive operation: ${op}`);
          return transformPrimitiveOp(list, currentDir);
        }

        if (
          list.elements.length === 2 &&
          !KERNEL_PRIMITIVES.has(op) &&
          !PRIMITIVE_DATA_STRUCTURE.has(op) &&
          !PRIMITIVE_CLASS.has(op) &&
          !op.startsWith("js-")
        ) {
          logger.debug(`Transforming collection access: ${op}`);
          return transformCollectionAccess(list, op, currentDir);
        }
      }

      if (first.type === "list") {
        logger.debug("Transforming nested list");
        return transformNestedList(list, currentDir);
      }

      logger.debug("Transforming standard function call");
      return transformStandardFunctionCall(list, currentDir);
    },
    "transformList",
    TransformError,
    [list],
  );
}

/**
 * Transform an empty list into an empty array expression.
 */
function transformEmptyList(): IR.IRArrayExpression {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements: [],
      } as IR.IRArrayExpression;
    },
    "transformEmptyList",
    TransformError,
  );
}

/**
 * Transform empty array literals
 */
function transformEmptyArray(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements: [],
      } as IR.IRArrayExpression;
    },
    "transformEmptyArray",
    TransformError,
  );
}

/**
 * Transform empty map literals
 */
function transformEmptyMap(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ObjectExpression,
        properties: [],
      } as IR.IRObjectExpression;
    },
    "transformEmptyMap",
    TransformError,
  );
}

/**
 * Transform empty set literals
 */
function transformEmptySet(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.NewExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "Set",
        } as IR.IRIdentifier,
        arguments: [],
      } as IR.IRNewExpression;
    },
    "transformEmptySet",
    TransformError,
  );
}

/**
 * Handle the special case for js-get-invoke.
 */
function transformJsGetInvokeSpecialCase(
  list: ListNode,
  currentDir: string,
): IR.IRNode | null {
  return perform(
    () => {
      if (
        list.elements.length === 3 &&
        list.elements[0].type === "symbol" &&
        (list.elements[0] as SymbolNode).name === "js-get-invoke"
      ) {
        const object = transformNode(list.elements[1], currentDir);
        if (!object) {
          throw new ValidationError(
            "Object expression in js-get-invoke resulted in null",
            "js-get-invoke",
            "valid object expression",
            "null",
          );
        }

        const property = transformNode(list.elements[2], currentDir);
        if (!property) {
          throw new ValidationError(
            "Property expression in js-get-invoke resulted in null",
            "js-get-invoke",
            "valid property expression",
            "null",
          );
        }

        if (property.type === IR.IRNodeType.StringLiteral) {
          return {
            type: IR.IRNodeType.MemberExpression,
            object,
            property: {
              type: IR.IRNodeType.Identifier,
              name: (property as IR.IRStringLiteral).value,
            } as IR.IRIdentifier,
            computed: false,
          } as IR.IRMemberExpression;
        }

        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property,
          computed: true,
        } as IR.IRMemberExpression;
      }
      return null;
    },
    "transformJsGetInvokeSpecialCase",
    TransformError,
    [list],
  );
}

/**
 * Transform a nested list (list where first element is also a list).
 */
function transformNestedList(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const innerExpr = transformNode(list.elements[0], currentDir);
      if (!innerExpr) {
        throw new ValidationError(
          "Inner list transformed to null",
          "nested list",
          "valid inner expression",
          "null",
        );
      }

      if (list.elements.length > 1) {
        const second = list.elements[1];
        if (
          second.type === "symbol" &&
          (second as SymbolNode).name.startsWith(".")
        ) {
          const methodName = (second as SymbolNode).name.substring(1);
          const args = list.elements.slice(2).map((arg) => {
            const transformed = transformNode(arg, currentDir);
            if (!transformed) {
              throw new ValidationError(
                `Argument transformed to null: ${JSON.stringify(arg)}`,
                "method argument",
                "valid argument expression",
                "null",
              );
            }
            return transformed;
          });
          return {
            type: IR.IRNodeType.CallExpression,
            callee: {
              type: IR.IRNodeType.MemberExpression,
              object: innerExpr,
              property: {
                type: IR.IRNodeType.Identifier,
                name: methodName,
              } as IR.IRIdentifier,
              computed: false,
            } as IR.IRMemberExpression,
            arguments: args,
          } as IR.IRCallExpression;
        } else if (second.type === "symbol") {
          return {
            type: IR.IRNodeType.MemberExpression,
            object: innerExpr,
            property: {
              type: IR.IRNodeType.Identifier,
              name: sanitizeIdentifier((second as SymbolNode).name),
            } as IR.IRIdentifier,
            computed: false,
          } as IR.IRMemberExpression;
        } else {
          const args = list.elements.slice(1).map((arg) => {
            const transformed = transformNode(arg, currentDir);
            if (!transformed) {
              throw new ValidationError(
                `Argument transformed to null: ${JSON.stringify(arg)}`,
                "function argument",
                "valid argument expression",
                "null",
              );
            }
            return transformed;
          });
          return {
            type: IR.IRNodeType.CallExpression,
            callee: innerExpr,
            arguments: args,
          } as IR.IRCallExpression;
        }
      }

      return innerExpr;
    },
    "transformNestedList",
    TransformError,
    [list],
  );
}

/**
 * Transform dot notation expressions to IR
 */
function transformDotNotation(
  list: ListNode,
  op: string,
  currentDir: string,
): IR.IRNode {
  return perform(
    () => {
      const parts = op.split(".");
      const objectName = parts[0];
      const property = parts.slice(1).join(".");

      const objectExpr = {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(objectName),
      } as IR.IRIdentifier;

      if (list.elements.length === 1) {
        return {
          type: IR.IRNodeType.MemberExpression,
          object: objectExpr,
          property: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(property),
          } as IR.IRIdentifier,
          computed: false,
        } as IR.IRMemberExpression;
      }

      const args = list.elements.slice(1).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Method argument transformed to null: ${JSON.stringify(arg)}`,
            "method argument",
            "valid argument expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.MemberExpression,
          object: objectExpr,
          property: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(property),
          } as IR.IRIdentifier,
          computed: false,
        } as IR.IRMemberExpression,
        arguments: args,
      } as IR.IRCallExpression;
    },
    `transformDotNotation '${op}'`,
    TransformError,
    [list],
  );
}

/**
 * Transform collection access syntax: (myList 2) => (get myList 2)
 */
function transformCollectionAccess(
  list: ListNode,
  op: string,
  currentDir: string,
): IR.IRNode {
  return perform(
    () => {
      const collection = transformNode(list.elements[0], currentDir);
      if (!collection) {
        throw new ValidationError(
          "Collection transformed to null",
          "collection access",
          "valid collection expression",
          "null",
        );
      }

      const index = transformNode(list.elements[1], currentDir);
      if (!index) {
        throw new ValidationError(
          "Index transformed to null",
          "collection access",
          "valid index expression",
          "null",
        );
      }

      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "get",
        } as IR.IRIdentifier,
        arguments: [collection, index],
      } as IR.IRCallExpression;
    },
    `transformCollectionAccess '${op}'`,
    TransformError,
    [list],
  );
}

/**
 * Transform a standard function call.
 */
function transformStandardFunctionCall(
  list: ListNode,
  currentDir: string,
): IR.IRNode {
  return perform(
    () => {
      const first = list.elements[0];
      if (first.type === "symbol") {
        const op = (first as SymbolNode).name;
        const args = list.elements.slice(1).map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Function argument transformed to null: ${JSON.stringify(arg)}`,
              "function argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });
        return {
          type: IR.IRNodeType.CallExpression,
          callee: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(op),
          } as IR.IRIdentifier,
          arguments: args,
        } as IR.IRCallExpression;
      }

      const callee = transformNode(list.elements[0], currentDir);
      if (!callee) {
        throw new ValidationError(
          "Function callee transformed to null",
          "function call",
          "valid function expression",
          "null",
        );
      }

      const args = list.elements.slice(1).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Function argument transformed to null: ${JSON.stringify(arg)}`,
            "function argument",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.CallExpression,
        callee,
        arguments: args,
      } as IR.IRCallExpression;
    },
    "transformStandardFunctionCall",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// String and Macro Processing Utilities
//-----------------------------------------------------------------------------

/**
 * Extract a string literal from a node.
 */
function extractStringLiteral(node: HQLNode): string {
  return perform(
    () => {
      if (node.type === "literal") {
        return String((node as LiteralNode).value);
      }

      if (node.type === "list") {
        const theList = node as ListNode;
        if (
          theList.elements.length === 2 &&
          theList.elements[0].type === "symbol" &&
          (theList.elements[0] as SymbolNode).name === "quote" &&
          theList.elements[1].type === "literal"
        ) {
          return String((theList.elements[1] as LiteralNode).value);
        }
      }

      throw new ValidationError(
        `Expected string literal but got: ${node.type}`,
        "string literal extraction",
        "string literal or quoted literal",
        node.type,
      );
    },
    "extractStringLiteral",
    TransformError,
    [node],
  );
}

/**
 * Transform quasiquoted expressions
 */
function transformQuasiquote(list: ListNode, currentDir: string): IR.IRNode {
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
function transformUnquote(list: ListNode, currentDir: string): IR.IRNode {
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
function transformUnquoteSplicing(
  list: ListNode,
  currentDir: string,
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

//-----------------------------------------------------------------------------
// Import and Export Transformers - Reorganized for better clarity
//-----------------------------------------------------------------------------

/**
 * Check if a position in a list of nodes has an 'as' alias following it
 */
function hasAliasFollowing(elements: HQLNode[], position: number): boolean {
  return (
    position + 2 < elements.length &&
    elements[position + 1].type === "symbol" &&
    (elements[position + 1] as SymbolNode).name === "as" &&
    elements[position + 2].type === "symbol"
  );
}

/**
 * Create an import specifier for the IR
 */
function createImportSpecifier(
  imported: string,
  local: string,
): IR.IRImportSpecifier {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ImportSpecifier,
        imported: {
          type: IR.IRNodeType.Identifier,
          name: imported,
        } as IR.IRIdentifier,
        local: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(local),
        } as IR.IRIdentifier,
      };
    },
    `createImportSpecifier '${imported} as ${local}'`,
    TransformError,
    [imported, local],
  );
}

/**
 * Check if a symbol is a macro in a module
 */
function isSymbolMacroInModule(
  symbolName: string,
  modulePath: string,
  currentDir: string,
): boolean {
  return perform(
    () => {
      const env = Environment.getGlobalEnv();
      if (!env) {
        logger.debug(
          `No global environment, assuming '${symbolName}' is not a macro in module`,
        );
        return false;
      }

      if (!modulePath.endsWith(".hql")) {
        logger.debug(`Not an HQL file, skipping macro check: ${modulePath}`);
        return false;
      }

      let resolvedPath = modulePath;
      if (modulePath.startsWith("./") || modulePath.startsWith("../")) {
        resolvedPath = path.resolve(currentDir, modulePath);
        logger.debug(
          `Resolved relative path '${modulePath}' to '${resolvedPath}'`,
        );
      }

      for (const [filePath, macros] of env.moduleMacros.entries()) {
        if (
          (filePath === resolvedPath || filePath.endsWith(resolvedPath)) &&
          macros.has(symbolName) &&
          env.getExportedMacros(filePath)?.has(symbolName)
        ) {
          logger.debug(
            `Symbol '${symbolName}' is a macro in module ${filePath}`,
          );
          return true;
        }
      }

      logger.debug(
        `Symbol '${symbolName}' is not a macro in module ${modulePath}`,
      );
      return false;
    },
    `isSymbolMacroInModule '${symbolName}'`,
    TransformError,
    [symbolName, modulePath, currentDir],
  );
}

/**
 * Transform namespace import with "from" syntax
 */
function transformNamespaceImport(
  list: ListNode,
  currentDir: string,
): IR.IRNode | null {
  return perform(
    () => {
      const nameNode = list.elements[1];
      const pathNode = list.elements[3];

      if (nameNode.type !== "symbol") {
        throw new ValidationError(
          "Import name must be a symbol",
          "namespace import",
          "symbol",
          nameNode.type,
        );
      }

      if (pathNode.type !== "literal") {
        throw new ValidationError(
          "Import path must be a string literal",
          "namespace import",
          "string literal",
          pathNode.type,
        );
      }

      const name = (nameNode as SymbolNode).name;
      const pathVal = String((pathNode as LiteralNode).value);

      return {
        type: IR.IRNodeType.JsImportReference,
        name,
        source: pathVal,
      } as IR.IRJsImportReference;
    },
    "transformNamespaceImport",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript imports
 */
function transformJsImport(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length === 3) {
        const nameNode = list.elements[1];
        if (nameNode.type !== "symbol") {
          throw new ValidationError(
            "js-import module name must be a symbol",
            "js-import",
            "symbol",
            nameNode.type,
          );
        }

        const name = (nameNode as SymbolNode).name;
        const source = extractStringLiteral(list.elements[2]);
        return {
          type: IR.IRNodeType.JsImportReference,
          name,
          source,
        } as IR.IRJsImportReference;
      } else if (list.elements.length === 2) {
        const source = extractStringLiteral(list.elements[1]);
        const moduleParts = source.split("/");
        let defaultName = moduleParts[moduleParts.length - 1].replace(
          /\.(js|ts|mjs|cjs)$/,
          "",
        );
        defaultName = defaultName.replace(/[^a-zA-Z0-9_$]/g, "_");

        return {
          type: IR.IRNodeType.JsImportReference,
          name: defaultName,
          source,
        } as IR.IRJsImportReference;
      }

      throw new ValidationError(
        `js-import requires 1 or 2 arguments, got ${list.elements.length - 1}`,
        "js-import",
        "1 or 2 arguments",
        `${list.elements.length - 1} arguments`,
      );
    },
    "transformJsImport",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript exports
 */
function transformJsExport(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-export requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-export",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const exportName = extractStringLiteral(list.elements[1]);
      const safeExportName = sanitizeIdentifier(exportName);
      const value = transformNode(list.elements[2], currentDir);
      if (!value) {
        throw new ValidationError(
          "Exported value transformed to null",
          "js-export",
          "valid expression",
          "null",
        );
      }

      if (value.type === IR.IRNodeType.Identifier) {
        return {
          type: IR.IRNodeType.ExportNamedDeclaration,
          specifiers: [
            {
              type: IR.IRNodeType.ExportSpecifier,
              local: value as IR.IRIdentifier,
              exported: {
                type: IR.IRNodeType.Identifier,
                name: safeExportName,
              } as IR.IRIdentifier,
            },
          ],
        } as IR.IRExportNamedDeclaration;
      }

      const tempId: IR.IRIdentifier = {
        type: IR.IRNodeType.Identifier,
        name: `export_${safeExportName}`,
      };

      return {
        type: IR.IRNodeType.ExportVariableDeclaration,
        declaration: {
          type: IR.IRNodeType.VariableDeclaration,
          kind: "const",
          declarations: [
            {
              type: IR.IRNodeType.VariableDeclarator,
              id: tempId,
              init: value,
            },
          ],
        },
        exportName: safeExportName,
      } as IR.IRExportVariableDeclaration;
    },
    "transformJsExport",
    TransformError,
    [list],
  );
}

/**
 * Transform a vector-based export statement
 */
function transformVectorExport(
  list: ListNode,
  currentDir: string,
): IR.IRNode | null {
  return perform(
    () => {
      const vectorNode = list.elements[1];
      if (vectorNode.type !== "list") {
        throw new ValidationError(
          "Export argument must be a vector (list)",
          "vector export",
          "vector (list)",
          vectorNode.type,
        );
      }

      const symbols = processVectorElements((vectorNode as ListNode).elements);
      const exportSpecifiers: IR.IRExportSpecifier[] = [];

      for (const elem of symbols) {
        if (elem.type !== "symbol") {
          logger.warn(`Skipping non-symbol export element: ${elem.type}`);
          continue;
        }
        const symbolName = (elem as SymbolNode).name;

        if (isUserLevelMacro(symbolName, currentDir)) {
          logger.debug(`Skipping macro in export: ${symbolName}`);
          continue;
        }
        exportSpecifiers.push(createExportSpecifier(symbolName));
      }

      if (exportSpecifiers.length === 0) {
        logger.debug("All exports were macros, skipping export declaration");
        return null;
      }

      return {
        type: IR.IRNodeType.ExportNamedDeclaration,
        specifiers: exportSpecifiers,
      } as IR.IRExportNamedDeclaration;
    },
    "transformVectorExport",
    TransformError,
    [list],
  );
}

/**
 * Create an export specifier
 */
function createExportSpecifier(symbolName: string): IR.IRExportSpecifier {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ExportSpecifier,
        local: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(symbolName),
        } as IR.IRIdentifier,
        exported: {
          type: IR.IRNodeType.Identifier,
          name: symbolName,
        } as IR.IRIdentifier,
      };
    },
    `createExportSpecifier '${symbolName}'`,
    TransformError,
    [symbolName],
  );
}

/**
 * Transform a vector-based import statement
 */
function transformVectorImport(
  list: ListNode,
  currentDir: string,
): IR.IRNode | null {
  return perform(
    () => {
      const vectorNode = list.elements[1] as ListNode;
      if (list.elements[3].type !== "literal") {
        throw new ValidationError(
          "Import path must be a string literal",
          "vector import",
          "string literal",
          list.elements[3].type,
        );
      }

      const modulePath = (list.elements[3] as LiteralNode).value as string;
      if (typeof modulePath !== "string") {
        throw new ValidationError(
          "Import path must be a string",
          "vector import",
          "string",
          typeof modulePath,
        );
      }

      const elements = processVectorElements(vectorNode.elements);
      const importSpecifiers: IR.IRImportSpecifier[] = [];
      let i = 0;
      while (i < elements.length) {
        const elem = elements[i];
        if (elem.type === "symbol") {
          const symbolName = (elem as SymbolNode).name;
          const hasAlias = hasAliasFollowing(elements, i);
          const aliasName = hasAlias
            ? (elements[i + 2] as SymbolNode).name
            : null;

          const isMacro = isUserLevelMacro(symbolName, currentDir) ||
            isSymbolMacroInModule(symbolName, modulePath, currentDir);

          if (isMacro) {
            logger.debug(
              `Skipping macro in import: ${symbolName}${
                aliasName ? ` as ${aliasName}` : ""
              }`,
            );
            i += hasAlias ? 3 : 1;
            continue;
          }

          if (hasAlias) {
            importSpecifiers.push(
              createImportSpecifier(symbolName, aliasName!),
            );
            i += 3;
          } else {
            importSpecifiers.push(
              createImportSpecifier(symbolName, symbolName),
            );
            i += 1;
          }
        } else {
          i += 1;
        }
      }

      if (importSpecifiers.length === 0) {
        logger.debug("All imports were macros, skipping import declaration");
        return null;
      }

      return {
        type: IR.IRNodeType.ImportDeclaration,
        source: modulePath,
        specifiers: importSpecifiers,
      } as IR.IRImportDeclaration;
    },
    "transformVectorImport",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// JS Interop Transformers
//-----------------------------------------------------------------------------

/**
 * Transform JavaScript "new" expressions
 */
function transformJsNew(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 2) {
        throw new ValidationError(
          "js-new requires a constructor and optional arguments",
          "js-new",
          "at least 1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const constructor = transformNode(list.elements[1], currentDir);
      if (!constructor) {
        throw new ValidationError(
          "Constructor transformed to null",
          "js-new",
          "valid constructor expression",
          "null",
        );
      }

      let args: IR.IRNode[] = [];
      if (list.elements.length > 2) {
        const argsNode = list.elements[2];
        if (argsNode.type !== "list") {
          throw new ValidationError(
            "js-new arguments must be a list",
            "js-new",
            "list",
            argsNode.type,
          );
        }
        args = (argsNode as ListNode).elements.map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-new argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });
      }

      return {
        type: IR.IRNodeType.NewExpression,
        callee: constructor,
        arguments: args,
      } as IR.IRNewExpression;
    },
    "transformJsNew",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript property access
 */
function transformJsGet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-get requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-get",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-get",
          "valid object expression",
          "null",
        );
      }

      try {
        const property = extractStringLiteral(list.elements[2]);
        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property: {
            type: IR.IRNodeType.StringLiteral,
            value: property,
          } as IR.IRStringLiteral,
          computed: true,
        } as IR.IRMemberExpression;
      } catch {
        const propExpr = transformNode(list.elements[2], currentDir);
        if (!propExpr) {
          throw new ValidationError(
            "Property transformed to null",
            "js-get",
            "valid property expression",
            "null",
          );
        }
        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property: propExpr,
          computed: true,
        } as IR.IRMemberExpression;
      }
    },
    "transformJsGet",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript method calls
 */
function transformJsCall(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 3) {
        throw new ValidationError(
          `js-call requires at least 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-call",
          "at least 2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-call",
          "valid object expression",
          "null",
        );
      }

      try {
        // Check if the second argument is a string literal
        const method = extractStringLiteral(list.elements[2]);
        const args = list.elements.slice(3).map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-call argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });

        // Create a CallExpression that accesses the method via bracket notation
        return {
          type: IR.IRNodeType.CallExpression,
          callee: {
            type: IR.IRNodeType.MemberExpression,
            object: object,
            property: { type: IR.IRNodeType.StringLiteral, value: method },
            computed: true,
          },
          arguments: args,
        };
      } catch {
        // If the second argument isn't a string literal, handle it differently
        const methodExpr = transformNode(list.elements[2], currentDir);
        if (!methodExpr) {
          throw new ValidationError(
            "Method transformed to null",
            "js-call",
            "valid method expression",
            "null",
          );
        }

        const args = list.elements.slice(3).map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-call argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });

        // If the method is a MemberExpression (e.g. from js-get), use it directly
        if (methodExpr.type === IR.IRNodeType.MemberExpression) {
          return {
            type: IR.IRNodeType.CallExpression,
            callee: methodExpr,
            arguments: args,
          };
        } else {
          // Otherwise create a member expression
          return {
            type: IR.IRNodeType.CallExpression,
            callee: {
              type: IR.IRNodeType.MemberExpression,
              object: object,
              property: methodExpr,
              computed: true,
            },
            arguments: args,
          };
        }
      }
    },
    "transformJsCall",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript property access with optional invocation
 */
function transformJsGetInvoke(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-get-invoke requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-get-invoke",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-get-invoke",
          "valid object expression",
          "null",
        );
      }

      try {
        const property = extractStringLiteral(list.elements[2]);
        return {
          type: IR.IRNodeType.InteropIIFE,
          object,
          property: {
            type: IR.IRNodeType.StringLiteral,
            value: property,
          } as IR.IRStringLiteral,
        } as IR.IRInteropIIFE;
      } catch (err) {
        throw new ValidationError(
          `js-get-invoke property must be a string literal or quoted string: ${
            err instanceof Error ? err.message : String(err)
          }`,
          "js-get-invoke",
          "string literal or quoted string",
          "other expression type",
        );
      }
    },
    "transformJsGetInvoke",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// Data Structure Transformers
//-----------------------------------------------------------------------------

/**
 * Transform vector literals
 */
function transformVector(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const elements = list.elements.slice(1).map((elem) => {
        const transformed = transformNode(elem, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Vector element transformed to null: ${JSON.stringify(elem)}`,
            "vector element",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements,
      } as IR.IRArrayExpression;
    },
    "transformVector",
    TransformError,
    [list],
  );
}

/**
 * Transform hash-map literals
 */
function transformHashMap(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const properties: IR.IRObjectProperty[] = [];
      const args = list.elements.slice(1);

      for (let i = 0; i < args.length; i += 2) {
        if (i + 1 >= args.length) {
          logger.warn(
            `Incomplete key-value pair in hash-map at index ${i}, skipping`,
          );
          break;
        }
        const keyNode = args[i];
        const valueNode = args[i + 1];

        let keyExpr: IR.IRNode;
        if (keyNode.type === "literal") {
          const val = (keyNode as LiteralNode).value;
          keyExpr = {
            type: IR.IRNodeType.StringLiteral,
            value: String(val),
          } as IR.IRStringLiteral;
        } else if (keyNode.type === "symbol") {
          keyExpr = {
            type: IR.IRNodeType.StringLiteral,
            value: (keyNode as SymbolNode).name,
          } as IR.IRStringLiteral;
        } else {
          const transformed = transformNode(keyNode, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Map key transformed to null: ${JSON.stringify(keyNode)}`,
              "hash-map key",
              "valid expression",
              "null",
            );
          }
          keyExpr = transformed;
        }

        const valueExpr = transformNode(valueNode, currentDir);
        if (!valueExpr) {
          throw new ValidationError(
            `Map value transformed to null: ${JSON.stringify(valueNode)}`,
            "hash-map value",
            "valid expression",
            "null",
          );
        }

        const objectProperty: IR.IRObjectProperty = {
          type: IR.IRNodeType.ObjectProperty,
          key: keyExpr,
          value: valueExpr,
        };
        properties.push(objectProperty);
      }

      return {
        type: IR.IRNodeType.ObjectExpression,
        properties,
      } as IR.IRObjectExpression;
    },
    "transformHashMap",
    TransformError,
    [list],
  );
}

/**
 * Transform hash-set literals
 */
function transformHashSet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const elements = list.elements.slice(1).map((elem) => {
        const transformed = transformNode(elem, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Set element transformed to null: ${JSON.stringify(elem)}`,
            "hash-set element",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.NewExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "Set",
        } as IR.IRIdentifier,
        arguments: [
          {
            type: IR.IRNodeType.ArrayExpression,
            elements,
          } as IR.IRArrayExpression,
        ],
      } as IR.IRNewExpression;
    },
    "transformHashSet",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// Collection Operation Transformers
//-----------------------------------------------------------------------------

/**
 * Transform collection 'get' operation.
 */
function transformGet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        return transformStandardFunctionCall(list, currentDir);
      }

      const collection = transformNode(list.elements[1], currentDir);
      if (!collection) {
        throw new ValidationError(
          "Collection transformed to null",
          "get operation",
          "valid collection expression",
          "null",
        );
      }

      const index = transformNode(list.elements[2], currentDir);
      if (!index) {
        throw new ValidationError(
          "Index transformed to null",
          "get operation",
          "valid index expression",
          "null",
        );
      }

      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "get",
        } as IR.IRIdentifier,
        arguments: [collection, index],
      } as IR.IRCallExpression;
    },
    "transformGet",
    TransformError,
    [list],
  );
}

/**
 * Transform "new" constructor.
 */
function transformNew(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 2) {
        throw new ValidationError(
          "'new' requires a constructor",
          "new constructor",
          "at least 1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const constructor = transformNode(list.elements[1], currentDir);
      if (!constructor) {
        throw new ValidationError(
          "Constructor transformed to null",
          "new constructor",
          "valid constructor expression",
          "null",
        );
      }

      const args = list.elements.slice(2).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Constructor argument transformed to null: ${JSON.stringify(arg)}`,
            "new constructor argument",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.NewExpression,
        callee: constructor,
        arguments: args,
      } as IR.IRNewExpression;
    },
    "transformNew",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// Expression and Statement Transformers
//-----------------------------------------------------------------------------

/**
 * Transform a quoted expression.
 */
function transformQuote(list: ListNode, currentDir: string): IR.IRNode {
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
        return transformLiteral(quoted as LiteralNode);
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
          )
        );
        return {
          type: IR.IRNodeType.ArrayExpression,
          elements,
        } as IR.IRArrayExpression;
      }

      throw new ValidationError(
        `Unsupported quoted expression: ${quoted.type}`,
        "quote",
        "literal, symbol, or list",
        quoted.type,
      );
    },
    "transformQuote",
    TransformError,
    [list],
  );
}

/**
 * Transform an if expression.
 */
function transformIf(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
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

      return {
        type: IR.IRNodeType.ConditionalExpression,
        test,
        consequent,
        alternate,
      } as IR.IRConditionalExpression;
    },
    "transformIf",
    TransformError,
    [list],
  );
}

/**
 * Transform a function definition.
 */
function transformFn(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 3) {
        throw new ValidationError(
          "fn requires parameters and body",
          "fn expression",
          "parameters and body",
          `${list.elements.length - 1} arguments`,
        );
      }

      const paramsNode = list.elements[1];
      if (paramsNode.type !== "list") {
        throw new ValidationError(
          "fn parameters must be a list",
          "fn parameters",
          "list",
          paramsNode.type,
        );
      }

      const { params, restParam } = processFunctionParams(
        paramsNode as ListNode,
      );
      const bodyNodes = processFunctionBody(list.elements.slice(2), currentDir);

      return {
        type: IR.IRNodeType.FunctionExpression,
        id: null,
        params: [...params, ...(restParam ? [restParam] : [])],
        body: { type: IR.IRNodeType.BlockStatement, body: bodyNodes },
      } as IR.IRFunctionExpression;
    },
    "transformFn",
    TransformError,
    [list],
  );
}

/**
 * Process function parameters, handling rest parameters
 */
function processFunctionParams(paramsNode: ListNode): {
  params: IR.IRIdentifier[];
  restParam: IR.IRIdentifier | null;
} {
  return perform(
    () => {
      const params: IR.IRIdentifier[] = [];
      let restParam: IR.IRIdentifier | null = null;
      let restMode = false;

      for (let i = 0; i < paramsNode.elements.length; i++) {
        const param = paramsNode.elements[i];
        if (param.type !== "symbol") {
          throw new ValidationError(
            `fn parameters must be symbols, got: ${param.type} at position ${i}`,
            "function parameter",
            "symbol",
            param.type,
          );
        }

        const paramName = (param as SymbolNode).name;
        if (paramName === "&") {
          restMode = true;
          continue;
        }

        if (restMode) {
          if (restParam !== null) {
            throw new ValidationError(
              `Multiple rest parameters not allowed: found '${
                restParam.name.slice(
                  3,
                )
              }' and '${paramName}'`,
              "rest parameter",
              "single rest parameter",
              "multiple rest parameters",
            );
          }

          restParam = {
            type: IR.IRNodeType.Identifier,
            name: `...${sanitizeIdentifier(paramName)}`,
          } as IR.IRIdentifier;
        } else {
          params.push({
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(paramName),
          } as IR.IRIdentifier);
        }
      }

      return { params, restParam };
    },
    "processFunctionParams",
    TransformError,
    [paramsNode],
  );
}

/**
 * Process function body expressions, creating return statements
 */
function processFunctionBody(
  bodyExprs: HQLNode[],
  currentDir: string,
): IR.IRNode[] {
  return perform(
    () => {
      const bodyNodes: IR.IRNode[] = [];

      for (let i = 0; i < bodyExprs.length - 1; i++) {
        const expr = transformNode(bodyExprs[i], currentDir);
        if (expr) bodyNodes.push(expr);
      }

      if (bodyExprs.length > 0) {
        const lastExpr = transformNode(
          bodyExprs[bodyExprs.length - 1],
          currentDir,
        );
        if (lastExpr) {
          bodyNodes.push({
            type: IR.IRNodeType.ReturnStatement,
            argument: lastExpr,
          } as IR.IRReturnStatement);
        } else {
          bodyNodes.push({
            type: IR.IRNodeType.ReturnStatement,
            argument: { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral,
          } as IR.IRReturnStatement);
        }
      }

      return bodyNodes;
    },
    "processFunctionBody",
    TransformError,
    [bodyExprs],
  );
}

/**
 * Transform primitive operations (+, -, *, /, etc.).
 */
function transformPrimitiveOp(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const op = (list.elements[0] as SymbolNode).name;
      const args = list.elements.slice(1).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Primitive op argument transformed to null: ${JSON.stringify(arg)}`,
            `${op} argument`,
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      if (op === "+" || op === "-" || op === "*" || op === "/" || op === "%") {
        return transformArithmeticOp(op, args);
      }

      if (
        op === "=" ||
        op === "eq?" ||
        op === "!=" ||
        op === ">" ||
        op === "<" ||
        op === ">=" ||
        op === "<="
      ) {
        return transformComparisonOp(op, args);
      }

      return {
        type: IR.IRNodeType.CallExpression,
        callee: { type: IR.IRNodeType.Identifier, name: op } as IR.IRIdentifier,
        arguments: args,
      } as IR.IRCallExpression;
    },
    "transformPrimitiveOp",
    TransformError,
    [list],
  );
}

/**
 * Transform arithmetic operations (+, -, *, /, %)
 */
function transformArithmeticOp(op: string, args: IR.IRNode[]): IR.IRNode {
  return perform(
    () => {
      if (args.length === 0) {
        throw new ValidationError(
          `${op} requires at least one argument`,
          `${op} operation`,
          "at least 1 argument",
          "0 arguments",
        );
      }

      if (args.length === 1 && (op === "+" || op === "-")) {
        return {
          type: IR.IRNodeType.UnaryExpression,
          operator: op,
          argument: args[0],
        } as IR.IRUnaryExpression;
      }

      if (args.length === 1) {
        const defaultValue = op === "*" || op === "/" ? 1 : 0;
        return {
          type: IR.IRNodeType.BinaryExpression,
          operator: op,
          left: args[0],
          right: {
            type: IR.IRNodeType.NumericLiteral,
            value: defaultValue,
          } as IR.IRNumericLiteral,
        } as IR.IRBinaryExpression;
      }

      let result = args[0];
      for (let i = 1; i < args.length; i++) {
        result = {
          type: IR.IRNodeType.BinaryExpression,
          operator: op,
          left: result,
          right: args[i],
        } as IR.IRBinaryExpression;
      }
      return result;
    },
    `transformArithmeticOp '${op}'`,
    TransformError,
    [op, args],
  );
}

/**
 * Transform comparison operations (=, !=, <, >, <=, >=)
 */
function transformComparisonOp(op: string, args: IR.IRNode[]): IR.IRNode {
  return perform(
    () => {
      if (args.length !== 2) {
        throw new ValidationError(
          `${op} requires exactly 2 arguments, got ${args.length}`,
          `${op} operation`,
          "2 arguments",
          `${args.length} arguments`,
        );
      }

      let jsOp: string;
      switch (op) {
        case "=":
        case "eq?":
          jsOp = "===";
          break;
        case "!=":
          jsOp = "!==";
          break;
        case ">":
        case "<":
        case ">=":
        case "<=":
          jsOp = op;
          break;
        default:
          jsOp = "===";
      }

      return {
        type: IR.IRNodeType.BinaryExpression,
        operator: jsOp,
        left: args[0],
        right: args[1],
      } as IR.IRBinaryExpression;
    },
    `transformComparisonOp '${op}'`,
    TransformError,
    [op, args],
  );
}

// In src/transpiler/hql-ast-to-hql-ir.ts

/**
 * Transform a let expression (immutable binding).
 * Handles both forms:
 * 1. (let name value) - Global immutable binding
 * 2. (let (name1 value1 name2 value2...) body...) - Local immutable binding block
 */
function transformLet(list: ListNode, currentDir: string): IR.IRNode {
  // Handle global binding form: (let name value)
  if (list.elements.length === 3 && list.elements[1].type === "symbol") {
    const nameNode = list.elements[1] as SymbolNode;
    const id = transformSymbol(nameNode) as IR.IRIdentifier;
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
  
  // Handle local binding form: (let (name1 value1 name2 value2...) body...)
  if (list.elements.length >= 2 && list.elements[1].type === "list") {
    const bindingsNode = list.elements[1] as ListNode;
    const bodyExprs = list.elements.slice(2);
    
    // Process bindings as pairs
    const bindings: Array<{name: string, value: IR.IRNode}> = [];
    
    for (let i = 0; i < bindingsNode.elements.length; i += 2) {
      if (i + 1 >= bindingsNode.elements.length) {
        throw new ValidationError(
          "Incomplete binding pair in let",
          "let binding",
          "name-value pair",
          "incomplete pair",
        );
      }
      
      const nameNode = bindingsNode.elements[i];
      if (nameNode.type !== "symbol") {
        throw new ValidationError(
          "Binding name must be a symbol",
          "let binding name",
          "symbol",
          nameNode.type,
        );
      }
      
      const name = (nameNode as SymbolNode).name;
      const valueExpr = transformNode(bindingsNode.elements[i + 1], currentDir);
      
      if (!valueExpr) {
        throw new ValidationError(
          `Binding value for '${name}' transformed to null`,
          "let binding value",
          "valid expression",
          "null",
        );
      }
      
      bindings.push({ name, value: valueExpr });
    }
    
    // Create variable declarations for all bindings
    const variableDeclarations: IR.IRNode[] = bindings.map(b => ({
      type: IR.IRNodeType.VariableDeclaration,
      kind: "const", // Use 'const' for immutable bindings
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
  
  throw new ValidationError(
    "Invalid let form",
    "let expression",
    "(let name value) or (let (bindings...) body...)",
    "invalid form",
  );
}

/**
 * Transform a var expression (mutable binding).
 * Handles both forms:
 * 1. (var name value) - Global mutable binding
 * 2. (var (name1 value1 name2 value2...) body...) - Local mutable binding block
 */
function transformVar(list: ListNode, currentDir: string): IR.IRNode {
  // Handle global binding form: (var name value)
  if (list.elements.length === 3 && list.elements[1].type === "symbol") {
    const nameNode = list.elements[1] as SymbolNode;
    const id = transformSymbol(nameNode) as IR.IRIdentifier;
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
    
    // Process bindings as pairs
    const bindings: Array<{name: string, value: IR.IRNode}> = [];
    
    for (let i = 0; i < bindingsNode.elements.length; i += 2) {
      if (i + 1 >= bindingsNode.elements.length) {
        throw new ValidationError(
          "Incomplete binding pair in var",
          "var binding",
          "name-value pair",
          "incomplete pair",
        );
      }
      
      const nameNode = bindingsNode.elements[i];
      if (nameNode.type !== "symbol") {
        throw new ValidationError(
          "Binding name must be a symbol",
          "var binding name",
          "symbol",
          nameNode.type,
        );
      }
      
      const name = (nameNode as SymbolNode).name;
      const valueExpr = transformNode(bindingsNode.elements[i + 1], currentDir);
      
      if (!valueExpr) {
        throw new ValidationError(
          `Binding value for '${name}' transformed to null`,
          "var binding value",
          "valid expression",
          "null",
        );
      }
      
      bindings.push({ name, value: valueExpr });
    }
    
    // Create variable declarations for all bindings
    const variableDeclarations: IR.IRNode[] = bindings.map(b => ({
      type: IR.IRNodeType.VariableDeclaration,
      kind: "let", // Use 'let' for mutable bindings
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
  
  throw new ValidationError(
    "Invalid var form",
    "var expression",
    "(var name value) or (var (bindings...) body...)",
    "invalid form",
  );
}

function transformSet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `set! requires exactly 2 arguments: target and value, got ${list.elements.length - 1}`,
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
      
      const target = transformSymbol(targetNode as SymbolNode);
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