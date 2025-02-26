// src/ts-ast-to-code.ts
import * as TS from "./ir-to-ts-ast.ts";

/**
 * Options for code generation
 */
export interface CodeGenerationOptions {
  // Indent size (number of spaces or tabs)
  indentSize?: number;
  
  // Whether to use spaces (true) or tabs (false) for indentation
  useSpaces?: boolean;
  
  // Whether to generate JavaScript or TypeScript
  target?: 'javascript' | 'typescript';
  
  // How much whitespace to include
  // 'minimal': minimal whitespace
  // 'standard': standard formatting
  // 'pretty': more extensive formatting
  formatting?: 'minimal' | 'standard' | 'pretty';
}

/**
 * Generate TypeScript or JavaScript code from TS AST.
 */
export function generateTypeScript(ast: TS.TSSourceFile, options?: CodeGenerationOptions): string {
  const config = {
    indentSize: options?.indentSize ?? 2,
    useSpaces: options?.useSpaces ?? true,
    indentChar: options?.useSpaces ?? true ? ' ' : '\t',
    target: options?.target ?? 'javascript',
    formatting: options?.formatting ?? 'standard'
  };
  
  const context = {
    code: '',
    indentLevel: 0,
    config
  };
  
  generateSourceFile(ast, context);
  return context.code;
}

interface GenerationContext {
  code: string;
  indentLevel: number;
  config: {
    indentSize: number;
    useSpaces: boolean;
    indentChar: string;
    target: 'javascript' | 'typescript';
    formatting: 'minimal' | 'standard' | 'pretty';
  };
}

function generateSourceFile(node: TS.TSSourceFile, context: GenerationContext): void {
  for (const statement of node.statements) {
    generateNode(statement, context);
    context.code += '\n';
  }
}

function generateNode(node: TS.TSNode, context: GenerationContext): void {
  if (!node) {
    console.warn("Attempted to generate code for undefined node");
    return;
  }
  
  switch (node.type) {
    case TS.TSNodeType.VariableStatement:
      generateVariableStatement(node as TS.TSVariableStatement, context);
      break;
    case TS.TSNodeType.FunctionDeclaration:
      generateFunctionDeclaration(node as TS.TSFunctionDeclaration, context);
      break;
    case TS.TSNodeType.FunctionExpression:
      generateFunctionExpression(node as TS.TSFunctionExpression, context);
      break;
    case TS.TSNodeType.EnumDeclaration:
      generateEnumDeclaration(node as TS.TSEnumDeclaration, context);
      break;
    case TS.TSNodeType.ImportDeclaration:
      generateImportDeclaration(node as TS.TSImportDeclaration, context);
      break;
    case TS.TSNodeType.ExportDeclaration:
      generateExportDeclaration(node as TS.TSExportDeclaration, context);
      break;
    case TS.TSNodeType.BinaryExpression:
      generateBinaryExpression(node as TS.TSBinaryExpression, context);
      break;
    case TS.TSNodeType.CallExpression:
      generateCallExpression(node as TS.TSCallExpression, context);
      break;
    case TS.TSNodeType.PropertyAccessExpression:
      generatePropertyAccessExpression(node as TS.TSPropertyAccessExpression, context);
      break;
    case TS.TSNodeType.ElementAccessExpression:
      generateElementAccessExpression(node as TS.TSElementAccessExpression, context);
      break;
    case TS.TSNodeType.Identifier:
      generateIdentifier(node as TS.TSIdentifier, context);
      break;
    case TS.TSNodeType.StringLiteral:
      generateStringLiteral(node as TS.TSStringLiteral, context);
      break;
    case TS.TSNodeType.NumericLiteral:
      generateNumericLiteral(node as TS.TSNumericLiteral, context);
      break;
    case TS.TSNodeType.BooleanLiteral:
      generateBooleanLiteral(node as TS.TSBooleanLiteral, context);
      break;
    case TS.TSNodeType.NullLiteral:
      generateNullLiteral(node as TS.TSNullLiteral, context);
      break;
    case TS.TSNodeType.ArrayLiteralExpression:
      generateArrayLiteralExpression(node as TS.TSArrayLiteralExpression, context);
      break;
    case TS.TSNodeType.ObjectLiteralExpression:
      generateObjectLiteralExpression(node as TS.TSObjectLiteralExpression, context);
      break;
    case TS.TSNodeType.Block:
      generateBlock(node as TS.TSBlock, context);
      break;
    case TS.TSNodeType.ReturnStatement:
      generateReturnStatement(node as TS.TSReturnStatement, context);
      break;
    case TS.TSNodeType.ExpressionStatement:
      generateExpressionStatement(node as TS.TSExpressionStatement, context);
      break;
    case TS.TSNodeType.NewExpression:
      generateNewExpression(node as TS.TSNewExpression, context);
      break;
    default:
      console.warn(`Unhandled node type: ${node.type}`);
      break;
  }
}

function generateVariableStatement(node: TS.TSVariableStatement, context: GenerationContext): void {
    const list = node.declarationList;
    const flags = list.flags;
    
    let keyword = 'var';
    if (flags === TS.VariableFlags.Let) {
      keyword = 'let';
    } else if (flags === TS.VariableFlags.Const) {
      keyword = 'const';
    }
    
    context.code += addIndent(context);
    context.code += keyword + ' ';
    
    for (let i = 0; i < list.declarations.length; i++) {
      const decl = list.declarations[i];
      generateNode(decl.name, context);
      
      // Only add type annotations for TypeScript target
      if (context.config.target === 'typescript' && decl.typeNode) {
        context.code += ': ';
        generateNode(decl.typeNode, context);
      }
      
      if (decl.initializer) {
        context.code += ' = ';
        
        // Don't add semicolons after nested variable declarations
        // This prevents issues like "const x = const y = 5;;"
        const prevLength = context.code.length;
        generateNode(decl.initializer, context);
        
        // Remove any trailing semicolons from the initializer
        if (context.code.endsWith(';')) {
          context.code = context.code.slice(0, -1);
        }
      }
      
      if (i < list.declarations.length - 1) {
        context.code += ', ';
      }
    }
    
    context.code += ';';
  }

function generateFunctionDeclaration(node: TS.TSFunctionDeclaration, context: GenerationContext): void {
    context.code += addIndent(context);
    context.code += 'function ';
    
    if (node.name) {
      generateNode(node.name, context);
    }
    
    context.code += '(';
    
    for (let i = 0; i < node.parameters.length; i++) {
      generateParameter(node.parameters[i], context);
      if (i < node.parameters.length - 1) {
        context.code += ', ';
      }
    }
    
    context.code += ')';
    
    // Only add return type for TypeScript target
    if (context.config.target === 'typescript' && node.type) {
      context.code += ': ';
      generateNode(node.type, context);
    }
    
    context.code += ' ';
    generateNode(node.body, context);
  }

  function generateFunctionExpression(node: TS.TSFunctionExpression, context: GenerationContext): void {
    // Do not include the word 'function' if it's already part of a variable declaration
    context.code += 'function';
    
    if (node.name) {
      context.code += ' ';
      generateNode(node.name, context);
    }
    
    context.code += '(';
    
    for (let i = 0; i < node.parameters.length; i++) {
      generateParameter(node.parameters[i], context);
      if (i < node.parameters.length - 1) {
        context.code += ', ';
      }
    }
    
    context.code += ')';
    
    // Only add return type for TypeScript target
    if (context.config.target === 'typescript' && node.type) {
      context.code += ': ';
      generateNode(node.type, context);
    }
    
    context.code += ' ';
    generateNode(node.body, context);
  }

function generateParameter(node: TS.TSParameter, context: GenerationContext): void {
  if (node.isRest) {
    context.code += '...';
  }
  
  generateNode(node.name, context);
  
  if (node.isOptional) {
    context.code += '?';
  }
  
  // Only add type annotations for TypeScript target
  if (context.config.target === 'typescript' && node.type) {
    context.code += ': ';
    generateNode(node.type, context);
  }
  
  if (node.initializer) {
    context.code += ' = ';
    generateNode(node.initializer, context);
  }
}

function generateEnumDeclaration(node: TS.TSEnumDeclaration, context: GenerationContext): void {
  // For JavaScript, we'll generate a plain object instead of an enum
  if (context.config.target === 'javascript') {
    context.code += addIndent(context);
    context.code += 'const ';
    generateNode(node.name, context);
    context.code += ' = {';
    
    if (node.members.length > 0) {
      context.code += ' ';
      
      for (let i = 0; i < node.members.length; i++) {
        const member = node.members[i];
        generateNode(member.name, context);
        context.code += ': ';
        
        if (member.initializer) {
          generateNode(member.initializer, context);
        } else {
          // Default initializer (string literal with the name)
          context.code += `"${(member.name as TS.TSIdentifier).text}"`;
        }
        
        if (i < node.members.length - 1) {
          context.code += ', ';
        }
      }
      
      context.code += ' ';
    }
    
    context.code += '};';
  } else {
    // TypeScript enum
    context.code += addIndent(context);
    context.code += 'enum ';
    generateNode(node.name, context);
    context.code += ' {';
    
    if (node.members.length > 0) {
      context.code += '\n';
      context.indentLevel++;
      
      for (let i = 0; i < node.members.length; i++) {
        const member = node.members[i];
        context.code += addIndent(context);
        generateNode(member.name, context);
        
        if (member.initializer) {
          context.code += ' = ';
          generateNode(member.initializer, context);
        }
        
        context.code += i < node.members.length - 1 ? ',\n' : '\n';
      }
      
      context.indentLevel--;
      context.code += addIndent(context);
    }
    
    context.code += '}';
  }
}

function generateImportDeclaration(node: TS.TSImportDeclaration, context: GenerationContext): void {
  context.code += addIndent(context);
  context.code += 'import ';
  
  if (node.importClause) {
    if (node.importClause.name) {
      generateNode(node.importClause.name, context);
      
      if (node.importClause.namedBindings) {
        context.code += ', ';
      }
    }
    
    if (node.importClause.namedBindings) {
      if (node.importClause.namedBindings.type === TS.TSNodeType.NamedImports) {
        const namedImports = node.importClause.namedBindings as TS.TSNamedImports;
        
        context.code += '{ ';
        
        for (let i = 0; i < namedImports.elements.length; i++) {
          const element = namedImports.elements[i];
          
          if (element.propertyName) {
            generateNode(element.propertyName, context);
            context.code += ' as ';
          }
          
          generateNode(element.name, context);
          
          if (i < namedImports.elements.length - 1) {
            context.code += ', ';
          }
        }
        
        context.code += ' }';
      } else {
        // Namespace import
        context.code += '* as ';
        generateNode(node.importClause.namedBindings as any, context);
      }
    }
    
    context.code += ' from ';
  }
  
  generateNode(node.moduleSpecifier, context);
  context.code += ';';
}

function generateExportDeclaration(node: TS.TSExportDeclaration, context: GenerationContext): void {
  context.code += addIndent(context);
  context.code += 'export ';
  
  if (node.exportClause) {
    context.code += '{ ';
    
    const elements = node.exportClause.elements;
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      
      if (element.propertyName) {
        generateNode(element.propertyName, context);
        context.code += ' as ';
      }
      
      generateNode(element.name, context);
      
      if (i < elements.length - 1) {
        context.code += ', ';
      }
    }
    
    context.code += ' }';
    
    if (node.moduleSpecifier) {
      context.code += ' from ';
      generateNode(node.moduleSpecifier, context);
    }
  }
  
  context.code += ';';
}

function generateBinaryExpression(node: TS.TSBinaryExpression, context: GenerationContext): void {
  generateNode(node.left, context);
  context.code += ` ${node.operator} `;
  generateNode(node.right, context);
}

function generateCallExpression(node: TS.TSCallExpression, context: GenerationContext): void {
  generateNode(node.expression, context);
  context.code += '(';
  
  for (let i = 0; i < node.arguments.length; i++) {
    generateNode(node.arguments[i], context);
    if (i < node.arguments.length - 1) {
      context.code += ', ';
    }
  }
  
  context.code += ')';
}

function generatePropertyAccessExpression(node: TS.TSPropertyAccessExpression, context: GenerationContext): void {
  generateNode(node.expression, context);
  context.code += '.';
  generateNode(node.name, context);
}

function generateElementAccessExpression(node: TS.TSElementAccessExpression, context: GenerationContext): void {
  generateNode(node.expression, context);
  context.code += '[';
  generateNode(node.argumentExpression, context);
  context.code += ']';
}

function generateIdentifier(node: TS.TSIdentifier, context: GenerationContext): void {
  context.code += node.text;
}

function generateStringLiteral(node: TS.TSStringLiteral, context: GenerationContext): void {
  // Check if this is a template string (starts with backtick)
  if (node.text.startsWith('`') && node.text.endsWith('`')) {
    context.code += node.text;
  } else {
    // Regular string
    context.code += node.text;
  }
}

function generateNumericLiteral(node: TS.TSNumericLiteral, context: GenerationContext): void {
  context.code += node.text;
}

function generateBooleanLiteral(node: TS.TSBooleanLiteral, context: GenerationContext): void {
  context.code += node.value ? 'true' : 'false';
}

function generateNullLiteral(node: TS.TSNullLiteral, context: GenerationContext): void {
  context.code += 'null';
}

function generateArrayLiteralExpression(node: TS.TSArrayLiteralExpression, context: GenerationContext): void {
  context.code += '[';
  
  for (let i = 0; i < node.elements.length; i++) {
    generateNode(node.elements[i], context);
    if (i < node.elements.length - 1) {
      context.code += ', ';
    }
  }
  
  context.code += ']';
}

function generateObjectLiteralExpression(node: TS.TSObjectLiteralExpression, context: GenerationContext): void {
  if (node.properties.length === 0) {
    context.code += '{}';
    return;
  }
  
  const useMultiline = node.properties.length > 2 && context.config.formatting !== 'minimal';
  
  if (useMultiline) {
    context.code += '{\n';
    context.indentLevel++;
    
    for (let i = 0; i < node.properties.length; i++) {
      const prop = node.properties[i];
      context.code += addIndent(context);
      
      if (prop.type === TS.TSNodeType.PropertyAssignment) {
        const propAssignment = prop as TS.TSPropertyAssignment;
        
        if (propAssignment.name.type === TS.TSNodeType.ComputedPropertyName) {
          context.code += '[';
          generateNode((propAssignment.name as TS.TSComputedPropertyName).expression, context);
          context.code += ']';
        } else {
          generateNode(propAssignment.name, context);
        }
        
        context.code += ': ';
        generateNode(propAssignment.initializer, context);
      } else {
        generateNode(prop, context);
      }
      
      if (i < node.properties.length - 1) {
        context.code += ',';
      }
      
      context.code += '\n';
    }
    
    context.indentLevel--;
    context.code += addIndent(context) + '}';
  } else {
    context.code += '{ ';
    
    for (let i = 0; i < node.properties.length; i++) {
      const prop = node.properties[i];
      
      if (prop.type === TS.TSNodeType.PropertyAssignment) {
        const propAssignment = prop as TS.TSPropertyAssignment;
        
        if (propAssignment.name.type === TS.TSNodeType.ComputedPropertyName) {
          context.code += '[';
          generateNode((propAssignment.name as TS.TSComputedPropertyName).expression, context);
          context.code += ']';
        } else {
          generateNode(propAssignment.name, context);
        }
        
        context.code += ': ';
        generateNode(propAssignment.initializer, context);
      } else {
        generateNode(prop, context);
      }
      
      if (i < node.properties.length - 1) {
        context.code += ', ';
      }
    }
    
    context.code += ' }';
  }
}

function generateBlock(node: TS.TSBlock, context: GenerationContext): void {
  const useMultiline = node.statements.length > 0 && context.config.formatting !== 'minimal';
  
  if (useMultiline) {
    context.code += '{\n';
    context.indentLevel++;
    
    for (const statement of node.statements) {
      generateNode(statement, context);
      context.code += '\n';
    }
    
    context.indentLevel--;
    context.code += addIndent(context) + '}';
  } else {
    context.code += '{';
    
    if (node.statements.length > 0) {
      context.code += ' ';
      
      for (let i = 0; i < node.statements.length; i++) {
        generateNode(node.statements[i], context);
        if (i < node.statements.length - 1) {
          context.code += ' ';
        }
      }
      
      context.code += ' ';
    }
    
    context.code += '}';
  }
}

function generateReturnStatement(node: TS.TSReturnStatement, context: GenerationContext): void {
  context.code += addIndent(context);
  context.code += 'return';
  
  if (node.expression) {
    context.code += ' ';
    generateNode(node.expression, context);
  }
  
  context.code += ';';
}

function generateExpressionStatement(node: TS.TSExpressionStatement, context: GenerationContext): void {
  context.code += addIndent(context);
  generateNode(node.expression, context);
  context.code += ';';
}

function generateNewExpression(node: TS.TSNewExpression, context: GenerationContext): void {
  context.code += 'new ';
  generateNode(node.expression, context);
  context.code += '(';
  
  for (let i = 0; i < node.arguments.length; i++) {
    generateNode(node.arguments[i], context);
    if (i < node.arguments.length - 1) {
      context.code += ', ';
    }
  }
  
  context.code += ')';
}

function addIndent(context: GenerationContext): string {
  const { indentLevel, config } = context;
  return config.indentChar.repeat(indentLevel * config.indentSize);
}