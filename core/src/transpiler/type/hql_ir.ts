// src/transpiler/hql_ir.ts - Updated with explicit enum values

export enum IRNodeType {
  Program = 0,
  StringLiteral = 1,
  NumericLiteral = 2,
  BooleanLiteral = 3,
  NullLiteral = 4,
  Identifier = 5,

  // Expressions
  CallExpression = 6,
  MemberExpression = 7,
  CallMemberExpression = 8,
  NewExpression = 9,
  BinaryExpression = 10,
  UnaryExpression = 11,
  ConditionalExpression = 12,
  ArrayExpression = 13,
  ArrayConsExpression = 14,
  FunctionExpression = 15,
  ObjectExpression = 16,
  ObjectProperty = 17,

  // Statements/Declarations
  VariableDeclaration = 18,
  VariableDeclarator = 19,
  FunctionDeclaration = 20,
  ReturnStatement = 21,
  BlockStatement = 22,

  // Import/Export
  ImportDeclaration = 23,
  ImportSpecifier = 24,
  ExportNamedDeclaration = 25,
  ExportSpecifier = 26,
  ExportVariableDeclaration = 27,

  // JS Interop
  InteropIIFE = 28,

  // Other
  CommentBlock = 29,
  Raw = 30,

  // For representing a JS import reference from (js-import "module")
  JsImportReference = 31,
  AssignmentExpression = 32,
  SpreadAssignment = 33,
  ExpressionStatement = 34,
  FxFunctionDeclaration = 35,
  FnFunctionDeclaration = 36,
  IfStatement = 37,

  ClassDeclaration = 38,
  ClassField = 39,
  ClassMethod = 40,
  ClassConstructor = 41,
  GetAndCall = 42,

  // Enum Types
  EnumDeclaration = 43,
  EnumCase = 44,
  JsMethodAccess = 45
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
  originalName?: string;
  isJS?: boolean;
}

// Expressions
export interface IRCallExpression extends IRNode {
  type: IRNodeType.CallExpression;
  callee: IRIdentifier | IRMemberExpression | IRFunctionExpression;
  arguments: IRNode[];
}

export interface IRAssignmentExpression extends IRNode {
  type: IRNodeType.AssignmentExpression;
  operator: string;
  left: IRNode;
  right: IRNode;
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

// Object literal support (for maps)
export interface IRObjectProperty extends IRNode {
  type: IRNodeType.ObjectProperty;
  key: IRNode;
  value: IRNode;
  computed?: boolean;
}

export interface IRSpreadAssignment extends IRNode {
  type: IRNodeType.SpreadAssignment;
  expression: IRNode;
}

export interface IRExpressionStatement extends IRNode {
  type: IRNodeType.ExpressionStatement;
  expression: IRNode;
}

// Update the ObjectExpression interface:
export interface IRObjectExpression extends IRNode {
  type: IRNodeType.ObjectExpression;
  properties: (IRObjectProperty | IRSpreadAssignment)[];
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
  specifiers: IRImportSpecifier[];
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

// IR node for JS import references
export interface IRJsImportReference extends IRNode {
  type: IRNodeType.JsImportReference;
  name: string;
  source: string;
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

export interface IRImportSpecifier extends IRNode {
  type: IRNodeType.ImportSpecifier;
  imported: IRIdentifier;
  local: IRIdentifier;
}

export interface IRAssignmentExpression extends IRNode {
  type: IRNodeType.AssignmentExpression;
  operator: string;
  left: IRNode;
  right: IRNode;
}

/**
 * IR node for fx function declarations with type information
 */
export interface IRFxFunctionDeclaration extends IRNode {
  type: IRNodeType.FxFunctionDeclaration;
  id: IRIdentifier;
  params: IRIdentifier[];
  defaults: { name: string; value: IRNode }[];
  paramTypes: { name: string; type: string }[];
  returnType: string;
  body: IRBlockStatement;
}

/**
 * IR node for fn function declarations with default values (no types)
 */
export interface IRFnFunctionDeclaration extends IRNode {
  type: IRNodeType.FnFunctionDeclaration;
  id: IRIdentifier;
  params: IRIdentifier[];
  defaults: { name: string; value: IRNode }[];
  body: IRBlockStatement;
}

export interface IRIfStatement extends IRNode {
  type: IRNodeType.IfStatement;
  test: IRNode;
  consequent: IRNode;
  alternate: IRNode | null;
}

export interface IRClassDeclaration extends IRNode {
  type: IRNodeType.ClassDeclaration;
  id: IRIdentifier;
  fields: IRClassField[];
  constructor: IRClassConstructor | null;
  methods: IRClassMethod[];
}

export interface IRClassField extends IRNode {
  type: IRNodeType.ClassField;
  name: string;
  mutable: boolean;
  initialValue: IRNode | null;
}

export interface IRClassMethod extends IRNode {
  type: IRNodeType.ClassMethod;
  name: string;
  params: IRIdentifier[];
  defaults?: { name: string, value: IRNode }[];
  body: IRBlockStatement;
}

export interface IRClassConstructor extends IRNode {
  type: IRNodeType.ClassConstructor;
  params: IRIdentifier[];
  body: IRBlockStatement;
}

export interface IRGetAndCall extends IRNode {
  type: IRNodeType.GetAndCall;
  object: IRNode;
  method: IRStringLiteral;
  arguments: IRNode[];
}

// --- Enum Types (Enhanced definitions) ---

/**
 * Associated value for enum cases with parameters
 * @example (case success: value: Int message: String)
 */
export interface IREnumAssociatedValue {
  name: string;
  type: string;
}

/**
 * Represents an enum declaration: (enum TypeName ...)
 */
export interface IREnumDeclaration extends IRNode {
  type: IRNodeType.EnumDeclaration;
  id: IRIdentifier;
  rawType?: string;
  cases: IREnumCase[];
  hasAssociatedValues?: boolean;
}

/**
 * Represents an enum case declaration
 * 
 * @example (case success)           - Simple case
 * @example (case error 404)         - Case with raw value
 * @example (case data: value: Int)  - Case with associated values
 */
export interface IREnumCase extends IRNode {
  type: IRNodeType.EnumCase;
  id: IRIdentifier;
  rawValue?: IRNode | null;
  associatedValues?: IREnumAssociatedValue[];
  hasAssociatedValues?: boolean;
}

export interface IRJsMethodAccess extends IRNode {
  type: IRNodeType.JsMethodAccess;
  object: IRNode;
  method: string;
}