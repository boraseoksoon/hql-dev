// src/transpiler/ir-to-ts-ast.ts - Convert IR to TypeScript AST

import * as IR from "./hql_ir.ts";
import * as TS from "./ts-ast-types.ts";

/**
 * Convert an IR program to a TypeScript AST.
 */
export function convertIRToTSAST(program: IR.IRProgram): TS.TSSourceFile {
  const statements: TS.TSNode[] = [];
  
  for (const node of program.body) {
    const tsNode = convertNode(node);
    if (tsNode) {
      if (Array.isArray(tsNode)) {
        statements.push(...tsNode);
      } else {
        statements.push(tsNode);
      }
    }
  }
  
  return { type: TS.TSNodeType.SourceFile, statements };
}

/**
 * Convert an IR node to a TypeScript AST node.
 */
function convertNode(node: IR.IRNode): TS.TSNode | TS.TSNode[] | null {
  switch (node.type) {
    // Literals
    case IR.IRNodeType.StringLiteral:
      return convertStringLiteral(node as IR.IRStringLiteral);
      
    case IR.IRNodeType.NumericLiteral:
      return convertNumericLiteral(node as IR.IRNumericLiteral);
      
    case IR.IRNodeType.BooleanLiteral:
      return convertBooleanLiteral(node as IR.IRBooleanLiteral);
      
    case IR.IRNodeType.NullLiteral:
      return convertNullLiteral(node as IR.IRNullLiteral);
      
    // Identifiers
    case IR.IRNodeType.Identifier:
      return convertIdentifier(node as IR.IRIdentifier);
      
    // Expressions
    case IR.IRNodeType.CallExpression:
      return convertCallExpression(node as IR.IRCallExpression);
      
    case IR.IRNodeType.MemberExpression:
      return convertMemberExpression(node as IR.IRMemberExpression);
      
    case IR.IRNodeType.CallMemberExpression:
      return convertCallMemberExpression(node as IR.IRCallMemberExpression);
      
    case IR.IRNodeType.NewExpression:
      return convertNewExpression(node as IR.IRNewExpression);
      
    case IR.IRNodeType.BinaryExpression:
      return convertBinaryExpression(node as IR.IRBinaryExpression);
      
    case IR.IRNodeType.UnaryExpression:
      return convertUnaryExpression(node as IR.IRUnaryExpression);
      
    case IR.IRNodeType.ConditionalExpression:
      return convertConditionalExpression(node as IR.IRConditionalExpression);
      
    case IR.IRNodeType.ArrayExpression:
      return convertArrayExpression(node as IR.IRArrayExpression);
      
    case IR.IRNodeType.ArrayConsExpression:
      return convertArrayConsExpression(node as IR.IRArrayConsExpression);
      
    case IR.IRNodeType.FunctionExpression:
      return convertFunctionExpression(node as IR.IRFunctionExpression);
      
    // Statements/Declarations
    case IR.IRNodeType.VariableDeclaration:
      return convertVariableDeclaration(node as IR.IRVariableDeclaration);
      
    case IR.IRNodeType.FunctionDeclaration:
      return convertFunctionDeclaration(node as IR.IRFunctionDeclaration);
      
    case IR.IRNodeType.ReturnStatement:
      return convertReturnStatement(node as IR.IRReturnStatement);
      
    case IR.IRNodeType.BlockStatement:
      return convertBlockStatement(node as IR.IRBlockStatement);
      
    // Import/Export
    case IR.IRNodeType.ImportDeclaration:
      return convertImportDeclaration(node as IR.IRImportDeclaration);
      
    case IR.IRNodeType.ExportNamedDeclaration:
      return convertExportNamedDeclaration(node as IR.IRExportNamedDeclaration);
      
    case IR.IRNodeType.ExportVariableDeclaration:
      return convertExportVariableDeclaration(node as IR.IRExportVariableDeclaration);
      
    // JS Interop
    case IR.IRNodeType.InteropIIFE:
      return convertInteropIIFE(node as IR.IRInteropIIFE);
      
    // Other
    case IR.IRNodeType.CommentBlock:
      return convertCommentBlock(node as IR.IRCommentBlock);
      
    case IR.IRNodeType.Raw:
      return convertRaw(node as IR.IRRaw);
      
    default:
      console.warn(`Unknown IR node type: ${(node as any).type}`);
      return null;
  }
}

// Convert literals
function convertStringLiteral(node: IR.IRStringLiteral): TS.TSStringLiteral {
  return {
    type: TS.TSNodeType.StringLiteral,
    value: node.value
  };
}

function convertNumericLiteral(node: IR.IRNumericLiteral): TS.TSNumericLiteral {
  return {
    type: TS.TSNodeType.NumericLiteral,
    value: node.value
  };
}

function convertBooleanLiteral(node: IR.IRBooleanLiteral): TS.TSBooleanLiteral {
  return {
    type: TS.TSNodeType.BooleanLiteral,
    value: node.value
  };
}

function convertNullLiteral(node: IR.IRNullLiteral): TS.TSNullLiteral {
  return {
    type: TS.TSNodeType.NullLiteral
  };
}

// Convert identifier
function convertIdentifier(node: IR.IRIdentifier): TS.TSIdentifier {
  return {
    type: TS.TSNodeType.Identifier,
    name: node.name
  };
}

// Convert expressions
function convertCallExpression(node: IR.IRCallExpression): TS.TSCallExpression {
  return {
    type: TS.TSNodeType.CallExpression,
    callee: convertNode(node.callee) as TS.TSExpression,
    arguments: node.arguments.map(arg => convertNode(arg) as TS.TSExpression)
  };
}

function convertMemberExpression(node: IR.IRMemberExpression): TS.TSMemberExpression {
  return {
    type: TS.TSNodeType.MemberExpression,
    object: convertNode(node.object) as TS.TSExpression,
    property: convertNode(node.property) as TS.TSExpression,
    computed: node.computed
  };
}

function convertCallMemberExpression(node: IR.IRCallMemberExpression): TS.TSCallExpression {
  // Create a member expression for obj[prop] or obj.prop
  const memberExpr: TS.TSMemberExpression = {
    type: TS.TSNodeType.MemberExpression,
    object: convertNode(node.object) as TS.TSExpression,
    property: convertNode(node.property) as TS.TSExpression,
    computed: true
  };
  
  // Create a call expression for obj[prop](...args) or obj.prop(...args)
  return {
    type: TS.TSNodeType.CallExpression,
    callee: memberExpr,
    arguments: node.arguments.map(arg => convertNode(arg) as TS.TSExpression)
  };
}

function convertNewExpression(node: IR.IRNewExpression): TS.TSNewExpression {
  return {
    type: TS.TSNodeType.NewExpression,
    callee: convertNode(node.callee) as TS.TSExpression,
    arguments: node.arguments.map(arg => convertNode(arg) as TS.TSExpression)
  };
}

function convertBinaryExpression(node: IR.IRBinaryExpression): TS.TSBinaryExpression {
  return {
    type: TS.TSNodeType.BinaryExpression,
    operator: node.operator,
    left: convertNode(node.left) as TS.TSExpression,
    right: convertNode(node.right) as TS.TSExpression
  };
}

function convertUnaryExpression(node: IR.IRUnaryExpression): TS.TSUnaryExpression {
  return {
    type: TS.TSNodeType.UnaryExpression,
    operator: node.operator,
    argument: convertNode(node.argument) as TS.TSExpression
  };
}

function convertConditionalExpression(node: IR.IRConditionalExpression): TS.TSConditionalExpression {
  return {
    type: TS.TSNodeType.ConditionalExpression,
    test: convertNode(node.test) as TS.TSExpression,
    consequent: convertNode(node.consequent) as TS.TSExpression,
    alternate: convertNode(node.alternate) as TS.TSExpression
  };
}

function convertArrayExpression(node: IR.IRArrayExpression): TS.TSArrayExpression {
  return {
    type: TS.TSNodeType.ArrayExpression,
    elements: node.elements.map(elem => convertNode(elem) as TS.TSExpression)
  };
}

function convertArrayConsExpression(node: IR.IRArrayConsExpression): TS.TSArrayConsExpression {
  return {
    type: TS.TSNodeType.ArrayConsExpression,
    item: convertNode(node.item) as TS.TSExpression,
    array: convertNode(node.array) as TS.TSExpression
  };
}

function convertFunctionExpression(node: IR.IRFunctionExpression): TS.TSFunctionExpression {
  return {
    type: TS.TSNodeType.FunctionExpression,
    id: node.id ? convertIdentifier(node.id) : null,
    params: node.params.map(param => convertIdentifier(param)),
    body: convertBlockStatement(node.body)
  };
}

// Convert statements/declarations
function convertVariableDeclaration(node: IR.IRVariableDeclaration): TS.TSVariableDeclaration {
  return {
    type: TS.TSNodeType.VariableDeclaration,
    kind: node.kind,
    declarations: node.declarations.map(decl => {
      return {
        type: TS.TSNodeType.VariableDeclarator,
        id: convertIdentifier(decl.id),
        init: convertNode(decl.init) as TS.TSExpression
      };
    })
  };
}

function convertFunctionDeclaration(node: IR.IRFunctionDeclaration): TS.TSFunctionDeclaration {
  return {
    type: TS.TSNodeType.FunctionDeclaration,
    id: convertIdentifier(node.id),
    params: node.params.map(param => convertIdentifier(param)),
    body: convertBlockStatement(node.body)
  };
}

function convertReturnStatement(node: IR.IRReturnStatement): TS.TSReturnStatement {
  return {
    type: TS.TSNodeType.ReturnStatement,
    argument: convertNode(node.argument) as TS.TSExpression
  };
}

function convertBlockStatement(node: IR.IRBlockStatement): TS.TSBlockStatement {
  return {
    type: TS.TSNodeType.BlockStatement,
    body: node.body.map(stmt => convertNode(stmt) as TS.TSStatement)
  };
}

// Convert import/export
function convertImportDeclaration(node: IR.IRImportDeclaration): TS.TSImportDeclaration {
  // Generate a variable name based on the import source
  const moduleName = createModuleVariableName(node.source);
  const defaultVarName = moduleName.replace(/Module$/, "");
  
  return {
    type: TS.TSNodeType.ImportDeclaration,
    source: node.source,
    moduleName,
    defaultVarName
  };
}

function convertExportNamedDeclaration(node: IR.IRExportNamedDeclaration): TS.TSExportNamedDeclaration {
  return {
    type: TS.TSNodeType.ExportNamedDeclaration,
    specifiers: node.specifiers.map(spec => {
      return {
        type: TS.TSNodeType.ExportSpecifier,
        local: convertIdentifier(spec.local),
        exported: convertIdentifier(spec.exported)
      };
    })
  };
}

function convertExportVariableDeclaration(node: IR.IRExportVariableDeclaration): TS.TSNamedExport {
  return {
    type: TS.TSNodeType.NamedExport,
    variableDeclaration: convertVariableDeclaration(node.declaration) as TS.TSVariableDeclaration,
    exportName: node.exportName
  };
}

// Convert JS interop
function convertInteropIIFE(node: IR.IRInteropIIFE): TS.TSInteropIIFE {
  return {
    type: TS.TSNodeType.InteropIIFE,
    object: convertNode(node.object) as TS.TSExpression,
    property: convertStringLiteral(node.property)
  };
}

// Convert other nodes
function convertCommentBlock(node: IR.IRCommentBlock): TS.TSCommentBlock {
  return {
    type: TS.TSNodeType.CommentBlock,
    value: node.value
  };
}

function convertRaw(node: IR.IRRaw): TS.TSRaw {
  return {
    type: TS.TSNodeType.Raw,
    code: node.code
  };
}

// Helper function to create a module variable name from an import source
function createModuleVariableName(source: string): string {
  // Extract the last part of the path
  const parts = source.split('/');
  let baseName = parts[parts.length - 1];
  
  // Remove file extension
  baseName = baseName.replace(/\.(js|ts|mjs|cjs)$/, '');
  
  // Convert to camelCase
  baseName = baseName.replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
  
  // Ensure it's a valid JS identifier
  baseName = baseName.replace(/^[^a-zA-Z_$]/, '_');
  
  return `${baseName}Module`;
}