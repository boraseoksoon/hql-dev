// src/transpiler/hql-to-ir.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import * as IR from "./hql_ir.ts";

// Cache for commonly transformed symbols
const symbolCache = new Map<string, IR.IRIdentifier>();

// Cache for transformed nodes to avoid redundant transformations
const nodeTransformCache = new Map<HQLNode, IR.IRNode | null>();

/** Convert an array of HQL nodes into an IR program */
export function transformToIR(nodes: HQLNode[], currentDir: string): IR.IRProgram {
  // Clear caches for each new transformation
  symbolCache.clear();
  nodeTransformCache.clear();
  
  const program: IR.IRProgram = { type: IR.IRNodeType.Program, body: [] };
  for (const n of nodes) {
    const ir = transformNode(n, currentDir);
    if (ir) program.body.push(ir);
  }
  return program;
}

function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
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

function hyphenToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
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

function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  // If this list node was parsed as an array literal, always transform it as a direct array.
  if ((list as any).isArrayLiteral) {
    return transformDirectArray(list, currentDir);
  }
  
  // If the list is empty (and not marked as an array literal), return null.
  if (list.elements.length === 0) return null;
  
  const head = list.elements[0];
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
      case "->": return null; // Ignore type annotations
      
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
  
  // For any list that is not a special form or a call form, treat it as a direct array literal.
  if (list.type === "list" && list.elements.length > 0 &&
      !isListForm(list) && !isCallForm(list)) {
    return transformDirectArray(list, currentDir);
  }
  
  // Default: treat the list as a function call.
  return transformCall(list, currentDir);
}


// Helper to check if a list should be treated as a special form
function isListForm(list: ListNode): boolean {
  if (list.elements.length === 0) return false;
  const head = list.elements[0];
  if (head.type !== "symbol") return false;
  
  const specialForms = [
    "def", "defn", "fn", "import", "vector", "list", "hash-map", 
    "keyword", "defenum", "export", "print", "new", "str", "let", 
    "cond", "if", "for", "set", "->",
    "+", "-", "*", "/", "<", ">", "<=", ">=", "=", "!=",
    "get", "return"
  ];
  
  return specialForms.includes((head as SymbolNode).name);
}

// Helper to check if a list should be treated as a function call
function isCallForm(list: ListNode): boolean {
  if (list.elements.length === 0) return false;
  const head = list.elements[0];
  
  // If the first element is a symbol (but not a special form) or another expression,
  // it's likely a function call
  return (
    (head.type === "symbol" && !isListForm(list)) ||
    head.type === "list"
  );
}

// Handle direct array literals for tests
function transformDirectArray(list: ListNode, currentDir: string): IR.IRArrayLiteral {
  const elements = list.elements.map(el => transformNode(el, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return {
    type: IR.IRNodeType.ArrayLiteral,
    elements: elements
  };
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

/** (defn name (params) body...) */
function transformDefn(list: ListNode, currentDir: string): IR.IRFunctionDeclaration {
  if (list.elements.length < 4) {
    throw new Error("defn requires a name, parameter list, and a body");
  }
  
  const nameSym = list.elements[1] as SymbolNode;
  const paramList = list.elements[2] as ListNode;
  const bodyNodes = list.elements.slice(3)
    .map(n => transformNode(n, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  const { params, namedParamIds } = transformParams(paramList);
  
  // For the last expression in the body, ensure it's properly returned
  ensureReturnForLastExpression(bodyNodes);
  
  return {
    type: IR.IRNodeType.FunctionDeclaration,
    id: transformSymbol(nameSym),
    params,
    body: { type: IR.IRNodeType.Block, body: bodyNodes },
    isAnonymous: false,
    isNamedParams: namedParamIds.length > 0,
    namedParamIds
  } as IR.IRFunctionDeclaration;
}

/** (fn (params) body...) */
function transformFn(list: ListNode, currentDir: string): IR.IRFunctionDeclaration {
  if (list.elements.length < 3) {
    throw new Error("fn requires a parameter list and a body");
  }
  
  const paramList = list.elements[1] as ListNode;
  const bodyNodes = list.elements.slice(2)
    .map(n => transformNode(n, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  const { params, namedParamIds } = transformParams(paramList);
  
  // For the last expression in the body, ensure it's properly returned
  ensureReturnForLastExpression(bodyNodes);
  
  return {
    type: IR.IRNodeType.FunctionDeclaration,
    id: { type: IR.IRNodeType.Identifier, name: "$anonymous" },
    params,
    body: { type: IR.IRNodeType.Block, body: bodyNodes },
    isAnonymous: true,
    isNamedParams: namedParamIds.length > 0,
    namedParamIds
  } as IR.IRFunctionDeclaration;
}

/** Helper: Transform a list as a Vector (JavaScript array) */
function transformVector(list: ListNode, currentDir: string): IR.IRArrayLiteral {
  const elems = list.elements.slice(1)
    .map(x => transformNode(x, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return { type: IR.IRNodeType.ArrayLiteral, elements: elems };
}

/** Helper: Transform a list as an ArrayLiteral (for both vectors and list literals) */
function transformArrayLiteral(list: ListNode, currentDir: string): IR.IRArrayLiteral {
  const elems = list.elements.slice(1)
    .map(x => transformNode(x, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return { type: IR.IRNodeType.ArrayLiteral, elements: elems };
}

/** (hash-map key value ... ) => ObjectLiteral */
function transformHashMap(list: ListNode, currentDir: string): IR.IRObjectLiteral {
  const body = list.elements.slice(1);
  
  if (body.length % 2 !== 0) {
    throw new Error("hash-map requires even number of arguments");
  }
  
  const props: IR.IRProperty[] = [];
  
  for (let i = 0; i < body.length; i += 2) {
    const k = transformNode(body[i], currentDir);
    const v = transformNode(body[i+1], currentDir);
    
    if (k && v) {
      props.push({ 
        type: IR.IRNodeType.Property, 
        key: k, 
        value: v, 
        computed: false 
      });
    }
  }
  
  return { type: IR.IRNodeType.ObjectLiteral, properties: props };
}

/** (keyword "foo") => KeywordLiteral */
function transformKeyword(list: ListNode): IR.IRKeywordLiteral {
  if (list.elements.length !== 2) {
    throw new Error("keyword requires exactly one argument");
  }
  
  const arg = list.elements[1];
  if (arg.type !== "literal" || typeof (arg as LiteralNode).value !== "string") {
    throw new Error("keyword argument must be a string literal");
  }
  
  return { 
    type: IR.IRNodeType.KeywordLiteral, 
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
  
  return {
    type: IR.IRNodeType.CallExpression,
    callee: { type: IR.IRNodeType.Identifier, name: "console.log" },
    arguments: args,
    isNamedArgs: false
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

/** (set var expr) => AssignmentExpression */
function transformSet(list: ListNode, currentDir: string): IR.IRNode {
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
  
  // Set constructor case (for #[] syntax)
  if (list.elements.length === 2) {
    const arg = transformNode(list.elements[1], currentDir);
    
    if (!arg) {
      throw new Error("Invalid argument to set constructor");
    }
    
    return {
      type: IR.IRNodeType.NewExpression,
      callee: { type: IR.IRNodeType.Identifier, name: "Set" },
      arguments: [arg]
    } as IR.IRNewExpression;
  }
  
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

/** Fallback: treat list as a function call. If arguments are named, fold them into an object. */
function transformCall(list: ListNode, currentDir: string): IR.IRCallExpression {
  const head = list.elements[0];
  const callee = transformNode(head, currentDir)!;
  const args = list.elements.slice(1);
  
  // Check if the arguments are named (key-value pairs)
  let isNamed = false;
  if (args.length >= 2 && args.length % 2 === 0) {
    isNamed = args.every((n, i) =>
      i % 2 === 0 ? (n.type === "symbol" && (n as SymbolNode).name.endsWith(":")) : true
    );
  }
  
  if (isNamed) {
    // Handle named arguments as object
    const props: IR.IRProperty[] = [];
    
    for (let i = 0; i < args.length; i += 2) {
      const keySym = args[i] as SymbolNode;
      const keyName = hyphenToCamel(keySym.name.slice(0, -1));
      const valNode = transformNode(args[i+1], currentDir);
      
      if (valNode) {
        const keyLiteral: IR.IRStringLiteral = { 
          type: IR.IRNodeType.StringLiteral, 
          value: keyName 
        };
        
        props.push({
          type: IR.IRNodeType.Property,
          key: keyLiteral,
          value: valNode,
          computed: false
        });
      }
    }
    
    const objLiteral: IR.IRObjectLiteral = {
      type: IR.IRNodeType.ObjectLiteral,
      properties: props
    };
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee,
      arguments: [objLiteral],
      isNamedArgs: true
    };
  } else {
    // Handle regular arguments
    const transformedArgs = args
      .map(x => transformNode(x, currentDir))
      .filter(Boolean) as IR.IRNode[];
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee,
      arguments: transformedArgs,
      isNamedArgs: false
    };
  }
}

/** Transform a parameter list into IR parameters */
function transformParams(list: ListNode): { params: IR.IRParameter[], namedParamIds: string[] } {
  const params: IR.IRParameter[] = [];
  const named: string[] = [];

  if (!list.elements) {
    console.warn("Warning: Empty parameter list");
    return { params, namedParamIds: named };
  }
  
  for (const el of list.elements) {
    if (el.type !== "symbol") {
      throw new Error("Parameter must be a symbol");
    }
    
    const name = (el as SymbolNode).name;
    
    if (name.endsWith(":")) {
      // Named parameter
      const real = hyphenToCamel(name.slice(0, -1));
      named.push(real);
      params.push({
        type: IR.IRNodeType.Parameter,
        id: { type: IR.IRNodeType.Identifier, name: real }
      });
    } else {
      // Regular parameter
      params.push({
        type: IR.IRNodeType.Parameter,
        id: { type: IR.IRNodeType.Identifier, name: hyphenToCamel(name) }
      });
    }
  }
  
  return { params, namedParamIds: named };
}