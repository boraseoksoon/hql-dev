// src/transpiler/hql-to-ir.ts - Updated transformPrimitiveOp function

import * as IR from "./hql_ir.ts";
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { KERNEL_PRIMITIVES, PRIMITIVE_OPS } from "../bootstrap.ts";
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

function transformMethodChain(list: ListNode, currentDir: string): IR.IRNode {
  // The first element is the inner function call that produces an object
  const innerCall = list.elements[0] as ListNode;
  
  // Inner call might be a regular function call or dot notation
  const innerCallIR = transformNode(innerCall, currentDir)!;
  
  // Get the method name from the second element
  let methodName: string;
  let args: IR.IRNode[] = [];
  
  if (list.elements.length > 1 && list.elements[1].type === "symbol") {
    const fullName = (list.elements[1] as SymbolNode).name;
    
    // If it has a dot, it's a method on the result
    if (fullName.includes('.')) {
      // The method name is everything after the dot
      methodName = fullName.split('.').slice(1).join('.');
      
      // Everything after the method symbol is args
      args = list.elements.slice(2).map(arg => transformNode(arg, currentDir)!);
    } else {
      // It's a direct property access or method call
      methodName = fullName;
      args = list.elements.slice(2).map(arg => transformNode(arg, currentDir)!);
    }
  } else {
    throw new Error("Invalid method chain syntax - expected method name after object expression");
  }
  
  // Create the expression for a method call on the inner result
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.MemberExpression,
      object: innerCallIR,
      property: { 
        type: IR.IRNodeType.Identifier, 
        name: methodName 
      } as IR.IRIdentifier,
      computed: false
    } as IR.IRMemberExpression,
    arguments: args
  } as IR.IRCallExpression;
}

// Helper function for transforming nested property access
function transformNestedPropertyAccess(innerExpr: IR.IRNode, propertySymbol: SymbolNode): IR.IRNode {
  const propertyName = propertySymbol.name;
  
  // Create a member expression for the property access
  return {
    type: IR.IRNodeType.MemberExpression,
    object: innerExpr,
    property: {
      type: IR.IRNodeType.Identifier,
      name: propertyName
    } as IR.IRIdentifier,
    computed: false
  } as IR.IRMemberExpression;
}

// Complete transformList function
function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  if (list.elements.length === 0) {
    // Transform empty lists to empty array expressions
    return {
      type: IR.IRNodeType.ArrayExpression,
      elements: []
    } as IR.IRArrayExpression;
  }
  
  const first = list.elements[0];

  // Case 1: First element is a list
  if (first.type === "list") {
    const innerExpr = transformNode(first, currentDir);
    
    // If there are more elements after the inner list
    if (list.elements.length > 1) {
      const second = list.elements[1];
      
      // If the second element is a symbol with dot notation, it's a method call
      if (second.type === "symbol" && (second as SymbolNode).name.includes('.')) {
        const methodName = (second as SymbolNode).name.split('.').slice(1).join('.');
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
        return transformNestedPropertyAccess(innerExpr!, second as SymbolNode);
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
    return innerExpr;
  }

  // Case 2: First element is a symbol
  if (first.type === "symbol") {
    const op = (first as SymbolNode).name;
    
    // Handle dot notation
    if (op.includes('.') && !op.startsWith('js/')) {
      const parts = op.split('.');
      const objectName = parts[0];
      const property = parts.slice(1).join('.');
      
      const objectExpr = {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(objectName)
      } as IR.IRIdentifier;
      
      // Property access (no arguments)
      if (list.elements.length === 1) {
        return {
          type: IR.IRNodeType.InteropIIFE,
          object: objectExpr,
          property: { type: IR.IRNodeType.StringLiteral, value: property } as IR.IRStringLiteral
        } as IR.IRInteropIIFE;
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
            name: property 
          } as IR.IRIdentifier,
          computed: false
        } as IR.IRMemberExpression,
        arguments: args
      } as IR.IRCallExpression;
    }
    
    // Single symbol in parentheses (not a function call)
    if (list.elements.length === 1 && 
        !KERNEL_PRIMITIVES.has(op) && 
        !op.startsWith('js-') && 
        !PRIMITIVE_OPS.has(op)) {
      return {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(op)
      } as IR.IRIdentifier;
    }
    
    // Handle kernel primitives
    if (KERNEL_PRIMITIVES.has(op)) {
      switch (op) {
        case "quote":
          return transformQuote(list, currentDir);
        case "if":
          return transformIf(list, currentDir);
        case "fn":
          return transformFn(list, currentDir);
        case "def":
          return transformDef(list, currentDir);
      }
    }
    
    // Handle JS interop primitives
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
    }
    
    // Data structure literals
    if (op === "vector") {
      const elements = list.elements.slice(1).map(elem => transformNode(elem, currentDir)!);
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements
      } as IR.IRArrayExpression;
    }
    
    if (op === "hash-map") {
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
    
    if (PRIMITIVE_OPS.has(op)) {
      return transformPrimitiveOp(list, currentDir);
    }
    
    // Standard function call
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
  
  // Default: transform to a function call
  const callee = transformNode(first, currentDir);
  const args = list.elements.slice(1).map(arg => transformNode(arg, currentDir)!);
  return { 
    type: IR.IRNodeType.CallExpression, 
    callee, 
    arguments: args 
  } as IR.IRCallExpression;
}

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
    const elements: IR.IRNode[] = (quoted as ListNode).elements.map(
      elem => transformQuote({ type: "list", elements: [{ type: "symbol", name: "quote" }, elem] }, currentDir)
    );
    
    return { type: IR.IRNodeType.ArrayExpression, elements } as IR.IRArrayExpression;
  }
  
  throw new Error(`Unsupported quoted expression: ${JSON.stringify(quoted)}`);
}

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

// Complete transformPrimitiveOp function for src/transpiler/hql-code-to-hql-ir.ts

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
    for (let i = 1; i < args.length; i++) {
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

function transformCall(list: ListNode, currentDir: string): IR.IRNode {
  const callee = transformNode(list.elements[0], currentDir)!;
  const args = list.elements.slice(1).map(arg => transformNode(arg, currentDir)!);
  return {
    type: IR.IRNodeType.CallExpression,
    callee,
    arguments: args
  } as IR.IRCallExpression;
}