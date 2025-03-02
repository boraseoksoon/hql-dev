// src/ts-ast-types.ts
export enum TSNodeType {
  SourceFile = "SourceFile",
  VariableStatement = "VariableStatement",
  VariableDeclaration = "VariableDeclaration",
  FunctionDeclaration = "FunctionDeclaration",
  Block = "Block",
  ExpressionStatement = "ExpressionStatement",
  CallExpression = "CallExpression",
  BinaryExpression = "BinaryExpression",
  Identifier = "Identifier",
  StringLiteral = "StringLiteral",
  NumericLiteral = "NumericLiteral",
  BooleanLiteral = "BooleanLiteral",
  NullLiteral = "NullLiteral",
  ObjectLiteral = "ObjectLiteral",
  PropertyAssignment = "PropertyAssignment",
  Raw = "Raw",
  ExportDeclaration = "ExportDeclaration"
}

export interface TSNode {
  type: TSNodeType;
}

export interface TSSourceFile extends TSNode {
  type: TSNodeType.SourceFile;
  statements: TSNode[];
}

export interface TSIdentifier extends TSNode {
  type: TSNodeType.Identifier;
  text: string;
}

export interface TSStringLiteral extends TSNode {
  type: TSNodeType.StringLiteral;
  text: string;
}

export interface TSNumericLiteral extends TSNode {
  type: TSNodeType.NumericLiteral;
  text: string;
}

export interface TSBooleanLiteral extends TSNode {
  type: TSNodeType.BooleanLiteral;
  text: string;
}

export interface TSNullLiteral extends TSNode {
  type: TSNodeType.NullLiteral;
}

export interface TSObjectLiteral extends TSNode {
  type: TSNodeType.ObjectLiteral;
  properties: TSPropertyAssignment[];
}

export interface TSPropertyAssignment extends TSNode {
  type: TSNodeType.PropertyAssignment;
  key: TSIdentifier;
  initializer: TSNode;
}

export interface TSBinaryExpression extends TSNode {
  type: TSNodeType.BinaryExpression;
  left: TSNode;
  operator: string;
  right: TSNode;
}

export interface TSCallExpression extends TSNode {
  type: TSNodeType.CallExpression;
  expression: TSNode;
  arguments: TSNode[];
}

export interface TSVariableDeclaration extends TSNode {
  type: TSNodeType.VariableDeclaration;
  name: TSIdentifier;
  initializer: TSNode;
}

export interface TSVariableStatement extends TSNode {
  type: TSNodeType.VariableStatement;
  declarations: TSVariableDeclaration[];
}

export interface TSFunctionDeclaration extends TSNode {
  type: TSNodeType.FunctionDeclaration;
  name: TSIdentifier;
  parameters: TSIdentifier[];
  body: TSBlock;
}

export interface TSBlock extends TSNode {
  type: TSNodeType.Block;
  statements: TSNode[];
}

export interface TSExpressionStatement extends TSNode {
  type: TSNodeType.ExpressionStatement;
  expression: TSNode;
}

/** TSRaw allows insertion of raw code. */
export interface TSRaw extends TSNode {
  type: TSNodeType.Raw;
  code: string;
}

/** New export declaration node for structured exports. */
export interface TSExportDeclaration extends TSNode {
  type: TSNodeType.ExportDeclaration;
  exports: { local: string; exported: string }[];
}
