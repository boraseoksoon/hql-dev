// src/transpiler/hql_ir.ts
export enum IRNodeType {
  Program,
  StringLiteral,
  NumericLiteral,
  BooleanLiteral,
  NullLiteral,
  KeywordLiteral,

  Identifier,
  ArrayLiteral,
  ObjectLiteral,
  Property,

  BinaryExpression,
  CallExpression,
  NewExpression,
  PropertyAccess,
  AssignmentExpression,
  ConditionalExpression,

  VariableDeclaration,
  FunctionDeclaration,
  EnumDeclaration,
  ExportDeclaration,
  ReturnStatement,
  IfStatement,
  ForStatement,
  Block,
  Parameter,
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

export interface IRBooleanLiteral extends IRNode {
  type: IRNodeType.BooleanLiteral;
  value: boolean;
}

export interface IRNullLiteral extends IRNode {
  type: IRNodeType.NullLiteral;
}

export interface IRKeywordLiteral extends IRNode {
  type: IRNodeType.KeywordLiteral;
  value: string;
}

export interface IRIdentifier extends IRNode {
  type: IRNodeType.Identifier;
  name: string;
  isJSAccess?: boolean;
}

export interface IRArrayLiteral extends IRNode {
  type: IRNodeType.ArrayLiteral;
  elements: IRNode[];
}

export interface IRProperty extends IRNode {
  type: IRNodeType.Property;
  key: IRNode;
  value: IRNode;
  computed: boolean;
}

export interface IRObjectLiteral extends IRNode {
  type: IRNodeType.ObjectLiteral;
  properties: IRProperty[];
}

export interface IRBinaryExpression extends IRNode {
  type: IRNodeType.BinaryExpression;
  operator: string;
  left: IRNode;
  right: IRNode;
}

export interface IRCallExpression extends IRNode {
  type: IRNodeType.CallExpression;
  callee: IRNode;
  arguments: IRNode[];
  isNamedArgs: boolean;
}

export interface IRNewExpression extends IRNode {
  type: IRNodeType.NewExpression;
  callee: IRNode;
  arguments: IRNode[];
}

export interface IRPropertyAccess extends IRNode {
  type: IRNodeType.PropertyAccess;
  object: IRNode;
  property: IRNode;
  computed: boolean;
}

export interface IRAssignmentExpression extends IRNode {
  type: IRNodeType.AssignmentExpression;
  operator: string;
  left: IRNode;
  right: IRNode;
}

export interface IRConditionalExpression extends IRNode {
  type: IRNodeType.ConditionalExpression;
  test: IRNode;
  consequent: IRNode;
  alternate: IRNode;
}

export interface IRVariableDeclaration extends IRNode {
  type: IRNodeType.VariableDeclaration;
  kind: "const" | "let" | "var";
  id: IRIdentifier;
  init: IRNode;
}

export interface IRParameter extends IRNode {
  type: IRNodeType.Parameter;
  id: IRIdentifier;
}

export interface IRBlock extends IRNode {
  type: IRNodeType.Block;
  body: IRNode[];
}

export interface IRFunctionDeclaration extends IRNode {
  type: IRNodeType.FunctionDeclaration;
  id: IRIdentifier;
  params: IRParameter[];
  body: IRBlock;
  isAnonymous: boolean;
  isNamedParams: boolean;
  namedParamIds?: string[];
}

export interface IREnumDeclaration extends IRNode {
  type: IRNodeType.EnumDeclaration;
  name: IRIdentifier;
  members: string[];
}

export interface IRExportDeclaration extends IRNode {
  type: IRNodeType.ExportDeclaration;
  exports: { local: IRIdentifier; exported: string }[];
}

export interface IRReturnStatement extends IRNode {
  type: IRNodeType.ReturnStatement;
  argument: IRNode | null;
}

export interface IRIfStatement extends IRNode {
  type: IRNodeType.IfStatement;
  test: IRNode;
  consequent: IRNode;
  alternate: IRNode | null;
}

export interface IRForStatement extends IRNode {
  type: IRNodeType.ForStatement;
  init: IRVariableDeclaration;
  test: IRNode;
  update: IRNode | null;
  body: IRBlock;
}

// Enhanced function to determine if a node returns a function expression
export function isHigherOrderFunction(node: IRNode): boolean {
  if (node.type === IRNodeType.FunctionDeclaration) {
    const fn = node as IRFunctionDeclaration;
    return fn.isAnonymous;
  }
  return false;
}

// Function to check if a node is statement-like (for auto-return handling)
export function isStatementLike(node: IRNode): boolean {
  return [
    IRNodeType.VariableDeclaration,
    IRNodeType.FunctionDeclaration,
    IRNodeType.ExportDeclaration,
    IRNodeType.EnumDeclaration,
    IRNodeType.ReturnStatement,
    IRNodeType.Block,
    IRNodeType.IfStatement,
    IRNodeType.ForStatement
  ].includes(node.type);
}

// Function to check if a node is an expression
export function isExpression(node: IRNode): boolean {
  return [
    IRNodeType.StringLiteral,
    IRNodeType.NumericLiteral,
    IRNodeType.BooleanLiteral,
    IRNodeType.NullLiteral,
    IRNodeType.KeywordLiteral,
    IRNodeType.Identifier,
    IRNodeType.ArrayLiteral,
    IRNodeType.ObjectLiteral,
    IRNodeType.BinaryExpression,
    IRNodeType.CallExpression,
    IRNodeType.NewExpression,
    IRNodeType.PropertyAccess,
    IRNodeType.AssignmentExpression,
    IRNodeType.ConditionalExpression
  ].includes(node.type);
}

// This function should be used for nested blocks where identifying 
// function expressions that need to be returned is important
export function containsNestedFunctionExpression(body: IRBlock): boolean {
  if (body.body.length === 0) return false;
  
  // Check if the last expression is a function expression
  const lastNode = body.body[body.body.length - 1];
  return isHigherOrderFunction(lastNode);
}