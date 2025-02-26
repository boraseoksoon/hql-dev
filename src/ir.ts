// src/ir.ts
// Intermediate Representation for HQL compiler

export enum IRNodeType {
    // Program level
    Program,
    ImportDeclaration,
    ExportDeclaration,
    
    // Declarations
    VariableDeclaration,
    FunctionDeclaration,
    EnumDeclaration,
    
    // Expressions
    BinaryExpression,
    CallExpression,
    MemberExpression,
    Identifier,
    
    // Literals
    StringLiteral,
    NumericLiteral,
    BooleanLiteral,
    NullLiteral,
    ArrayLiteral,
    ObjectLiteral,
    
    // Statements
    ReturnStatement,
    ExpressionStatement,
    
    // Other
    Block,
    Parameter,
    Property,
    TypeAnnotation,
    
    // Patterns
    ObjectPattern,
  }

  // Other
export interface IRBlock extends IRNode {
    type: IRNodeType.Block;
    body: IRNode[];
  }
  
  export interface IRParameter extends IRNode {
    type: IRNodeType.Parameter;
    id: IRIdentifier;
    typeAnnotation?: IRTypeAnnotation;
  }
  
  export interface IRProperty extends IRNode {
    type: IRNodeType.Property;
    key: IRNode;
    value: IRNode;
    computed: boolean; // e.g., { prop: value } vs { [expr]: value }
  }
  
  export interface IRTypeAnnotation extends IRNode {
    type: IRNodeType.TypeAnnotation;
    typeName: string;
  }
  
  // Patterns (for destructuring)
  export interface IRObjectPattern extends IRNode {
    type: IRNodeType.ObjectPattern;
    properties: IRProperty[];
  }
  
  export interface SourceLocation {
    start: { line: number; column: number; offset: number; };
    end: { line: number; column: number; offset: number; };
  }
  
  export interface IRNode {
    type: IRNodeType;
    location?: SourceLocation;
  }
  
  // Program level
  export interface IRProgram extends IRNode {
    type: IRNodeType.Program;
    body: IRNode[];
  }
  
  export interface IRImportDeclaration extends IRNode {
    type: IRNodeType.ImportDeclaration;
    source: IRStringLiteral;
    specifiers: IRImportSpecifier[];
    isLocal: boolean;
  }
  
  export interface IRImportSpecifier {
    imported: IRIdentifier | null; // null for default import
    local: IRIdentifier;
  }
  
  export interface IRExportDeclaration extends IRNode {
    type: IRNodeType.ExportDeclaration;
    declaration: IRNode | null; // null for re-export
    specifiers: IRExportSpecifier[];
  }
  
  export interface IRExportSpecifier {
    exported: IRIdentifier;
    local: IRIdentifier;
  }
  
  // Declarations
  export interface IRVariableDeclaration extends IRNode {
    type: IRNodeType.VariableDeclaration;
    id: IRIdentifier;
    init: IRNode;
    kind: 'const' | 'let' | 'var';
  }
  
  export interface IRFunctionDeclaration extends IRNode {
    type: IRNodeType.FunctionDeclaration;
    id: IRIdentifier;
    params: IRParameter[];
    body: IRBlock;
    returnType?: IRTypeAnnotation;
    isAnonymous: boolean;
    isNamedParams: boolean;
  }
  
  export interface IREnumDeclaration extends IRNode {
    type: IRNodeType.EnumDeclaration;
    id: IRIdentifier;
    members: IREnumMember[];
  }
  
  export interface IREnumMember {
    id: IRIdentifier;
    initializer?: IRNode;
  }
  
  // Expressions
  export interface IRBinaryExpression extends IRNode {
    type: IRNodeType.BinaryExpression;
    operator: string; // '+', '-', '*', '/', etc.
    left: IRNode;
    right: IRNode;
  }
  
  export interface IRCallExpression extends IRNode {
    type: IRNodeType.CallExpression;
    callee: IRNode;
    arguments: IRNode[];
    isNamedArgs: boolean;
  }
  
  export interface IRMemberExpression extends IRNode {
    type: IRNodeType.MemberExpression;
    object: IRNode;
    property: IRNode;
    computed: boolean; // e.g., obj.prop vs obj["prop"]
  }
  
  export interface IRIdentifier extends IRNode {
    type: IRNodeType.Identifier;
    name: string;
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
  
  export interface IRArrayLiteral extends IRNode {
    type: IRNodeType.ArrayLiteral;
    elements: IRNode[];
  }
  
  export interface IRObjectLiteral extends IRNode {
    type: IRNodeType.ObjectLiteral;
    properties: IRProperty[];
  }
  
  // Statements
  export interface IRReturnStatement extends IRNode {
    type: IRNodeType.ReturnStatement;
    argument: IRNode;
  }
  
  export interface IRExpressionStatement extends IRNode {
    type: IRNodeType.ExpressionStatement;
    expression: IRNode;
  }
  
  // Other
  export interface IRBlock extends IRNode {
    type: IRNodeType.Block;
    body: IRNode[];
  }
  
  export interface IRParameter extends IRNode {
    type: IRNodeType.Parameter;
    id: IRIdentifier;
    typeAnnotation?: IRTypeAnnotation;
  }
  
  export interface IRProperty extends IRNode {
    type: IRNodeType.Property;
    key: IRNode;
    value: IRNode;
    computed: boolean; // e.g., { prop: value } vs { [expr]: value }
  }
  
  export interface IRTypeAnnotation extends IRNode {
    type: IRNodeType.TypeAnnotation;
    typeName: string;
  }
  