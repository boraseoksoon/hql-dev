// Complete implementation for ir-to-official-ts.ts

import * as ts from "npm:typescript";
import * as IR from "./hql_ir.ts";
import { sanitizeIdentifier } from "../utils.ts";

/**
 * Converts HQL IR directly to the official TypeScript AST.
 * This preserves expression semantics while eliminating the proprietary TS AST step.
 */
export function convertHqlIRToTypeScript(program: IR.IRProgram): ts.SourceFile {
  const statements: ts.Statement[] = [];
  
  for (const node of program.body) {
    const statement = convertIRNode(node);
    if (Array.isArray(statement)) {
      statements.push(...statement);
    } else if (statement) {
      statements.push(statement);
    }
  }
  
  return ts.factory.createSourceFile(
    statements,
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );
}

function convertIRNode(node: IR.IRNode): ts.Statement | ts.Statement[] | null {
  switch (node.type) {
    case IR.IRNodeType.ObjectExpression:
      return ts.factory.createExpressionStatement(
        convertObjectExpression(node as IR.IRObjectExpression)
      );
    case IR.IRNodeType.StringLiteral:
      return createExpressionStatement(convertStringLiteral(node as IR.IRStringLiteral));
    case IR.IRNodeType.NumericLiteral:
      return createExpressionStatement(convertNumericLiteral(node as IR.IRNumericLiteral));
    case IR.IRNodeType.BooleanLiteral:
      return createExpressionStatement(convertBooleanLiteral(node as IR.IRBooleanLiteral));
    case IR.IRNodeType.NullLiteral:
      return createExpressionStatement(convertNullLiteral());
    case IR.IRNodeType.Identifier:
      return createExpressionStatement(convertIdentifier(node as IR.IRIdentifier));
    case IR.IRNodeType.CallExpression:
      return createExpressionStatement(convertCallExpression(node as IR.IRCallExpression));
    case IR.IRNodeType.MemberExpression:
      return createExpressionStatement(convertMemberExpression(node as IR.IRMemberExpression));
    case IR.IRNodeType.CallMemberExpression:
      return createExpressionStatement(convertCallMemberExpression(node as IR.IRCallMemberExpression));
    case IR.IRNodeType.NewExpression:
      return createExpressionStatement(convertNewExpression(node as IR.IRNewExpression));
    case IR.IRNodeType.BinaryExpression:
      return createExpressionStatement(convertBinaryExpression(node as IR.IRBinaryExpression));
    case IR.IRNodeType.UnaryExpression:
      return createExpressionStatement(convertUnaryExpression(node as IR.IRUnaryExpression));
    case IR.IRNodeType.ConditionalExpression:
      return createExpressionStatement(convertConditionalExpression(node as IR.IRConditionalExpression));
    case IR.IRNodeType.ArrayExpression:
      return createExpressionStatement(convertArrayExpression(node as IR.IRArrayExpression));
    case IR.IRNodeType.FunctionExpression:
      return createExpressionStatement(convertFunctionExpression(node as IR.IRFunctionExpression));
    case IR.IRNodeType.VariableDeclaration:
      return convertVariableDeclaration(node as IR.IRVariableDeclaration);
    case IR.IRNodeType.FunctionDeclaration:
      return convertFunctionDeclaration(node as IR.IRFunctionDeclaration);
    case IR.IRNodeType.ReturnStatement:
      return convertReturnStatement(node as IR.IRReturnStatement);
    case IR.IRNodeType.BlockStatement:
      return convertBlockStatement(node as IR.IRBlockStatement);
    case IR.IRNodeType.ImportDeclaration:
      return convertImportDeclaration(node as IR.IRImportDeclaration);
    case IR.IRNodeType.ExportNamedDeclaration:
      return convertExportNamedDeclaration(node as IR.IRExportNamedDeclaration);
    case IR.IRNodeType.ExportVariableDeclaration:
      return convertExportVariableDeclaration(node as IR.IRExportVariableDeclaration);
    case IR.IRNodeType.InteropIIFE:
      return createExpressionStatement(convertInteropIIFE(node as IR.IRInteropIIFE));
    case IR.IRNodeType.JsImportReference:
      return convertJsImportReference(node as IR.IRJsImportReference);
    case IR.IRNodeType.CommentBlock:
      return convertCommentBlock(node as IR.IRCommentBlock);
    case IR.IRNodeType.Raw:
      return convertRaw(node as IR.IRRaw);
    case IR.IRNodeType.ObjectExpression:
      return createExpressionStatement(convertObjectExpression(node as IR.IRObjectExpression));
    default:
      console.warn(`Cannot convert node of type ${node.type} to expression`);
      return null;
  }
}

function convertObjectExpression(node: IR.IRObjectExpression): ts.ObjectLiteralExpression {
  const properties: ts.PropertyAssignment[] = [];
  
  for (const prop of node.properties) {
    const key = convertObjectPropertyKey(prop.key);
    const value = convertIRExpr(prop.value);
    
    properties.push(ts.factory.createPropertyAssignment(key, value));
  }
  
  return ts.factory.createObjectLiteralExpression(properties, true);
}

function convertObjectPropertyKey(node: IR.IRNode): ts.PropertyName {
  switch (node.type) {
    case IR.IRNodeType.StringLiteral: {
      const literal = node as IR.IRStringLiteral;
      const value = literal.value;
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
        return ts.factory.createIdentifier(value);
      } else {
        return ts.factory.createStringLiteral(value);
      }
    }
    case IR.IRNodeType.Identifier:
      return ts.factory.createIdentifier((node as IR.IRIdentifier).name);
      
    default:{
      // For computed properties (unlikely in this context)
      const computed = convertIRExpr(node);
      return ts.factory.createComputedPropertyName(computed);
    }
  }
}

function convertPropertyKey(node: IR.IRNode): ts.PropertyName {
  if (node.type === IR.IRNodeType.StringLiteral) {
    const value = (node as IR.IRStringLiteral).value;
    
    // If it's a valid JS identifier without quotes, use as identifier
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
      return ts.factory.createIdentifier(value);
    }
    
    // Otherwise use as string literal
    return ts.factory.createStringLiteral(value);
  }
  
  if (node.type === IR.IRNodeType.Identifier) {
    return ts.factory.createIdentifier((node as IR.IRIdentifier).name);
  }
  
  if (node.type === IR.IRNodeType.NumericLiteral) {
    return ts.factory.createNumericLiteral((node as IR.IRNumericLiteral).value.toString());
  }
  
  // For computed properties
  const expr = convertIRExpr(node);
  return ts.factory.createComputedPropertyName(expr);
}

// Helper to create expression statements
function createExpressionStatement(expr: ts.Expression): ts.ExpressionStatement {
  return ts.factory.createExpressionStatement(expr);
}

// Literal conversions
function convertStringLiteral(node: IR.IRStringLiteral): ts.StringLiteral {
  return ts.factory.createStringLiteral(node.value);
}

function convertNumericLiteral(node: IR.IRNumericLiteral): ts.Expression {
  // For negative numbers, create a prefix unary expression with minus sign
  if (node.value < 0) {
    return ts.factory.createPrefixUnaryExpression(
      ts.SyntaxKind.MinusToken,
      ts.factory.createNumericLiteral(Math.abs(node.value).toString())
    );
  }
  
  // For zero or positive numbers, create a numeric literal directly
  return ts.factory.createNumericLiteral(node.value.toString());
}

function convertBooleanLiteral(node: IR.IRBooleanLiteral): ts.BooleanLiteral {
  return node.value ? ts.factory.createTrue() : ts.factory.createFalse();
}

function convertNullLiteral(): ts.NullLiteral {
  return ts.factory.createNull();
}

function convertIdentifier(node: IR.IRIdentifier): ts.Identifier {
  return ts.factory.createIdentifier(node.name);
}

function convertCallExpressionWithMemberCallee(node: IR.IRCallExpression): ts.CallExpression {
  // Check if the callee is a member expression
  if (node.callee.type === IR.IRNodeType.MemberExpression) {
    const memberExpr = node.callee as IR.IRMemberExpression;
    
    // Create the member expression
    let tsPropertyAccessExpr: ts.Expression;
    
    // Handle the property access
    if (memberExpr.property.type === IR.IRNodeType.Identifier) {
      const propName = (memberExpr.property as IR.IRIdentifier).name;
      
      tsPropertyAccessExpr = ts.factory.createPropertyAccessExpression(
        convertIRExpr(memberExpr.object),
        ts.factory.createIdentifier(propName)
      );
    } else {
      // Fallback for computed property access
      tsPropertyAccessExpr = ts.factory.createElementAccessExpression(
        convertIRExpr(memberExpr.object),
        convertIRExpr(memberExpr.property)
      );
    }
    
    // Create the method call with the property access as callee
    return ts.factory.createCallExpression(
      tsPropertyAccessExpr,
      undefined,
      node.arguments.map(arg => convertIRExpr(arg))
    );
  }
  
  // Regular call expression handling
  return ts.factory.createCallExpression(
    convertIRExpr(node.callee),
    undefined,
    node.arguments.map(arg => convertIRExpr(arg))
  );
}

function convertCallExpression(node: IR.IRCallExpression): ts.CallExpression {
  // If the callee is a member expression, use our specialized converter
  if (node.callee.type === IR.IRNodeType.MemberExpression) {
    return convertCallExpressionWithMemberCallee(node);
  }
  
  // Standard call expression handling
  const callee = convertIRExpr(node.callee);
  const args = node.arguments.map(arg => convertIRExpr(arg));
  return ts.factory.createCallExpression(callee, undefined, args);
}

function convertMemberExpression(node: IR.IRMemberExpression): ts.Expression {
  const object = convertIRExpr(node.object);
  const property = convertIRExpr(node.property);
  
  // Special case: If the object is an InteropIIFE, we need to handle this differently
  if (node.object.type === IR.IRNodeType.InteropIIFE) {
    const iife = node.object as IR.IRInteropIIFE;
    
    // Create an IIFE to handle the nested property access
    const statements: ts.Statement[] = [
      // const _obj = original object;
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier("_obj"),
            undefined,
            undefined,
            convertIRExpr(iife.object)
          )],
          ts.NodeFlags.Const
        )
      ),
      
      // const _member = _obj["originalProp"];
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier("_member"),
            undefined,
            undefined,
            ts.factory.createElementAccessExpression(
              ts.factory.createIdentifier("_obj"),
              convertIRExpr(iife.property)
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      
      // const _result = typeof _member === "function" ? _member.call(_obj) : _member;
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier("_result"),
            undefined,
            undefined,
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createTypeOfExpression(ts.factory.createIdentifier("_member")),
                ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                ts.factory.createStringLiteral("function")
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier("_member"),
                  ts.factory.createIdentifier("call")
                ),
                undefined,
                [ts.factory.createIdentifier("_obj")]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createIdentifier("_member")
            )
          )],
          ts.NodeFlags.Const
        )
      ),
      
      // return _result.propName; - using the property from the outer part
      ts.factory.createReturnStatement(
        node.computed ?
          ts.factory.createElementAccessExpression(
            ts.factory.createIdentifier("_result"),
            property
          ) :
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier("_result"),
            property as ts.Identifier
          )
      )
    ];
    
    // Create the IIFE
    return ts.factory.createCallExpression(
      ts.factory.createParenthesizedExpression(
        ts.factory.createFunctionExpression(
          undefined,
          undefined,
          undefined,
          undefined,
          [],
          undefined,
          ts.factory.createBlock(statements, true)
        )
      ),
      undefined,
      []
    );
  }
  
  // Regular property access - no special handling needed
  if (node.computed) {
    return ts.factory.createElementAccessExpression(object, property);
  } else {
    if (ts.isIdentifier(property) || ts.isStringLiteral(property)) {
      const propName = ts.isIdentifier(property) ? property.text : property.text;
      return ts.factory.createPropertyAccessExpression(
        object, 
        ts.factory.createIdentifier(propName)
      );
    }
    // Fallback
    return ts.factory.createElementAccessExpression(object, property);
  }
}

function convertCallMemberExpression(node: IR.IRCallMemberExpression): ts.CallExpression {
  // Create member expression first
  let memberExpr: ts.Expression;
  
  if (node.property.type === IR.IRNodeType.StringLiteral) {
    // For string literal properties, create a property access with an identifier
    const propName = (node.property as IR.IRStringLiteral).value;
    memberExpr = ts.factory.createPropertyAccessExpression(
      convertIRExpr(node.object),
      ts.factory.createIdentifier(propName)
    );
  } else {
    // For other types of properties, convert and use element access if needed
    const property = convertIRExpr(node.property);
    if (ts.isStringLiteral(property)) {
      memberExpr = ts.factory.createPropertyAccessExpression(
        convertIRExpr(node.object),
        ts.factory.createIdentifier(property.text)
      );
    } else if (ts.isIdentifier(property)) {
      memberExpr = ts.factory.createPropertyAccessExpression(
        convertIRExpr(node.object),
        property
      );
    } else {
      // Fallback to element access
      memberExpr = ts.factory.createElementAccessExpression(
        convertIRExpr(node.object),
        property
      );
    }
  }
  
  // Then create the call
  return ts.factory.createCallExpression(
    memberExpr,
    undefined,
    node.arguments.map(arg => convertIRExpr(arg))
  );
}

function convertNewExpression(node: IR.IRNewExpression): ts.NewExpression {
  return ts.factory.createNewExpression(
    convertIRExpr(node.callee),
    undefined,
    node.arguments.map(arg => convertIRExpr(arg))
  );
}

function convertBinaryExpression(node: IR.IRBinaryExpression): ts.BinaryExpression {
  let operator: ts.BinaryOperator;
  switch (node.operator) {
    case '+': operator = ts.SyntaxKind.PlusToken; break;
    case '-': operator = ts.SyntaxKind.MinusToken; break;
    case '*': operator = ts.SyntaxKind.AsteriskToken; break;
    case '/': operator = ts.SyntaxKind.SlashToken; break;
    case '%': operator = ts.SyntaxKind.PercentToken; break;
    case '===': case '==': operator = ts.SyntaxKind.EqualsEqualsEqualsToken; break;
    case '!==': case '!=': operator = ts.SyntaxKind.ExclamationEqualsEqualsToken; break;
    case '>': operator = ts.SyntaxKind.GreaterThanToken; break;
    case '<': operator = ts.SyntaxKind.LessThanToken; break;
    case '>=': operator = ts.SyntaxKind.GreaterThanEqualsToken; break;
    case '<=': operator = ts.SyntaxKind.LessThanEqualsToken; break;
    case '&&': operator = ts.SyntaxKind.AmpersandAmpersandToken; break;
    case '||': operator = ts.SyntaxKind.BarBarToken; break;
    default: operator = ts.SyntaxKind.EqualsToken;
  }
  
  return ts.factory.createBinaryExpression(
    convertIRExpr(node.left),
    ts.factory.createToken(operator),
    convertIRExpr(node.right)
  );
}

function convertUnaryExpression(node: IR.IRUnaryExpression): ts.UnaryExpression {
  let operator: ts.PrefixUnaryOperator;
  switch (node.operator) {
    case '+': operator = ts.SyntaxKind.PlusToken; break;
    case '-': operator = ts.SyntaxKind.MinusToken; break;
    case '!': operator = ts.SyntaxKind.ExclamationToken; break;
    case '~': operator = ts.SyntaxKind.TildeToken; break;
    default: operator = ts.SyntaxKind.ExclamationToken;
  }
  
  return ts.factory.createPrefixUnaryExpression(
    operator,
    convertIRExpr(node.argument)
  );
}

function convertConditionalExpression(node: IR.IRConditionalExpression): ts.ConditionalExpression {
  return ts.factory.createConditionalExpression(
    convertIRExpr(node.test),
    ts.factory.createToken(ts.SyntaxKind.QuestionToken),
    convertIRExpr(node.consequent),
    ts.factory.createToken(ts.SyntaxKind.ColonToken),
    convertIRExpr(node.alternate)
  );
}

function convertArrayExpression(node: IR.IRArrayExpression): ts.ArrayLiteralExpression {
  return ts.factory.createArrayLiteralExpression(
    node.elements.map(elem => convertIRExpr(elem)),
    false // multiline
  );
}

function convertFunctionExpression(node: IR.IRFunctionExpression): ts.FunctionExpression {
    // Convert parameters, handling rest parameters (marked with ... prefix)
    const parameters = node.params.map(param => {
      // Check if this is a rest parameter (name starts with '...')
      if (param.name && param.name.startsWith('...')) {
        const paramName = param.name.slice(3); // Remove the '...' prefix
        const dotDotDotToken = ts.factory.createToken(ts.SyntaxKind.DotDotDotToken);
        const identifier = ts.factory.createIdentifier(paramName);
        
        // Create a parameter with dot-dot-dot token for rest parameters
        // Using the minimal 3-argument form
        return ts.factory.createParameterDeclaration(
          undefined, // modifiers
          dotDotDotToken,
          identifier
        );
      }
  
      // Regular parameters - use the minimal form
      return ts.factory.createParameterDeclaration(
        undefined, // modifiers 
        undefined, // dotDotDotToken
        convertIdentifier(param)
      );
    });
    
    // Create the function expression with the converted parameters and body
    return ts.factory.createFunctionExpression(
      undefined, // modifiers
      undefined, // asteriskToken
      undefined, // name
      undefined, // typeParameters
      parameters,
      undefined, // type
      convertBlockStatement(node.body)
    );
  }

// Statement conversions
function convertVariableDeclaration(node: IR.IRVariableDeclaration): ts.VariableStatement {
  let nodeFlags: ts.NodeFlags;
  switch (node.kind) {
    case "const": nodeFlags = ts.NodeFlags.Const; break;
    case "let": nodeFlags = ts.NodeFlags.Let; break;
    default: nodeFlags = ts.NodeFlags.None; // var
  }
  
  const declarations = node.declarations.map(decl => 
    ts.factory.createVariableDeclaration(
      convertIdentifier(decl.id),
      undefined,
      undefined,
      convertIRExpr(decl.init)
    )
  );
  
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(declarations, nodeFlags)
  );
}

function convertFunctionDeclaration(node: IR.IRFunctionDeclaration): ts.FunctionDeclaration {
  return ts.factory.createFunctionDeclaration(
    undefined, // modifiers
    undefined, // asteriskToken
    convertIdentifier(node.id),
    undefined, // typeParameters
    node.params.map(param => 
      ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        convertIdentifier(param)
      )
    ),
    undefined, // type
    convertBlockStatement(node.body)
  );
}

function convertReturnStatement(node: IR.IRReturnStatement): ts.ReturnStatement {
  return ts.factory.createReturnStatement(
    node.argument ? convertIRExpr(node.argument) : undefined
  );
}

function convertBlockStatement(node: IR.IRBlockStatement): ts.Block {
  const statements: ts.Statement[] = [];
  
  for (const stmt of node.body) {
    const converted = convertIRNode(stmt);
    if (Array.isArray(converted)) {
      statements.push(...converted);
    } else if (converted) {
      statements.push(converted);
    }
  }
  
  return ts.factory.createBlock(statements, true);
}

function convertImportDeclaration(node: IR.IRImportDeclaration): ts.ImportDeclaration {
  // Create a namespace import (import * as name from 'source')
  const moduleName = createModuleVariableName(node.source);
  
  return ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamespaceImport(
        ts.factory.createIdentifier(moduleName)
      )
    ),
    ts.factory.createStringLiteral(node.source)
  );
}

// src/transpiler/hql-ir-to-ts-ast.ts - Simplified alternative

function convertJsImportReference(node: IR.IRJsImportReference): ts.Statement[] {
  // Generate a unique internal module name based on the user-provided name
  const importName = sanitizeIdentifier(node.name);
  const internalModuleName = `${importName}Module`;
  
  // Create import declaration
  const importDecl = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamespaceImport(
        ts.factory.createIdentifier(internalModuleName)
      )
    ),
    ts.factory.createStringLiteral(node.source)
  );
  
  // Create a simpler implementation using a function
  // This is more readable and maintainable than the complex Object.assign approach
  const functionBody = ts.factory.createBlock(
    [
      // Create a wrapper function that will preserve the 'this' binding
      ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [
            ts.factory.createVariableDeclaration(
              ts.factory.createIdentifier("wrapper"),
              undefined,
              undefined,
              ts.factory.createConditionalExpression(
                // Check if default export exists
                ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier(internalModuleName),
                    ts.factory.createIdentifier("default")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                  ts.factory.createIdentifier("undefined")
                ),
                ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                // If default exists, use it
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier(internalModuleName),
                  ts.factory.createIdentifier("default")
                ),
                ts.factory.createToken(ts.SyntaxKind.ColonToken),
                // If no default, use empty object
                ts.factory.createObjectLiteralExpression([], false)
              )
            )
          ],
          ts.NodeFlags.Const
        )
      ),
      
      // Copy all named exports to the wrapper
      ts.factory.createForOfStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [
            ts.factory.createVariableDeclaration(
              ts.factory.createArrayBindingPattern([
                ts.factory.createBindingElement(
                  undefined, 
                  undefined, 
                  ts.factory.createIdentifier("key"), 
                  undefined
                ),
                ts.factory.createBindingElement(
                  undefined, 
                  undefined, 
                  ts.factory.createIdentifier("value"), 
                  undefined
                )
              ]),
              undefined,
              undefined,
              undefined
            )
          ],
          ts.NodeFlags.Const
        ),
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier("Object"),
            ts.factory.createIdentifier("entries")
          ),
          undefined,
          [ts.factory.createIdentifier(internalModuleName)]
        ),
        ts.factory.createBlock(
          [
            ts.factory.createIfStatement(
              ts.factory.createBinaryExpression(
                ts.factory.createIdentifier("key"),
                ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                ts.factory.createStringLiteral("default")
              ),
              ts.factory.createExpressionStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createElementAccessExpression(
                    ts.factory.createIdentifier("wrapper"),
                    ts.factory.createIdentifier("key")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                  ts.factory.createIdentifier("value")
                )
              ),
              undefined
            )
          ],
          true
        )
      ),
      
      // Return the enhanced wrapper
      ts.factory.createReturnStatement(
        ts.factory.createIdentifier("wrapper")
      )
    ],
    true
  );
  
  // Create a self-executing function expression
  const iife = ts.factory.createCallExpression(
    ts.factory.createParenthesizedExpression(
      ts.factory.createFunctionExpression(
        undefined,
        undefined,
        undefined,
        undefined,
        [],
        undefined,
        functionBody
      )
    ),
    undefined,
    []
  );
  
  // Create the assignment with the IIFE
  const defaultAssignment = ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(importName),
          undefined,
          undefined,
          iife
        )
      ],
      ts.NodeFlags.Const
    )
  );
  
  return [importDecl, defaultAssignment];
}

function convertExportNamedDeclaration(node: IR.IRExportNamedDeclaration): ts.ExportDeclaration {
  const specifiers = node.specifiers.map(spec => 
    ts.factory.createExportSpecifier(
      false,
      spec.local.name !== spec.exported.name ? 
        ts.factory.createIdentifier(spec.local.name) : 
        undefined,
      ts.factory.createIdentifier(spec.exported.name)
    )
  );
  
  return ts.factory.createExportDeclaration(
    undefined,
    false,
    ts.factory.createNamedExports(specifiers),
    undefined
  );
}

function convertExportVariableDeclaration(node: IR.IRExportVariableDeclaration): ts.Statement[] {
  // First create the variable declaration
  const varDecl = convertVariableDeclaration(node.declaration);
  
  // Get the variable name from the first declaration
  const varName = node.declaration.declarations[0].id.name;
  
  // Create the export declaration
  const exportDecl = ts.factory.createExportDeclaration(
    undefined,
    false,
    ts.factory.createNamedExports([
      ts.factory.createExportSpecifier(
        false,
        ts.factory.createIdentifier(varName),
        ts.factory.createIdentifier(node.exportName)
      )
    ]),
    undefined
  );
  
  return [varDecl, exportDecl];
}

function convertInteropIIFE(node: IR.IRInteropIIFE): ts.Expression {
  // Create temporary variables for the object and member
  const objVar = ts.factory.createIdentifier("_obj");
  const memberVar = ts.factory.createIdentifier("_member");
  
  // Create the function body with correct variable references
  const statements: ts.Statement[] = [
    // const _obj = object;
    ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration(
          objVar,
          undefined,
          undefined,
          convertIRExpr(node.object)
        )],
        ts.NodeFlags.Const
      )
    ),
    
    // const _member = _obj[property];
    ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration(
          memberVar,
          undefined,
          undefined,
          ts.factory.createElementAccessExpression(
            objVar,
            convertStringLiteral(node.property)
          )
        )],
        ts.NodeFlags.Const
      )
    ),
    
    // return typeof _member === "function" ? _member.call(_obj) : _member;
    ts.factory.createReturnStatement(
      ts.factory.createConditionalExpression(
        ts.factory.createBinaryExpression(
          ts.factory.createTypeOfExpression(memberVar),
          ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
          ts.factory.createStringLiteral("function")
        ),
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(memberVar, "call"),
          undefined,
          [objVar]
        ),
        ts.factory.createToken(ts.SyntaxKind.ColonToken),
        memberVar
      )
    )
  ];
  
  // Return the IIFE
  return ts.factory.createCallExpression(
    ts.factory.createFunctionExpression(
      undefined,
      undefined,
      undefined,
      undefined,
      [],
      undefined,
      ts.factory.createBlock(statements, true)
    ),
    undefined,
    []
  );
}

function convertCommentBlock(node: IR.IRCommentBlock): ts.EmptyStatement {
  const statement = ts.factory.createEmptyStatement();
  ts.addSyntheticLeadingComment(
    statement,
    ts.SyntaxKind.MultiLineCommentTrivia,
    node.value,
    true
  );
  return statement;
}

function convertRaw(node: IR.IRRaw): ts.ExpressionStatement {
  // Create a raw code block as a non-executable string
  return ts.factory.createExpressionStatement(
    ts.factory.createIdentifier(node.code)
  );
}

function convertIRExpr(node: IR.IRNode): ts.Expression {
  switch (node.type) {
    case IR.IRNodeType.ObjectExpression:
      return convertObjectExpression(node as IR.IRObjectExpression);
    case IR.IRNodeType.StringLiteral:
      return convertStringLiteral(node as IR.IRStringLiteral);
    case IR.IRNodeType.NumericLiteral:
      return convertNumericLiteral(node as IR.IRNumericLiteral);
    case IR.IRNodeType.BooleanLiteral:
      return convertBooleanLiteral(node as IR.IRBooleanLiteral);
    case IR.IRNodeType.NullLiteral:
      return convertNullLiteral();
    case IR.IRNodeType.Identifier:
      return convertIdentifier(node as IR.IRIdentifier);
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
    case IR.IRNodeType.FunctionExpression:
      return convertFunctionExpression(node as IR.IRFunctionExpression);
    case IR.IRNodeType.InteropIIFE:
      return convertInteropIIFE(node as IR.IRInteropIIFE);
    default:
      console.warn(`Cannot convert node of type ${node.type} to expression`);
      return ts.factory.createIdentifier("undefined");
  }
}

function createModuleVariableName(source: string): string {
  // Handle npm: and jsr: prefixes
  let cleanSource = source;
  if (cleanSource.startsWith("npm:")) {
    cleanSource = cleanSource.substring(4);
  } else if (cleanSource.startsWith("jsr:")) {
    cleanSource = cleanSource.substring(4);
  }
  
  // Handle scoped packages (e.g., @nothing628/chalk)
  if (cleanSource.includes('@') && cleanSource.includes('/')) {
    const parts = cleanSource.split('/');
    // For scoped packages, use the last part (e.g., "chalk" from "@nothing628/chalk")
    cleanSource = parts[parts.length - 1];
  } else if (cleanSource.includes('/')) {
    const parts = cleanSource.split('/');
    cleanSource = parts[parts.length - 1];
  }
  
  // Clean up the name
  let baseName = cleanSource.replace(/\.(js|ts|mjs|cjs)$/, '');
  baseName = baseName.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
  baseName = baseName.replace(/^[^a-zA-Z_$]/, '_');
  
  return `${baseName}Module`;
}