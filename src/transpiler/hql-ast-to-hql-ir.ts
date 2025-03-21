// src/transpiler/hql-ast-to-hql-ir.ts - Refactored to reduce special cases

import * as IR from "./hql_ir.ts";
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { KERNEL_PRIMITIVES, PRIMITIVE_OPS, PRIMITIVE_DATA_STRUCTURE, PRIMITIVE_CLASS } from "./primitives.ts";
import { sanitizeIdentifier } from "../utils.ts";
import { Environment } from "../environment.ts";
import * as path from "../platform/platform.ts";

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
 */
export function transformToIR(nodes: HQLNode[], currentDir: string): IR.IRProgram {
  // Clear the macro cache for this transformation
  macroCache.clear();
  initializeTransformFactory();
  
  const body: IR.IRNode[] = [];
  for (const node of nodes) {
    const ir = transformNode(node, currentDir);
    if (ir) body.push(ir);
  }
  return { type: IR.IRNodeType.Program, body };
}

/**
 * Initialize the transform factory with handlers for each operation
 * This replaces the large switch statement in transformList with a more structured approach
 */
function initializeTransformFactory(): void {
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
  // These are checked separately in transformList but registered here for completeness
  transformFactory.set("export", null); // Handled by vector/legacy export checks
  transformFactory.set("import", null); // Handled by vector/legacy import checks
}

/**
 * Transform a single HQL node to its IR representation.
 */
function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
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
 * Check if a symbol represents a user-level macro
 */
function isUserLevelMacro(symbolName: string, currentDir: string): boolean {
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
    macroCache.get(currentDir)!.set(symbolName, false);
    return false;
  }
  
  // Check with environment
  const result = env.isUserLevelMacro(symbolName, currentDir);
  
  // Cache the result
  macroCache.get(currentDir)!.set(symbolName, result);
  
  return result;
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
  // Skip "vector" symbol if present as first element
  let startIndex = 0;
  if (elements.length > 0 && 
      elements[0].type === "symbol" && 
      (elements[0] as SymbolNode).name === "vector") {
    startIndex = 1;
  }
  
  // Filter out comma symbols
  return elements.slice(startIndex).filter(elem => 
    !(elem.type === "symbol" && (elem as SymbolNode).name === ",")
  );
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
 */
function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
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
      return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
    }
    
    // Check for vector exports
    if (isVectorExport(list)) {
      return transformVectorExport(list, currentDir);
    }
    
    // Check for vector imports
    if (isVectorImport(list)) {
      return transformVectorImport(list, currentDir);
    }
    
    // Check for legacy imports
    if (isLegacyImport(list)) {
      return transformLegacyImport(list, currentDir);
    }
    
    // Check for dot notation
    if (isDotNotation(op)) {
      return transformDotNotation(list, op, currentDir);
    }
    
    // Check if we have a registered handler for this operation
    const handler = transformFactory.get(op);
    if (handler) {
      return handler(list, currentDir);
    }
    
    // Handle primitive operations (+, -, *, /, etc.)
    if (PRIMITIVE_OPS.has(op)) {
      return transformPrimitiveOp(list, currentDir);
    }
    
    // Check for collection access syntax (obj key) -> (get obj key)
    if (list.elements.length === 2 && 
        !KERNEL_PRIMITIVES.has(op) && 
        !PRIMITIVE_DATA_STRUCTURE.has(op) && 
        !PRIMITIVE_CLASS.has(op) && 
        !op.startsWith("js-")) {
      return transformCollectionAccess(list, op, currentDir);
    }
  }
  
  // Case 1: First element is a list
  if (first.type === "list") {
    return transformNestedList(list, currentDir);
  }
  
  // Default: standard function call
  return transformStandardFunctionCall(list, currentDir);
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
 * Transform empty array literals
 */
function transformEmptyArray(list: ListNode, currentDir: string): IR.IRNode {
  return {
    type: IR.IRNodeType.ArrayExpression,
    elements: []
  } as IR.IRArrayExpression;
}

/**
 * Transform empty map literals
 */
function transformEmptyMap(list: ListNode, currentDir: string): IR.IRNode {
  return {
    type: IR.IRNodeType.ObjectExpression,
    properties: []
  } as IR.IRObjectExpression;
}

/**
 * Transform empty set literals
 */
function transformEmptySet(list: ListNode, currentDir: string): IR.IRNode {
  return {
    type: IR.IRNodeType.NewExpression,
    callee: {
      type: IR.IRNodeType.Identifier,
      name: "Set"
    } as IR.IRIdentifier,
    arguments: []
  } as IR.IRNewExpression;
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
    
    // If the second element is a regular symbol, create a member expression
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
 * Transform dot notation expressions to IR
 */
function transformDotNotation(list: ListNode, op: string, currentDir: string): IR.IRNode {
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

/**
 * Transform quasiquoted expressions
 */
function transformQuasiquote(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("quasiquote requires exactly one argument");
  }
  // For IR generation, treat quasiquoted expressions similar to quoted ones
  return transformNode(list.elements[1], currentDir)!;
}

/**
 * Transform unquote expressions
 */
function transformUnquote(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("unquote requires exactly one argument");
  }
  // For IR generation, unquote should be expanded during macro processing
  return transformNode(list.elements[1], currentDir)!;
}

/**
 * Transform unquote-splicing expressions
 */
function transformUnquoteSplicing(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("unquote-splicing requires exactly one argument");
  }
  // For IR generation, unquote-splicing should be expanded during macro processing
  return transformNode(list.elements[1], currentDir)!;
}

/**
 * Transform vector-based export statement to its IR representation
 */
function transformVectorExport(list: ListNode, currentDir: string): IR.IRNode | null {
  // Extract the symbols to export
  const vectorNode = list.elements[1];
  if (vectorNode.type !== "list") {
    throw new Error("Export argument must be a vector");
  }
  
  // Process vector elements
  const symbols = processVectorElements((vectorNode as ListNode).elements);
  
  // Build export specifiers for non-macro symbols
  const exportSpecifiers: IR.IRExportSpecifier[] = [];
  
  for (const elem of symbols) {
    if (elem.type !== "symbol") continue;
    
    const symbolName = (elem as SymbolNode).name;
    
    // Skip macros - don't create exports for them
    if (isUserLevelMacro(symbolName, currentDir)) continue;
    
    // Add specifier for regular value
    exportSpecifiers.push(createExportSpecifier(symbolName));
  }
  
  // Skip empty exports (where all symbols were macros)
  if (exportSpecifiers.length === 0) return null;
  
  // Create the export declaration
  return {
    type: IR.IRNodeType.ExportNamedDeclaration,
    specifiers: exportSpecifiers
  } as IR.IRExportNamedDeclaration;
}

/**
 * Create an export specifier
 */
function createExportSpecifier(symbolName: string): IR.IRExportSpecifier {
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
}

/**
 * Check if a symbol is a macro in a module
 */
function isSymbolMacroInModule(symbolName: string, modulePath: string, currentDir: string): boolean {
  const env = Environment.getGlobalEnv();
  if (!env) return false;
  
  // Only check HQL files
  if (!modulePath.endsWith('.hql')) return false;
  
  try {
    // Resolve the module path
    let resolvedPath = modulePath;
    
    // Handle relative paths
    if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
      resolvedPath = path.resolve(currentDir, modulePath);
    }
    
    // Check all modules to handle path normalization differences
    for (const [filePath, macros] of env.moduleMacros.entries()) {
      // Check if this file path matches or ends with our module path
      if ((filePath === resolvedPath || filePath.endsWith(resolvedPath)) && 
          macros.has(symbolName) && 
          env.getExportedMacros(filePath)?.has(symbolName)) {
        return true;
      }
    }
    
    return false;
  } catch (e) {
    console.warn(`Error checking for macro in module: ${e.message}`);
    return false;
  }
}

/**
 * Transform a vector-based import statement to its IR representation
 */
function transformVectorImport(list: ListNode, currentDir: string): IR.IRNode | null {
  // Extract the vector and path
  const vectorNode = list.elements[1] as ListNode;
  const modulePath = (list.elements[3] as LiteralNode).value as string;
  
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
  if (importSpecifiers.length === 0) return null;
  
  // Create the import declaration
  return {
    type: IR.IRNodeType.ImportDeclaration,
    source: modulePath,
    specifiers: importSpecifiers
  } as IR.IRImportDeclaration;
}

/**
 * Transform legacy import syntax to IR
 */
function transformLegacyImport(list: ListNode, currentDir: string): IR.IRNode | null {
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

/**
 * Transform JavaScript imports
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
 * Transform JavaScript exports
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
 * Transform JavaScript "new" expressions
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
 * Transform JavaScript property access
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
 * Transform JavaScript method calls
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
 * Transform JavaScript property access with optional invocation
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
 * Transform vector literals
 */
function transformVector(list: ListNode, currentDir: string): IR.IRNode {
  const elements = list.elements.slice(1).map(elem => transformNode(elem, currentDir)!);
  return {
    type: IR.IRNodeType.ArrayExpression,
    elements
  } as IR.IRArrayExpression;
}

/**
 * Transform hash-map literals
 */
function transformHashMap(list: ListNode, currentDir: string): IR.IRNode {
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
 * Transform hash-set literals
 */
function transformHashSet(list: ListNode, currentDir: string): IR.IRNode {
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

/**
 * Transform collection 'get' operation.
 */
function transformGet(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 3) {
    return transformStandardFunctionCall(list, currentDir);
  }
  
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

/**
 * Transform "new" constructor.
 */
function transformNew(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 2) {
    throw new Error("'new' requires a constructor");
  }
  
  const constructor = transformNode(list.elements[1], currentDir)!;
  return {
    type: IR.IRNodeType.NewExpression,
    callee: constructor,
    arguments: list.elements.slice(2).map(arg => transformNode(arg, currentDir)!)
  } as IR.IRNewExpression;
}

/**
 * Transform collection access syntax.
 * (myList 2) => (get myList 2)
 * (myMap "key") => (get myMap "key")
 */
function transformCollectionAccess(list: ListNode, op: string, currentDir: string): IR.IRNode {
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

/**
 * Transform a standard function call.
 */
function transformStandardFunctionCall(list: ListNode, currentDir: string): IR.IRNode {
  const first = list.elements[0];
  
  // If first element is a symbol, create a function call with that name
  if (first.type === "symbol") {
    const op = (first as SymbolNode).name;
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
  
  // Otherwise, first element is an expression that should evaluate to a function
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
  
  const { params, restParam } = processFunctionParams(paramsNode as ListNode);
  
  // Process body expressions and return statements
  const bodyNodes = processFunctionBody(list.elements.slice(2), currentDir);
  
  return {
    type: IR.IRNodeType.FunctionExpression,
    id: null,
    params: [...params, ...(restParam ? [restParam] : [])],
    body: { type: IR.IRNodeType.BlockStatement, body: bodyNodes }
  } as IR.IRFunctionExpression;
}

/**
 * Process function parameters, handling rest parameters
 */
function processFunctionParams(paramsNode: ListNode): { 
  params: IR.IRIdentifier[], 
  restParam: IR.IRIdentifier | null 
} {
  const params: IR.IRIdentifier[] = [];
  let restParam: IR.IRIdentifier | null = null;
  let restMode = false;
  
  for (const param of paramsNode.elements) {
    if (param.type !== "symbol") {
      throw new Error("fn parameters must be symbols");
    }
    
    const paramName = (param as SymbolNode).name;
    
    if (paramName === '&') {
      restMode = true;
      continue;
    }
    
    if (restMode) {
      if (restParam !== null) {
        throw new Error("Multiple rest parameters not allowed");
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
}

/**
 * Process function body expressions, creating return statements
 */
function processFunctionBody(bodyExprs: HQLNode[], currentDir: string): IR.IRNode[] {
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
    }
  }
  
  return bodyNodes;
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
 * Transform primitive operations (+, -, *, /, etc.).
 */
function transformPrimitiveOp(list: ListNode, currentDir: string): IR.IRNode {
  const op = (list.elements[0] as SymbolNode).name;
  const args = list.elements.slice(1).map(arg => transformNode(arg, currentDir)!);

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
}

/**
 * Transform arithmetic operations (+, -, *, /, %)
 */
function transformArithmeticOp(op: string, args: IR.IRNode[]): IR.IRNode {
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
}

/**
 * Transform comparison operations (=, !=, <, >, <=, >=)
 */
function transformComparisonOp(op: string, args: IR.IRNode[]): IR.IRNode {
  if (args.length !== 2) {
    throw new Error(`${op} requires exactly 2 arguments`);
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
}