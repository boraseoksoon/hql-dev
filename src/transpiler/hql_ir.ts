// src/transpiler/hql_ir.ts

export enum IRNodeType {
  Program,
  StringLiteral,
  NumericLiteral,
  Identifier,
  CallExpression,
  NewExpression,
  VariableDeclaration,
  FunctionDeclaration,
  ExportDeclaration,
  ImportDeclaration,
  ReturnExpression,
  Raw
}

export interface IRRaw extends IR.IRNode {
  type: IRNodeType.Raw;
  code: string;
}

export interface IRNode {
  type: IRNodeType;
}

export interface IRProgram extends IRNode {
  type: IRNodeType.Program;
  body: IRNode[];
}

export interface IRStringLiteral extends IRNode {
  type: IRNodeType.StringLiteral;
  value: string;
}

export interface IRNumericLiteral extends IRNode {
  type: IRNodeType.NumericLiteral;
  value: number;
}

export interface IRIdentifier extends IRNode {
  type: IRNodeType.Identifier;
  name: string;
  isJS?: boolean;
}

export interface IRCallExpression extends IRNode {
  type: IRNodeType.CallExpression;
  callee: IRNode;
  arguments: IRNode[];
}

export interface IRNewExpression extends IRNode {
  type: IRNodeType.NewExpression;
  callee: IRNode;
  arguments: IRNode[];
}

export interface IRVariableDeclaration extends IRNode {
  type: IRNodeType.VariableDeclaration;
  kind: "const";
  id: IRIdentifier;
  init: IRNode;
}

export interface IRFunctionDeclaration extends IRNode {
  type: IRNodeType.FunctionDeclaration;
  id: IRIdentifier;
  params: IRIdentifier[];
  body: IRNode[];
}

export interface IRExportDeclaration extends IRNode {
  type: IRNodeType.ExportDeclaration;
  exports: { local: IRIdentifier; exported: string }[];
}

export interface IRImportDeclaration extends IRNode {
  type: IRNodeType.ImportDeclaration;
  specifier: string;
}

// New: Used to wrap the last expression in a function body.
export interface IRReturnExpression extends IRNode {
  type: IRNodeType.ReturnExpression;
  argument: IRNode;
}
