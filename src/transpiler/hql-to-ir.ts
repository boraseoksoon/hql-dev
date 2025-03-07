// src/transpiler/hql-to-ir.ts

import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import * as IR from "./hql_ir.ts";

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
 * Transform a single HQL AST node into an IR node.
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
 * Transform a literal node.
 */
function transformLiteral(lit: LiteralNode): IR.IRNode {
  const value = lit.value;
  if (typeof value === "number") {
    return { type: IR.IRNodeType.NumericLiteral, value } as IR.IRNumericLiteral;
  } else {
    return { type: IR.IRNodeType.StringLiteral, value: String(value) } as IR.IRStringLiteral;
  }
}

/**
 * Transform a symbol node.
 */
function transformSymbol(sym: SymbolNode): IR.IRNode {
  let name = sym.name;
  let isJS = false;
  if (name.startsWith("js/")) {
    name = name.slice(3);
    isJS = true;
  }
  return { type: IR.IRNodeType.Identifier, name, isJS } as IR.IRIdentifier;
}

/**
 * Split a composite symbol (e.g. "obj.member") into its object part and member name.
 */
function transformCompositeSymbol(sym: SymbolNode): { object: SymbolNode; member: string } {
  const parts = sym.name.split('.');
  if (parts.length !== 2) {
    throw new Error(`Composite member access must have exactly one dot: ${sym.name}`);
  }
  return { object: { type: "symbol", name: parts[0] }, member: parts[1] };
}

/**
 * Transform a composite member access.
 * If extra arguments are provided, treat it as a method call;
 * otherwise, treat it as a property access that auto-invokes if callable.
 */
function transformMemberAccess(list: ListNode, currentDir: string): IR.IRNode {
  // The head is a composite symbol like "human.say-my-name"
  const composite = list.elements[0] as SymbolNode;
  const { object, member } = transformCompositeSymbol(composite);
  const objectIR = transformNode(object, currentDir);
  if (list.elements.length > 1) {
    // Method call with arguments.
    const args: IR.IRNode[] = [];
    for (let i = 1; i < list.elements.length; i++) {
      const argIR = transformNode(list.elements[i], currentDir);
      if (argIR) args.push(argIR);
    }
    return {
      type: IR.IRNodeType.Raw,
      code: `(function(){
  const _obj = ${nodeToString(objectIR)};
  const _member = _obj["${member}"];
  return typeof _member === "function" ? _member.call(_obj, ${args.map(a => nodeToString(a)).join(", ")}) : _member;
})()`
    } as IR.IRNode;
  } else {
    // No arguments: property access, but if callable, auto-invoke with the proper binding.
    return {
      type: IR.IRNodeType.Raw,
      code: `(function(){
  const _obj = ${nodeToString(objectIR)};
  const _member = _obj["${member}"];
  return typeof _member === "function" ? _member.call(_obj) : _member;
})()`
    } as IR.IRNode;
  }
}

/**
 * Transform a list node.
 * If the head symbol contains a dot, delegate to transformMemberAccess.
 */
export function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  if (list.elements.length === 0) return null;
  const first = list.elements[0];
  if (first.type === "symbol" && first.name.includes('.')) {
    return transformMemberAccess(list, currentDir);
  }
  // Dispatch on standard core forms.
  switch ((first as SymbolNode).name) {
    case "def":
      return transformDef(list, currentDir);
    case "defn":
      return transformDefn(list, currentDir);
    case "import":
      return transformImport(list, currentDir);
    case "export":
      return transformExport(list, currentDir);
    case "new":
      return transformNew(list, currentDir);
    default:
      return transformCall(list, currentDir);
  }
}

/**
 * Transform a def form.
 * Example: (def greeting "Hello, HQL!")
 */
function transformDef(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 3) {
    throw new Error("def requires exactly 2 arguments");
  }
  const idNode = list.elements[1];
  if (idNode.type !== "symbol") {
    throw new Error("def requires an identifier as name");
  }
  const id = transformSymbol(idNode as SymbolNode) as IR.IRIdentifier;
  const init = transformNode(list.elements[2], currentDir)!;
  return { type: IR.IRNodeType.VariableDeclaration, kind: "const", id, init } as IR.IRVariableDeclaration;
}

/**
 * Transform a defn form.
 * Example: (defn ok () "OK")
 * The last expression in the function body is wrapped in a ReturnExpression.
 */
function transformDefn(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 4) {
    throw new Error("defn requires a name, parameter list, and a body");
  }
  const idNode = list.elements[1];
  if (idNode.type !== "symbol") {
    throw new Error("defn requires an identifier as function name");
  }
  const id = transformSymbol(idNode as SymbolNode) as IR.IRIdentifier;
  const paramsNode = list.elements[2];
  if (paramsNode.type !== "list") {
    throw new Error("defn parameter list must be a list");
  }
  const paramsList = paramsNode as ListNode;
  const params: IR.IRIdentifier[] = [];
  for (const param of paramsList.elements) {
    if (param.type !== "symbol") {
      throw new Error("defn parameters must be symbols");
    }
    params.push(transformSymbol(param as SymbolNode) as IR.IRIdentifier);
  }
  const bodyNodes: IR.IRNode[] = [];
  for (let i = 3; i < list.elements.length; i++) {
    const expr = transformNode(list.elements[i], currentDir);
    if (expr) bodyNodes.push(expr);
  }
  // Wrap the last expression in a ReturnExpression.
  if (bodyNodes.length > 0) {
    const last = bodyNodes[bodyNodes.length - 1];
    bodyNodes[bodyNodes.length - 1] = { type: IR.IRNodeType.ReturnExpression, argument: last } as IR.IRReturnExpression;
  }
  return { type: IR.IRNodeType.FunctionDeclaration, id, params, body: bodyNodes } as IR.IRFunctionDeclaration;
}

/**
 * Transform an import form.
 * Example: (import "npm:lodash")
 */
function transformImport(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 2) {
    throw new Error("import requires exactly one argument");
  }
  const arg = list.elements[1];
  if (arg.type !== "literal") {
    throw new Error("import argument must be a literal string");
  }
  const lit = arg as LiteralNode;
  const url = String(lit.value);
  return { type: IR.IRNodeType.ImportDeclaration, specifier: url } as IR.IRImportDeclaration;
}

/**
 * Transform an export form.
 * Example: (export "greeting" greeting)
 */
function transformExport(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length !== 3) {
    throw new Error("export requires exactly 2 arguments");
  }
  const nameArg = list.elements[1];
  if (nameArg.type !== "literal") {
    throw new Error("export name must be a literal string");
  }
  const exportName = String((nameArg as LiteralNode).value);
  const localSym = list.elements[2];
  if (localSym.type !== "symbol") {
    throw new Error("export local name must be a symbol");
  }
  const local = transformSymbol(localSym as SymbolNode) as IR.IRIdentifier;
  return { type: IR.IRNodeType.ExportDeclaration, exports: [{ local, exported: exportName }] } as IR.IRExportDeclaration;
}

/**
 * Transform a new form.
 * Example: (new Date)
 */
function transformNew(list: ListNode, currentDir: string): IR.IRNode {
  if (list.elements.length < 2) {
    throw new Error("new requires a type and optional arguments");
  }
  const typeNode = list.elements[1];
  const callee = transformNode(typeNode, currentDir)!;
  const args: IR.IRNode[] = [];
  for (let i = 2; i < list.elements.length; i++) {
    const arg = transformNode(list.elements[i], currentDir);
    if (arg) args.push(arg);
  }
  return { type: IR.IRNodeType.NewExpression, callee, arguments: args } as IR.IRNewExpression;
}

/**
 * Transform a function call.
 */
function transformCall(list: ListNode, currentDir: string): IR.IRNode {
  const callee = transformNode(list.elements[0], currentDir)!;
  const args: IR.IRNode[] = [];
  for (let i = 1; i < list.elements.length; i++) {
    const arg = transformNode(list.elements[i], currentDir);
    if (arg) args.push(arg);
  }
  return { type: IR.IRNodeType.CallExpression, callee, arguments: args } as IR.IRCallExpression;
}

/**
 * Helper function to convert an IR node to a string.
 * This is used when generating Raw nodes for member access.
 */
function nodeToString(node: IR.IRNode | null): string {
  if (!node) return "";
  switch (node.type) {
    case IR.IRNodeType.Raw:
      return (node as IR.IRRaw).code;
    case IR.IRNodeType.StringLiteral:
      return JSON.stringify((node as IR.IRStringLiteral).value);
    case IR.IRNodeType.NumericLiteral:
      return (node as IR.IRNumericLiteral).value.toString();
    case IR.IRNodeType.Identifier:
      return (node as IR.IRIdentifier).name;
    default:
      return "";
  }
}
