// src/transpiler/hql-ir-to-ts-ast.ts - Enhanced with improved error handling

import * as ts from "npm:typescript";
import * as IR from "./hql_ir.ts";
import { sanitizeIdentifier } from "../utils.ts";
import { CodeGenError } from "./errors.ts";
import { Logger } from "../logger.ts";

/**
 * Convert an IR node to a TypeScript statement.
 * Enhanced with error handling for each node type.
 */
export function convertIRNode(node: IR.IRNode): ts.Statement | ts.Statement[] | null {
  try {
    if (!node) {
      throw new CodeGenError(
        "Cannot convert null or undefined node to TS AST",
        "unknown node type",
        node
      );
    }
    
    const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");
    logger.debug(`Converting IR node of type ${IR.IRNodeType[node.type]}`);
    
    switch (node.type) {
      case IR.IRNodeType.ObjectExpression:
        return createExpressionStatement(convertObjectExpression(node as IR.IRObjectExpression));
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
      default:
        logger.warn(`Cannot convert node of type ${node.type} (${IR.IRNodeType[node.type]}) to expression`);
        throw new CodeGenError(
          `Unsupported IR node type: ${IR.IRNodeType[node.type] || node.type}`,
          `IR node ${IR.IRNodeType[node.type] || node.type}`,
          node
        );
    }
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    // Wrap other errors in a CodeGenError with node context
    const nodeType = node ? IR.IRNodeType[node.type] || String(node.type) : "unknown";
    throw new CodeGenError(
      `Failed to convert IR node of type ${nodeType} to TS AST: ${error instanceof Error ? error.message : String(error)}`,
      nodeType,
      node
    );
  }
}

/**
 * Convert an object expression with proper error handling
 */
function convertObjectExpression(node: IR.IRObjectExpression): ts.ObjectLiteralExpression {
  try {
    const properties: ts.PropertyAssignment[] = [];
    
    for (const prop of node.properties) {
      try {
        const key = convertObjectPropertyKey(prop.key);
        const value = convertIRExpr(prop.value);
        
        properties.push(ts.factory.createPropertyAssignment(key, value));
      } catch (error) {
        throw new CodeGenError(
          `Failed to convert object property: ${error instanceof Error ? error.message : String(error)}`,
          `object property conversion`,
          prop
        );
      }
    }
    
    return ts.factory.createObjectLiteralExpression(properties, true);
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert object expression: ${error instanceof Error ? error.message : String(error)}`,
      "object expression",
      node
    );
  }
}

/**
 * Convert an object property key with error handling
 */
function convertObjectPropertyKey(node: IR.IRNode): ts.PropertyName {
  try {
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
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert object property key: ${error instanceof Error ? error.message : String(error)}`,
      `property key conversion`,
      node
    );
  }
}

/**
 * Helper to create expression statements with error handling
 */
function createExpressionStatement(expr: ts.Expression): ts.ExpressionStatement {
  try {
    return ts.factory.createExpressionStatement(expr);
  } catch (error) {
    throw new CodeGenError(
      `Failed to create expression statement: ${error instanceof Error ? error.message : String(error)}`,
      "expression statement creation",
      expr
    );
  }
}

/**
 * Convert a string literal with error handling
 */
function convertStringLiteral(node: IR.IRStringLiteral): ts.StringLiteral {
  try {
    return ts.factory.createStringLiteral(node.value);
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert string literal "${node.value}": ${error instanceof Error ? error.message : String(error)}`,
      "string literal",
      node
    );
  }
}

/**
 * Convert a numeric literal with error handling
 */
function convertNumericLiteral(node: IR.IRNumericLiteral): ts.Expression {
  try {
    // For negative numbers, create a prefix unary expression with minus sign
    if (node.value < 0) {
      return ts.factory.createPrefixUnaryExpression(
        ts.SyntaxKind.MinusToken,
        ts.factory.createNumericLiteral(Math.abs(node.value).toString())
      );
    }
    
    // For zero or positive numbers, create a numeric literal directly
    return ts.factory.createNumericLiteral(node.value.toString());
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert numeric literal ${node.value}: ${error instanceof Error ? error.message : String(error)}`,
      "numeric literal",
      node
    );
  }
}

/**
 * Convert a boolean literal with error handling
 */
function convertBooleanLiteral(node: IR.IRBooleanLiteral): ts.BooleanLiteral {
  try {
    return node.value ? ts.factory.createTrue() : ts.factory.createFalse();
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert boolean literal ${node.value}: ${error instanceof Error ? error.message : String(error)}`,
      "boolean literal",
      node
    );
  }
}

/**
 * Convert a null literal with error handling
 */
function convertNullLiteral(): ts.NullLiteral {
  try {
    return ts.factory.createNull();
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert null literal: ${error instanceof Error ? error.message : String(error)}`,
      "null literal",
      null
    );
  }
}

/**
 * Convert an identifier with error handling
 */
function convertIdentifier(node: IR.IRIdentifier): ts.Identifier {
  try {
    const sanitizedName = sanitizeIdentifier(node.name);
    return ts.factory.createIdentifier(sanitizedName);
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert identifier "${node.name}": ${error instanceof Error ? error.message : String(error)}`,
      "identifier",
      node
    );
  }
}

/**
 * Enhanced conversion for call expressions to handle method chains with error handling
 */
function convertCallExpression(node: IR.IRCallExpression): ts.CallExpression {
  try {
    // If the callee is a member expression, use specialized handling
    if (node.callee.type === IR.IRNodeType.MemberExpression) {
      return convertCallExpressionWithMemberCallee(node);
    }
    
    // If the callee is itself a call expression, handle chained calls
    if (node.callee.type === IR.IRNodeType.CallExpression) {
      try {
        const innerCall = convertCallExpression(node.callee as IR.IRCallExpression);
        
        // Create a call using the result of the inner call
        return ts.factory.createCallExpression(
          innerCall,
          undefined,
          node.arguments.map(arg => convertIRExpr(arg))
        );
      } catch (error) {
        throw new CodeGenError(
          `Failed to convert nested call expression: ${error instanceof Error ? error.message : String(error)}`,
          "nested call expression",
          node.callee
        );
      }
    }
    
    // Standard call expression handling
    const callee = convertIRExpr(node.callee);
    
    try {
      const args = node.arguments.map(arg => convertIRExpr(arg));
      return ts.factory.createCallExpression(callee, undefined, args);
    } catch (error) {
      throw new CodeGenError(
        `Failed to convert call expression arguments: ${error instanceof Error ? error.message : String(error)}`,
        "call expression arguments",
        node.arguments
      );
    }
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert call expression: ${error instanceof Error ? error.message : String(error)}`,
      "call expression",
      node
    );
  }
}

/**
 * Enhanced function to handle call expressions with member expressions as callee
 * with better error handling
 */
function convertCallExpressionWithMemberCallee(node: IR.IRCallExpression): ts.CallExpression {
  try {
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
    
    // Fallback to regular call expression
    return ts.factory.createCallExpression(
      convertIRExpr(node.callee),
      undefined,
      node.arguments.map(arg => convertIRExpr(arg))
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert call expression with member callee: ${error instanceof Error ? error.message : String(error)}`,
      "call expression with member",
      node
    );
  }
}

/**
 * Improved handling for nested member expressions and method chains with error handling
 */
function convertMemberExpression(node: IR.IRMemberExpression): ts.Expression {
  try {
    const object = convertIRExpr(node.object);
    
    // For identifier properties, use PropertyAccessExpression
    if (node.property.type === IR.IRNodeType.Identifier) {
      const propertyName = (node.property as IR.IRIdentifier).name;
      
      // Create a property access expression (using dot notation)
      return ts.factory.createPropertyAccessExpression(
        object,
        ts.factory.createIdentifier(propertyName)
      );
    }
    // For string literals, either use PropertyAccessExpression or ElementAccessExpression
    else if (node.property.type === IR.IRNodeType.StringLiteral) {
      const propValue = (node.property as IR.IRStringLiteral).value;
      
      // If the property name is a valid identifier, use property access
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propValue)) {
        return ts.factory.createPropertyAccessExpression(
          object,
          ts.factory.createIdentifier(propValue)
        );
      } 
      // Otherwise use computed access
      else {
        return ts.factory.createElementAccessExpression(
          object,
          ts.factory.createStringLiteral(propValue)
        );
      }
    } 
    // For all other property types, use ElementAccessExpression
    else {
      return ts.factory.createElementAccessExpression(
        object,
        convertIRExpr(node.property)
      );
    }
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert member expression: ${error instanceof Error ? error.message : String(error)}`,
      "member expression",
      node
    );
  }
}

/**
 * Convert a CallMemberExpression with error handling
 */
function convertCallMemberExpression(node: IR.IRCallMemberExpression): ts.CallExpression {
  try {
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
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert call member expression: ${error instanceof Error ? error.message : String(error)}`,
      "call member expression",
      node
    );
  }
}

/**
 * Convert a NewExpression with error handling
 */
function convertNewExpression(node: IR.IRNewExpression): ts.NewExpression {
  try {
    return ts.factory.createNewExpression(
      convertIRExpr(node.callee),
      undefined,
      node.arguments.map(arg => convertIRExpr(arg))
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert new expression: ${error instanceof Error ? error.message : String(error)}`,
      "new expression",
      node
    );
  }
}

/**
 * Convert a BinaryExpression with enhanced error handling
 */
function convertBinaryExpression(node: IR.IRBinaryExpression): ts.BinaryExpression {
  try {
    // Add null checks for left and right operands
    if (!node.left || !node.right) {
      let left: ts.Expression;
      if (node.left) {
        left = convertIRExpr(node.left);
      } else {
        left = ts.factory.createNumericLiteral("0");
      }
      
      let right: ts.Expression;
      if (node.right) {
        right = convertIRExpr(node.right);
      } else {
        // For null right operand, create a numeric literal 1 for addition, 0 for other operations
        const defaultValue = node.operator === "+" ? "1" : "0";
        right = ts.factory.createNumericLiteral(defaultValue);
      }
      
      // Determine operator - use the existing one if available
      let operator: ts.BinaryOperator;
      switch (node.operator || '+') { // Default to '+' if no operator
        case '+': operator = ts.SyntaxKind.PlusToken; break;
        case '-': operator = ts.SyntaxKind.MinusToken; break;
        case '*': operator = ts.SyntaxKind.AsteriskToken; break;
        case '/': operator = ts.SyntaxKind.SlashToken; break;
        case '%': operator = ts.SyntaxKind.PercentToken; break;
        default: operator = ts.SyntaxKind.PlusToken; // Default to addition
      }
      
      return ts.factory.createBinaryExpression(
        left,
        ts.factory.createToken(operator),
        right
      );
    }
    
    // Normal case when both operands are present
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
      default: 
        throw new CodeGenError(
          `Unknown binary operator: ${node.operator}`,
          "binary expression operator",
          node
        );
    }
    
    return ts.factory.createBinaryExpression(
      convertIRExpr(node.left),
      ts.factory.createToken(operator),
      convertIRExpr(node.right)
    );
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert binary expression with operator "${node.operator}": ${error instanceof Error ? error.message : String(error)}`,
      "binary expression",
      node
    );
  }
}

/**
 * Convert a UnaryExpression with error handling
 */
function convertUnaryExpression(node: IR.IRUnaryExpression): ts.UnaryExpression {
  try {
    let operator: ts.PrefixUnaryOperator;
    switch (node.operator) {
      case '+': operator = ts.SyntaxKind.PlusToken; break;
      case '-': operator = ts.SyntaxKind.MinusToken; break;
      case '!': operator = ts.SyntaxKind.ExclamationToken; break;
      case '~': operator = ts.SyntaxKind.TildeToken; break;
      default: 
        throw new CodeGenError(
          `Unknown unary operator: ${node.operator}`,
          "unary expression operator",
          node
        );
    }
    
    return ts.factory.createPrefixUnaryExpression(
      operator,
      convertIRExpr(node.argument)
    );
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert unary expression with operator "${node.operator}": ${error instanceof Error ? error.message : String(error)}`,
      "unary expression",
      node
    );
  }
}

/**
 * Convert a ConditionalExpression with error handling
 */
function convertConditionalExpression(node: IR.IRConditionalExpression): ts.ConditionalExpression {
  try {
    return ts.factory.createConditionalExpression(
      convertIRExpr(node.test),
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      convertIRExpr(node.consequent),
      ts.factory.createToken(ts.SyntaxKind.ColonToken),
      convertIRExpr(node.alternate)
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert conditional expression: ${error instanceof Error ? error.message : String(error)}`,
      "conditional expression",
      node
    );
  }
}

/**
 * Convert an ArrayExpression with error handling
 */
function convertArrayExpression(node: IR.IRArrayExpression): ts.ArrayLiteralExpression {
  try {
    return ts.factory.createArrayLiteralExpression(
      node.elements.map(elem => convertIRExpr(elem)),
      false // multiline
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert array expression: ${error instanceof Error ? error.message : String(error)}`,
      "array expression",
      node
    );
  }
}

/**
 * Convert a FunctionExpression with error handling
 */
function convertFunctionExpression(node: IR.IRFunctionExpression): ts.FunctionExpression {
  try {
    // Convert parameters, handling rest parameters (marked with ... prefix)
    const parameters = node.params.map(param => {
      try {
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
      } catch (error) {
        throw new CodeGenError(
          `Failed to convert function parameter: ${error instanceof Error ? error.message : String(error)}`,
          "function parameter",
          param
        );
      }
    });
    
    try {
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
    } catch (error) {
      throw new CodeGenError(
        `Failed to create function expression: ${error instanceof Error ? error.message : String(error)}`,
        "function expression creation",
        node
      );
    }
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert function expression: ${error instanceof Error ? error.message : String(error)}`,
      "function expression",
      node
    );
  }
}

/**
 * Convert a VariableDeclaration with error handling
 */
function convertVariableDeclaration(node: IR.IRVariableDeclaration): ts.VariableStatement {
  try {
    let nodeFlags: ts.NodeFlags;
    switch (node.kind) {
      case "const": nodeFlags = ts.NodeFlags.Const; break;
      case "let": nodeFlags = ts.NodeFlags.Let; break;
      case "var": nodeFlags = ts.NodeFlags.None; break;
      default: 
        throw new CodeGenError(
          `Unknown variable declaration kind: ${node.kind}`,
          "variable declaration kind",
          node
        );
    }
    
    const declarations = node.declarations.map(decl => {
      try {
        return ts.factory.createVariableDeclaration(
          convertIdentifier(decl.id),
          undefined,
          undefined,
          convertIRExpr(decl.init)
        );
      } catch (error) {
        throw new CodeGenError(
          `Failed to convert variable declarator: ${error instanceof Error ? error.message : String(error)}`,
          "variable declarator",
          decl
        );
      }
    });
    
    return ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(declarations, nodeFlags)
    );
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert variable declaration: ${error instanceof Error ? error.message : String(error)}`,
      "variable declaration",
      node
    );
  }
}

/**
 * Convert a FunctionDeclaration with error handling
 */
function convertFunctionDeclaration(node: IR.IRFunctionDeclaration): ts.FunctionDeclaration {
  try {
    const params = node.params.map(param => {
      try {
        return ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          convertIdentifier(param)
        );
      } catch (error) {
        throw new CodeGenError(
          `Failed to convert function parameter: ${error instanceof Error ? error.message : String(error)}`,
          "function declaration parameter",
          param
        );
      }
    });
    
    return ts.factory.createFunctionDeclaration(
      undefined, // modifiers
      undefined, // asteriskToken
      convertIdentifier(node.id),
      undefined, // typeParameters
      params,
      undefined, // type
      convertBlockStatement(node.body)
    );
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert function declaration: ${error instanceof Error ? error.message : String(error)}`,
      "function declaration",
      node
    );
  }
}

/**
 * Convert a ReturnStatement with error handling
 */
function convertReturnStatement(node: IR.IRReturnStatement): ts.ReturnStatement {
  try {
    return ts.factory.createReturnStatement(
      node.argument ? convertIRExpr(node.argument) : undefined
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert return statement: ${error instanceof Error ? error.message : String(error)}`,
      "return statement",
      node
    );
  }
}

/**
 * Convert a BlockStatement with error handling
 */
function convertBlockStatement(node: IR.IRBlockStatement): ts.Block {
  try {
    const statements: ts.Statement[] = [];
    
    for (const stmt of node.body) {
      try {
        const converted = convertIRNode(stmt);
        if (Array.isArray(converted)) {
          statements.push(...converted);
        } else if (converted) {
          statements.push(converted);
        }
      } catch (error) {
        throw new CodeGenError(
          `Failed to convert statement in block: ${error instanceof Error ? error.message : String(error)}`,
          "block statement item",
          stmt
        );
      }
    }
    
    return ts.factory.createBlock(statements, true);
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert block statement: ${error instanceof Error ? error.message : String(error)}`,
      "block statement",
      node
    );
  }
}

/**
 * Convert an ImportDeclaration with error handling
 */
function convertImportDeclaration(node: IR.IRImportDeclaration): ts.ImportDeclaration {
  try {
    // If there are no specifiers or only a namespace import, 
    // create a namespace import (import * as name from 'source')
    if (!node.specifiers || node.specifiers.length === 0) {
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
    
    // Create named imports for all specifiers
    const namedImports = node.specifiers.map(spec => {
      try {
        // Check if we need an alias (if imported and local names differ)
        const importedName = spec.imported.name;
        const localName = spec.local.name;
        
        return ts.factory.createImportSpecifier(
          false,
          importedName !== localName ? 
            ts.factory.createIdentifier(importedName) : 
            undefined,
          ts.factory.createIdentifier(localName)
        );
      } catch (error) {
        throw new CodeGenError(
          `Failed to convert import specifier: ${error instanceof Error ? error.message : String(error)}`,
          "import specifier",
          spec
        );
      }
    });
    
    // Create the import declaration with named imports
    return ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports(namedImports)
      ),
      ts.factory.createStringLiteral(node.source)
    );
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert import declaration: ${error instanceof Error ? error.message : String(error)}`,
      "import declaration",
      node
    );
  }
}

/**
 * Convert a JsImportReference with error handling
 */
function convertJsImportReference(node: IR.IRJsImportReference): ts.Statement[] {
  try {
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
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert JS import reference: ${error instanceof Error ? error.message : String(error)}`,
      "JS import reference",
      node
    );
  }
}

/**
 * Convert an ExportNamedDeclaration with error handling
 */
function convertExportNamedDeclaration(node: IR.IRExportNamedDeclaration): ts.ExportDeclaration {
  try {
    const specifiers = node.specifiers.map(spec => {
      try {
        return ts.factory.createExportSpecifier(
          false,
          spec.local.name !== spec.exported.name ? 
            ts.factory.createIdentifier(spec.local.name) : 
            undefined,
          ts.factory.createIdentifier(spec.exported.name)
        );
      } catch (error) {
        throw new CodeGenError(
          `Failed to convert export specifier: ${error instanceof Error ? error.message : String(error)}`,
          "export specifier",
          spec
        );
      }
    });
    
    return ts.factory.createExportDeclaration(
      undefined,
      false,
      ts.factory.createNamedExports(specifiers),
      undefined
    );
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    throw new CodeGenError(
      `Failed to convert export named declaration: ${error instanceof Error ? error.message : String(error)}`,
      "export named declaration",
      node
    );
  }
}

/**
 * Convert an ExportVariableDeclaration with error handling
 */
function convertExportVariableDeclaration(node: IR.IRExportVariableDeclaration): ts.Statement[] {
  try {
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
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert export variable declaration: ${error instanceof Error ? error.message : String(error)}`,
      "export variable declaration",
      node
    );
  }
}

/**
 * Convert an InteropIIFE with error handling
 */
function convertInteropIIFE(node: IR.IRInteropIIFE): ts.Expression {
  try {
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
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert interop IIFE: ${error instanceof Error ? error.message : String(error)}`,
      "interop IIFE",
      node
    );
  }
}

/**
 * Convert a CommentBlock with error handling
 */
function convertCommentBlock(node: IR.IRCommentBlock): ts.EmptyStatement {
  try {
    const statement = ts.factory.createEmptyStatement();
    ts.addSyntheticLeadingComment(
      statement,
      ts.SyntaxKind.MultiLineCommentTrivia,
      node.value,
      true
    );
    return statement;
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert comment block: ${error instanceof Error ? error.message : String(error)}`,
      "comment block",
      node
    );
  }
}

/**
 * Convert a Raw node with error handling
 */
function convertRaw(node: IR.IRRaw): ts.ExpressionStatement {
  try {
    // Create a raw code block as a non-executable string
    return ts.factory.createExpressionStatement(
      ts.factory.createIdentifier(node.code)
    );
  } catch (error) {
    throw new CodeGenError(
      `Failed to convert raw code: ${error instanceof Error ? error.message : String(error)}`,
      "raw code",
      node
    );
  }
}

/**
 * Convert an IR Node to a TypeScript Expression with error handling
 */
function convertIRExpr(node: IR.IRNode): ts.Expression {
  try {
    // Add null check to prevent "Cannot read properties of null" errors
    if (!node) {
      console.warn("Null node passed to convertIRExpr, returning 'undefined'");
      return ts.factory.createIdentifier("undefined");
    }
    
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
        throw new CodeGenError(
          `Cannot convert node of type ${IR.IRNodeType[node.type] || node.type} to expression`,
          `IR node ${IR.IRNodeType[node.type] || node.type}`,
          node
        );
    }
  } catch (error) {
    if (error instanceof CodeGenError) {
      throw error; // Re-throw CodeGenError directly
    }
    
    const nodeType = node ? IR.IRNodeType[node.type] || String(node.type) : "unknown";
    throw new CodeGenError(
      `Failed to convert IR node to expression: ${error instanceof Error ? error.message : String(error)}`,
      nodeType,
      node
    );
  }
}

/**
 * Create a module variable name from the source path
 */
function createModuleVariableName(source: string): string {
  try {
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
  } catch (error) {
    throw new CodeGenError(
      `Failed to create module variable name: ${error instanceof Error ? error.message : String(error)}`,
      "module variable name creation",
      source
    );
  }
}