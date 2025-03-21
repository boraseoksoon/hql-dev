// src/transpiler/hql-ast-to-hql-ir.ts - Enhanced with improved error handling

import * as IR from "./hql_ir.ts";
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { KERNEL_PRIMITIVES, PRIMITIVE_OPS, PRIMITIVE_DATA_STRUCTURE, PRIMITIVE_CLASS } from "./primitives.ts";
import { sanitizeIdentifier } from "../utils.ts";
import { Environment } from "../environment.ts";
import * as path from "../platform/platform.ts";
import { TransformError, ValidationError } from "./errors.ts";
import { Logger } from "../logger.ts";

// Initialize logger for this module
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Cache to avoid repeated checks during transform
 */
const macroCache = new Map<string, Map<string, boolean>>();

/**
 * Transform factory to map operators to handler functions
 * This centralizes all the special case handlers to make the code more maintainable
 */
const transformFactory = new Map<string, (list: ListNode, currentDir: string) => IR.IRNode | null>();

/**
 * Transform an array of HQL AST nodes into an IR program.
 * Enhanced with better error handling and logging.
 */
export function transformToIR(nodes: HQLNode[], currentDir: string): IR.IRProgram {
  try {
    logger.debug(`Transforming ${nodes.length} HQL AST nodes to IR`);
    const startTime = performance.now();
    
    // Clear the macro cache for this transformation
    macroCache.clear();
    initializeTransformFactory();
    
    const body: IR.IRNode[] = [];
    
    // Track which nodes failed to transform for better error context
    const errors: {node: HQLNode, error: Error}[] = [];
    
    for (let i = 0; i < nodes.length; i++) {
      try {
        const node = nodes[i];
        const ir = transformNode(node, currentDir);
        if (ir) body.push(ir);
      } catch (error) {
        // Log the error but continue processing other nodes
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error transforming node #${i + 1}: ${errorMsg}`);
        
        // Store the error for later reporting
        errors.push({node: nodes[i], error: error instanceof Error ? error : new Error(errorMsg)});
      }
    }
    
    // If we had errors but also some successful transformations, log a warning
    if (errors.length > 0 && body.length > 0) {
      logger.warn(`Transformed ${body.length} nodes successfully, but ${errors.length} nodes failed`);
      
      // Log the first few errors in detail (avoid spamming)
      const MAX_DETAILED_ERRORS = 3;
      errors.slice(0, MAX_DETAILED_ERRORS).forEach((err, index) => {
        logger.error(`Error ${index + 1}/${errors.length}: ${err.error.message}`);
      });
      
      if (errors.length > MAX_DETAILED_ERRORS) {
        logger.error(`...and ${errors.length - MAX_DETAILED_ERRORS} more errors`);
      }
    }
    
    // If all nodes failed, throw an error with details
    if (errors.length > 0 && body.length === 0) {
      throw new TransformError(
        `Failed to transform any nodes (${errors.length} errors). First error: ${errors[0].error.message}`,
        `${nodes.length} AST nodes`,
        "AST to IR transformation",
        nodes
      );
    }
    
    const endTime = performance.now();
    logger.debug(`Transformation completed in ${(endTime - startTime).toFixed(2)}ms with ${body.length} IR nodes`);
    
    return { type: IR.IRNodeType.Program, body };
  } catch (error) {
    // Enhance non-TransformError errors with more context
    if (!(error instanceof TransformError)) {
      throw new TransformError(
        `Failed to transform AST to IR: ${error instanceof Error ? error.message : String(error)}`,
        `${nodes.length} AST nodes`,
        "AST to IR transformation",
        nodes
      );
    }
    throw error;
  }
}

/**
 * Initialize the transform factory with handlers for each operation
 * This replaces the large switch statement in transformList with a more structured approach
 */
function initializeTransformFactory(): void {
  try {
    logger.debug("Initializing transform factory");
    
    // Register kernel primitive handlers
    transformFactory.set("quote", transformQuote);
    transformFactory.set("if", transformIf);
    transformFactory.set("fn", transformFn);
    transformFactory.set("def", transformDef);
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
    
    // Register import/export handlers
    transformFactory.set("export", null); // Handled by vector/legacy export checks
    transformFactory.set("import", null); // Handled by vector/legacy import checks
    
    logger.debug(`Registered ${transformFactory.size} handler functions`);
  } catch (error) {
    logger.error(`Error initializing transform factory: ${error instanceof Error ? error.message : String(error)}`);
    throw new TransformError(
      `Failed to initialize transform factory: ${error instanceof Error ? error.message : String(error)}`,
      "transform factory initialization",
      "initialization",
      null
    );
  }
}

/**
 * Transform a single HQL node to its IR representation.
 * Enhanced with error handling.
 */
function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
  try {
    if (!node) {
      throw new ValidationError(
        "Cannot transform null or undefined node",
        "node transformation",
        "valid HQL node",
        "null or undefined"
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
  } catch (error) {
    if (error instanceof TransformError || error instanceof ValidationError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Error transforming node: ${error instanceof Error ? error.message : String(error)}`,
      `node of type ${node?.type || 'unknown'}`,
      "node transformation",
      node
    );
  }
}

/**
 * Transform a literal node to its IR representation.
 * Enhanced with error handling.
 */
function transformLiteral(lit: LiteralNode): IR.IRNode {
  try {
    const value = lit.value;
    
    if (value === null) {
      return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
    } else if (typeof value === "boolean") {
      return { type: IR.IRNodeType.BooleanLiteral, value } as IR.IRBooleanLiteral;
    } else if (typeof value === "number") {
      return { type: IR.IRNodeType.NumericLiteral, value } as IR.IRNumericLiteral;
    } else {
      return { type: IR.IRNodeType.StringLiteral, value: String(value) } as IR.IRStringLiteral;
    }
  } catch (error) {
    throw new TransformError(
      `Failed to transform literal: ${error instanceof Error ? error.message : String(error)}`,
      `literal value: ${lit.value !== null ? lit.value : 'null'}`,
      "literal transformation",
      lit
    );
  }
}

/**
 * Transform a symbol node to its IR representation.
 * Enhanced with error handling.
 */
function transformSymbol(sym: SymbolNode): IR.IRNode {
  try {
    let name = sym.name;
    let isJS = false;
    
    if (name.startsWith("js/")) {
      name = name.slice(3);
      isJS = true;
    }
    
    // Use sanitizeIdentifier instead of just replacing hyphens
    if (!isJS) {
      name = sanitizeIdentifier(name);
    } else {
      // For JS interop, we only replace hyphens
      name = name.replace(/-/g, '_');
    }
    
    return { type: IR.IRNodeType.Identifier, name, isJS } as IR.IRIdentifier;
  } catch (error) {
    throw new TransformError(
      `Failed to transform symbol '${sym.name}': ${error instanceof Error ? error.message : String(error)}`,
      `symbol: ${sym.name}`,
      "symbol transformation",
      sym
    );
  }
}

/**
 * Check if a symbol represents a user-level macro
 * Enhanced with error handling and caching.
 */
function isUserLevelMacro(symbolName: string, currentDir: string): boolean {
  try {
    // Use cache if available
    if (macroCache.has(currentDir)) {
      const fileCache = macroCache.get(currentDir)!;
      if (fileCache.has(symbolName)) {
        return fileCache.get(symbolName)!;
      }
    } else {
      macroCache.set(currentDir, new Map<string, boolean>());
    }
    
    // Get the global environment instance
    const env = Environment.getGlobalEnv();
    if (!env) {
      logger.debug(`No global environment found, assuming '${symbolName}' is not a macro`);
      macroCache.get(currentDir)!.set(symbolName, false);
      return false;
    }
    
    // Check with environment
    const result = env.isUserLevelMacro(symbolName, currentDir);
    
    // Cache the result
    macroCache.get(currentDir)!.set(symbolName, result);
    
    logger.debug(`Checking if '${symbolName}' is a user-level macro: ${result}`);
    return result;
  } catch (error) {
    logger.warn(`Error checking if '${symbolName}' is a user-level macro: ${error instanceof Error ? error.message : String(error)}`);
    // Default to false on error for safety
    return false;
  }
}

/**
 * Check if a list node represents a vector-based export
 */
function isVectorExport(list: ListNode): boolean {
  return list.elements.length === 2 &&
         list.elements[0].type === "symbol" &&
         (list.elements[0] as SymbolNode).name === "export" &&
         list.elements[1].type === "list";
}

/**
 * Check if a list node represents a vector-based import
 */
function isVectorImport(list: ListNode): boolean {
  return list.elements.length === 4 &&
         list.elements[0].type === "symbol" &&
         (list.elements[0] as SymbolNode).name === "import" &&
         list.elements[1].type === "list" &&
         list.elements[2].type === "symbol" &&
         (list.elements[2] as SymbolNode).name === "from" &&
         list.elements[3].type === "literal";
}

/**
 * Check if a list node represents a legacy import
 */
function isLegacyImport(list: ListNode): boolean {
  return list.elements.length === 3 &&
         list.elements[0].type === "symbol" &&
         (list.elements[0] as SymbolNode).name === "import" &&
         list.elements[1].type === "symbol" &&
         list.elements[2].type === "literal";
}

/**
 * Process elements in a vector, handling vector keyword and commas
 */
function processVectorElements(elements: HQLNode[]): HQLNode[] {
  try {
    // Skip "vector" symbol if present as first element
    let startIndex = 0;
    if (elements.length > 0 && 
        elements[0].type === "symbol" && 
        (elements[0] as SymbolNode).name === "vector") {
      startIndex = 1;
    }
    
    // Filter out comma symbols
    return elements.slice(startIndex).filter(elem => 
      !(elem.type === "symbol" && (elem as SymbolNode).name === ',')
    );
  } catch (error) {
    throw new TransformError(
      `Failed to process vector elements: ${error instanceof Error ? error.message : String(error)}`,
      `${elements.length} vector elements`,
      "vector element processing",
      elements
    );
  }
}

/**
 * Check if a string represents a dot notation
 */
function isDotNotation(op: string): boolean {
  return op.includes('.') && !op.startsWith('js/');
}

/**
 * Transform a list node to its IR representation.
 * Refactored to use the transformFactory where possible
 * Enhanced with error handling.
 */
function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  try {
    // Special case: empty list
    if (list.elements.length === 0) {
      return transformEmptyList();
    }
    
    // Special case for js-get-invoke
    const jsGetInvokeResult = transformJsGetInvokeSpecialCase(list, currentDir);
    if (jsGetInvokeResult) return jsGetInvokeResult;
    
    const first = list.elements[0];

    // Special case for defmacro and module-level macros
    if (first.type === "symbol") {
      const op = (first as SymbolNode).name;
      
      if (op === "defmacro" || op === "macro") {
        logger.debug(`Skipping macro definition: ${op}`);
        return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
      }
      
      // Check for vector exports
      if (isVectorExport(list)) {
        logger.debug("Transforming vector export");
        return transformVectorExport(list, currentDir);
      }
      
      // Check for vector imports
      if (isVectorImport(list)) {
        logger.debug("Transforming vector import");
        return transformVectorImport(list, currentDir);
      }
      
      // Check for legacy imports
      if (isLegacyImport(list)) {
        logger.debug("Transforming legacy import");
        return transformLegacyImport(list, currentDir);
      }
      
      // Check for dot notation
      if (isDotNotation(op)) {
        logger.debug(`Transforming dot notation: ${op}`);
        return transformDotNotation(list, op, currentDir);
      }
      
      // Check if we have a registered handler for this operation
      const handler = transformFactory.get(op);
      if (handler) {
        try {
          logger.debug(`Using registered handler for operation: ${op}`);
          return handler(list, currentDir);
        } catch (error) {
          throw new TransformError(
            `Handler for operation '${op}' failed: ${error instanceof Error ? error.message : String(error)}`,
            `operation ${op}`,
            "operation transform",
            list
          );
        }
      }
      
      // Handle primitive operations (+, -, *, /, etc.)
      if (PRIMITIVE_OPS.has(op)) {
        logger.debug(`Transforming primitive operation: ${op}`);
        return transformPrimitiveOp(list, currentDir);
      }
      
      // Check for collection access syntax (obj key) -> (get obj key)
      if (list.elements.length === 2 && 
          !KERNEL_PRIMITIVES.has(op) && 
          !PRIMITIVE_DATA_STRUCTURE.has(op) && 
          !PRIMITIVE_CLASS.has(op) && 
          !op.startsWith("js-")) {
        logger.debug(`Transforming collection access: ${op}`);
        return transformCollectionAccess(list, op, currentDir);
      }
    }
    
    // Case 1: First element is a list
    if (first.type === "list") {
      logger.debug("Transforming nested list");
      return transformNestedList(list, currentDir);
    }
    
    // Default: standard function call
    logger.debug("Transforming standard function call");
    return transformStandardFunctionCall(list, currentDir);
  } catch (error) {
    // Enhance error with context about the list being transformed
    if (error instanceof TransformError) {
      throw error; // Re-throw TransformError directly
    }
    
    // Try to extract the operation name for better context
    let opName = "unknown";
    if (list.elements.length > 0 && list.elements[0].type === "symbol") {
      opName = (list.elements[0] as SymbolNode).name;
    }
    
    throw new TransformError(
      `Failed to transform list with op '${opName}': ${error instanceof Error ? error.message : String(error)}`,
      `list with ${list.elements.length} elements`,
      "list transformation",
      list
    );
  }
}

/**
 * Transform an empty list into an empty array expression.
 */
function transformEmptyList(): IR.IRArrayExpression {
  try {
    return {
      type: IR.IRNodeType.ArrayExpression,
      elements: []
    } as IR.IRArrayExpression;
  } catch (error) {
    throw new TransformError(
      `Failed to transform empty list: ${error instanceof Error ? error.message : String(error)}`,
      "empty list",
      "empty list transformation",
      { type: "list", elements: [] }
    );
  }
}

/**
 * Transform empty array literals
 */
function transformEmptyArray(list: ListNode, currentDir: string): IR.IRNode {
  try {
    return {
      type: IR.IRNodeType.ArrayExpression,
      elements: []
    } as IR.IRArrayExpression;
  } catch (error) {
    throw new TransformError(
      `Failed to transform empty array: ${error instanceof Error ? error.message : String(error)}`,
      "empty array",
      "empty array transformation",
      list
    );
  }
}

/**
 * Transform empty map literals
 */
function transformEmptyMap(list: ListNode, currentDir: string): IR.IRNode {
  try {
    return {
      type: IR.IRNodeType.ObjectExpression,
      properties: []
    } as IR.IRObjectExpression;
  } catch (error) {
    throw new TransformError(
      `Failed to transform empty map: ${error instanceof Error ? error.message : String(error)}`,
      "empty map",
      "empty map transformation",
      list
    );
  }
}

/**
 * Transform empty set literals
 */
function transformEmptySet(list: ListNode, currentDir: string): IR.IRNode {
  try {
    return {
      type: IR.IRNodeType.NewExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: "Set"
      } as IR.IRIdentifier,
      arguments: []
    } as IR.IRNewExpression;
  } catch (error) {
    throw new TransformError(
      `Failed to transform empty set: ${error instanceof Error ? error.message : String(error)}`,
      "empty set",
      "empty set transformation",
      list
    );
  }
}

/**
 * Handle the special case for js-get-invoke.
 */
function transformJsGetInvokeSpecialCase(list: ListNode, currentDir: string): IR.IRNode | null {
  try {
    if (list.elements.length === 3 && 
        list.elements[0].type === "symbol" && 
        (list.elements[0] as SymbolNode).name === "js-get-invoke") {
      
      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object expression in js-get-invoke resulted in null",
          "js-get-invoke",
          "valid object expression",
          "null"
        );
      }
      
      const property = transformNode(list.elements[2], currentDir);
      if (!property) {
        throw new ValidationError(
          "Property expression in js-get-invoke resulted in null",
          "js-get-invoke",
          "valid property expression",
          "null"
        );
      }
      
      // If the property is a string literal, convert to MemberExpression
      if (property.type === IR.IRNodeType.StringLiteral) {
        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property: {
            type: IR.IRNodeType.Identifier,
            name: (property as IR.IRStringLiteral).value
          } as IR.IRIdentifier,
          computed: false
        } as IR.IRMemberExpression;
      }
      
      return {
        type: IR.IRNodeType.MemberExpression,
        object,
        property,
        computed: true
      } as IR.IRMemberExpression;
    }
    
    return null;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // Re-throw ValidationError directly
    }
    
    throw new TransformError(
      `Failed to transform js-get-invoke special case: ${error instanceof Error ? error.message : String(error)}`,
      "js-get-invoke",
      "js-get-invoke transformation",
      list
    );
  }
}

/**
 * Transform a nested list (list where first element is also a list).
 */
function transformNestedList(list: ListNode, currentDir: string): IR.IRNode {
  try {
    const innerExpr = transformNode(list.elements[0], currentDir);
    if (!innerExpr) {
      throw new ValidationError(
        "Inner list transformed to null",
        "nested list",
        "valid inner expression",
        "null"
      );
    }
    
    // If there are more elements after the inner list
    if (list.elements.length > 1) {
      const second = list.elements[1];
      
      // If the second element is a symbol with dot notation, it's a method call
      if (second.type === "symbol" && (second as SymbolNode).name.startsWith('.')) {
        const methodName = (second as SymbolNode).name.substring(1);
        const args = list.elements.slice(2).map(arg => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "method argument",
              "valid argument expression",
              "null"
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
              name: methodName 
            } as IR.IRIdentifier,
            computed: false
          } as IR.IRMemberExpression,
          arguments: args
        } as IR.IRCallExpression;
      }
      
      // If the second element is a regular symbol, create a member expression
      else if (second.type === "symbol") {
        return {
          type: IR.IRNodeType.MemberExpression,
          object: innerExpr,
          property: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier((second as SymbolNode).name)
          } as IR.IRIdentifier,
          computed: false
        } as IR.IRMemberExpression;
      }
      
      // Otherwise, call with arguments
      else {
        const args = list.elements.slice(1).map(arg => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "function argument",
              "valid argument expression",
              "null"
            );
          }
          return transformed;
        });
        
        return {
          type: IR.IRNodeType.CallExpression,
          callee: innerExpr,
          arguments: args
        } as IR.IRCallExpression;
      }
    }
    
    // If no additional elements, just return the inner expression itself
    return innerExpr;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform nested list: ${error instanceof Error ? error.message : String(error)}`,
      "nested list",
      "nested list transformation",
      list
    );
  }
}

/**
 * Transform dot notation expressions to IR
 */
function transformDotNotation(list: ListNode, op: string, currentDir: string): IR.IRNode {
  try {
    const parts = op.split('.');
    const objectName = parts[0];
    const property = parts.slice(1).join('.');
    
    // Create a proper member expression that preserves the dot notation
    const objectExpr = {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(objectName)
    } as IR.IRIdentifier;
    
    // Property access (no arguments)
    if (list.elements.length === 1) {
      return {
        type: IR.IRNodeType.MemberExpression,
        object: objectExpr,
        property: { 
          type: IR.IRNodeType.Identifier, 
          name: sanitizeIdentifier(property) 
        } as IR.IRIdentifier,
        computed: false
      } as IR.IRMemberExpression;
    }
    
    // Method call (with arguments)
    const args = list.elements.slice(1).map(arg => {
      const transformed = transformNode(arg, currentDir);
      if (!transformed) {
        throw new ValidationError(
          `Method argument transformed to null: ${JSON.stringify(arg)}`,
          "method argument",
          "valid argument expression",
          "null"
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
          name: sanitizeIdentifier(property) 
        } as IR.IRIdentifier,
        computed: false
      } as IR.IRMemberExpression,
      arguments: args
    } as IR.IRCallExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform dot notation '${op}': ${error instanceof Error ? error.message : String(error)}`,
      `dot notation: ${op}`,
      "dot notation transformation",
      list
    );
  }
}

/**
 * Transform quasiquoted expressions
 */
function transformQuasiquote(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 2) {
      throw new ValidationError(
        `quasiquote requires exactly one argument, got ${list.elements.length - 1}`,
        "quasiquote",
        "1 argument",
        `${list.elements.length - 1} arguments`
      );
    }
    
    // For IR generation, treat quasiquoted expressions similar to quoted ones
    const transformed = transformNode(list.elements[1], currentDir);
    if (!transformed) {
      throw new ValidationError(
        "Quasiquoted expression transformed to null",
        "quasiquote",
        "valid expression",
        "null"
      );
    }
    
    return transformed;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform quasiquote: ${error instanceof Error ? error.message : String(error)}`,
      "quasiquote",
      "quasiquote transformation",
      list
    );
  }
}

/**
 * Transform unquote expressions
 */
function transformUnquote(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 2) {
      throw new ValidationError(
        `unquote requires exactly one argument, got ${list.elements.length - 1}`,
        "unquote",
        "1 argument",
        `${list.elements.length - 1} arguments`
      );
    }
    
    // For IR generation, unquote should be expanded during macro processing
    const transformed = transformNode(list.elements[1], currentDir);
    if (!transformed) {
      throw new ValidationError(
        "Unquoted expression transformed to null",
        "unquote",
        "valid expression",
        "null"
      );
    }
    
    return transformed;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform unquote: ${error instanceof Error ? error.message : String(error)}`,
      "unquote",
      "unquote transformation",
      list
    );
  }
}

/**
 * Transform unquote-splicing expressions
 */
function transformUnquoteSplicing(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 2) {
      throw new ValidationError(
        `unquote-splicing requires exactly one argument, got ${list.elements.length - 1}`,
        "unquote-splicing",
        "1 argument",
        `${list.elements.length - 1} arguments`
      );
    }
    
    // For IR generation, unquote-splicing should be expanded during macro processing
    const transformed = transformNode(list.elements[1], currentDir);
    if (!transformed) {
      throw new ValidationError(
        "Unquote-spliced expression transformed to null",
        "unquote-splicing",
        "valid expression",
        "null"
      );
    }
    
    return transformed;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform unquote-splicing: ${error instanceof Error ? error.message : String(error)}`,
      "unquote-splicing",
      "unquote-splicing transformation",
      list
    );
  }
}

/**
 * Transform vector-based export statement to its IR representation
 * Enhanced with better error handling
 */
function transformVectorExport(list: ListNode, currentDir: string): IR.IRNode | null {
  try {
    // Extract the symbols to export
    const vectorNode = list.elements[1];
    if (vectorNode.type !== "list") {
      throw new ValidationError(
        "Export argument must be a vector (list)",
        "vector export",
        "vector (list)",
        vectorNode.type
      );
    }
    
    // Process vector elements
    const symbols = processVectorElements((vectorNode as ListNode).elements);
    
    // Build export specifiers for non-macro symbols
    const exportSpecifiers: IR.IRExportSpecifier[] = [];
    
    for (const elem of symbols) {
      if (elem.type !== "symbol") {
        logger.warn(`Skipping non-symbol export element: ${elem.type}`);
        continue;
      }
      
      const symbolName = (elem as SymbolNode).name;
      
      // Skip macros - don't create exports for them
      if (isUserLevelMacro(symbolName, currentDir)) {
        logger.debug(`Skipping macro in export: ${symbolName}`);
        continue;
      }
      
      // Add specifier for regular value
      exportSpecifiers.push(createExportSpecifier(symbolName));
    }
    
    // Skip empty exports (where all symbols were macros)
    if (exportSpecifiers.length === 0) {
      logger.debug("All exports were macros, skipping export declaration");
      return null;
    }
    
    // Create the export declaration
    return {
      type: IR.IRNodeType.ExportNamedDeclaration,
      specifiers: exportSpecifiers
    } as IR.IRExportNamedDeclaration;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform vector export: ${error instanceof Error ? error.message : String(error)}`,
      "vector export",
      "vector export transformation",
      list
    );
  }
}

/**
 * Create an export specifier
 */
function createExportSpecifier(symbolName: string): IR.IRExportSpecifier {
  try {
    return {
      type: IR.IRNodeType.ExportSpecifier,
      local: { 
        type: IR.IRNodeType.Identifier, 
        name: sanitizeIdentifier(symbolName) 
      } as IR.IRIdentifier,
      exported: { 
        type: IR.IRNodeType.Identifier, 
        name: symbolName 
      } as IR.IRIdentifier
    };
  } catch (error) {
    throw new TransformError(
      `Failed to create export specifier for '${symbolName}': ${error instanceof Error ? error.message : String(error)}`,
      `export specifier: ${symbolName}`,
      "export specifier creation",
      null
    );
  }
}

/**
 * Check if a position in a list of nodes has an 'as' alias following it
 */
function hasAliasFollowing(elements: HQLNode[], position: number): boolean {
  return position + 2 < elements.length && 
         elements[position+1].type === "symbol" && 
         (elements[position+1] as SymbolNode).name === "as" &&
         elements[position+2].type === "symbol";
}

/**
 * Create an import specifier for the IR
 */
function createImportSpecifier(imported: string, local: string): IR.IRImportSpecifier {
  try {
    return {
      type: IR.IRNodeType.ImportSpecifier,
      imported: {
        type: IR.IRNodeType.Identifier,
        name: imported
      } as IR.IRIdentifier,
      local: {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(local)
      } as IR.IRIdentifier
    };
  } catch (error) {
    throw new TransformError(
      `Failed to create import specifier '${imported}' as '${local}': ${error instanceof Error ? error.message : String(error)}`,
      `import specifier: ${imported} as ${local}`,
      "import specifier creation",
      null
    );
  }
}

/**
 * Check if a symbol is a macro in a module
 */
function isSymbolMacroInModule(symbolName: string, modulePath: string, currentDir: string): boolean {
  try {
    const env = Environment.getGlobalEnv();
    if (!env) {
      logger.debug(`No global environment, assuming '${symbolName}' is not a macro in module`);
      return false;
    }
    
    // Only check HQL files
    if (!modulePath.endsWith('.hql')) {
      logger.debug(`Not an HQL file, skipping macro check: ${modulePath}`);
      return false;
    }
    
    try {
      // Resolve the module path
      let resolvedPath = modulePath;
      
      // Handle relative paths
      if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
        resolvedPath = path.resolve(currentDir, modulePath);
        logger.debug(`Resolved relative path '${modulePath}' to '${resolvedPath}'`);
      }
      
      // Check all modules to handle path normalization differences
      for (const [filePath, macros] of env.moduleMacros.entries()) {
        // Check if this file path matches or ends with our module path
        if ((filePath === resolvedPath || filePath.endsWith(resolvedPath)) && 
            macros.has(symbolName) && 
            env.getExportedMacros(filePath)?.has(symbolName)) {
          logger.debug(`Symbol '${symbolName}' is a macro in module ${filePath}`);
          return true;
        }
      }
      
      logger.debug(`Symbol '${symbolName}' is not a macro in module ${modulePath}`);
      return false;
    } catch (e) {
      logger.warn(`Error checking for macro in module: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  } catch (error) {
    logger.warn(`Error checking if '${symbolName}' is a macro in module '${modulePath}': ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Transform a vector-based import statement to its IR representation
 * Enhanced with better error handling
 */
function transformVectorImport(list: ListNode, currentDir: string): IR.IRNode | null {
  try {
    // Extract the vector and path
    const vectorNode = list.elements[1] as ListNode;
    
    if (list.elements[3].type !== "literal") {
      throw new ValidationError(
        "Import path must be a string literal",
        "vector import",
        "string literal",
        list.elements[3].type
      );
    }
    
    const modulePath = (list.elements[3] as LiteralNode).value as string;
    if (typeof modulePath !== "string") {
      throw new ValidationError(
        "Import path must be a string",
        "vector import",
        "string",
        typeof modulePath
      );
    }
    
    // Process vector elements
    const elements = processVectorElements(vectorNode.elements);
    
    // Build import specifiers for non-macro symbols
    const importSpecifiers: IR.IRImportSpecifier[] = [];
    
    // Process the elements
    let i = 0;
    while (i < elements.length) {
      const elem = elements[i];
      
      // Only process symbols
      if (elem.type === "symbol") {
        const symbolName = (elem as SymbolNode).name;
        
        // Check for alias pattern
        const hasAlias = hasAliasFollowing(elements, i);
        const aliasName = hasAlias ? (elements[i+2] as SymbolNode).name : null;
        
        // Check if the symbol is a macro - either locally or in source module
        const isMacro = isUserLevelMacro(symbolName, currentDir) || 
                        isSymbolMacroInModule(symbolName, modulePath, currentDir);
        
        // Skip macros - don't create JS imports for them
        if (isMacro) {
          logger.debug(`Skipping macro in import: ${symbolName}${aliasName ? ` as ${aliasName}` : ''}`);
          i += hasAlias ? 3 : 1; // Skip appropriate number of elements
          continue;
        }
        
        // Add import specifier for non-macros
        if (hasAlias) {
          importSpecifiers.push(createImportSpecifier(symbolName, aliasName!));
          i += 3; // Skip symbol, 'as', and alias
        } else {
          importSpecifiers.push(createImportSpecifier(symbolName, symbolName));
          i += 1; // Next symbol
        }
      } else {
        i += 1; // Skip non-symbols
      }
    }
    
    // Skip empty imports (where all symbols were macros)
    if (importSpecifiers.length === 0) {
      logger.debug("All imports were macros, skipping import declaration");
      return null;
    }
    
    // Create the import declaration
    return {
      type: IR.IRNodeType.ImportDeclaration,
      source: modulePath,
      specifiers: importSpecifiers
    } as IR.IRImportDeclaration;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform vector import: ${error instanceof Error ? error.message : String(error)}`,
      "vector import",
      "vector import transformation",
      list
    );
  }
}

/**
 * Transform legacy import syntax to IR
 */
function transformLegacyImport(list: ListNode, currentDir: string): IR.IRNode | null {
  try {
    // Extract module name and path
    const nameNode = list.elements[1];
    const pathNode = list.elements[2];
    
    if (nameNode.type !== "symbol") {
      throw new ValidationError(
        "Import name must be a symbol",
        "legacy import",
        "symbol",
        nameNode.type
      );
    }
    
    if (pathNode.type !== "literal") {
      throw new ValidationError(
        "Import path must be a string literal",
        "legacy import", 
        "string literal",
        pathNode.type
      );
    }
    
    const name = (nameNode as SymbolNode).name;
    const path = String((pathNode as LiteralNode).value);
    
    // Create a JsImportReference - same as js-import handling
    return {
      type: IR.IRNodeType.JsImportReference,
      name,
      source: path
    } as IR.IRJsImportReference;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform legacy import: ${error instanceof Error ? error.message : String(error)}`,
      "legacy import",
      "legacy import transformation",
      list
    );
  }
}

/**
 * Transform JavaScript imports
 * Enhanced with better error handling
 */
function transformJsImport(list: ListNode, currentDir: string): IR.IRNode {
  try {
    // Handle new syntax: (js-import name source)
    if (list.elements.length === 3) {
      const nameNode = list.elements[1];
      if (nameNode.type !== "symbol") {
        throw new ValidationError(
          "js-import module name must be a symbol",
          "js-import",
          "symbol",
          nameNode.type
        );
      }
      
      const name = (nameNode as SymbolNode).name;
      const source = extractStringLiteral(list.elements[2]);
      
      return {
        type: IR.IRNodeType.JsImportReference,
        name,
        source
      } as IR.IRJsImportReference;
    }
    
    // Handle old syntax: (js-import source)
    else if (list.elements.length === 2) {
      const source = extractStringLiteral(list.elements[1]);
      // Generate default module name from source
      const moduleParts = source.split('/');
      let defaultName = moduleParts[moduleParts.length - 1].replace(/\.(js|ts|mjs|cjs)$/, '');
      // Clean up the name
      defaultName = defaultName.replace(/[^a-zA-Z0-9_$]/g, '_');
      
      return {
        type: IR.IRNodeType.JsImportReference,
        name: defaultName,
        source
      } as IR.IRJsImportReference;
    }
    
    // Invalid syntax
    else {
      throw new ValidationError(
        `js-import requires 1 or 2 arguments, got ${list.elements.length - 1}`,
        "js-import",
        "1 or 2 arguments",
        `${list.elements.length - 1} arguments`
      );
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform js-import: ${error instanceof Error ? error.message : String(error)}`,
      "js-import",
      "js-import transformation",
      list
    );
  }
}

/**
 * Transform JavaScript exports
 * Enhanced with better error handling
 */
function transformJsExport(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 3) {
      throw new ValidationError(
        `js-export requires exactly 2 arguments, got ${list.elements.length - 1}`,
        "js-export",
        "2 arguments",
        `${list.elements.length - 1} arguments`
      );
    }
    
    // Extract the export name as a string literal.
    const exportName = extractStringLiteral(list.elements[1]);
    
    // Create a sanitized variable name for the export
    const safeExportName = sanitizeIdentifier(exportName);
    
    // Transform the exported value.
    const value = transformNode(list.elements[2], currentDir);
    if (!value) {
      throw new ValidationError(
        "Exported value transformed to null",
        "js-export",
        "valid expression",
        "null"
      );
    }
    
    // If the value is already an identifier, then create a named export.
    if (value.type === IR.IRNodeType.Identifier) {
      return {
        type: IR.IRNodeType.ExportNamedDeclaration,
        specifiers: [{
          type: IR.IRNodeType.ExportSpecifier,
          local: value as IR.IRIdentifier,
          exported: { 
            type: IR.IRNodeType.Identifier, 
            name: safeExportName 
          } as IR.IRIdentifier
        }]
      } as IR.IRExportNamedDeclaration;
    }
    
    // Otherwise, create a temporary variable and export it.
    const tempId: IR.IRIdentifier = { 
      type: IR.IRNodeType.Identifier, 
      name: `export_${safeExportName}` 
    };
    
    return {
      type: IR.IRNodeType.ExportVariableDeclaration,
      declaration: {
        type: IR.IRNodeType.VariableDeclaration,
        kind: "const",
        declarations: [{
          type: IR.IRNodeType.VariableDeclarator,
          id: tempId,
          init: value
        }]
      },
      exportName: safeExportName
    } as IR.IRExportVariableDeclaration;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform js-export: ${error instanceof Error ? error.message : String(error)}`,
      "js-export",
      "js-export transformation",
      list
    );
  }
}

/**
 * Transform JavaScript "new" expressions
 * Enhanced with better error handling
 */
function transformJsNew(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length < 2) {
      throw new ValidationError(
        "js-new requires a constructor and optional arguments",
        "js-new",
        "at least 1 argument",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const constructor = transformNode(list.elements[1], currentDir);
    if (!constructor) {
      throw new ValidationError(
        "Constructor transformed to null",
        "js-new",
        "valid constructor expression",
        "null"
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
          argsNode.type
        );
      }
      
      args = (argsNode as ListNode).elements.map(arg => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Argument transformed to null: ${JSON.stringify(arg)}`,
            "js-new argument",
            "valid expression",
            "null"
          );
        }
        return transformed;
      });
    }
    
    return {
      type: IR.IRNodeType.NewExpression,
      callee: constructor,
      arguments: args
    } as IR.IRNewExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform js-new: ${error instanceof Error ? error.message : String(error)}`,
      "js-new",
      "js-new transformation",
      list
    );
  }
}

/**
 * Transform JavaScript property access
 * Enhanced with better error handling
 */
function transformJsGet(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 3) {
      throw new ValidationError(
        `js-get requires exactly 2 arguments, got ${list.elements.length - 1}`,
        "js-get",
        "2 arguments",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const object = transformNode(list.elements[1], currentDir);
    if (!object) {
      throw new ValidationError(
        "Object transformed to null",
        "js-get",
        "valid object expression",
        "null"
      );
    }
    
    try {
      const property = extractStringLiteral(list.elements[2]);
      return {
        type: IR.IRNodeType.MemberExpression,
        object,
        property: { type: IR.IRNodeType.StringLiteral, value: property } as IR.IRStringLiteral,
        computed: true
      } as IR.IRMemberExpression;
    } catch (error) {
      // Not a string literal, try as a general expression
      const propExpr = transformNode(list.elements[2], currentDir);
      if (!propExpr) {
        throw new ValidationError(
          "Property transformed to null",
          "js-get",
          "valid property expression",
          "null"
        );
      }
      
      return {
        type: IR.IRNodeType.MemberExpression,
        object,
        property: propExpr,
        computed: true
      } as IR.IRMemberExpression;
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform js-get: ${error instanceof Error ? error.message : String(error)}`,
      "js-get",
      "js-get transformation",
      list
    );
  }
}

/**
 * Transform JavaScript method calls
 * Enhanced with better error handling
 */
function transformJsCall(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length < 3) {
      throw new ValidationError(
        `js-call requires at least 2 arguments, got ${list.elements.length - 1}`,
        "js-call",
        "at least 2 arguments",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const object = transformNode(list.elements[1], currentDir);
    if (!object) {
      throw new ValidationError(
        "Object transformed to null",
        "js-call",
        "valid object expression",
        "null"
      );
    }
    
    try {
      const method = extractStringLiteral(list.elements[2]);
      const args = list.elements.slice(3).map(arg => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Argument transformed to null: ${JSON.stringify(arg)}`,
            "js-call argument",
            "valid expression",
            "null"
          );
        }
        return transformed;
      });
      
      return {
        type: IR.IRNodeType.CallMemberExpression,
        object,
        property: { type: IR.IRNodeType.StringLiteral, value: method } as IR.IRStringLiteral,
        arguments: args
      } as IR.IRCallMemberExpression;
    } catch (error) {
      // Not a string literal, try as a general expression
      const methodExpr = transformNode(list.elements[2], currentDir);
      if (!methodExpr) {
        throw new ValidationError(
          "Method transformed to null",
          "js-call",
          "valid method expression",
          "null"
        );
      }
      
      const args = list.elements.slice(3).map(arg => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Argument transformed to null: ${JSON.stringify(arg)}`,
            "js-call argument",
            "valid expression",
            "null"
          );
        }
        return transformed;
      });
      
      return {
        type: IR.IRNodeType.CallMemberExpression,
        object,
        property: methodExpr,
        arguments: args
      } as IR.IRCallMemberExpression;
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform js-call: ${error instanceof Error ? error.message : String(error)}`,
      "js-call",
      "js-call transformation",
      list
    );
  }
}

/**
 * Transform JavaScript property access with optional invocation
 * Enhanced with better error handling
 */
function transformJsGetInvoke(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 3) {
      throw new ValidationError(
        `js-get-invoke requires exactly 2 arguments, got ${list.elements.length - 1}`,
        "js-get-invoke",
        "2 arguments",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const object = transformNode(list.elements[1], currentDir);
    if (!object) {
      throw new ValidationError(
        "Object transformed to null",
        "js-get-invoke",
        "valid object expression",
        "null"
      );
    }
    
    try {
      const property = extractStringLiteral(list.elements[2]);
      return {
        type: IR.IRNodeType.InteropIIFE,
        object,
        property: { type: IR.IRNodeType.StringLiteral, value: property } as IR.IRStringLiteral
      } as IR.IRInteropIIFE;
    } catch (error) {
      throw new ValidationError(
        `js-get-invoke property must be a string literal or quoted string: ${error instanceof Error ? error.message : String(error)}`,
        "js-get-invoke",
        "string literal or quoted string",
        "other expression type"
      );
    }
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform js-get-invoke: ${error instanceof Error ? error.message : String(error)}`,
      "js-get-invoke",
      "js-get-invoke transformation",
      list
    );
  }
}

/**
 * Transform vector literals
 * Enhanced with better error handling
 */
function transformVector(list: ListNode, currentDir: string): IR.IRNode {
  try {
    const elements = list.elements.slice(1).map(elem => {
      const transformed = transformNode(elem, currentDir);
      if (!transformed) {
        throw new ValidationError(
          `Vector element transformed to null: ${JSON.stringify(elem)}`,
          "vector element",
          "valid expression",
          "null"
        );
      }
      return transformed;
    });
    
    return {
      type: IR.IRNodeType.ArrayExpression,
      elements
    } as IR.IRArrayExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform vector: ${error instanceof Error ? error.message : String(error)}`,
      "vector",
      "vector transformation",
      list
    );
  }
}

/**
 * Transform hash-map literals
 * Enhanced with better error handling
 */
function transformHashMap(list: ListNode, currentDir: string): IR.IRNode {
  try {
    const properties: IR.IRObjectProperty[] = [];
    const args = list.elements.slice(1);
    
    for (let i = 0; i < args.length; i += 2) {
      if (i + 1 >= args.length) {
        logger.warn(`Incomplete key-value pair in hash-map at index ${i}, skipping`);
        break; // Skip incomplete pairs
      }
      
      const keyNode = args[i];
      const valueNode = args[i + 1];
      
      // Process the key
      let keyExpr: IR.IRNode;
      
      if (keyNode.type === "literal") {
        const value = (keyNode as LiteralNode).value;
        keyExpr = {
          type: IR.IRNodeType.StringLiteral,
          value: String(value)
        } as IR.IRStringLiteral;
      } else if (keyNode.type === "symbol") {
        keyExpr = {
          type: IR.IRNodeType.StringLiteral,
          value: (keyNode as SymbolNode).name
        } as IR.IRStringLiteral;
      } else {
        const transformed = transformNode(keyNode, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Map key transformed to null: ${JSON.stringify(keyNode)}`,
            "hash-map key",
            "valid expression",
            "null"
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
          "null"
        );
      }
      
      const objectProperty: IR.IRObjectProperty = {
        type: IR.IRNodeType.ObjectProperty,
        key: keyExpr,
        value: valueExpr
      };
      
      properties.push(objectProperty);
    }
    
    return {
      type: IR.IRNodeType.ObjectExpression,
      properties
    } as IR.IRObjectExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform hash-map: ${error instanceof Error ? error.message : String(error)}`,
      "hash-map",
      "hash-map transformation",
      list
    );
  }
}

/**
 * Transform hash-set literals
 * Enhanced with better error handling
 */
function transformHashSet(list: ListNode, currentDir: string): IR.IRNode {
  try {
    const elements = list.elements.slice(1).map(elem => {
      const transformed = transformNode(elem, currentDir);
      if (!transformed) {
        throw new ValidationError(
          `Set element transformed to null: ${JSON.stringify(elem)}`,
          "hash-set element",
          "valid expression",
          "null"
        );
      }
      return transformed;
    });
    
    return {
      type: IR.IRNodeType.NewExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: "Set"
      } as IR.IRIdentifier,
      arguments: [
        {
          type: IR.IRNodeType.ArrayExpression,
          elements
        } as IR.IRArrayExpression
      ]
    } as IR.IRNewExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform hash-set: ${error instanceof Error ? error.message : String(error)}`,
      "hash-set",
      "hash-set transformation",
      list
    );
  }
}

/**
 * Transform collection 'get' operation.
 * Enhanced with better error handling
 */
function transformGet(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 3) {
      // For non-standard usage, fall back to regular function call
      return transformStandardFunctionCall(list, currentDir);
    }
    
    const collection = transformNode(list.elements[1], currentDir);
    if (!collection) {
      throw new ValidationError(
        "Collection transformed to null",
        "get operation",
        "valid collection expression",
        "null"
      );
    }
    
    const index = transformNode(list.elements[2], currentDir);
    if (!index) {
      throw new ValidationError(
        "Index transformed to null",
        "get operation",
        "valid index expression",
        "null"
      );
    }
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: "get"
      } as IR.IRIdentifier,
      arguments: [collection, index]
    } as IR.IRCallExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform get operation: ${error instanceof Error ? error.message : String(error)}`,
      "get",
      "get transformation",
      list
    );
  }
}

/**
 * Transform "new" constructor.
 * Enhanced with better error handling
 */
function transformNew(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length < 2) {
      throw new ValidationError(
        "'new' requires a constructor",
        "new constructor",
        "at least 1 argument",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const constructor = transformNode(list.elements[1], currentDir);
    if (!constructor) {
      throw new ValidationError(
        "Constructor transformed to null",
        "new constructor",
        "valid constructor expression",
        "null"
      );
    }
    
    const args = list.elements.slice(2).map(arg => {
      const transformed = transformNode(arg, currentDir);
      if (!transformed) {
        throw new ValidationError(
          `Constructor argument transformed to null: ${JSON.stringify(arg)}`,
          "new constructor argument",
          "valid expression",
          "null"
        );
      }
      return transformed;
    });
    
    return {
      type: IR.IRNodeType.NewExpression,
      callee: constructor,
      arguments: args
    } as IR.IRNewExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform new constructor: ${error instanceof Error ? error.message : String(error)}`,
      "new",
      "new transformation",
      list
    );
  }
}

/**
 * Transform collection access syntax.
 * (myList 2) => (get myList 2)
 * (myMap "key") => (get myMap "key")
 * Enhanced with better error handling
 */
function transformCollectionAccess(list: ListNode, op: string, currentDir: string): IR.IRNode {
  try {
    const collection = transformNode(list.elements[0], currentDir);
    if (!collection) {
      throw new ValidationError(
        "Collection transformed to null",
        "collection access",
        "valid collection expression",
        "null"
      );
    }
    
    const index = transformNode(list.elements[1], currentDir);
    if (!index) {
      throw new ValidationError(
        "Index transformed to null",
        "collection access",
        "valid index expression",
        "null"
      );
    }
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: "get"
      } as IR.IRIdentifier,
      arguments: [collection, index]
    } as IR.IRCallExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform collection access with op '${op}': ${error instanceof Error ? error.message : String(error)}`,
      "collection access",
      "collection access transformation",
      list
    );
  }
}

/**
 * Transform a standard function call.
 * Enhanced with better error handling
 */
function transformStandardFunctionCall(list: ListNode, currentDir: string): IR.IRNode {
  try {
    const first = list.elements[0];
    
    // If first element is a symbol, create a function call with that name
    if (first.type === "symbol") {
      const op = (first as SymbolNode).name;
      const args = list.elements.slice(1).map(arg => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Function argument transformed to null: ${JSON.stringify(arg)}`,
            "function argument",
            "valid expression",
            "null"
          );
        }
        return transformed;
      });
      
      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(op)
        } as IR.IRIdentifier,
        arguments: args
      } as IR.IRCallExpression;
    }
    
    // Otherwise, first element is an expression that should evaluate to a function
    const callee = transformNode(list.elements[0], currentDir);
    if (!callee) {
      throw new ValidationError(
        "Function callee transformed to null",
        "function call",
        "valid function expression",
        "null"
      );
    }
    
    const args = list.elements.slice(1).map(arg => {
      const transformed = transformNode(arg, currentDir);
      if (!transformed) {
        throw new ValidationError(
          `Function argument transformed to null: ${JSON.stringify(arg)}`,
          "function argument",
          "valid expression",
          "null"
        );
      }
      return transformed;
    });
    
    return { 
      type: IR.IRNodeType.CallExpression, 
      callee, 
      arguments: args 
    } as IR.IRCallExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform function call: ${error instanceof Error ? error.message : String(error)}`,
      "function call",
      "function call transformation",
      list
    );
  }
}

/**
 * Extract a string literal from a node.
 * Enhanced with better error handling
 */
function extractStringLiteral(node: HQLNode): string {
  try {
    if (node.type === "literal") {
      return String((node as LiteralNode).value);
    }
    
    if (node.type === "list") {
      const list = node as ListNode;
      if (list.elements.length === 2 &&
          list.elements[0].type === "symbol" &&
          (list.elements[0] as SymbolNode).name === "quote" &&
          list.elements[1].type === "literal") {
        return String((list.elements[1] as LiteralNode).value);
      }
    }
    
    throw new ValidationError(
      `Expected string literal but got: ${node.type}`,
      "string literal extraction",
      "string literal or quoted literal",
      node.type
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // Re-throw ValidationError directly
    }
    
    throw new ValidationError(
      `Failed to extract string literal: ${error instanceof Error ? error.message : String(error)}`,
      "string literal extraction",
      "string literal",
      "unknown"
    );
  }
}

/**
 * Transform a quoted expression.
 * Enhanced with better error handling
 */
function transformQuote(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 2) {
      throw new ValidationError(
        `quote requires exactly 1 argument, got ${list.elements.length - 1}`,
        "quote",
        "1 argument",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const quoted = list.elements[1];
    
    if (quoted.type === "literal") {
      return transformLiteral(quoted as LiteralNode);
    } else if (quoted.type === "symbol") {
      return { 
        type: IR.IRNodeType.StringLiteral, 
        value: (quoted as SymbolNode).name 
      } as IR.IRStringLiteral;
    } else if (quoted.type === "list") {
      // Special case for empty quoted lists - return empty array
      if ((quoted as ListNode).elements.length === 0) {
        return { 
          type: IR.IRNodeType.ArrayExpression, 
          elements: [] 
        } as IR.IRArrayExpression;
      }
      
      // Normal case for non-empty quoted lists
      const elements: IR.IRNode[] = (quoted as ListNode).elements.map(
        elem => transformQuote({ type: "list", elements: [{ type: "symbol", name: "quote" }, elem] }, currentDir)
      );
      
      return { 
        type: IR.IRNodeType.ArrayExpression, 
        elements 
      } as IR.IRArrayExpression;
    }
    
    throw new ValidationError(
      `Unsupported quoted expression: ${quoted.type}`,
      "quote",
      "literal, symbol, or list",
      quoted.type
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform quote: ${error instanceof Error ? error.message : String(error)}`,
      "quote",
      "quote transformation",
      list
    );
  }
}

/**
 * Transform an if expression.
 * Enhanced with better error handling
 */
function transformIf(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length < 3 || list.elements.length > 4) {
      throw new ValidationError(
        `if requires 2 or 3 arguments, got ${list.elements.length - 1}`,
        "if expression",
        "2 or 3 arguments",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const test = transformNode(list.elements[1], currentDir);
    if (!test) {
      throw new ValidationError(
        "Test condition transformed to null",
        "if test",
        "valid test expression",
        "null"
      );
    }
    
    const consequent = transformNode(list.elements[2], currentDir);
    if (!consequent) {
      throw new ValidationError(
        "Then branch transformed to null",
        "if consequent",
        "valid consequent expression",
        "null"
      );
    }
    
    const alternate = list.elements.length > 3 
      ? transformNode(list.elements[3], currentDir) 
      : { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
      
    if (!alternate) {
      throw new ValidationError(
        "Else branch transformed to null",
        "if alternate",
        "valid alternate expression",
        "null"
      );
    }
    
    return {
      type: IR.IRNodeType.ConditionalExpression,
      test,
      consequent,
      alternate
    } as IR.IRConditionalExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform if expression: ${error instanceof Error ? error.message : String(error)}`,
      "if expression",
      "if transformation",
      list
    );
  }
}

/**
 * Transform a function definition.
 * Enhanced with better error handling
 */
function transformFn(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length < 3) {
      throw new ValidationError(
        "fn requires parameters and body",
        "fn expression",
        "parameters and body",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const paramsNode = list.elements[1];
    if (paramsNode.type !== "list") {
      throw new ValidationError(
        "fn parameters must be a list",
        "fn parameters",
        "list",
        paramsNode.type
      );
    }
    
    const { params, restParam } = processFunctionParams(paramsNode as ListNode);
    
    // Process body expressions and return statements
    const bodyNodes = processFunctionBody(list.elements.slice(2), currentDir);
    
    return {
      type: IR.IRNodeType.FunctionExpression,
      id: null,
      params: [...params, ...(restParam ? [restParam] : [])],
      body: { type: IR.IRNodeType.BlockStatement, body: bodyNodes }
    } as IR.IRFunctionExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform fn expression: ${error instanceof Error ? error.message : String(error)}`,
      "fn expression",
      "fn transformation",
      list
    );
  }
}

/**
 * Process function parameters, handling rest parameters
 * Enhanced with better error handling
 */
function processFunctionParams(paramsNode: ListNode): { 
  params: IR.IRIdentifier[], 
  restParam: IR.IRIdentifier | null 
} {
  try {
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
          param.type
        );
      }
      
      const paramName = (param as SymbolNode).name;
      
      if (paramName === '&') {
        restMode = true;
        continue;
      }
      
      if (restMode) {
        if (restParam !== null) {
          throw new ValidationError(
            `Multiple rest parameters not allowed: found '${restParam.name.slice(3)}' and '${paramName}'`,
            "rest parameter",
            "single rest parameter",
            "multiple rest parameters"
          );
        }
        
        restParam = {
          type: IR.IRNodeType.Identifier,
          name: `...${sanitizeIdentifier(paramName)}`
        } as IR.IRIdentifier;
      } else {
        params.push({
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(paramName)
        } as IR.IRIdentifier);
      }
    }
    
    return { params, restParam };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // Re-throw ValidationError directly
    }
    
    throw new ValidationError(
      `Failed to process function parameters: ${error instanceof Error ? error.message : String(error)}`,
      "function parameters",
      "valid parameter list",
      "invalid parameter format"
    );
  }
}

/**
 * Process function body expressions, creating return statements
 * Enhanced with better error handling
 */
function processFunctionBody(bodyExprs: HQLNode[], currentDir: string): IR.IRNode[] {
  try {
    const bodyNodes: IR.IRNode[] = [];
    
    // Process all but the last expression as statements
    for (let i = 0; i < bodyExprs.length - 1; i++) {
      const expr = transformNode(bodyExprs[i], currentDir);
      if (expr) bodyNodes.push(expr);
    }
    
    // Process the last expression as the return value
    if (bodyExprs.length > 0) {
      const lastExpr = transformNode(bodyExprs[bodyExprs.length - 1], currentDir);
      
      if (lastExpr) {
        // Add a return statement for the last expression
        bodyNodes.push({
          type: IR.IRNodeType.ReturnStatement,
          argument: lastExpr
        } as IR.IRReturnStatement);
      } else {
        // If the last expression transforms to null, return null explicitly
        bodyNodes.push({
          type: IR.IRNodeType.ReturnStatement,
          argument: { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral
        } as IR.IRReturnStatement);
      }
    }
    
    return bodyNodes;
  } catch (error) {
    throw new TransformError(
      `Failed to process function body: ${error instanceof Error ? error.message : String(error)}`,
      "function body",
      "function body transformation",
      bodyExprs
    );
  }
}

/**
 * Transform a definition.
 * Enhanced with better error handling
 */
function transformDef(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length !== 3) {
      throw new ValidationError(
        `def requires exactly 2 arguments, got ${list.elements.length - 1}`,
        "def expression",
        "2 arguments",
        `${list.elements.length - 1} arguments`
      );
    }
    
    const nameNode = list.elements[1];
    if (nameNode.type !== "symbol") {
      throw new ValidationError(
        "def requires a symbol name",
        "def name",
        "symbol",
        nameNode.type
      );
    }
    
    const id = transformSymbol(nameNode as SymbolNode) as IR.IRIdentifier;
    
    const init = transformNode(list.elements[2], currentDir);
    if (!init) {
      throw new ValidationError(
        "Definition value transformed to null",
        "def value",
        "valid expression",
        "null"
      );
    }
    
    return {
      type: IR.IRNodeType.VariableDeclaration,
      kind: "const",
      declarations: [{
        type: IR.IRNodeType.VariableDeclarator,
        id,
        init
      }]
    } as IR.IRVariableDeclaration;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    throw new TransformError(
      `Failed to transform def expression: ${error instanceof Error ? error.message : String(error)}`,
      "def expression",
      "def transformation",
      list
    );
  }
}

/**
 * Transform primitive operations (+, -, *, /, etc.).
 * Enhanced with better error handling
 */
function transformPrimitiveOp(list: ListNode, currentDir: string): IR.IRNode {
  try {
    const op = (list.elements[0] as SymbolNode).name;
    const args = list.elements.slice(1).map(arg => {
      const transformed = transformNode(arg, currentDir);
      if (!transformed) {
        throw new ValidationError(
          `Primitive op argument transformed to null: ${JSON.stringify(arg)}`,
          `${op} argument`,
          "valid expression",
          "null"
        );
      }
      return transformed;
    });

    // Handle arithmetic operators
    if (op === "+" || op === "-" || op === "*" || op === "/" || op === "%") {
      return transformArithmeticOp(op, args);
    }
    
    // Handle comparison operators
    if (op === "=" || op === "eq?" || op === "!=" || 
        op === ">" || op === "<" || op === ">=" || op === "<=") {
      return transformComparisonOp(op, args);
    }
    
    // For all other primitive operations, create a function call expression
    return {
      type: IR.IRNodeType.CallExpression,
      callee: { type: IR.IRNodeType.Identifier, name: op } as IR.IRIdentifier,
      arguments: args,
    } as IR.IRCallExpression;
  } catch (error) {
    if (error instanceof ValidationError || error instanceof TransformError) {
      throw error; // Re-throw specialized errors
    }
    
    const opName = list.elements[0].type === "symbol" ? (list.elements[0] as SymbolNode).name : "unknown";
    
    throw new TransformError(
      `Failed to transform primitive op '${opName}': ${error instanceof Error ? error.message : String(error)}`,
      `primitive op: ${opName}`,
      "primitive op transformation",
      list
    );
  }
}

/**
 * Transform arithmetic operations (+, -, *, /, %)
 * Enhanced with better error handling
 */
function transformArithmeticOp(op: string, args: IR.IRNode[]): IR.IRNode {
  try {
    if (args.length === 0) {
      throw new ValidationError(
        `${op} requires at least one argument`,
        `${op} operation`,
        "at least 1 argument",
        "0 arguments"
      );
    }
    
    // Handle unary +/- (e.g., (+ 5) or (- 3))
    if (args.length === 1 && (op === "+" || op === "-")) {
      return {
        type: IR.IRNodeType.UnaryExpression,
        operator: op,
        argument: args[0],
      } as IR.IRUnaryExpression;
    }
    
    // For a single argument with * or /, use a default second operand
    if (args.length === 1) {
      // Default second argument for * and / is 1, for + and - it's 0
      const defaultValue = (op === "*" || op === "/") ? 1 : 0;
      
      return {
        type: IR.IRNodeType.BinaryExpression,
        operator: op,
        left: args[0],
        right: {
          type: IR.IRNodeType.NumericLiteral,
          value: defaultValue
        } as IR.IRNumericLiteral
      } as IR.IRBinaryExpression;
    }
    
    // For multiple arguments, chain them as binary operations
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
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // Re-throw ValidationError directly
    }
    
    throw new ValidationError(
      `Failed to transform arithmetic operation '${op}': ${error instanceof Error ? error.message : String(error)}`,
      `${op} operation`,
      "valid arithmetic operation",
      "invalid operation"
    );
  }
}

/**
 * Transform comparison operations (=, !=, <, >, <=, >=)
 * Enhanced with better error handling
 */
function transformComparisonOp(op: string, args: IR.IRNode[]): IR.IRNode {
  try {
    if (args.length !== 2) {
      throw new ValidationError(
        `${op} requires exactly 2 arguments, got ${args.length}`,
        `${op} operation`,
        "2 arguments",
        `${args.length} arguments`
      );
    }
    
    // Map HQL operators to JavaScript operators
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
        jsOp = "==="; // Default to equality
    }
    
    return {
      type: IR.IRNodeType.BinaryExpression,
      operator: jsOp,
      left: args[0],
      right: args[1],
    } as IR.IRBinaryExpression;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error; // Re-throw ValidationError directly
    }
    
    throw new ValidationError(
      `Failed to transform comparison operation '${op}': ${error instanceof Error ? error.message : String(error)}`,
      `${op} operation`,
      "valid comparison operation",
      "invalid operation"
    );
  }
}