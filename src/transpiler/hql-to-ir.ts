// src/transpiler/hql-to-ir.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode, VectorNode, SetNode, MapNode } from "./hql_ast.ts";
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
    case "vector":
      result = transformVector(node as VectorNode, currentDir);
      break;
    case "set":
      result = transformSetLiteral(node as SetNode, currentDir);
      break;
    case "map":
      result = transformMap(node as MapNode, currentDir);
      break;
    default:
      throw new Error("Unknown HQL node type: " + (node as any).type);
  }
  
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
  if (typeof v === "object") {
    // Handle JSON objects
    return transformJSONObject(v);
  }
  throw new Error("Unsupported literal: " + v);
}

function hyphenToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function transformSymbol(sym: SymbolNode): IR.IRIdentifier {
  const name = sym.name;
  if (symbolCache.has(name)) {
    return { ...symbolCache.get(name)! };
  }
  
  let result: IR.IRIdentifier;
  if (name.startsWith("js/")) {
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
  symbolCache.set(name, result);
  return { ...result };
}

function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  if (list.elements.length === 0) return null;
  
  const head = list.elements[0];
  if (head.type === "symbol") {
    const s = head as SymbolNode;
    switch (s.name) {
      case "def": return transformDef(list, currentDir);
      case "defn": return transformDefn(list, currentDir);
      case "fn": return transformFn(list, currentDir);
      case "import": return transformImport(list, currentDir);
      case "vector": return transformVector(list, currentDir); // list form for vector literal
      case "list": return transformArrayLiteral(list, currentDir);
      case "hash-map": return transformHashMap(list, currentDir);
      case "hash-set": return transformHashSet(list, currentDir);
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
      case "set": return transformSetAssignment(list, currentDir); // assignment form: (set x expr)
      case "->": return null;
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
  
  // Default: treat as function call
  return transformCall(list, currentDir);
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
  } as IR.IRVariableDeclaration;
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

/** Merged: Transform a vector node or a list with 'vector' as head into an IR array literal */
function transformVector(node: VectorNode | ListNode, currentDir: string): IR.IRArrayLiteral {
  let elements: IR.IRNode[];
  if (node.type === "vector") {
    elements = node.elements
      .map(elem => transformNode(elem, currentDir))
      .filter((elem): elem is IR.IRNode => elem !== null);
  } else {
    // For list form, skip the head symbol ("vector")
    elements = node.elements.slice(1)
      .map(x => transformNode(x, currentDir))
      .filter((elem): elem is IR.IRNode => elem !== null);
  }
  return {
    type: IR.IRNodeType.ArrayLiteral,
    elements
  };
}

/** Helper: Transform a list as an ArrayLiteral (for 'list' literal) */
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

/** (hash-set item1 item2 ...) => new Set([...]) */
function transformHashSet(list: ListNode, currentDir: string): IR.IRNewExpression {
  const elements = list.elements.slice(1)
    .map(x => transformNode(x, currentDir))
    .filter(Boolean) as IR.IRNode[];
  return {
    type: IR.IRNodeType.NewExpression,
    callee: { type: IR.IRNodeType.Identifier, name: "Set" },
    arguments: [
      { type: IR.IRNodeType.ArrayLiteral, elements } as IR.IRArrayLiteral
    ]
  } as IR.IRNewExpression;
}

/** Transform a set literal node (from #[...]) to new Set([...]) */
function transformSetLiteral(set: SetNode, currentDir: string): IR.IRNewExpression {
  const elements = set.elements
    .map(elem => transformNode(elem, currentDir))
    .filter((elem): elem is IR.IRNode => elem !== null);
  return {
    type: IR.IRNodeType.NewExpression,
    callee: { type: IR.IRNodeType.Identifier, name: "Set" },
    arguments: [
      { type: IR.IRNodeType.ArrayLiteral, elements } as IR.IRArrayLiteral
    ]
  } as IR.IRNewExpression;
}

/** Transform a map node to an object literal */
function transformMap(map: MapNode, currentDir: string): IR.IRObjectLiteral {
  const properties: IR.IRProperty[] = [];
  for (const [key, value] of map.pairs) {
    const keyNode = transformNode(key, currentDir);
    const valueNode = transformNode(value, currentDir);
    if (keyNode && valueNode) {
      properties.push({
        type: IR.IRNodeType.Property,
        key: keyNode,
        value: valueNode,
        computed: false
      });
    }
  }
  return { type: IR.IRNodeType.ObjectLiteral, properties };
}

/** Transform a JSON object to an object literal */
function transformJSONObject(obj: object): IR.IRObjectLiteral {
  const properties: IR.IRProperty[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const keyLiteral: IR.IRStringLiteral = { type: IR.IRNodeType.StringLiteral, value: key };
    let valueNode: IR.IRNode;
    if (value === null) {
      valueNode = { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
    } else if (typeof value === "string") {
      valueNode = { type: IR.IRNodeType.StringLiteral, value } as IR.IRStringLiteral;
    } else if (typeof value === "number") {
      valueNode = { type: IR.IRNodeType.NumericLiteral, value } as IR.IRNumericLiteral;
    } else if (typeof value === "boolean") {
      valueNode = { type: IR.IRNodeType.BooleanLiteral, value } as IR.IRBooleanLiteral;
    } else if (Array.isArray(value)) {
      valueNode = transformJSONArray(value);
    } else if (typeof value === "object") {
      valueNode = transformJSONObject(value);
    } else {
      valueNode = { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
    }
    properties.push({
      type: IR.IRNodeType.Property,
      key: keyLiteral,
      value: valueNode,
      computed: false
    });
  }
  return { type: IR.IRNodeType.ObjectLiteral, properties };
}

/** Transform a JSON array to an array literal */
function transformJSONArray(arr: any[]): IR.IRArrayLiteral {
  const elements: IR.IRNode[] = [];
  for (const value of arr) {
    if (value === null) {
      elements.push({ type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral);
    } else if (typeof value === "string") {
      elements.push({ type: IR.IRNodeType.StringLiteral, value } as IR.IRStringLiteral);
    } else if (typeof value === "number") {
      elements.push({ type: IR.IRNodeType.NumericLiteral, value } as IR.IRNumericLiteral);
    } else if (typeof value === "boolean") {
      elements.push({ type: IR.IRNodeType.BooleanLiteral, value } as IR.IRBooleanLiteral);
    } else if (Array.isArray(value)) {
      elements.push(transformJSONArray(value));
    } else if (typeof value === "object") {
      elements.push(transformJSONObject(value));
    }
  }
  return { type: IR.IRNodeType.ArrayLiteral, elements };
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
  } as IR.IREnumDeclaration;
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
  } as IR.IRExportDeclaration;
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

/** (cond pred1 val1 pred2 val2 ... true default) => Conditional expression chain */
function transformCond(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 3) {
    throw new Error("cond requires at least one predicate-value pair");
  }
  const pairs: Array<[IR.IRNode, IR.IRNode]> = [];
  for (let i = 1; i < list.elements.length; i += 2) {
    if (i + 1 >= list.elements.length) {
      throw new Error("cond requires pairs of predicate and value");
    }
    const predicate = transformNode(list.elements[i], currentDir)!;
    const value = transformNode(list.elements[i + 1], currentDir)!;
    pairs.push([predicate, value]);
  }
  return buildConditionalChain(pairs, 0);
}

function buildConditionalChain(pairs: Array<[IR.IRNode, IR.IRNode]>, index: number): IR.IRNode {
  if (index >= pairs.length - 1) {
    const [predicate, value] = pairs[index];
    if (predicate.type === IR.IRNodeType.Identifier && (predicate as IR.IRIdentifier).name === 'true') {
      return value;
    }
    return {
      type: IR.IRNodeType.ConditionalExpression,
      test: predicate,
      consequent: value,
      alternate: { type: IR.IRNodeType.NullLiteral }
    } as IR.IRConditionalExpression;
  }
  const [predicate, value] = pairs[index];
  return {
    type: IR.IRNodeType.ConditionalExpression,
    test: predicate,
    consequent: value,
    alternate: buildConditionalChain(pairs, index + 1)
  } as IR.IRConditionalExpression;
}

/** (if condition then-branch else-branch) => ConditionalExpression (if both branches are expressions) or IfStatement */
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
  if (IR.isExpression(thenBranch) && (elseBranch === null || IR.isExpression(elseBranch))) {
    return {
      type: IR.IRNodeType.ConditionalExpression,
      test: condition,
      consequent: thenBranch,
      alternate: elseBranch || { type: IR.IRNodeType.NullLiteral }
    } as IR.IRConditionalExpression;
  }
  return {
    type: IR.IRNodeType.IfStatement,
    test: condition,
    consequent: thenBranch,
    alternate: elseBranch
  } as IR.IRIfStatement;
}

/** (for [var init condition update] body...) => ForStatement */
function transformFor(list: ListNode, currentDir: string): IR.IRForStatement {
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

/** (set var expr) => AssignmentExpression (list form) */
function transformSetAssignment(list: ListNode, currentDir: string): IR.IRAssignmentExpression {
  if (list.elements.length !== 3) {
    throw new Error("set requires a target and an expression");
  }
  const target = transformNode(list.elements[1], currentDir)!;
  const value = transformNode(list.elements[2], currentDir)!;
  return {
    type: IR.IRNodeType.AssignmentExpression,
    operator: "=",
    left: target,
    right: value
  } as IR.IRAssignmentExpression;
}

/** (get obj "prop") => PropertyAccess */
function transformPropertyAccess(list: ListNode, currentDir: string): IR.IRPropertyAccess {
  if (list.elements.length !== 3) {
    throw new Error("get requires object and property arguments");
  }
  const obj = transformNode(list.elements[1], currentDir)!;
  const prop = transformNode(list.elements[2], currentDir)!;
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
    return { type: IR.IRNodeType.ReturnStatement, argument: null } as IR.IRReturnStatement;
  }
  const valueNode = list.elements[1];
  return { type: IR.IRNodeType.ReturnStatement, argument: transformNode(valueNode, currentDir) } as IR.IRReturnStatement;
}

/** (let [var1 val1 var2 val2 ...] body...) => Block */
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
  ensureReturnForLastExpression(bodyNodes);
  return { type: IR.IRNodeType.Block, body: [...declarations, ...bodyNodes] };
}

function ensureReturnForLastExpression(bodyNodes: IR.IRNode[]): void {
  if (bodyNodes.length === 0) return;
  const lastIndex = bodyNodes.length - 1;
  const lastNode = bodyNodes[lastIndex];
  if (IR.isExpression(lastNode) && lastNode.type !== IR.IRNodeType.ReturnStatement) {
    bodyNodes[lastIndex] = { type: IR.IRNodeType.ReturnStatement, argument: lastNode } as IR.IRReturnStatement;
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

/** Fallback: treat list as a function call. */
function transformCall(list: ListNode, currentDir: string): IR.IRCallExpression {
  const head = list.elements[0];
  const callee = transformNode(head, currentDir)!;
  const args = list.elements.slice(1);
  let isNamed = false;
  if (args.length >= 2 && args.length % 2 === 0) {
    isNamed = args.every((n, i) =>
      i % 2 === 0 ? (n.type === "symbol" && (n as SymbolNode).name.endsWith(":")) : true
    );
  }
  if (isNamed) {
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
    } as IR.IRCallExpression;
  } else {
    const transformedArgs = args
      .map(x => transformNode(x, currentDir))
      .filter(Boolean) as IR.IRNode[];
    return {
      type: IR.IRNodeType.CallExpression,
      callee,
      arguments: transformedArgs,
      isNamedArgs: false
    } as IR.IRCallExpression;
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
      const real = hyphenToCamel(name.slice(0, -1));
      named.push(real);
      params.push({
        type: IR.IRNodeType.Parameter,
        id: { type: IR.IRNodeType.Identifier, name: real }
      });
    } else {
      params.push({
        type: IR.IRNodeType.Parameter,
        id: { type: IR.IRNodeType.Identifier, name: hyphenToCamel(name) }
      });
    }
  }
  return { params, namedParamIds: named };
}
