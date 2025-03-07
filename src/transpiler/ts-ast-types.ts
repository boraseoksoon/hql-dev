// src/transpiler/ts-ast-types.ts

export enum TSNodeType {
  SourceFile = "SourceFile",
  Identifier = "Identifier",
  StringLiteral = "StringLiteral",
  NumericLiteral = "NumericLiteral",
  Raw = "Raw",
  ExportDeclaration = "ExportDeclaration"
}

export interface TSNode {
  type: TSNodeType;
  text?: string;
  code?: string;
}

export interface TSSourceFile extends TSNode {
  type: TSNodeType.SourceFile;
  statements: TSNode[];
}

export interface TSRaw extends TSNode {
  type: TSNodeType.Raw;
  code: string;
}

export interface TSExportDeclaration extends TSNode {
  type: TSNodeType.ExportDeclaration;
  exports: { local: string; exported: string }[];
}
