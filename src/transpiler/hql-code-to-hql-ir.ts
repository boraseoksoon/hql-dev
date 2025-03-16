// Refactored hql-code-to-hql-ir.ts with modular functions and reduced redundancy

import * as IR from "./hql_ir.ts";
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { KERNEL_PRIMITIVES, PRIMITIVE_OPS, PRIMITIVE_DATA_STRUCTURE, PRIMITIVE_CLASS } from "../bootstrap.ts";
import { sanitizeIdentifier } from "../utils.ts";

/**
 * Transform an array of HQL AST nodes into an IR program.
 */
export function transformToIR(nodes: HQLNode[], currentDir: string): IR.IRProgram {
  const body: IR.IRNode[] = [];
  for (const node of nodes) {
    const ir = transformNode(node, currentDir);
    if (ir) body.push(ir);
  }
  return { type: IR.IRNodeType.Program, body };
}

/**
 * Transform a single HQL node to its IR representation.
 */
export function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
  switch (node.type) {
    case "literal":
      return transformLiteral(node as LiteralNode);
    case "symbol":
      return transformSymbol(node as SymbolNode);
    case "list":
      return transformList(node as ListNode, currentDir);
    default:
      return null;
  }
}

/**
 * Transform a literal node to its IR representation.
 */
function transformLiteral(lit: LiteralNode): IR.IRNode {
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
}

/**
 * Transform a symbol node to its IR representation.
 */
function transformSymbol(sym: SymbolNode): IR.IRNode {
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
}

/**
 * Transform a list node to its IR representation.
 */
function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  if (list.elements.length === 0) {
    return transformEmptyList();
  }
  
  // Special case for js-get-invoke
  const jsGetInvokeResult = transformJsGetInvokeSpecialCase(list, currentDir);
  if (jsGetInvokeResult) return jsGetInvokeResult;
  
  const first = list.elements[0];

  // Special case for defmacro - handle it explicitly to avoid runtime errors
  if (first.type === "symbol" && (first as SymbolNode).name === "defmacro") {
    // Return a null literal which will be harmless in the output JS
    return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
  }
  
  // Case 1: First element is a list
  if (first.type === "list") {
    return transformNestedList(list, currentDir);
  }

  // Case 2: First element is a symbol
  if (first.type === "symbol") {
    const op = (first as SymbolNode).name;
    
    // Case 2: First element is a symbol
    if (op === "import" && list.elements.length === 3) {
      // Extract module name and path
      const nameNode = list.elements[1];
      const pathNode = list.elements[2];
      
      if (nameNode.type !== "symbol") {
        throw new Error("Import name must be a symbol");
      }
      
      if (pathNode.type !== "literal") {
        throw new Error("Import path must be a string literal");
      }
      
      const name = (nameNode as SymbolNode).name;
      const path = String((pathNode as LiteralNode).value);
      
      // Create a JsImportReference - same as js-import handling
      return {
        type: IR.IRNodeType.JsImportReference,
        name,
        source: path
      } as IR.IRJsImportReference;
    }
    
    // Handle dot notation
    const dotNotationResult = transformDotNotation(list, op, currentDir);
    if (dotNotationResult) return dotNotationResult;
    
    // Handle empty data structure literals
    const emptyDataStructureResult = transformEmptyDataStructure(op);
    if (emptyDataStructureResult) return emptyDataStructureResult;
    
    // Handle kernel primitives
    if (KERNEL_PRIMITIVES.has(op)) {
      return transformKernelPrimitive(list, op, currentDir);
    }
    
    // console.log(">>>>>> transformList list : ", list)
    
    // Handle JS interop primitives
    const jsInteropResult = transformJsInteropPrimitive(list, op, currentDir);
    if (jsInteropResult) return jsInteropResult;
    
    // Handle data structure literals
    const dataStructureResult = transformDataStructure(list, op, currentDir);
    if (dataStructureResult) return dataStructureResult;
    
    // Handle primitive operations (+, -, *, /, etc.)
    if (PRIMITIVE_OPS.has(op)) {
      return transformPrimitiveOp(list, currentDir);
    }
    
    // Handle collection access (get)
    const getResult = transformGetOperation(list, op, currentDir);
    if (getResult) return getResult;
    
    // Handle "new" constructor
    const newResult = transformNewConstructor(list, op, currentDir);
    if (newResult) return newResult;
    
    // Handle no-argument function call
    const noArgResult = transformNoArgFunction(list, op);
    if (noArgResult) return noArgResult;
    
    const sExpressionCollectionAccess = transformCollectionAccess(list, op, currentDir);
    if (sExpressionCollectionAccess) return sExpressionCollectionAccess;
    
    // Standard function call
    return transformStandardFunctionCall(list, op, currentDir);
  }
  
  // Default: transform to a function call
  return transformDefaultFunctionCall(list, currentDir);
}

/**
 * Transform an empty list into an empty array expression.
 */
function transformEmptyList(): IR.IRArrayExpression {
  return {
    type: IR.IRNodeType.ArrayExpression,
    elements: []
  } as IR.IRArrayExpression;
}

/**
 * Handle the special case for js-get-invoke.
 */
function transformJsGetInvokeSpecialCase(list: ListNode, currentDir: string): IR.IRNode | null {
  if (list.elements.length === 3 && 
      list.elements[0].type === "symbol" && 
      (list.elements[0] as SymbolNode).name === "js-get-invoke") {
    
    const object = transformNode(list.elements[1], currentDir)!;
    const property = transformNode(list.elements[2], currentDir)!;
    
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
}

/**
 * Transform a nested list (list where first element is also a list).
 */
function transformNestedList(list: ListNode, currentDir: string): IR.IRNode {
  const innerExpr = transformNode(list.elements[0], currentDir);
  
  // If there are more elements after the inner list
  if (list.elements.length > 1) {
    const second = list.elements[1];
    
    // If the second element is a symbol with dot notation, it's a method call
    if (second.type === "symbol" && (second as SymbolNode).name.startsWith('.')) {
      const methodName = (second as SymbolNode).name.substring(1);
      const args = list.elements.slice(2).map(arg => transformNode(arg, currentDir)!);
      
      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.MemberExpression,
          object: innerExpr!,
          property: { 
            type: IR.IRNodeType.Identifier, 
            name: methodName 
          } as IR.IRIdentifier,
          computed: false
        } as IR.IRMemberExpression,
        arguments: args
      } as IR.IRCallExpression;
    }
    
    // If the second element is a regular symbol, use transformNestedPropertyAccess
    else if (second.type === "symbol") {
      return {
        type: IR.IRNodeType.MemberExpression,
        object: innerExpr!,
        property: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier((second as SymbolNode).name)
        } as IR.IRIdentifier,
        computed: false
      } as IR.IRMemberExpression;
    }
    
    // Otherwise, call with arguments
    else {
      const args = list.elements.slice(1).map(arg => transformNode(arg, currentDir)!);
      return {
        type: IR.IRNodeType.CallExpression,
        callee: innerExpr!,
        arguments: args
      } as IR.IRCallExpression;
    }
  }
  
  // If no additional elements, just return the inner expression itself
  return innerExpr!;
}

/**
 * Transform dot notation expressions (e.g., object.property).
 */
function transformDotNotation(list: ListNode, op: string, currentDir: string): IR.IRNode | null {
  if (op.includes('.') && !op.startsWith('js/')) {
    const parts = op.split('.');
    const objectName = parts[0];
    const property = parts.slice(1).join('.');
    
    // Create a proper member expression that preserves the dot notation
    const objectExpr = {
      type: IR.IRNodeType.Identifier,
      // Important: Don't sanitize the whole op, just the parts
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
    const args = list.elements.slice(1).map(arg => transformNode(arg, currentDir)!);
    
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
  }
  
  return null;
}

/**
 * Transform empty data structure literals (empty-array, empty-map, empty-set).
 */
function transformEmptyDataStructure(op: string): IR.IRNode | null {
  if (op === "empty-array") {
    return {
      type: IR.IRNodeType.ArrayExpression,
      elements: []
    } as IR.IRArrayExpression;
  }
  
  if (op === "empty-map") {
    return {
      type: IR.IRNodeType.ObjectExpression,
      properties: []
    } as IR.IRObjectExpression;
  }
  
  if (op === "empty-set") {
    return {
      type: IR.IRNodeType.NewExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: "Set"
      } as IR.IRIdentifier,
      arguments: []
    } as IR.IRNewExpression;
  }
  
  return null;
}

/**
 * Transform kernel primitives (quote, if, fn, def).
 */
function transformKernelPrimitive(list: ListNode, op: string, currentDir: string): IR.IRNode {
  switch (op) {
    case "quote":
      return transformQuote(list, currentDir);
    case "if":
      return transformIf(list, currentDir);
    case "fn":
      return transformFn(list, currentDir);
    case "def":
      return transformDef(list, currentDir);
    case "quasiquote":
      return transformQuasiquote(list, currentDir);
    case "unquote":
      return transformUnquote(list, currentDir);
    case "unquote-splicing":
      return transformUnquoteSplicing(list, currentDir);
    default:
      throw new Error(`Unknown kernel primitive: ${op}`);
  }
}

function transformQuasiquote(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("quasiquote requires exactly one argument");
  }
  // For IR generation, treat quasiquoted expressions similar to quoted ones
  return transformNode(list.elements[1], currentDir)!;
}

function transformUnquote(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("unquote requires exactly one argument");
  }
  // For IR generation, unquote should be expanded during macro processing
  return transformNode(list.elements[1], currentDir)!;
}

function transformUnquoteSplicing(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("unquote-splicing requires exactly one argument");
  }
  // For IR generation, unquote-splicing should be expanded during macro processing
  return transformNode(list.elements[1], currentDir)!;
}

/**
 * Transform JS interop primitives (js-import, js-export, js-new, js-get, js-call, js-get-invoke).
 */
function transformJsInteropPrimitive(list: ListNode, op: string, currentDir: string): IR.IRNode | null {
  switch (op) {
    case "js-import":
      return transformJsImport(list, currentDir);
    case "js-export":
      return transformJsExport(list, currentDir);
    case "js-new":
      return transformJsNew(list, currentDir);
    case "js-get":
      return transformJsGet(list, currentDir);
    case "js-call":
      return transformJsCall(list, currentDir);
    case "js-get-invoke":
      return transformJsGetInvoke(list, currentDir);
    default:
      return null;
  }
}

/**
 * Transform data structure literals (vector, hash-map, hash-set).
 */
function transformDataStructure(list: ListNode, op: string, currentDir: string): IR.IRNode | null {
  if (op === "vector") {
    const elements = list.elements.slice(1).map(elem => transformNode(elem, currentDir)!);
    return {
      type: IR.IRNodeType.ArrayExpression,
      elements
    } as IR.IRArrayExpression;
  }
  
  if (op === "hash-map") {
    return transformHashMap(list, currentDir);
  }
  
  if (op === "hash-set") {
    const elements = list.elements.slice(1).map(elem => transformNode(elem, currentDir)!);
    
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
  }
  
  return null;
}

/**
 * Transform a hash-map data structure.
 */
function transformHashMap(list: ListNode, currentDir: string): IR.IRObjectExpression {
  const properties: IR.IRObjectProperty[] = [];
  const args = list.elements.slice(1);
  
  for (let i = 0; i < args.length; i += 2) {
    if (i + 1 >= args.length) break; // Skip incomplete pairs
    
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
      keyExpr = transformNode(keyNode, currentDir)!;
    }
    
    const valueExpr = transformNode(valueNode, currentDir)!;
    
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
}

/**
 * Transform collection 'get' operation.
 */
function transformGetOperation(list: ListNode, op: string, currentDir: string): IR.IRNode | null {
  if (op === "get" && list.elements.length === 3) {
    const collection = transformNode(list.elements[1], currentDir)!;
    const index = transformNode(list.elements[2], currentDir)!;
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: "get"
      } as IR.IRIdentifier,
      arguments: [collection, index]
    } as IR.IRCallExpression;
  }
  
  return null;
}

/**
 * Transform "new" constructor.
 */
function transformNewConstructor(list: ListNode, op: string, currentDir: string): IR.IRNode | null {
  if (op === "new") {
    const constructor = transformNode(list.elements[1], currentDir)!;
    return {
      type: IR.IRNodeType.NewExpression,
      callee: constructor,
      arguments: list.elements.slice(2).map(arg => transformNode(arg, currentDir)!)
    } as IR.IRNewExpression;
  }
  
  return null;
}

/**
 * Transform a function call with no arguments.
 */
function transformNoArgFunction(list: ListNode, op: string): IR.IRNode | null {
  if (list.elements.length === 1 && 
      !["empty-array", "empty-map", "empty-set"].includes(op) &&
      !KERNEL_PRIMITIVES.has(op) && 
      !op.startsWith('js-') && 
      !PRIMITIVE_OPS.has(op)) {
    
    // Create a function call with no arguments
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(op)
      } as IR.IRIdentifier,
      arguments: []
    } as IR.IRCallExpression;
  }
  
  return null;
}

function shouldTransformCollectionAccess(list: ListNode, op: string): boolean {
  return list.elements.length === 2 &&
         !KERNEL_PRIMITIVES.has(op) &&
         !PRIMITIVE_DATA_STRUCTURE.has(op) &&
         !PRIMITIVE_CLASS.has(op) &&
         !op.startsWith("js-");
}

/**
 * Transform collection access.
 * (myList 2) => (get myList 2)
 * (myMap "key") => (get myMap "key")
 */
export function transformCollectionAccess(list: ListNode, op: string, currentDir: string): IR.IRNode | null {
  if (shouldTransformCollectionAccess(list, op)) {
    const collection = transformNode(list.elements[0], currentDir)!;
    const index = transformNode(list.elements[1], currentDir)!;
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: "get"
      } as IR.IRIdentifier,
      arguments: [collection, index]
    } as IR.IRCallExpression;
  }
  
  return null;
}

/**
 * Transform a standard function call.
 */
function transformStandardFunctionCall(list: ListNode, op: string, currentDir: string): IR.IRNode {
  const args = list.elements.slice(1).map(arg => transformNode(arg, currentDir)!);
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(op)
    } as IR.IRIdentifier,
    arguments: args
  } as IR.IRCallExpression;
}

/**
 * Transform a default function call (where the first element is not a symbol).
 */
function transformDefaultFunctionCall(list: ListNode, currentDir: string): IR.IRNode {
  const callee = transformNode(list.elements[0], currentDir);
  const args = list.elements.slice(1).map(arg => transformNode(arg, currentDir)!);
  return { 
    type: IR.IRNodeType.CallExpression, 
    callee, 
    arguments: args 
  } as IR.IRCallExpression;
}

/**
 * Extract a string literal from a node.
 */
function extractStringLiteral(node: HQLNode): string {
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
  
  throw new Error(`Expected string literal but got: ${JSON.stringify(node)}`);
}

/**
 * Transform a quoted expression.
 */
function transformQuote(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("quote requires exactly 1 argument");
  }
  
  const quoted = list.elements[1];
  
  if (quoted.type === "literal") {
    return transformLiteral(quoted as LiteralNode);
  } else if (quoted.type === "symbol") {
    return { type: IR.IRNodeType.StringLiteral, value: (quoted as SymbolNode).name } as IR.IRStringLiteral;
  } else if (quoted.type === "list") {
    // Special case for empty quoted lists - return empty array
    if ((quoted as ListNode).elements.length === 0) {
      return { type: IR.IRNodeType.ArrayExpression, elements: [] } as IR.IRArrayExpression;
    }
    
    // Normal case for non-empty quoted lists
    const elements: IR.IRNode[] = (quoted as ListNode).elements.map(
      elem => transformQuote({ type: "list", elements: [{ type: "symbol", name: "quote" }, elem] }, currentDir)
    );
    
    return { type: IR.IRNodeType.ArrayExpression, elements } as IR.IRArrayExpression;
  }
  
  throw new Error(`Unsupported quoted expression: ${JSON.stringify(quoted)}`);
}

/**
 * Transform an if expression.
 */
function transformIf(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3 || list.elements.length > 4) {
    throw new Error("if requires 2 or 3 arguments");
  }
  
  const test = transformNode(list.elements[1], currentDir)!;
  const consequent = transformNode(list.elements[2], currentDir)!;
  const alternate = list.elements.length > 3 ? transformNode(list.elements[3], currentDir)! : { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
  
  return {
    type: IR.IRNodeType.ConditionalExpression,
    test,
    consequent,
    alternate
  } as IR.IRConditionalExpression;
}

/**
 * Transform a function definition.
 */
function transformFn(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("fn requires parameters and body");
  }
  
  const paramsNode = list.elements[1];
  if (paramsNode.type !== "list") {
    throw new Error("fn parameters must be a list");
  }
  
  // Process parameters, handling '&' for rest parameters
  const paramElements = (paramsNode as ListNode).elements;
  const params: IR.IRIdentifier[] = [];
  
  for (let i = 0; i < paramElements.length; i++) {
    const param = paramElements[i];
    if (param.type !== "symbol") {
      throw new Error("fn parameters must be symbols");
    }
    
    // Check for &
    if ((param as SymbolNode).name === "&") {
      // Next symbol should be the rest parameter
      if (i + 1 < paramElements.length && paramElements[i + 1].type === "symbol") {
        const restParam = paramElements[i + 1] as SymbolNode;
        const restParamName = sanitizeIdentifier(restParam.name);
        
        // Create a rest parameter identifier with the ... prefix
        params.push({
          type: IR.IRNodeType.Identifier,
          name: `...${restParamName}`
        } as IR.IRIdentifier);
        
        // Skip the next parameter since we've handled it
        i++;
      } else {
        throw new Error("& must be followed by a symbol in parameter list");
      }
    } else {
      params.push(transformSymbol(param as SymbolNode) as IR.IRIdentifier);
    }
  }
  
  const bodyNodes: IR.IRNode[] = [];
  
  // Process all but the last expression as statements
  for (let i = 2; i < list.elements.length - 1; i++) {
    const expr = transformNode(list.elements[i], currentDir);
    if (expr) bodyNodes.push(expr);
  }
  
  // Process the last expression as the return value
  if (list.elements.length > 2) {
    const lastExpr = transformNode(list.elements[list.elements.length - 1], currentDir);
    
    if (lastExpr) {
      // Special handling for variable declarations in return position
      if (lastExpr.type === IR.IRNodeType.VariableDeclaration) {
        // Add the variable declaration as a statement
        bodyNodes.push(lastExpr);
        
        // Then add a return statement that refers to the variable
        const varDecl = lastExpr as IR.IRVariableDeclaration;
        if (varDecl.declarations.length > 0 && varDecl.declarations[0].id) {
          bodyNodes.push({
            type: IR.IRNodeType.ReturnStatement,
            argument: {
              type: IR.IRNodeType.Identifier,
              name: varDecl.declarations[0].id.name
            } as IR.IRIdentifier
          } as IR.IRReturnStatement);
        } else {
          // Fallback if we couldn't get the variable name
          bodyNodes.push({
            type: IR.IRNodeType.ReturnStatement,
            argument: { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral
          } as IR.IRReturnStatement);
        }
      } 
      // Special handling for call expressions with empty arguments (like IIFE from do macro)
      else if (lastExpr.type === IR.IRNodeType.CallExpression) {
        const callExpr = lastExpr as IR.IRCallExpression;
        if (callExpr.arguments.length === 0) {
          // First add the function call as a statement
          bodyNodes.push(callExpr);
          
          // Then add a return null statement as a fallback
          bodyNodes.push({
            type: IR.IRNodeType.ReturnStatement,
            argument: { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral
          } as IR.IRReturnStatement);
        } else {
          // Normal call expression - return its value
          bodyNodes.push({
            type: IR.IRNodeType.ReturnStatement,
            argument: callExpr
          } as IR.IRReturnStatement);
        }
      }
      else {
        // Normal expression - just return it
        bodyNodes.push({
          type: IR.IRNodeType.ReturnStatement,
          argument: lastExpr
        } as IR.IRReturnStatement);
      }
    } else {
      // If lastExpr is null, add a fallback return null
      bodyNodes.push({
        type: IR.IRNodeType.ReturnStatement,
        argument: { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral
      } as IR.IRReturnStatement);
    }
  }
  
  return {
    type: IR.IRNodeType.FunctionExpression,
    id: null,
    params,
    body: { type: IR.IRNodeType.BlockStatement, body: bodyNodes }
  } as IR.IRFunctionExpression;
}

/**
 * Transform a definition.
 */
function transformDef(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 3) {
    throw new Error("def requires exactly 2 arguments");
  }
  
  const nameNode = list.elements[1];
  if (nameNode.type !== "symbol") {
    throw new Error("def requires a symbol name");
  }
  
  const id = transformSymbol(nameNode as SymbolNode) as IR.IRIdentifier;
  const init = transformNode(list.elements[2], currentDir)!;
  
  return {
    type: IR.IRNodeType.VariableDeclaration,
    kind: "const",
    declarations: [{
      type: IR.IRNodeType.VariableDeclarator,
      id,
      init
    }]
  } as IR.IRVariableDeclaration;
}

/**
 * Transform a JavaScript import.
 */
function transformJsImport(list: ListNode, currentDir: string): IR.IRNode {
  // Handle new syntax: (js-import name source)
  if (list.elements.length === 3) {
    try {
      const nameNode = list.elements[1];
      if (nameNode.type !== "symbol") {
        throw new Error("js-import module name must be a symbol");
      }
      const name = (nameNode as SymbolNode).name;
      const source = extractStringLiteral(list.elements[2]);
      
      return {
        type: IR.IRNodeType.JsImportReference,
        name,
        source
      } as IR.IRJsImportReference;
    } catch (error) {
      throw new Error(`js-import error: ${error.message}`);
    }
  }
  
  // Handle old syntax: (js-import source)
  else if (list.elements.length === 2) {
    try {
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
    } catch (error) {
      throw new Error(`js-import source must be a string literal: ${error.message}`);
    }
  }
  
  // Invalid syntax
  else {
    throw new Error("js-import requires either 1 argument (source) or 2 arguments (name, source)");
  }
}

/**
 * Transform a JavaScript export.
 */
function transformJsExport(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 3) {
    throw new Error("js-export requires exactly 2 arguments");
  }
  
  // Extract the export name as a string literal.
  let exportName: string;
  try {
    exportName = extractStringLiteral(list.elements[1]);
  } catch (error) {
    throw new Error(`js-export name must be a string literal: ${error.message}`);
  }
  
  // Create a sanitized variable name for the export
  const safeExportName = sanitizeIdentifier(exportName);
  
  // Transform the exported value.
  const value = transformNode(list.elements[2], currentDir)!;
  
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
}

/**
 * Transform a JavaScript new expression.
 */
function transformJsNew(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 2) {
    throw new Error("js-new requires a constructor and optional arguments");
  }
  const constructor = transformNode(list.elements[1], currentDir)!;
  let args: IR.IRNode[] = [];
  if (list.elements.length > 2) {
    const argsNode = list.elements[2];
    if (argsNode.type !== "list") {
      throw new Error("js-new arguments must be a list");
    }
    args = (argsNode as ListNode).elements.map(arg => transformNode(arg, currentDir)!);
  }
  return {
    type: IR.IRNodeType.NewExpression,
    callee: constructor,
    arguments: args
  } as IR.IRNewExpression;
}

/**
 * Transform a JavaScript get operation.
 */
function transformJsGet(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 3) {
    throw new Error("js-get requires exactly 2 arguments");
  }
  const object = transformNode(list.elements[1], currentDir)!;
  try {
    const property = extractStringLiteral(list.elements[2]);
    return {
      type: IR.IRNodeType.MemberExpression,
      object,
      property: { type: IR.IRNodeType.StringLiteral, value: property } as IR.IRStringLiteral,
      computed: true
    } as IR.IRMemberExpression;
  } catch (error) {
    const propExpr = transformNode(list.elements[2], currentDir)!;
    return {
      type: IR.IRNodeType.MemberExpression,
      object,
      property: propExpr,
      computed: true
    } as IR.IRMemberExpression;
  }
}

/**
 * Transform a JavaScript call operation.
 */
function transformJsCall(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("js-call requires at least 2 arguments");
  }
  const object = transformNode(list.elements[1], currentDir)!;
  try {
    const method = extractStringLiteral(list.elements[2]);
    const args = list.elements.slice(3).map(arg => transformNode(arg, currentDir)!);
    return {
      type: IR.IRNodeType.CallMemberExpression,
      object,
      property: { type: IR.IRNodeType.StringLiteral, value: method } as IR.IRStringLiteral,
      arguments: args
    } as IR.IRCallMemberExpression;
  } catch (error) {
    const methodExpr = transformNode(list.elements[2], currentDir)!;
    const args = list.elements.slice(3).map(arg => transformNode(arg, currentDir)!);
    return {
      type: IR.IRNodeType.CallMemberExpression,
      object,
      property: methodExpr,
      arguments: args
    } as IR.IRCallMemberExpression;
  }
}

/**
 * Transform a JavaScript get-invoke operation.
 */
function transformJsGetInvoke(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 3) {
    throw new Error("js-get-invoke requires exactly 2 arguments");
  }
  const object = transformNode(list.elements[1], currentDir)!;
  try {
    const property = extractStringLiteral(list.elements[2]);
    return {
      type: IR.IRNodeType.InteropIIFE,
      object,
      property: { type: IR.IRNodeType.StringLiteral, value: property } as IR.IRStringLiteral
    } as IR.IRInteropIIFE;
  } catch (error) {
    throw new Error(`js-get-invoke property must be a string literal or quoted string: ${error.message}`);
  }
}

/**
 * Transform primitive operations (+, -, *, /, etc.).
 */
function transformPrimitiveOp(list: ListNode, currentDir: string): IR.IRNode {
  const op = (list.elements[0] as SymbolNode).name;
  const args = list.elements.slice(1).map(arg => transformNode(arg, currentDir)!);

  // Essential arithmetic operators
  if (op === "+" || op === "-" || op === "*" || op === "/" || op === "%") {
    if (args.length === 0) {
      throw new Error(`${op} requires at least one argument`);
    }
    
    // Handle unary +/- (e.g., (+ 5) or (- 3))
    if (args.length === 1 && (op === "+" || op === "-")) {
      return {
        type: IR.IRNodeType.UnaryExpression,
        operator: op,
        argument: args[0],
      } as IR.IRUnaryExpression;
    }
    
    // Handle binary operations
    let result = args[0];
    
    // If we only have one argument, add a default second argument
    if (args.length === 1) {
      // Default second argument depends on the operator:
      // - For +/-, use 0 
      // - For */%, use 1
      const defaultValue = (op === "*" || op === "/") ? 1 : 0;
      
      return {
        type: IR.IRNodeType.BinaryExpression,
        operator: op,
        left: result,
        right: {
          type: IR.IRNodeType.NumericLiteral,
          value: defaultValue
        } as IR.IRNumericLiteral
      } as IR.IRBinaryExpression;
    }
    
    // For multiple arguments, chain them as binary operations
    for (let i = 1; i < args.length; i++) {
      // Skip any null arguments (shouldn't happen, but just in case)
      if (!args[i]) continue;
      
      result = {
        type: IR.IRNodeType.BinaryExpression,
        operator: op,
        left: result,
        right: args[i],
      } as IR.IRBinaryExpression;
    }
    
    return result;
  }
  
  // Comparison operators - all of these need special handling
  
  // Equal operator (= -> ===)
  if (op === "=" || op === "eq?") {
    if (args.length !== 2) {
      throw new Error(`${op} requires exactly 2 arguments`);
    }
    return {
      type: IR.IRNodeType.BinaryExpression,
      operator: "===",
      left: args[0],
      right: args[1],
    } as IR.IRBinaryExpression;
  }
  
  // Not equal operator (!= -> !==)
  if (op === "!=") {
    if (args.length !== 2) {
      throw new Error(`${op} requires exactly 2 arguments`);
    }
    return {
      type: IR.IRNodeType.BinaryExpression,
      operator: "!==",
      left: args[0],
      right: args[1],
    } as IR.IRBinaryExpression;
  }
  
  // Greater than (>)
  if (op === ">") {
    if (args.length !== 2) {
      throw new Error(`${op} requires exactly 2 arguments`);
    }
    return {
      type: IR.IRNodeType.BinaryExpression,
      operator: ">",
      left: args[0],
      right: args[1],
    } as IR.IRBinaryExpression;
  }
  
  // Less than (<)
  if (op === "<") {
    if (args.length !== 2) {
      throw new Error(`${op} requires exactly 2 arguments`);
    }
    return {
      type: IR.IRNodeType.BinaryExpression,
      operator: "<",
      left: args[0],
      right: args[1],
    } as IR.IRBinaryExpression;
  }
  
  // Greater than or equal (>=)
  if (op === ">=") {
    if (args.length !== 2) {
      throw new Error(`${op} requires exactly 2 arguments`);
    }
    return {
      type: IR.IRNodeType.BinaryExpression,
      operator: ">=",
      left: args[0],
      right: args[1],
    } as IR.IRBinaryExpression;
  }
  
  // Less than or equal (<=)
  if (op === "<=") {
    if (args.length !== 2) {
      throw new Error(`${op} requires exactly 2 arguments`);
    }
    return {
      type: IR.IRNodeType.BinaryExpression,
      operator: "<=",
      left: args[0],
      right: args[1],
    } as IR.IRBinaryExpression;
  }
  
  // For all other primitive operations, create a function call expression
  return {
    type: IR.IRNodeType.CallExpression,
    callee: { type: IR.IRNodeType.Identifier, name: op } as IR.IRIdentifier,
    arguments: args,
  } as IR.IRCallExpression;
}