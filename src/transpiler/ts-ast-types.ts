// src/transpiler/ts-ast-types.ts

export enum TSNodeType {
  SourceFile = "SourceFile",
  StringLiteral = "StringLiteral",
  NumericLiteral = "NumericLiteral",
  BooleanLiteral = "BooleanLiteral",
  NullLiteral = "NullLiteral",
  Identifier = "Identifier",
  BinaryExpression = "BinaryExpression",
  UnaryExpression = "UnaryExpression",
  CallExpression = "CallExpression",
  MemberExpression = "MemberExpression",
  NewExpression = "NewExpression",
  ConditionalExpression = "ConditionalExpression",
  ArrayExpression = "ArrayExpression",
  ArrayConsExpression = "ArrayConsExpression",
  FunctionExpression = "FunctionExpression",
  ArrowFunctionExpression = "ArrowFunctionExpression",
  ExpressionStatement = "ExpressionStatement",
  BlockStatement = "BlockStatement",
  ReturnStatement = "ReturnStatement",
  IfStatement = "IfStatement",
  VariableDeclaration = "VariableDeclaration",
  VariableDeclarator = "VariableDeclarator",
  FunctionDeclaration = "FunctionDeclaration",
  ImportDeclaration = "ImportDeclaration",
  ExportNamedDeclaration = "ExportNamedDeclaration",
  ExportSpecifier = "ExportSpecifier",
  NamedExport = "NamedExport",
  InteropIIFE = "InteropIIFE",
  CommentBlock = "CommentBlock",
  Raw = "Raw"
}

export interface TSNode {
  type: TSNodeType;
}

export interface TSExpression extends TSNode {}
export interface TSStatement extends TSNode {}
export interface TSDeclaration extends TSStatement {}

export interface TSSourceFile extends TSNode {
  type: TSNodeType.SourceFile;
  statements: TSNode[];
}

export interface TSStringLiteral extends TSExpression {
  type: TSNodeType.StringLiteral;
  value: string;
}

export interface TSNumericLiteral extends TSExpression {
  type: TSNodeType.NumericLiteral;
  value: number;
}

export interface TSBooleanLiteral extends TSExpression {
  type: TSNodeType.BooleanLiteral;
  value: boolean;
}

export interface TSNullLiteral extends TSExpression {
  type: TSNodeType.NullLiteral;
}

export interface TSIdentifier extends TSExpression {
  type: TSNodeType.Identifier;
  name: string;
}

export interface TSBinaryExpression extends TSExpression {
  type: TSNodeType.BinaryExpression;
  operator: string;
  left: TSExpression;
  right: TSExpression;
}

export interface TSUnaryExpression extends TSExpression {
  type: TSNodeType.UnaryExpression;
  operator: string;
  argument: TSExpression;
}

export interface TSCallExpression extends TSExpression {
  type: TSNodeType.CallExpression;
  callee: TSExpression;
  arguments: TSExpression[];
}

export interface TSMemberExpression extends TSExpression {
  type: TSNodeType.MemberExpression;
  object: TSExpression;
  property: TSExpression;
  computed: boolean;
}

export interface TSNewExpression extends TSExpression {
  type: TSNodeType.NewExpression;
  callee: TSExpression;
  arguments: TSExpression[];
}

export interface TSConditionalExpression extends TSExpression {
  type: TSNodeType.ConditionalExpression;
  test: TSExpression;
  consequent: TSExpression;
  alternate: TSExpression;
}

export interface TSArrayExpression extends TSExpression {
  type: TSNodeType.ArrayExpression;
  elements: TSExpression[];
}

export interface TSArrayConsExpression extends TSExpression {
  type: TSNodeType.ArrayConsExpression;
  item: TSExpression;
  array: TSExpression;
}

export interface TSFunctionExpression extends TSExpression {
  type: TSNodeType.FunctionExpression;
  id: TSIdentifier | null;
  params: TSIdentifier[];
  body: TSBlockStatement;
}

export interface TSArrowFunctionExpression extends TSExpression {
  type: TSNodeType.ArrowFunctionExpression;
  params: TSIdentifier[];
  body: TSBlockStatement | TSExpression;
  expression: boolean;
}

export interface TSExpressionStatement extends TSStatement {
  type: TSNodeType.ExpressionStatement;
  expression: TSExpression;
}

export interface TSBlockStatement extends TSStatement {
  type: TSNodeType.BlockStatement;
  body: TSStatement[];
}

export interface TSReturnStatement extends TSStatement {
  type: TSNodeType.ReturnStatement;
  argument: TSExpression | null;
}

export interface TSIfStatement extends TSStatement {
  type: TSNodeType.IfStatement;
  test: TSExpression;
  consequent: TSStatement;
  alternate: TSStatement | null;
}

export interface TSVariableDeclaration extends TSDeclaration {
  type: TSNodeType.VariableDeclaration;
  kind: "const" | "let" | "var";
  declarations: TSVariableDeclarator[];
}

export interface TSVariableDeclarator extends TSNode {
  type: TSNodeType.VariableDeclarator;
  id: TSIdentifier;
  init: TSExpression | null;
}

export interface TSFunctionDeclaration extends TSDeclaration {
  type: TSNodeType.FunctionDeclaration;
  id: TSIdentifier;
  params: TSIdentifier[];
  body: TSBlockStatement;
}

export interface TSImportDeclaration extends TSDeclaration {
  type: TSNodeType.ImportDeclaration;
  source: string;
  moduleName: string;
  defaultVarName?: string;
}

export interface TSExportNamedDeclaration extends TSDeclaration {
  type: TSNodeType.ExportNamedDeclaration;
  specifiers: TSExportSpecifier[];
}

export interface TSExportSpecifier extends TSNode {
  type: TSNodeType.ExportSpecifier;
  local: TSIdentifier;
  exported: TSIdentifier;
}

export interface TSNamedExport extends TSDeclaration {
  type: TSNodeType.NamedExport;
  variableDeclaration: TSVariableDeclaration;
  exportName: string;
}

export interface TSInteropIIFE extends TSExpression {
  type: TSNodeType.InteropIIFE;
  object: TSExpression;
  property: TSStringLiteral;
}

export interface TSCommentBlock extends TSNode {
  type: TSNodeType.CommentBlock;
  value: string;
}

export interface TSRaw extends TSNode {
  type: TSNodeType.Raw;
  code: string;
}
