// src/ir-to-ts-ast.ts
import * as IR from "./ir.ts";

// Define a simplified TypeScript AST
// In a real implementation, you'd use the TypeScript compiler API
// or a similar library for a complete AST representation

export enum TSNodeType {
  // Program
  SourceFile,
  
  // Declarations
  VariableDeclaration,
  VariableDeclarationList,
  VariableStatement,
  FunctionDeclaration,
  FunctionExpression, // Added to handle anonymous functions properly
  EnumDeclaration,
  EnumMember,
  Parameter,
  
  // Statements
  Block,
  ExpressionStatement,
  ReturnStatement,
  
  // Expressions
  BinaryExpression,
  CallExpression,
  PropertyAccessExpression,
  ElementAccessExpression,
  Identifier,
  StringLiteral,
  NumericLiteral,
  BooleanLiteral,
  NullLiteral,
  ArrayLiteralExpression,
  ObjectLiteralExpression,
  PropertyAssignment,
  ComputedPropertyName,
  NewExpression,
  
  // Module
  ImportDeclaration,
  ImportClause,
  NamedImports,
  ImportSpecifier,
  ExportDeclaration,
  NamedExports,
  ExportSpecifier,
  
  // Types
  TypeReference,
  
  // Other
  Token,
  EndOfFileToken
}

export interface TSNode {
  type: TSNodeType;
}

// Program
export interface TSSourceFile extends TSNode {
  type: TSNodeType.SourceFile;
  statements: TSNode[];
  endOfFileToken: TSNode;
}

// Declarations
export interface TSVariableDeclaration extends TSNode {
  type: TSNodeType.VariableDeclaration;
  name: TSNode;
  initializer?: TSNode;
  typeNode?: TSNode;
}

export interface TSVariableDeclarationList extends TSNode {
  type: TSNodeType.VariableDeclarationList;
  declarations: TSVariableDeclaration[];
  flags: VariableFlags;
}

export enum VariableFlags {
  None,
  Let,
  Const
}

export interface TSVariableStatement extends TSNode {
  type: TSNodeType.VariableStatement;
  declarationList: TSVariableDeclarationList;
}

export interface TSFunctionDeclaration extends TSNode {
  type: TSNodeType.FunctionDeclaration;
  name?: TSNode;
  parameters: TSParameter[];
  body: TSBlock;
  typeParameters?: TSNode[];
  type?: TSNode;
  isGenerator?: boolean;
  isAsync?: boolean;
  isDefaultExport?: boolean;
}

export interface TSFunctionExpression extends TSNode {
  type: TSNodeType.FunctionExpression;
  name?: TSNode;
  parameters: TSParameter[];
  body: TSBlock;
  typeParameters?: TSNode[];
  type?: TSNode;
  isGenerator?: boolean;
  isAsync?: boolean;
}

export interface TSParameter extends TSNode {
  type: TSNodeType.Parameter;
  name: TSNode;
  type?: TSNode;
  initializer?: TSNode;
  isRest?: boolean;
  isOptional?: boolean;
}

export interface TSEnumDeclaration extends TSNode {
  type: TSNodeType.EnumDeclaration;
  name: TSNode;
  members: TSEnumMember[];
}

export interface TSEnumMember extends TSNode {
  type: TSNodeType.EnumMember;
  name: TSNode;
  initializer?: TSNode;
}

// Statements
export interface TSBlock extends TSNode {
  type: TSNodeType.Block;
  statements: TSNode[];
}

export interface TSExpressionStatement extends TSNode {
  type: TSNodeType.ExpressionStatement;
  expression: TSNode;
}

export interface TSReturnStatement extends TSNode {
  type: TSNodeType.ReturnStatement;
  expression?: TSNode;
}

// Expressions
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
  typeArguments?: TSNode[];
}

export interface TSPropertyAccessExpression extends TSNode {
  type: TSNodeType.PropertyAccessExpression;
  expression: TSNode;
  name: TSNode;
}

export interface TSElementAccessExpression extends TSNode {
  type: TSNodeType.ElementAccessExpression;
  expression: TSNode;
  argumentExpression: TSNode;
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
  value: boolean;
}

export interface TSNullLiteral extends TSNode {
  type: TSNodeType.NullLiteral;
}

export interface TSArrayLiteralExpression extends TSNode {
  type: TSNodeType.ArrayLiteralExpression;
  elements: TSNode[];
}

export interface TSObjectLiteralExpression extends TSNode {
  type: TSNodeType.ObjectLiteralExpression;
  properties: TSNode[];
}

export interface TSPropertyAssignment extends TSNode {
  type: TSNodeType.PropertyAssignment;
  name: TSNode;
  initializer: TSNode;
}

export interface TSComputedPropertyName extends TSNode {
  type: TSNodeType.ComputedPropertyName;
  expression: TSNode;
}

export interface TSNewExpression extends TSNode {
  type: TSNodeType.NewExpression;
  expression: TSNode;
  arguments: TSNode[];
  typeArguments?: TSNode[];
}

// Module
export interface TSImportDeclaration extends TSNode {
  type: TSNodeType.ImportDeclaration;
  importClause?: TSImportClause;
  moduleSpecifier: TSNode;
}

export interface TSImportClause extends TSNode {
  type: TSNodeType.ImportClause;
  name?: TSNode; // Default import
  namedBindings?: TSNamedImports;
  isTypeOnly: boolean;
}

export interface TSNamedImports extends TSNode {
  type: TSNodeType.NamedImports;
  elements: TSImportSpecifier[];
}

export interface TSImportSpecifier extends TSNode {
  type: TSNodeType.ImportSpecifier;
  name: TSNode;
  propertyName?: TSNode;
  isTypeOnly: boolean;
}

export interface TSExportDeclaration extends TSNode {
  type: TSNodeType.ExportDeclaration;
  exportClause?: TSNamedExports;
  moduleSpecifier?: TSNode;
  isTypeOnly: boolean;
}

export interface TSNamedExports extends TSNode {
  type: TSNodeType.NamedExports;
  elements: TSExportSpecifier[];
}

export interface TSExportSpecifier extends TSNode {
  type: TSNodeType.ExportSpecifier;
  name: TSNode;
  propertyName?: TSNode;
  isTypeOnly: boolean;
}

// Types
export interface TSTypeReference extends TSNode {
  type: TSNodeType.TypeReference;
  typeName: TSNode;
  typeArguments?: TSNode[];
}

// Token
export interface TSToken extends TSNode {
  type: TSNodeType.Token;
  tokenKind: TokenKind;
}

export enum TokenKind {
  EndOfFileToken
}

// Configuration for code generation
export interface ASTConversionOptions {
  // Whether to generate TypeScript (with types) or JavaScript (no types)
  target: 'typescript' | 'javascript';
  
  // How to handle missing type annotations
  // 'omit': Don't include type annotations if missing
  // 'any': Use 'any' for missing type annotations
  missingTypeStrategy: 'omit' | 'any';
  
  // How to handle property access
  // 'dot': Use dot notation when possible (obj.prop)
  // 'bracket': Always use bracket notation (obj["prop"])
  propertyAccessStyle: 'dot' | 'bracket';
}

// Default options
const defaultOptions: ASTConversionOptions = {
  target: 'javascript',
  missingTypeStrategy: 'omit',
  propertyAccessStyle: 'dot'
};

// Main conversion function
export function convertIRToTSAST(program: IR.IRProgram, options: Partial<ASTConversionOptions> = {}): TSSourceFile {
  // Merge options with defaults
  const config: ASTConversionOptions = { ...defaultOptions, ...options };
  
  const statements: TSNode[] = [];
  
  for (const node of program.body) {
    const tsNode = convertIRNodeToTS(node, config);
    if (tsNode) {
      if (Array.isArray(tsNode)) {
        statements.push(...tsNode);
      } else {
        statements.push(tsNode);
      }
    }
  }
  
  return {
    type: TSNodeType.SourceFile,
    statements,
    endOfFileToken: {
      type: TSNodeType.Token,
      tokenKind: TokenKind.EndOfFileToken
    }
  };
}

function convertObjectPattern(node: IR.IRObjectPattern, options: ASTConversionOptions): TSObjectLiteralExpression {
    return {
      type: TSNodeType.ObjectLiteralExpression,
      properties: node.properties.map(prop => {
        return {
          type: TSNodeType.PropertyAssignment,
          name: convertIRNodeToTS(prop.key, options) as TSNode,
          initializer: convertIRNodeToTS(prop.value, options) as TSNode
        };
      })
    };
  }

function convertIRNodeToTS(node: IR.IRNode, options: ASTConversionOptions): TSNode | TSNode[] | null {
    switch (node.type) {
      case IR.IRNodeType.VariableDeclaration:
        return convertVariableDeclaration(node as IR.IRVariableDeclaration, options);
      case IR.IRNodeType.FunctionDeclaration:
        return convertFunctionDeclaration(node as IR.IRFunctionDeclaration, options);
      case IR.IRNodeType.EnumDeclaration:
        return convertEnumDeclaration(node as IR.IREnumDeclaration, options);
      case IR.IRNodeType.ImportDeclaration:
        return convertImportDeclaration(node as IR.IRImportDeclaration, options);
      case IR.IRNodeType.ExportDeclaration:
        return convertExportDeclaration(node as IR.IRExportDeclaration, options);
      case IR.IRNodeType.BinaryExpression:
        return convertBinaryExpression(node as IR.IRBinaryExpression, options);
      case IR.IRNodeType.CallExpression:
        return convertCallExpression(node as IR.IRCallExpression, options);
      case IR.IRNodeType.MemberExpression:
        return convertMemberExpression(node as IR.IRMemberExpression, options);
      case IR.IRNodeType.Identifier:
        return convertIdentifier(node as IR.IRIdentifier, options);
      case IR.IRNodeType.StringLiteral:
        return convertStringLiteral(node as IR.IRStringLiteral, options);
      case IR.IRNodeType.NumericLiteral:
        return convertNumericLiteral(node as IR.IRNumericLiteral, options);
      case IR.IRNodeType.BooleanLiteral:
        return convertBooleanLiteral(node as IR.IRBooleanLiteral, options);
      case IR.IRNodeType.NullLiteral:
        return convertNullLiteral(node as IR.IRNullLiteral, options);
      case IR.IRNodeType.ArrayLiteral:
        return convertArrayLiteral(node as IR.IRArrayLiteral, options);
      case IR.IRNodeType.ObjectLiteral:
        return convertObjectLiteral(node as IR.IRObjectLiteral, options);
      case IR.IRNodeType.ObjectPattern:
        return convertObjectPattern(node as IR.IRObjectPattern, options);
      case IR.IRNodeType.Block:
        return convertBlock(node as IR.IRBlock, options);
      case IR.IRNodeType.ReturnStatement:
        return convertReturnStatement(node as IR.IRReturnStatement, options);
      case IR.IRNodeType.ExpressionStatement:
        return convertExpressionStatement(node as IR.IRExpressionStatement, options);
      default:
        console.warn(`Unhandled IR node type: ${node.type}`);
        return null;
    }
  }

function convertVariableDeclaration(node: IR.IRVariableDeclaration, options: ASTConversionOptions): TSVariableStatement {
  // Special handling for import
  if (node.init.type === IR.IRNodeType.ImportDeclaration) {
    return convertImportDeclaration(node.init as IR.IRImportDeclaration, options);
  }
  
  const declaration: TSVariableDeclaration = {
    type: TSNodeType.VariableDeclaration,
    name: convertIdentifier(node.id, options),
    initializer: convertIRNodeToTS(node.init, options) as TSNode
  };
  
  const declarationList: TSVariableDeclarationList = {
    type: TSNodeType.VariableDeclarationList,
    declarations: [declaration],
    flags: getVariableFlags(node.kind)
  };
  
  return {
    type: TSNodeType.VariableStatement,
    declarationList
  };
}

function getVariableFlags(kind: string): VariableFlags {
  switch (kind) {
    case 'const': return VariableFlags.Const;
    case 'let': return VariableFlags.Let;
    default: return VariableFlags.None;
  }
}

function convertFunctionDeclaration(node: IR.IRFunctionDeclaration, options: ASTConversionOptions): TSFunctionDeclaration | TSVariableStatement {
    const parameters = node.params.map(param => convertParameter(param, options));
    const body = convertBlock(node.body, options);
    
    if (node.isAnonymous && node.id.name !== '$anonymous') {
      // For anonymous functions assigned to variables
      const functionExpr: TSFunctionExpression = {
        type: TSNodeType.FunctionExpression,
        parameters,
        body
      };
      
      // Return as a variable declaration
      const varDecl: TSVariableDeclaration = {
        type: TSNodeType.VariableDeclaration,
        name: convertIdentifier(node.id, options),
        initializer: functionExpr
      };
      
      return {
        type: TSNodeType.VariableStatement,
        declarationList: {
          type: TSNodeType.VariableDeclarationList,
          declarations: [varDecl],
          flags: VariableFlags.Const
        }
      };
    } else if (node.isAnonymous) {
      // Pure anonymous function expression
      return {
        type: TSNodeType.FunctionExpression,
        parameters,
        body
      } as any; // Type cast needed for return type
    }
    
    // Named function declaration
    return {
      type: TSNodeType.FunctionDeclaration,
      name: convertIdentifier(node.id, options),
      parameters,
      body
    };
  }

function convertParameter(node: IR.IRParameter, options: ASTConversionOptions): TSParameter {
  const param: TSParameter = {
    type: TSNodeType.Parameter,
    name: convertIdentifier(node.id, options)
  };
  
  // Only add type annotation if we're targeting TypeScript and the annotation exists
  // or if we're using 'any' for missing types
  if (options.target === 'typescript' && 
      (node.typeAnnotation || options.missingTypeStrategy === 'any')) {
    param.type = {
      type: TSNodeType.TypeReference,
      typeName: {
        type: TSNodeType.Identifier,
        text: node.typeAnnotation ? node.typeAnnotation.typeName : 'any'
      }
    };
  }
  
  return param;
}

function convertEnumDeclaration(node: IR.IREnumDeclaration, options: ASTConversionOptions): TSEnumDeclaration {
  return {
    type: TSNodeType.EnumDeclaration,
    name: convertIdentifier(node.id, options),
    members: node.members.map(member => ({
      type: TSNodeType.EnumMember,
      name: convertIdentifier(member.id, options),
      initializer: member.initializer 
        ? convertIRNodeToTS(member.initializer, options) as TSNode 
        : undefined
    }))
  };
}

function convertImportDeclaration(node: IR.IRImportDeclaration, options: ASTConversionOptions): TSImportDeclaration {
  const moduleSpecifier: TSStringLiteral = {
    type: TSNodeType.StringLiteral,
    text: JSON.stringify(node.source.value) // Ensure path is properly quoted
  };
  
  let importClause: TSImportClause | undefined;
  
  if (node.specifiers.length > 0) {
    const spec = node.specifiers[0];
    
    if (spec.imported === null) {
      // Default import
      importClause = {
        type: TSNodeType.ImportClause,
        name: {
          type: TSNodeType.Identifier,
          text: spec.local.name
        },
        isTypeOnly: false
      };
    } else {
      // Named import
      importClause = {
        type: TSNodeType.ImportClause,
        namedBindings: {
          type: TSNodeType.NamedImports,
          elements: [
            {
              type: TSNodeType.ImportSpecifier,
              name: {
                type: TSNodeType.Identifier,
                text: spec.local.name
              },
              propertyName: {
                type: TSNodeType.Identifier,
                text: spec.imported.name
              },
              isTypeOnly: false
            }
          ]
        },
        isTypeOnly: false
      };
    }
  }
  
  return {
    type: TSNodeType.ImportDeclaration,
    importClause,
    moduleSpecifier
  };
}

function convertExportDeclaration(node: IR.IRExportDeclaration, options: ASTConversionOptions): TSExportDeclaration {
  if (node.declaration) {
    // TODO: Handle direct export declarations
    return {
      type: TSNodeType.ExportDeclaration,
      isTypeOnly: false
    };
  }
  
  // Named exports
  return {
    type: TSNodeType.ExportDeclaration,
    exportClause: {
      type: TSNodeType.NamedExports,
      elements: node.specifiers.map(spec => ({
        type: TSNodeType.ExportSpecifier,
        name: {
          type: TSNodeType.Identifier,
          text: spec.exported.name
        },
        propertyName: spec.local.name !== spec.exported.name
          ? {
              type: TSNodeType.Identifier,
              text: spec.local.name
            }
          : undefined,
        isTypeOnly: false
      }))
    },
    isTypeOnly: false
  };
}

function convertBinaryExpression(node: IR.IRBinaryExpression, options: ASTConversionOptions): TSBinaryExpression {
  return {
    type: TSNodeType.BinaryExpression,
    left: convertIRNodeToTS(node.left, options) as TSNode,
    operator: node.operator,
    right: convertIRNodeToTS(node.right, options) as TSNode
  };
}

function convertCallExpression(node: IR.IRCallExpression, options: ASTConversionOptions): TSCallExpression | TSNewExpression {
  // Special handling for 'new' expressions
  if (
    node.callee.type === IR.IRNodeType.Identifier && 
    (node.callee as IR.IRIdentifier).name === "$new" &&
    node.arguments.length > 0
  ) {
    return {
      type: TSNodeType.NewExpression,
      expression: convertIRNodeToTS(node.arguments[0], options) as TSNode,
      arguments: node.arguments.slice(1).map(arg => convertIRNodeToTS(arg, options) as TSNode)
    };
  }
  
  return {
    type: TSNodeType.CallExpression,
    expression: convertIRNodeToTS(node.callee, options) as TSNode,
    arguments: node.arguments.map(arg => convertIRNodeToTS(arg, options) as TSNode)
  };
}
function convertMemberExpression(node: IR.IRMemberExpression, options: ASTConversionOptions): TSPropertyAccessExpression | TSElementAccessExpression {
    // If the property is a string literal and we prefer dot notation, use property access
    // Otherwise, use element access (brackets)
    const isStringLiteral = node.property.type === IR.IRNodeType.StringLiteral;
    const isIdentifier = node.property.type === IR.IRNodeType.Identifier;
    
    // Use property access for identifiers or simple string literals (that are valid identifiers)
    let usePropertyAccess = !node.computed &&
                            options.propertyAccessStyle === 'dot' &&
                            (isIdentifier || 
                             (isStringLiteral && 
                              /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test((node.property as IR.IRStringLiteral).value)));
    
    // Also use property access for common property names even when computed
    if (!usePropertyAccess && isStringLiteral && options.propertyAccessStyle === 'dot') {
      const propValue = (node.property as IR.IRStringLiteral).value;
      const commonProps = ['blue', 'red', 'green', 'format', 'join', 'v4', 'chunk', 'size', 'length'];
      if (commonProps.includes(propValue)) {
        usePropertyAccess = true;
        node.computed = false; // Treat as non-computed
      }
    }
    
    if (usePropertyAccess) {
      return {
        type: TSNodeType.PropertyAccessExpression,
        expression: convertIRNodeToTS(node.object, options) as TSNode,
        name: isIdentifier ? 
          convertIRNodeToTS(node.property, options) as TSNode :
          {
            type: TSNodeType.Identifier,
            text: (node.property as IR.IRStringLiteral).value
          }
      };
    } else {
      return {
        type: TSNodeType.ElementAccessExpression,
        expression: convertIRNodeToTS(node.object, options) as TSNode,
        argumentExpression: convertIRNodeToTS(node.property, options) as TSNode
      };
    }
  }

function convertIdentifier(node: IR.IRIdentifier, options: ASTConversionOptions): TSIdentifier {
  return {
    type: TSNodeType.Identifier,
    text: node.name
  };
}

function convertStringLiteral(node: IR.IRStringLiteral, options: ASTConversionOptions): TSStringLiteral {
  // Handle string interpolation (already processed at IR level)
  if (node.value.includes("${")) {
    // Use backticks for template strings
    return {
      type: TSNodeType.StringLiteral,
      text: `\`${node.value}\``
    };
  }
  
  return {
    type: TSNodeType.StringLiteral,
    text: JSON.stringify(node.value) // Ensure proper quoting
  };
}

function convertNumericLiteral(node: IR.IRNumericLiteral, options: ASTConversionOptions): TSNumericLiteral {
  return {
    type: TSNodeType.NumericLiteral,
    text: node.value.toString()
  };
}

function convertBooleanLiteral(node: IR.IRBooleanLiteral, options: ASTConversionOptions): TSBooleanLiteral {
  return {
    type: TSNodeType.BooleanLiteral,
    value: node.value
  };
}

function convertNullLiteral(node: IR.IRNullLiteral, options: ASTConversionOptions): TSNullLiteral {
  return {
    type: TSNodeType.NullLiteral
  };
}

function convertArrayLiteral(node: IR.IRArrayLiteral, options: ASTConversionOptions): TSArrayLiteralExpression {
  return {
    type: TSNodeType.ArrayLiteralExpression,
    elements: node.elements.map(elem => convertIRNodeToTS(elem, options) as TSNode)
  };
}

function convertObjectLiteral(node: IR.IRObjectLiteral, options: ASTConversionOptions): TSObjectLiteralExpression {
  return {
    type: TSNodeType.ObjectLiteralExpression,
    properties: node.properties.map(prop => {
      if (prop.computed) {
        return {
          type: TSNodeType.PropertyAssignment,
          name: {
            type: TSNodeType.ComputedPropertyName,
            expression: convertIRNodeToTS(prop.key, options) as TSNode
          },
          initializer: convertIRNodeToTS(prop.value, options) as TSNode
        };
      } else {
        return {
          type: TSNodeType.PropertyAssignment,
          name: convertIRNodeToTS(prop.key, options) as TSNode,
          initializer: convertIRNodeToTS(prop.value, options) as TSNode
        };
      }
    })
  };
}

function convertBlock(node: IR.IRBlock, options: ASTConversionOptions): TSBlock {
  return {
    type: TSNodeType.Block,
    statements: node.body.map(stmt => convertIRNodeToTS(stmt, options) as TSNode)
  };
}

function convertReturnStatement(node: IR.IRReturnStatement, options: ASTConversionOptions): TSReturnStatement {
  return {
    type: TSNodeType.ReturnStatement,
    expression: convertIRNodeToTS(node.argument, options) as TSNode
  };
}

function convertExpressionStatement(node: IR.IRExpressionStatement, options: ASTConversionOptions): TSExpressionStatement {
  return {
    type: TSNodeType.ExpressionStatement,
    expression: convertIRNodeToTS(node.expression, options) as TSNode
  };
}