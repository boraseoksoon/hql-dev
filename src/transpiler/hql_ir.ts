// src/transpiler/hql_ir.ts - Updated IR types

export enum IRNodeType {
  // Basic program structure
  Program,
  
  // Literals
  StringLiteral,
  NumericLiteral,
  BooleanLiteral,
  NullLiteral,
  
  // Identifiers
  Identifier,
  
  // Expressions
  CallExpression,
  MemberExpression,
  CallMemberExpression,
  NewExpression,
  BinaryExpression,
  UnaryExpression,
  ConditionalExpression,
  ArrayExpression,
  ArrayConsExpression,
  FunctionExpression,
  
  // Statements/Declarations
  VariableDeclaration,
  VariableDeclarator,
  FunctionDeclaration,
  ReturnStatement,
  BlockStatement,
  
  // Import/Export
  ImportDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  ExportVariableDeclaration,
  
  // JS Interop
  InteropIIFE,
  
  // Other
  CommentBlock,
  Raw
}

export interface IRNode {
  type: IRNodeType;
}

export interface IRProgram extends IRNode {
  type: IRNodeType.Program;
  body: IRNode[];
}

// Literals
export interface IRStringLiteral extends IRNode {
  type: IRNodeType.StringLiteral;
  value: string;
}

export interface IRNumericLiteral extends IRNode {
  type: IRNodeType.NumericLiteral;
  value: number;
}

export interface IRBooleanLiteral extends IRNode {
  type: IRNodeType.BooleanLiteral;
  value: boolean;
}

export interface IRNullLiteral extends IRNode {
  type: IRNodeType.NullLiteral;
}

// Identifiers
export interface IRIdentifier extends IRNode {
  type: IRNodeType.Identifier;
  name: string;
  isJS?: boolean;
}

// Expressions
export interface IRCallExpression extends IRNode {
  type: IRNodeType.CallExpression;
  callee: IRNode;
  arguments: IRNode[];
}

export interface IRMemberExpression extends IRNode {
  type: IRNodeType.MemberExpression;
  object: IRNode;
  property: IRNode;
  computed: boolean;
}

export interface IRCallMemberExpression extends IRNode {
  type: IRNodeType.CallMemberExpression;
  object: IRNode;
  property: IRNode;
  arguments: IRNode[];
}

export interface IRNewExpression extends IRNode {
  type: IRNodeType.NewExpression;
  callee: IRNode;
  arguments: IRNode[];
}

export interface IRBinaryExpression extends IRNode {
  type: IRNodeType.BinaryExpression;
  operator: string;
  left: IRNode;
  right: IRNode;
}

export interface IRUnaryExpression extends IRNode {
  type: IRNodeType.UnaryExpression;
  operator: string;
  argument: IRNode;
}

export interface IRConditionalExpression extends IRNode {
  type: IRNodeType.ConditionalExpression;
  test: IRNode;
  consequent: IRNode;
  alternate: IRNode;
}

export interface IRArrayExpression extends IRNode {
  type: IRNodeType.ArrayExpression;
  elements: IRNode[];
}

export interface IRArrayConsExpression extends IRNode {
  type: IRNodeType.ArrayConsExpression;
  item: IRNode;
  array: IRNode;
}

export interface IRFunctionExpression extends IRNode {
  type: IRNodeType.FunctionExpression;
  id: IRIdentifier | null;
  params: IRIdentifier[];
  body: IRBlockStatement;
}

// Statements/Declarations
export interface IRVariableDeclaration extends IRNode {
  type: IRNodeType.VariableDeclaration;
  kind: "const" | "let" | "var";
  declarations: IRVariableDeclarator[];
}

export interface IRVariableDeclarator extends IRNode {
  type: IRNodeType.VariableDeclarator;
  id: IRIdentifier;
  init: IRNode;
}

export interface IRFunctionDeclaration extends IRNode {
  type: IRNodeType.FunctionDeclaration;
  id: IRIdentifier;
  params: IRIdentifier[];
  body: IRBlockStatement;
}

export interface IRReturnStatement extends IRNode {
  type: IRNodeType.ReturnStatement;
  argument: IRNode;
}

export interface IRBlockStatement extends IRNode {
  type: IRNodeType.BlockStatement;
  body: IRNode[];
}

// Import/Export
export interface IRImportDeclaration extends IRNode {
  type: IRNodeType.ImportDeclaration;
  source: string;
}

export interface IRExportNamedDeclaration extends IRNode {
  type: IRNodeType.ExportNamedDeclaration;
  specifiers: IRExportSpecifier[];
}

export interface IRExportSpecifier extends IRNode {
  type: IRNodeType.ExportSpecifier;
  local: IRIdentifier;
  exported: IRIdentifier;
}

export interface IRExportVariableDeclaration extends IRNode {
  type: IRNodeType.ExportVariableDeclaration;
  declaration: IRVariableDeclaration;
  exportName: string;
}

// JS Interop
export interface IRInteropIIFE extends IRNode {
  type: IRNodeType.InteropIIFE;
  object: IRNode;
  property: IRStringLiteral;
}

// Other
export interface IRCommentBlock extends IRNode {
  type: IRNodeType.CommentBlock;
  value: string;
}

export interface IRRaw extends IRNode {
  type: IRNodeType.Raw;
  code: string;
}