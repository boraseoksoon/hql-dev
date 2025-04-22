////////////////////////////////////////////////////////////////////////////////
// src/transpiler/pipeline/hql-ast-to-hql-ir.ts - Refactored to use syntax modules
////////////////////////////////////////////////////////////////////////////////

import * as IR from "../type/hql_ir.ts";
import { HQLNode, ListNode, LiteralNode, SymbolNode } from "../type/hql_ast.ts";
import { sanitizeIdentifier } from "../../common/utils.ts";
import { TransformError, ValidationError, perform } from "../../common/error-pipeline.ts";
import { globalLogger as logger } from "../../logger.ts";
import { macroCache } from "../../s-exp/macro.ts";
import { transformStandardFunctionCall, processFunctionBody, transformNamedArgumentCall, handleFxFunctionCall } from "../syntax/function.ts";
import {
  isNamespaceImport,
  isVectorExport,
  isVectorImport,
} from "../type/hql_ast.ts";

// Import syntax modules
import * as bindingModule from "../syntax/binding.ts";
import * as classModule from "../syntax/class.ts";
import * as conditionalModule from "../syntax/conditional.ts";
import * as dataStructureModule from "../syntax/data-structure.ts";
import * as enumModule from "../syntax/enum.ts";
import * as functionModule from "../syntax/function.ts";
import * as importExportModule from "../syntax/import-export.ts";
import * as jsInteropModule from "../syntax/js-interop.ts";
import * as loopRecurModule from "../syntax/loop-recur.ts";
import * as primitiveModule from "../syntax/primitive.ts";
import * as quoteModule from "../syntax/quote.ts";

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

      // Initialize the factory if it hasn't been already
      if (transformFactory.size === 0) {
        initializeTransformFactory();
      }

      const body: IR.IRNode[] = [];
      const errors: { node: HQLNode; error: Error }[] = [];

      // Process each node in a single loop, collecting successful transformations and errors
      for (let i = 0; i < nodes.length; i++) {
        try {
          const ir = perform(
            () => transformNode(nodes[i], currentDir),
            `transform node #${i + 1}`,
            TransformError,
            [nodes[i]],
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

      // Log appropriate error summaries based on success rate
      if (errors.length > 0) {
        const MAX_DETAILED_ERRORS = 3;
        
        if (body.length > 0) {
          logger.warn(
            `Transformed ${body.length} nodes successfully, but ${errors.length} nodes failed`,
          );
          
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
        } else {
          // If no successful transformations, throw an error with the first error message
          throw new TransformError(
            `Failed to transform any nodes (${errors.length} errors). First error: ${
              errors[0].error.message
            }`,
            `${nodes.length} AST nodes`,
            "AST to IR transformation",
            nodes,
          );
        }
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
  perform(() => {
    logger.debug("Initializing transform factory");
    transformFactory.set("quote", (list, currentDir) => quoteModule.transformQuote(list, currentDir, transformNode));
    transformFactory.set("quasiquote", (list, currentDir) => quoteModule.transformQuasiquote(list, currentDir, transformNode));
    transformFactory.set("unquote", (list, currentDir) => quoteModule.transformUnquote(list, currentDir, transformNode));
    transformFactory.set("unquote-splicing", (list, currentDir) => quoteModule.transformUnquoteSplicing(list, currentDir, transformNode));
    transformFactory.set("vector", (list, currentDir) => dataStructureModule.transformVector(list, currentDir, transformNode));
    transformFactory.set("hash-map", (list, currentDir) => dataStructureModule.transformHashMap(list, currentDir, transformNode));
    transformFactory.set("hash-set", (list, currentDir) => dataStructureModule.transformHashSet(list, currentDir, transformNode));
    transformFactory.set("get", (list, currentDir) => dataStructureModule.transformGet(list, currentDir, transformNode));
    transformFactory.set("new", (list, currentDir) => dataStructureModule.transformNew(list, currentDir, transformNode));
    transformFactory.set("fn", (list, currentDir) => functionModule.transformFn(list, currentDir, transformNode, processFunctionBody));
    transformFactory.set("fx", (list, currentDir) => functionModule.transformFx(list, currentDir, transformNode, processFunctionBody));
    transformFactory.set("lambda", (list, currentDir) => conditionalModule.transformLambda(list, currentDir, processFunctionBody));
    transformFactory.set("let", (list, currentDir) => bindingModule.transformLet(list, currentDir, transformNode));
    transformFactory.set("var", (list, currentDir) => bindingModule.transformVar(list, currentDir, transformNode));
    transformFactory.set("set!", (list, currentDir) => bindingModule.transformSet(list, currentDir, transformNode));
    transformFactory.set("if", (list, currentDir) => conditionalModule.transformIf(list, currentDir, transformNode, loopRecurModule.hasLoopContext));
    transformFactory.set("cond", (list, currentDir) => conditionalModule.transformCond(list, currentDir, transformNode));
    transformFactory.set("do", (list, currentDir) => conditionalModule.transformDo(list, currentDir, transformNode));
    transformFactory.set("loop", (list, currentDir) => loopRecurModule.transformLoop(list, currentDir, transformNode));
    transformFactory.set("recur", (list, currentDir) => loopRecurModule.transformRecur(list, currentDir, transformNode));
    transformFactory.set("return", (list, currentDir) => conditionalModule.transformReturn(list, currentDir, transformNode));
    transformFactory.set("js-import", jsInteropModule.transformJsImport);
    transformFactory.set("js-export", (list, currentDir) => jsInteropModule.transformJsExport(list, currentDir, transformNode));
    transformFactory.set("js-new", (list, currentDir) => jsInteropModule.transformJsNew(list, currentDir, transformNode));
    transformFactory.set("js-get", (list, currentDir) => jsInteropModule.transformJsGet(list, currentDir, transformNode));
    transformFactory.set("js-call", (list, currentDir) => jsInteropModule.transformJsCall(list, currentDir, transformNode));
    transformFactory.set("js-get-invoke", (list, currentDir) => jsInteropModule.transformJsGetInvoke(list, currentDir, transformNode));
    transformFactory.set("js-set", (list, currentDir) => jsInteropModule.transformJsSet(list, currentDir, transformNode));
    transformFactory.set("class", (list, currentDir) => classModule.transformClass(list, currentDir, transformNode));
    transformFactory.set("method-call", (list, currentDir) => classModule.transformMethodCall(list, currentDir, transformNode));
    transformFactory.set("enum", (list, currentDir) => enumModule.transformEnumDeclaration(list, currentDir, transformNode));
    transformFactory.set("empty-array", dataStructureModule.transformEmptyArray);
    transformFactory.set("empty-map", dataStructureModule.transformEmptyMap);
    transformFactory.set("empty-set", dataStructureModule.transformEmptySet);
    transformFactory.set("export", (_list, _currentDir) => {
      logger.debug(`Skipping export transformation for now`);
      return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
    });

    transformFactory.set("import", (_list, _currentDir) => {
      logger.debug(`Skipping import transformation for now`);
      return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
    });

    logger.debug(`Registered ${transformFactory.size} handler functions`);
  }, "initializeTransformFactory", TransformError);
}


/**
 * Transform a single HQL node to its IR representation.
 */
export function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
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

      // Dispatch based on node type
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
 * Transform a list node, handling special forms and function calls.
 */
function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  if (list.elements.length === 0) {
    return dataStructureModule.transformEmptyList();
  }

  // Special case for js-get-invoke
  const jsGetInvokeResult = jsInteropModule.transformJsGetInvokeSpecialCase(list, currentDir, transformNode);
  if (jsGetInvokeResult) return jsGetInvokeResult;

  const first = list.elements[0];

  // Handle dot method calls (object.method(...))
  if (first.type === "symbol" && (first as SymbolNode).name.startsWith('.') && list.elements.length >= 2) {
    return transformDotMethodCall(list, currentDir);
  }

  if (first.type === "symbol") {
    const op = (first as SymbolNode).name;

    // Skip macro definitions
    if (op === "defmacro" || op === "macro") {
      logger.debug(`Skipping macro definition: ${op}`);
      return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
    }

    // Delegate to appropriate handler based on operation type
    return transformBasedOnOperator(list, op, currentDir);
  }

  // Handle nested lists
  if (first.type === "list") {
    return transformNestedList(list, currentDir);
  }

  // Default case: standard function call
  return transformStandardFunctionCall(list, currentDir);
}

/**
 * Transform dot method calls (.methodName object arg1 arg2...)
 */
function transformDotMethodCall(list: ListNode, currentDir: string): IR.IRNode {
  const methodSymbol = list.elements[0] as SymbolNode;
  const methodName = methodSymbol.name.substring(1);
  
  // The object is the SECOND element (after the method name)
  const object = transformNode(list.elements[1], currentDir);
  if (!object) {
    throw new ValidationError(
      "Object in method call transformed to null",
      "method call object",
      "valid object expression",
      "null"
    );
  }

  // Arguments are all elements AFTER the object (starting from the third element)
  const args = list.elements.slice(2).map(arg => {
    const transformed = transformNode(arg, currentDir);
    if (!transformed) {
      throw new ValidationError(
        `Method argument transformed to null: ${JSON.stringify(arg)}`,
        "method argument",
        "valid expression",
        "null"
      );
    }
    return transformed;
  });

  // Create the call expression with member expression as callee
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.MemberExpression,
      object: object,
      property: {
        type: IR.IRNodeType.Identifier,
        name: methodName
      } as IR.IRIdentifier,
      computed: false
    } as IR.IRMemberExpression,
    arguments: args
  } as IR.IRCallExpression;
}

/**
 * Transform list based on the operator type
 */
function transformBasedOnOperator(list: ListNode, op: string, currentDir: string): IR.IRNode | null {
  // First check if this is a method call
  if (op.startsWith('.')) {
    return classModule.transformMethodCall(list, currentDir, transformNode);
  }
  
  // Check for import/export forms which have special handling
  if (isVectorExport(list)) {
    return importExportModule.transformVectorExport(list, currentDir);
  }

  if (isVectorImport(list)) {
    return importExportModule.transformVectorImport(list, currentDir);
  }

  if (isNamespaceImport(list)) {
    return importExportModule.transformNamespaceImport(list, currentDir);
  }

  // Handle function calls with named arguments
  if (functionModule.hasNamedArguments(list)) {
    return transformNamedArgumentCall(list, currentDir);
  }

  // Handle dot notation for property access (obj.prop)
  if (jsInteropModule.isDotNotation(op)) {
    return jsInteropModule.transformDotNotation(list, op, currentDir, transformNode);
  }

  // Handle registered fn functions
  const fnDef = functionModule.getFnFunction(op);
  if (fnDef) {
    logger.debug(`Processing call to fn function ${op}`);
    return functionModule.processFnFunctionCall(
      op,
      fnDef,
      list.elements.slice(1),
      currentDir,
      transformNode,
    );
  }

  // Handle registered fx functions
  const fxDef = functionModule.getFxFunction(op);
  if (fxDef) {
    return handleFxFunctionCall(list, op, fxDef, currentDir);
  }

  // Handle built-in operations via the transform factory
  const handler = transformFactory.get(op);
  if (handler) {
    return perform(
      () => handler(list, currentDir),
      `handler for '${op}'`,
      TransformError,
      [list],
    );
  }

  // Handle primitive operations
  if (primitiveModule.isPrimitiveOp(op)) {
    return primitiveModule.transformPrimitiveOp(list, currentDir, transformNode);
  }

  // This is the critical part - determine if this is a function call or collection access
  if (!isBuiltInOperator(op)) {
    return determineCallOrAccess(list, currentDir, transformNode);
  }

  // Fallback to standard function call
  return transformStandardFunctionCall(list, currentDir);
}

/**
 * Check if an operator is a built-in syntax or primitive
 */
function isBuiltInOperator(op: string): boolean {
  return (
    primitiveModule.isKernelPrimitive(op) ||
    primitiveModule.isPrimitiveDataStructure(op) ||
    primitiveModule.isPrimitiveClass(op) ||
    op.startsWith("js-")
  );
}

/**
 * Determines if a list represents a function call or a collection access.
 * For example, (myFunction arg) is a function call, while (myArray 0) is a collection access.
 * This function makes the determination based on structural analysis rather than naming patterns.
 */
function determineCallOrAccess(
  list: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  const elements = list.elements;
  
  // Handle empty list case
  if (elements.length === 0) {
    return dataStructureModule.transformEmptyList();
  }
  
  // Handle single-element list
  if (elements.length === 1) {
    // Just transform the single element
    const singleElement = transformNode(elements[0], currentDir);
    if (!singleElement) {
      throw new TransformError(
        "Single element transformed to null", 
        JSON.stringify(list), 
        "Single element transformation"
      );
    }
    return singleElement;
  }

  // First, transform the first element
  const firstTransformed = transformNode(elements[0], currentDir);
  if (!firstTransformed) {
    throw new TransformError(
      "First element transformed to null", 
      JSON.stringify(list), 
      "Function or collection access"
    );
  }

  const first = elements[0];
  const secondElement = elements[1];
  
  // Known macros that should be treated as function calls
  const knownMacros = ["contains?", "empty?", "nil?", "first", "second", "rest", "next", "nth"];
  
  // Handle macro calls
  if (first.type === "symbol") {
    const symbolName = (first as SymbolNode).name;
    if (knownMacros.includes(symbolName)) {
      return createCallExpression(list, currentDir, transformNode, firstTransformed);
    }
    
    // Check for collection naming patterns - these should override function call assumptions
    const collectionIndicators = ["Collection", "Array", "List", "Vector", "Map", "Set"];
    
    // Check for explicit collection naming patterns
    const hasCollectionIndicator = collectionIndicators.some(indicator => 
      symbolName.includes(indicator) || symbolName.startsWith("my") || symbolName.endsWith("s"));
      
    if (hasCollectionIndicator && elements.length === 2) {
      // Check if the second element is a number or seems like an index
      const isLikelyIndex = 
        (secondElement.type === "literal" && typeof (secondElement as LiteralNode).value === "number") ||
        (secondElement.type === "symbol" && /^[0-9i]|index|idx|key$/.test((secondElement as SymbolNode).name));
      
      if (isLikelyIndex) {
        return dataStructureModule.transformCollectionAccess(list, currentDir, transformNode, firstTransformed);
      }
    }
  }
  
  // Structural-based detection (more reliable than name-based heuristics)
  
  // 1. If the first element is already a function expression, it's definitely a function call
  if (firstTransformed.type === IR.IRNodeType.FunctionExpression) {
    return createCallExpression(list, currentDir, transformNode, firstTransformed);
  }
  
  // 2. If the first element is a list node, it's likely a lambda/function being called
  if (first.type === "list") {
    return createCallExpression(list, currentDir, transformNode, firstTransformed);
  }
  
  // 3. For more than two arguments, it's almost certainly a function call
  if (elements.length > 2) {
    return createCallExpression(list, currentDir, transformNode, firstTransformed);
  }

  // 4. Check if the second element (index) is a numeric literal - likely collection access
  const isNumericIndex = 
    secondElement.type === "literal" && 
    typeof (secondElement as LiteralNode).value === "number";
  
  // 5. Look at transformed node type for additional structural clues
  const isMemberExpression = firstTransformed.type === IR.IRNodeType.MemberExpression;
  
  // If we have a member expression with a property access and a numeric index
  // e.g., (obj.items 0) is likely a collection access
  if (isMemberExpression && isNumericIndex) {
    return dataStructureModule.transformCollectionAccess(list, currentDir, transformNode, firstTransformed);
  }
  
  // When we have a simple identifier with a numeric index, use advanced heuristics
  if (firstTransformed.type === IR.IRNodeType.Identifier && isNumericIndex) {
    return dataStructureModule.transformCollectionAccess(list, currentDir, transformNode, firstTransformed);
  }
  
  // Default: If it's a symbol (identifier) with a second argument, prefer function call semantics
  // This represents typical function call syntax in Lisp-like languages
  if (first.type === "symbol") {
    return createCallExpression(list, currentDir, transformNode, firstTransformed);
  }
  
  // As a fallback, create collection access - let the runtime handle errors
  return dataStructureModule.transformCollectionAccess(list, currentDir, transformNode, firstTransformed);
}

/**
 * Helper function to create a call expression
 */
function createCallExpression(
  list: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
  callee: IR.IRNode
): IR.IRCallExpression {
  const args = [];
  for (let i = 1; i < list.elements.length; i++) {
    const arg = transformNode(list.elements[i], currentDir);
    if (!arg) {
      throw new TransformError(
        `Argument ${i} transformed to null`, 
        JSON.stringify(list), 
        "Function argument"
      );
    }
    args.push(arg);
  }

  return {
    type: IR.IRNodeType.CallExpression,
    callee: callee,
    arguments: args,
  } as IR.IRCallExpression;
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
      } 
      
      if (typeof value === "boolean") {
        return {
          type: IR.IRNodeType.BooleanLiteral,
          value,
        } as IR.IRBooleanLiteral;
      } 
      
      if (typeof value === "number") {
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

      // Special handling for placeholder symbol
      if (name === "_") {
        // Transform it to a string literal "_" instead of an identifier
        return {
          type: IR.IRNodeType.StringLiteral,
          value: "_",
        } as IR.IRStringLiteral;
      }

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
        
        // Handle method call notation (list).method(args)
        if (second.type === "symbol" && (second as SymbolNode).name.startsWith(".")) {
          return transformNestedMethodCall(list, innerExpr, currentDir);
        } 
        // Handle property access (list).property
        else if (second.type === "symbol") {
          return {
            type: IR.IRNodeType.MemberExpression,
            object: innerExpr,
            property: {
              type: IR.IRNodeType.Identifier,
              name: sanitizeIdentifier((second as SymbolNode).name),
            } as IR.IRIdentifier,
            computed: false,
          } as IR.IRMemberExpression;
        } 
        // Function call with the nested list as the callee
        else {
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
 * Handle nested method calls like ((foo) .bar arg1 arg2)
 */
function transformNestedMethodCall(
  list: ListNode, 
  innerExpr: IR.IRNode, 
  currentDir: string
): IR.IRNode {
  const methodName = (list.elements[1] as SymbolNode).name.substring(1);
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
}