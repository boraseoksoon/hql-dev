// src/transpiler/hql-to-ir.ts - Fixed version for extended function definitions
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import * as IR from "./hql_ir.ts";

// Enable debug logging via environment variable
const DEBUG = !!Deno.env.get("HQL_DEBUG");

/**
 * Log debug information if debug mode is enabled
 */
function debugLog(module: string, ...args: any[]) {
  if (DEBUG) {
    console.log(`[DEBUG:${module}]`, ...args);
  }
}

// Cache for commonly transformed symbols
const symbolCache = new Map<string, IR.IRIdentifier>();

// Cache for transformed nodes to avoid redundant transformations
const nodeTransformCache = new Map<HQLNode, IR.IRNode | null>();

export function transformToIR(nodes: HQLNode[], currentDir: string): IR.IRProgram {
  // Clear caches for a new transformation
  symbolCache.clear();
  nodeTransformCache.clear();
  
  // Ensure nodes is an array and not null/undefined
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  
  // Get the transformed AST from the parser if available, with safety checks
  const transformedAst = (globalThis as any).__transformedAST;
  const transformedNodes = Array.isArray(transformedAst) ? transformedAst : safeNodes;
  
  const program: IR.IRProgram = { type: IR.IRNodeType.Program, body: [] };
  
  try {
    // Process each node with defensive programming
    for (const node of transformedNodes) {
      if (!node) continue; // Skip null/undefined nodes
      
      try {
        const ir = transformNode(node, currentDir);
        if (ir) program.body.push(ir);
      } catch (error) {
        console.error(`Error transforming node: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other nodes rather than failing completely
      }
    }
  } catch (error) {
    console.error(`Error in transformToIR: ${error instanceof Error ? error.message : String(error)}`);
    // Return the program with whatever we've processed so far
  }
  
  return program;
}

function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
  // Check for null/undefined node
  if (!node) return null;
  
  // Check cache first
  if (nodeTransformCache.has(node)) {
    return nodeTransformCache.get(node) || null;
  }
  
  let result: IR.IRNode | null;
  
  switch (node.type) {
    case "literal":
      result = transformLiteral(node as LiteralNode);
      break;
    case "symbol":
      result = transformSymbol(node as SymbolNode);
      break;
    case "list":
      result = transformList(node as ListNode, currentDir);
      break;
    default:
      // Use as any to avoid 'never' type issue
      console.error(`Unknown HQL node type: ${String((node as any).type)}`);
      throw new Error("Unknown HQL node type: " + (node as any).type);
  }
  
  // Cache the result
  nodeTransformCache.set(node, result);
  return result;
}

function transformLiteral(lit: LiteralNode): IR.IRNode {
  const v = lit.value;
  
  if (typeof v === "string") {
    return { type: IR.IRNodeType.StringLiteral, value: v } as IR.IRStringLiteral;
  }
  
  if (typeof v === "number") {
    return { type: IR.IRNodeType.NumericLiteral, value: v } as IR.IRNumericLiteral;
  }
  
  if (typeof v === "boolean") {
    return { type: IR.IRNodeType.BooleanLiteral, value: v } as IR.IRBooleanLiteral;
  }
  
  if (v === null) {
    return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
  }
  
  throw new Error("Unsupported literal: " + v);
}

/**
 * Convert hyphenated names to camelCase
 * Improved version with better error handling
 */
function hyphenToCamel(name: string): string {
  // Handle empty or undefined names
  if (!name) return '';
  
  // First, standardize the name by replacing multiple hyphens with single hyphens
  const normalized = name.replace(/--+/g, '-');
  
  // Then convert to camelCase
  return normalized.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function transformSymbol(sym: SymbolNode): IR.IRIdentifier {
  const name = sym.name;
  
  // Check cache first
  if (symbolCache.has(name)) {
    return { ...symbolCache.get(name)! };
  }
  
  let result: IR.IRIdentifier;
  
  // Handle JavaScript interop (js/X.y.z -> X.y.z)
  if (name.startsWith('js/')) {
    result = { 
      type: IR.IRNodeType.Identifier, 
      name: name.substring(3), // Remove 'js/' prefix
      isJSAccess: true
    };
  } else {
    result = { 
      type: IR.IRNodeType.Identifier, 
      name: hyphenToCamel(name) 
    };
  }
  
  // Cache the result
  symbolCache.set(name, result);
  return { ...result };
}

/**
 * Transform list nodes with special handling for function parameters
 * This adds support for type annotations (x: Int) and default values (x = 0)
 * without breaking existing functionality
 */
function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  // If this list node was parsed as an array literal, always transform it as a direct array.
  if ((list as any).isArrayLiteral) {
    return transformArrayLiteral(list, currentDir);
  }
  
  // If the list is empty (and not marked as an array literal), return null.
  if (!list.elements || list.elements.length === 0) return null;
  
  const head = list.elements[0];
  if (!head) return null;
  
  if (head.type === "symbol") {
    const s = head as SymbolNode;
    
    // Dispatch based on the head symbol
    switch (s.name) {
      case "def": return transformDef(list, currentDir);
      case "defn": return transformDefn(list, currentDir);
      case "fn": return transformFn(list, currentDir);
      case "import": return transformImport(list, currentDir);
      case "vector": return transformVector(list, currentDir);
      case "list": return transformArrayLiteral(list, currentDir);
      case "hash-map": return transformHashMap(list, currentDir);
      case "keyword": return transformKeyword(list);
      case "defenum": return transformDefenum(list);
      case "export": return transformExport(list, currentDir);
      case "print": return transformPrint(list, currentDir);
      case "new": return transformNew(list, currentDir);
      case "str": return transformStr(list, currentDir);
      case "let": return transformLet(list, currentDir);
      case "cond": return transformCond(list, currentDir);
      case "if": return transformIf(list, currentDir);
      case "for": return transformFor(list, currentDir);
      case "set": return transformSet(list, currentDir);
      
      // Handle the extended function definition canonical forms
      case "type-annotated": return transformTypeAnnotated(list);
      case "default-param": return transformDefaultParam(list, currentDir);
      case "return-type": return null; // Skip return-type nodes, they are handled in defn/fn
      
      // Arithmetic and comparison operators
      case "+":
      case "-":
      case "*":
      case "/":
      case "<":
      case ">":
      case "<=":
      case ">=":
      case "=":
      case "!=":
        return transformArithmetic(list, currentDir);
        
      case "get": return transformPropertyAccess(list, currentDir);
      case "return": return transformReturnStatement(list, currentDir);
      
      default: break;
    }
  }
  
  // Default: treat the list as a function call.
  return transformCall(list, currentDir);
}

/** Handle (type-annotated param type) form */
function transformTypeAnnotated(list: ListNode): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("type-annotated requires a name and a type");
  }
  
  const paramNode = list.elements[1] as SymbolNode;
  // Type is stored but not used in JavaScript output currently
  
  // Just return the parameter name as an identifier
  return transformSymbol(paramNode);
}

/** Handle (default-param param defaultValue) form */
function transformDefaultParam(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("default-param requires a name and a default value");
  }
  
  const paramNode = list.elements[1] as SymbolNode;
  // Default value is handled separately in function bodies
  
  // Just return the parameter name as an identifier
  return transformSymbol(paramNode);
}

/**
 * This function fixes the handling of empty vectors like []
 * It ensures that the variable emptyVector is properly defined
 */
function transformArrayLiteral(list: ListNode, currentDir: string): IR.IRArrayLiteral {
  // Handle empty lists properly
  if (!list.elements || list.elements.length === 0) {
    return {
      type: IR.IRNodeType.ArrayLiteral,
      elements: []
    } as IR.IRArrayLiteral;
  }
  
  // Skip the first element if it's 'vector' or 'list'
  const startIndex = (list.elements[0]?.type === 'symbol' && 
    ['vector', 'list'].includes((list.elements[0] as SymbolNode).name)) ? 1 : 0;
  
  // Handle case when there are no elements after skipping the first element
  if (startIndex >= list.elements.length) {
    return {
      type: IR.IRNodeType.ArrayLiteral,
      elements: []
    } as IR.IRArrayLiteral;
  }
  
  const elements = list.elements.slice(startIndex)
    .map(el => transformNode(el, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  // Ensure we're properly casting the result
  return {
    type: IR.IRNodeType.ArrayLiteral,
    elements
  } as IR.IRArrayLiteral;
}

/**
 * Improved vector transformation to handle empty vectors
 */
function transformVector(list: ListNode, currentDir: string): IR.IRArrayLiteral {
  // Handle empty vectors or invalid input
  if (!list.elements || list.elements.length <= 1) {
    return { 
      type: IR.IRNodeType.ArrayLiteral, 
      elements: [] 
    };
  }
  
  const elems = list.elements.slice(1)
    .map(x => transformNode(x, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return { type: IR.IRNodeType.ArrayLiteral, elements: elems };
}

/** (def var expr) */
function transformDef(list: ListNode, currentDir: string): IR.IRVariableDeclaration {
  if (list.elements.length < 3) {
    throw new Error("def requires a name and an expression");
  }
  
  const nameNode = list.elements[1] as SymbolNode;
  const valNode = list.elements[2];
  
  return {
    type: IR.IRNodeType.VariableDeclaration,
    kind: "const",
    id: transformSymbol(nameNode),
    init: transformNode(valNode, currentDir)!
  };
}

/** (import "url") */
function transformImport(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("import requires a string argument");
  }
  
  const urlNode = list.elements[1] as LiteralNode;
  if (typeof urlNode.value !== "string") {
    throw new Error("import path must be a string literal");
  }
  
  const stringLiteral: IR.IRStringLiteral = { 
    type: IR.IRNodeType.StringLiteral, 
    value: urlNode.value
  };
  
  return {
    type: IR.IRNodeType.CallExpression,
    callee: { type: IR.IRNodeType.Identifier, name: "$$IMPORT" },
    arguments: [stringLiteral],
    isNamedArgs: false
  } as IR.IRCallExpression;
}

function transformFn(list: ListNode, currentDir: string): IR.IRFunctionDeclaration {
  if (list.elements.length < 3) {
    throw new Error("fn requires a parameter list and a body");
  }

  const paramList = list.elements[1] as ListNode;
  let bodyNodes = list.elements.slice(2);

  let returnType: IR.IRNode | null = null;
  if (
    bodyNodes.length >= 2 &&
    bodyNodes[0].type === "symbol" &&
    (bodyNodes[0] as SymbolNode).name === "->"
  ) {
    returnType = transformNode(bodyNodes[1], currentDir);
    bodyNodes = bodyNodes.slice(2);
  }

  // A simpler version that just extracts the parameter names directly
  const params: IR.IRParameter[] = [];
  const namedParamIds: string[] = [];
  
  // Handle each parameter element directly
  for (const param of paramList.elements) {
    if (param.type === "symbol") {
      const symbolName = (param as SymbolNode).name;
      // Check if it's a named parameter
      if (symbolName.endsWith(':')) {
        const baseName = symbolName.substring(0, symbolName.length - 1);
        const camelName = hyphenToCamel(baseName);
        namedParamIds.push(camelName);
        params.push({
          type: IR.IRNodeType.Parameter,
          id: { type: IR.IRNodeType.Identifier, name: camelName }
        });
      } else {
        params.push({
          type: IR.IRNodeType.Parameter,
          id: { type: IR.IRNodeType.Identifier, name: hyphenToCamel(symbolName) }
        });
      }
    }
  }

  const transformedBody = bodyNodes
    .map(n => transformNode(n, currentDir))
    .filter(n => n !== null && n.type !== IR.IRNodeType.NullLiteral) as IR.IRNode[];

  ensureReturnForLastExpression(transformedBody);

  return {
    type: IR.IRNodeType.FunctionDeclaration,
    id: { type: IR.IRNodeType.Identifier, name: "$anonymous" },
    params,
    body: { type: IR.IRNodeType.Block, body: transformedBody },
    isAnonymous: true,
    isNamedParams: namedParamIds.length > 0,
    namedParamIds: namedParamIds.length > 0 ? namedParamIds : undefined,
    returnType
  };
}

/**
 * Parse parameters with type annotations and default values
 * This supports both named parameters and typed parameters
 */
function parseParamsAsNamedOrTyped(
  paramList: ListNode,
  currentDir: string
): {
  params: IR.IRParameter[];
  defaultParams: { paramName: string; defaultValue: IR.IRNode }[];
  namedParamIds: string[];
} {
  const params: IR.IRParameter[] = [];
  const defaultParams: { paramName: string; defaultValue: IR.IRNode }[] = [];
  const namedParamIds: string[] = [];

  // Handle empty parameter list
  if (!paramList.elements || paramList.elements.length === 0) {
    return { params, defaultParams, namedParamIds };
  }

  let i = 0;
  while (i < paramList.elements.length) {
    const token = paramList.elements[i];
    if (!token || token.type !== "symbol") {
      i++;
      continue;
    }

    let paramName = (token as SymbolNode).name;
    let hasNamedColon = false;

    // 1) Check if the token itself ends with a colon, e.g. "name:"
    //    If so, strip the colon and mark it as named.
    if (paramName.endsWith(":")) {
      paramName = paramName.slice(0, -1); // remove trailing colon
      hasNamedColon = true;
      i++;
    }
    // 2) Otherwise, check if the *next* token is a standalone colon.
    else if (
      i + 1 < paramList.elements.length &&
      paramList.elements[i + 1].type === "symbol" &&
      (paramList.elements[i + 1] as SymbolNode).name === ":"
    ) {
      // e.g. we have [Symbol("name"), Symbol(":")]
      hasNamedColon = true;
      i += 2; // skip both tokens
    }
    // Else it's a regular param (no named colon).
    else {
      i++;
    }

    const finalParamName = hyphenToCamel(paramName);
    if (hasNamedColon) {
      namedParamIds.push(finalParamName);
    }

    // 3) Check if the next token is a type annotation.
    //    A type annotation is any token that is *not* "=" and not another colon token.
    let typeAnnotation: IR.IRNode | undefined;
    if (i < paramList.elements.length) {
      const peekToken = paramList.elements[i];
      if (
        peekToken.type === "symbol" &&
        ((peekToken as SymbolNode).name === "=" ||
         (peekToken as SymbolNode).name === ":")
      ) {
        // If it's "=" or ":", then no type annotation.
      } else {
        // We interpret it as the type annotation
        const ta = transformNode(peekToken, currentDir);
        if (ta) {
          typeAnnotation = ta;
        }
        i++;
      }
    }

    // 4) Build the parameter
    params.push({
      type: IR.IRNodeType.Parameter,
      id: { type: IR.IRNodeType.Identifier, name: finalParamName },
      typeAnnotation
    });

    // 5) Check for default value if the next token is "="
    if (
      i < paramList.elements.length &&
      paramList.elements[i].type === "symbol" &&
      (paramList.elements[i] as SymbolNode).name === "="
    ) {
      if (i + 1 < paramList.elements.length) {
        const dv = transformNode(paramList.elements[i + 1], currentDir);
        if (dv) {
          defaultParams.push({ paramName: finalParamName, defaultValue: dv });
        }
        i += 2;
      } else {
        i++;
      }
    }
  }

  return { params, defaultParams, namedParamIds };
}

function transformDefn(list: ListNode, currentDir: string): IR.IRFunctionDeclaration {
  console.log("transformDefn called with:", JSON.stringify(list));
  
  if (list.elements.length < 4) {
    throw new Error("defn requires a name, parameter list, and a body");
  }

  const nameSym = list.elements[1] as SymbolNode;
  const paramList = list.elements[2] as ListNode;
  let bodyNodes = list.elements.slice(3);

  console.log("Function name:", nameSym.name);
  console.log("Parameter list:", JSON.stringify(paramList));

  // Check for return type syntax
  let returnType: IR.IRNode | null = null;
  if (
    bodyNodes.length >= 2 &&
    bodyNodes[0].type === "symbol" &&
    (bodyNodes[0] as SymbolNode).name === "->"
  ) {
    returnType = transformNode(bodyNodes[1], currentDir);
    bodyNodes = bodyNodes.slice(2);
  }

  // Extract parameters directly
  const params: IR.IRParameter[] = [];
  const namedParamIds: string[] = [];
  
  console.log("Raw param elements:", JSON.stringify(paramList.elements));
  
  for (const param of paramList.elements) {
    console.log("Processing param:", JSON.stringify(param));
    
    if (param.type === "symbol") {
      const symName = (param as SymbolNode).name;
      const camelName = hyphenToCamel(symName);
      
      // Check if it's a named parameter with colon
      if (symName.endsWith(':')) {
        const baseName = symName.substring(0, symName.length - 1);
        const paramName = hyphenToCamel(baseName);
        namedParamIds.push(paramName);
        
        params.push({
          type: IR.IRNodeType.Parameter,
          id: { type: IR.IRNodeType.Identifier, name: paramName }
        });
        
        console.log(`Added named param: ${paramName}`);
      } else {
        // Regular parameter
        params.push({
          type: IR.IRNodeType.Parameter,
          id: { type: IR.IRNodeType.Identifier, name: camelName }
        });
        
        console.log(`Added regular param: ${camelName}`);
      }
    }
  }
  
  console.log("Final params:", JSON.stringify(params.map(p => p.id.name)));

  // Transform the body
  const transformedBody = bodyNodes
    .map(n => transformNode(n, currentDir))
    .filter(n => n !== null && n.type !== IR.IRNodeType.NullLiteral) as IR.IRNode[];

  // Ensure last expr is returned
  ensureReturnForLastExpression(transformedBody);

  // isNamedParams if we found any param with a colon
  const isNamedParams = namedParamIds.length > 0;

  return {
    type: IR.IRNodeType.FunctionDeclaration,
    id: transformSymbol(nameSym),
    params,
    body: { type: IR.IRNodeType.Block, body: transformedBody },
    isAnonymous: false,
    isNamedParams,
    namedParamIds: isNamedParams ? namedParamIds : undefined,
    returnType
  };
}

/** (hash-map key value ... ) => ObjectLiteral */
function transformHashMap(list: ListNode, currentDir: string): IR.IRObjectLiteral {
  const body = list.elements.slice(1);
  
  if (body.length % 2 !== 0) {
    throw new Error("hash-map requires even number of arguments");
  }
  
  const props: IR.IRProperty[] = [];
  
  for (let i = 0; i < body.length; i += 2) {
    const keyNode = body[i];
    const valueNode = body[i+1];
    
    let key: IR.IRNode;
    let value: IR.IRNode;
    
    // Special handling for keyword literals
    if (keyNode.type === "list" && 
        keyNode.elements.length > 0 && 
        keyNode.elements[0].type === "symbol" && 
        (keyNode.elements[0] as SymbolNode).name === "keyword") {
      
      // Extract the value directly from the keyword argument
      if (keyNode.elements.length > 1 && keyNode.elements[1].type === "literal") {
        const keyLiteral = keyNode.elements[1] as LiteralNode;
        if (typeof keyLiteral.value === "string") {
          // Create a direct string literal for the key
          key = {
            type: IR.IRNodeType.StringLiteral,
            value: keyLiteral.value
          } as IR.IRStringLiteral;
        } else {
          // Fallback for non-string keys
          key = transformNode(keyNode, currentDir) || {
            type: IR.IRNodeType.StringLiteral,
            value: "unknown_key"
          } as IR.IRStringLiteral;
        }
      } else {
        // Fallback if keyword doesn't have a valid argument
        key = {
          type: IR.IRNodeType.StringLiteral,
          value: "unknown_key"
        } as IR.IRStringLiteral;
      }
    } else {
      // Regular key transformation
      key = transformNode(keyNode, currentDir) || {
        type: IR.IRNodeType.StringLiteral,
        value: "unknown_key"
      } as IR.IRStringLiteral;
    }
    
    // Transform the value
    value = transformNode(valueNode, currentDir) || {
      type: IR.IRNodeType.NullLiteral
    } as IR.IRNullLiteral;
    
    // Add the property to the list
    props.push({ 
      type: IR.IRNodeType.Property, 
      key, 
      value, 
      computed: false 
    });
  }
  
  // Always return an object literal, even if empty
  return { 
    type: IR.IRNodeType.ObjectLiteral, 
    properties: props 
  };
}

/** (keyword "foo") => KeywordLiteral */
function transformKeyword(list: ListNode): IR.IRStringLiteral {
  if (list.elements.length !== 2) {
    throw new Error("keyword requires exactly one argument");
  }
  
  const arg = list.elements[1];
  if (arg.type !== "literal" || typeof (arg as LiteralNode).value !== "string") {
    throw new Error("keyword argument must be a string literal");
  }
  
  // Return a StringLiteral instead of KeywordLiteral for better compatibility
  return { 
    type: IR.IRNodeType.StringLiteral, 
    value: (arg as LiteralNode).value as string 
  };
}

/** (defenum Name member1 member2 ...) => EnumDeclaration */
function transformDefenum(list: ListNode): IR.IREnumDeclaration {
  if (list.elements.length < 2) {
    throw new Error("defenum requires a name");
  }
  
  const nameSym = list.elements[1] as SymbolNode;
  const members = list.elements.slice(2).map(x => {
    if (x.type !== "symbol") {
      throw new Error("defenum members must be symbols");
    }
    return hyphenToCamel((x as SymbolNode).name);
  });
  
  return {
    type: IR.IRNodeType.EnumDeclaration,
    name: { type: IR.IRNodeType.Identifier, name: hyphenToCamel(nameSym.name) },
    members
  };
}

/** (export "exportName" localSym) => ExportDeclaration */
function transformExport(list: ListNode, currentDir: string): IR.IRExportDeclaration {
  if (list.elements.length !== 3) {
    throw new Error("export requires two arguments: exportName and localSymbol");
  }
  
  const exportNameNode = list.elements[1] as LiteralNode;
  const localSym = list.elements[2] as SymbolNode;
  
  if (typeof exportNameNode.value !== "string") {
    throw new Error("export name must be a string literal");
  }
  
  return {
    type: IR.IRNodeType.ExportDeclaration,
    exports: [
      { 
        local: { type: IR.IRNodeType.Identifier, name: hyphenToCamel(localSym.name) },
        exported: exportNameNode.value 
      }
    ]
  };
}

/** (print ...) => console.log(...) */
function transformPrint(list: ListNode, currentDir: string): IR.IRCallExpression {
  const args = list.elements.slice(1)
    .map(x => transformNode(x, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  // Propagate the named-arguments flag if any argument is a call with named args.
  let isNamedArgs = false;
  for (const arg of args) {
    if (arg.type === IR.IRNodeType.CallExpression && (arg as IR.IRCallExpression).isNamedArgs) {
      isNamedArgs = true;
      break;
    }
  }
  
  return {
    type: IR.IRNodeType.CallExpression,
    callee: { type: IR.IRNodeType.Identifier, name: "console.log" },
    arguments: args,
    isNamedArgs
  } as IR.IRCallExpression;
}

/** (new Type arg1 arg2) => NewExpression */
function transformNew(list: ListNode, currentDir: string): IR.IRNewExpression {
  if (list.elements.length < 2) {
    throw new Error("new requires a type");
  }
  
  const typeNode = list.elements[1];
  const args = list.elements.slice(2)
    .map(x => transformNode(x, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return {
    type: IR.IRNodeType.NewExpression,
    callee: transformNode(typeNode, currentDir)!,
    arguments: args
  } as IR.IRNewExpression;
}

/** (str a b c) => string concatenation */
function transformStr(list: ListNode, currentDir: string): IR.IRCallExpression {
  const args = list.elements.slice(1)
    .map(x => transformNode(x, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return {
    type: IR.IRNodeType.CallExpression,
    callee: { type: IR.IRNodeType.Identifier, name: "str" },
    arguments: args,
    isNamedArgs: false
  } as IR.IRCallExpression;
}

/** (let [var1 val1 var2 val2 ...] body...) => local scoped variables */
function transformLet(list: ListNode, currentDir: string): IR.IRBlock {
  if (list.elements.length < 3) {
    throw new Error("let requires bindings and a body");
  }
  
  const bindingsNode = list.elements[1] as ListNode;
  const bindings = bindingsNode.elements;
  
  if (bindings.length % 2 !== 0) {
    throw new Error("let bindings require even number of forms");
  }
  
  const declarations: IR.IRVariableDeclaration[] = [];
  for (let i = 0; i < bindings.length; i += 2) {
    const nameNode = bindings[i] as SymbolNode;
    const valNode = bindings[i+1];
    
    const valueIR = transformNode(valNode, currentDir);
    if (valueIR) {
      declarations.push({
        type: IR.IRNodeType.VariableDeclaration,
        kind: "const",
        id: transformSymbol(nameNode),
        init: valueIR
      });
    }
  }
  
  const bodyNodes = list.elements.slice(2)
    .map(n => transformNode(n, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  // Ensure the last expression is returned
  ensureReturnForLastExpression(bodyNodes);
  
  return {
    type: IR.IRNodeType.Block,
    body: [...declarations, ...bodyNodes]
  };
}

/** (cond pred1 val1 pred2 val2 ... true default) => Conditional */
function transformCond(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("cond requires at least one predicate-value pair");
  }
  
  // Group elements into pairs
  const pairs: Array<[IR.IRNode, IR.IRNode]> = [];
  
  for (let i = 1; i < list.elements.length; i += 2) {
    // Check if we have enough elements
    if (i + 1 >= list.elements.length) {
      throw new Error("cond requires pairs of predicate and value");
    }
    
    const predicate = transformNode(list.elements[i], currentDir)!;
    const value = transformNode(list.elements[i + 1], currentDir)!;
    pairs.push([predicate, value]);
  }
  
  // Convert to nested ternary operators
  return buildConditionalChain(pairs, 0);
}

/** Helper to build a chain of conditional expressions */
function buildConditionalChain(pairs: Array<[IR.IRNode, IR.IRNode]>, index: number): IR.IRNode {
  if (index >= pairs.length - 1) {
    // Last pair - either the final condition-result or default
    const [predicate, value] = pairs[index];
    
    // If the predicate is 'true', just return the value
    if (predicate.type === IR.IRNodeType.Identifier && 
        (predicate as IR.IRIdentifier).name === 'true') {
      return value;
    }
    
    // Otherwise, it's a normal condition
    return {
      type: IR.IRNodeType.ConditionalExpression,
      test: predicate,
      consequent: value,
      alternate: { type: IR.IRNodeType.NullLiteral }
    } as IR.IRConditionalExpression;
  }
  
  // Build a conditional with the rest of the chain as the alternate
  const [predicate, value] = pairs[index];
  return {
    type: IR.IRNodeType.ConditionalExpression,
    test: predicate,
    consequent: value,
    alternate: buildConditionalChain(pairs, index + 1)
  } as IR.IRConditionalExpression;
}

/** (if condition then-branch else-branch) => IfStatement */
function transformIf(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("if requires at least a condition and then-branch");
  }
  
  const condition = transformNode(list.elements[1], currentDir)!;
  const thenBranch = transformNode(list.elements[2], currentDir)!;
  let elseBranch = null;
  
  if (list.elements.length > 3) {
    elseBranch = transformNode(list.elements[3], currentDir)!;
  }
  
  // Use a conditional expression if both branches are expressions
  if (IR.isExpression(thenBranch) && (elseBranch === null || IR.isExpression(elseBranch))) {
    return {
      type: IR.IRNodeType.ConditionalExpression,
      test: condition,
      consequent: thenBranch,
      alternate: elseBranch || { type: IR.IRNodeType.NullLiteral }
    } as IR.IRConditionalExpression;
  }
  
  // Otherwise, use an if statement
  return {
    type: IR.IRNodeType.IfStatement,
    test: condition,
    consequent: thenBranch,
    alternate: elseBranch
  } as IR.IRIfStatement;
}

/** (for [var init condition update] body...) => ForStatement */
function transformFor(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("for requires loop parameters and a body");
  }
  
  const forParams = list.elements[1] as ListNode;
  if (forParams.elements.length < 3) {
    throw new Error("for requires at least var, init, and condition parameters");
  }
  
  const variable = forParams.elements[0] as SymbolNode;
  const init = transformNode(forParams.elements[1], currentDir)!;
  const condition = transformNode(forParams.elements[2], currentDir)!;
  
  let update = null;
  if (forParams.elements.length > 3) {
    update = transformNode(forParams.elements[3], currentDir)!;
  }
  
  const bodyNodes = list.elements.slice(2)
    .map(n => transformNode(n, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return {
    type: IR.IRNodeType.ForStatement,
    init: {
      type: IR.IRNodeType.VariableDeclaration,
      kind: "let",
      id: transformSymbol(variable),
      init: init
    },
    test: condition,
    update: update,
    body: { type: IR.IRNodeType.Block, body: bodyNodes }
  } as IR.IRForStatement;
}

/**
 * This function fixes the handling of empty sets like #[]
 * It ensures that the variable emptySet is properly defined
 */
function transformSet(list: ListNode, currentDir: string): IR.IRNode {
  // Set constructor case (for #[] syntax)
  if (list.elements.length <= 2) {  // Handle both empty set and set with elements
    // If there's no second element or it's null/undefined, create an empty array
    if (list.elements.length <= 1 || !list.elements[1]) {
      return {
        type: IR.IRNodeType.NewExpression,
        callee: { type: IR.IRNodeType.Identifier, name: "Set" } as IR.IRIdentifier,
        arguments: [{
          type: IR.IRNodeType.ArrayLiteral,
          elements: []
        } as IR.IRArrayLiteral]
      } as IR.IRNewExpression;
    }
    
    const arg = transformNode(list.elements[1], currentDir);
    
    if (!arg) {
      // Handle empty set case - create an empty array literal for the Set constructor
      return {
        type: IR.IRNodeType.NewExpression,
        callee: { type: IR.IRNodeType.Identifier, name: "Set" } as IR.IRIdentifier,
        arguments: [{
          type: IR.IRNodeType.ArrayLiteral,
          elements: []
        } as IR.IRArrayLiteral]
      } as IR.IRNewExpression;
    }
    
    return {
      type: IR.IRNodeType.NewExpression,
      callee: { type: IR.IRNodeType.Identifier, name: "Set" } as IR.IRIdentifier,
      arguments: [arg]
    } as IR.IRNewExpression;
  }
  
  // Assignment case (for tests)
  if (list.elements.length === 3 && list.elements[1].type === "symbol") {
    const target = transformNode(list.elements[1], currentDir)!;
    const value = transformNode(list.elements[2], currentDir)!;
    
    return {
      type: IR.IRNodeType.AssignmentExpression,
      operator: "=",
      left: target,
      right: value
    } as IR.IRAssignmentExpression;
  }
  
  // Default case
  throw new Error("set requires a target and an expression");
}

/** (get obj "prop") => PropertyAccess */
function transformPropertyAccess(list: ListNode, currentDir: string): IR.IRPropertyAccess {
  if (list.elements.length !== 3) {
    throw new Error("get requires object and property arguments");
  }
  
  const obj = transformNode(list.elements[1], currentDir)!;
  const prop = transformNode(list.elements[2], currentDir)!;
  
  // Determine if this should be computed (bracket) or direct (dot) access
  let computed = true;
  if (prop.type === IR.IRNodeType.StringLiteral) {
    const propName = (prop as IR.IRStringLiteral).value;
    computed = !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName);
  }
  
  return {
    type: IR.IRNodeType.PropertyAccess,
    object: obj,
    property: prop,
    computed
  } as IR.IRPropertyAccess;
}

/** (return value) => ReturnStatement */
function transformReturnStatement(list: ListNode, currentDir: string): IR.IRReturnStatement {
  if (list.elements.length === 1) {
    // return with no value
    return {
      type: IR.IRNodeType.ReturnStatement,
      argument: null
    } as IR.IRReturnStatement;
  }
  
  // return with value
  const valueNode = list.elements[1];
  return {
    type: IR.IRNodeType.ReturnStatement,
    argument: transformNode(valueNode, currentDir)
  } as IR.IRReturnStatement;
}

/** Helper function to ensure the last expression in a block is returned */
function ensureReturnForLastExpression(bodyNodes: IR.IRNode[]): void {
  if (bodyNodes.length === 0) return;
  
  const lastIndex = bodyNodes.length - 1;
  const lastNode = bodyNodes[lastIndex];
  
  // If the last node is an expression (not a statement) and not already a return statement
  if (IR.isExpression(lastNode) && lastNode.type !== IR.IRNodeType.ReturnStatement) {
    bodyNodes[lastIndex] = {
      type: IR.IRNodeType.ReturnStatement,
      argument: lastNode
    } as IR.IRReturnStatement;
  }
}

/** (+ a b c ...) => fold left into binary expressions */
function transformArithmetic(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("Arithmetic operator requires at least two operands");
  }
  
  const op = (list.elements[0] as SymbolNode).name;
  let expr = transformNode(list.elements[1], currentDir)!;
  
  for (let i = 2; i < list.elements.length; i++) {
    const rightNode = transformNode(list.elements[i], currentDir);
    if (rightNode) {
      expr = {
        type: IR.IRNodeType.BinaryExpression,
        operator: op,
        left: expr,
        right: rightNode
      } as IR.IRBinaryExpression;
    }
  }
  
  return expr;
}

/**
 * Transform a function call, handling both regular and named arguments 
 * This handles both (fn arg1 arg2) and (fn name1: val1 name2: val2) forms
 */
function transformCall(list: ListNode, currentDir: string): IR.IRCallExpression {
  const head = list.elements[0];
  const callee = transformNode(head, currentDir)!;
  
  // Check if we have named arguments (every other argument starts with a colon)
  let isNamedArgs = false;
  const args = list.elements.slice(1);
  
  // To detect named args, look for tokens ending with colon
  if (args.length >= 2 && args.length % 2 === 0) {
    isNamedArgs = true;
    for (let i = 0; i < args.length; i += 2) {
      const arg = args[i];
      if (arg.type !== "symbol" || 
          !(arg as SymbolNode).name.endsWith(":")) {
        isNamedArgs = false;
        break;
      }
    }
  }
  
  if (isNamedArgs) {
    // Build an object literal with named parameters
    const properties: IR.IRProperty[] = [];
    
    for (let i = 0; i < args.length; i += 2) {
      const nameArg = args[i] as SymbolNode;
      const valueArg = args[i + 1];
      
      // Remove the trailing colon from parameter name
      const paramName = nameArg.name.slice(0, -1);
      const camelCaseName = hyphenToCamel(paramName);
      
      const value = transformNode(valueArg, currentDir);
      if (value) {
        properties.push({
          type: IR.IRNodeType.Property,
          key: { 
            type: IR.IRNodeType.StringLiteral, 
            value: camelCaseName 
          } as IR.IRStringLiteral,
          value,
          computed: false
        });
      }
    }
    
    // Return a call expression with an object literal argument
    return {
      type: IR.IRNodeType.CallExpression,
      callee,
      arguments: [{
        type: IR.IRNodeType.ObjectLiteral,
        properties
      } as IR.IRObjectLiteral],
      isNamedArgs: true
    } as IR.IRCallExpression;
  } else {
    // Regular positional arguments
    const transformedArgs = args
      .map(arg => transformNode(arg, currentDir))
      .filter(Boolean) as IR.IRNode[];
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee,
      arguments: transformedArgs,
      isNamedArgs: false
    } as IR.IRCallExpression;
  }
}