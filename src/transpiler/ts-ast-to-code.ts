// src/transpiler/ts-ast-to-code.ts - Clean implementation
import {
  TSNode,
  TSNodeType,
  TSSourceFile,
  TSVariableStatement,
  TSVariableDeclaration,
  TSFunctionDeclaration,
  TSBlock,
  TSExpressionStatement,
  TSCallExpression,
  TSIdentifier,
  TSStringLiteral,
  TSNumericLiteral,
  TSBooleanLiteral,
  TSNullLiteral,
  TSRaw,
  TSObjectLiteral,
  TSPropertyAssignment,
  TSBinaryExpression,
} from "./ts-ast-types.ts";

export interface CodeGenerationOptions {
  indentSize?: number;
  useSpaces?: boolean;
  formatting?: "minimal" | "standard" | "pretty";
}

/**
 * Generate TypeScript/JavaScript code from a TypeScript AST.
 */
export function generateTypeScript(ast: TSSourceFile, options?: CodeGenerationOptions): string {
  const indentSize = options?.indentSize ?? 2;
  const useSpaces = options?.useSpaces !== false;
  const formatting = options?.formatting ?? "standard";
  const indentChar = useSpaces ? " " : "\t";

  function indent(level: number): string {
    return indentChar.repeat(level * indentSize);
  }

  function genWithIndent(node: TSNode, level: number): string {
    const code = gen(node, level);
    if (code.trim().length === 0) return "";
    
    // Don't indent raw nodes that contain multiline code - they have their own indentation
    if (node.type === TSNodeType.Raw && code.includes("\n")) {
      return code;
    }
    
    return indent(level) + code;
  }

  function gen(node: TSNode, level: number): string {
    switch (node.type) {
      case TSNodeType.SourceFile: {
        const src = node as TSSourceFile;
        return src.statements
          .map(s => gen(s, level))
          .filter(s => s.trim().length > 0)
          .join("\n");
      }
      
      case TSNodeType.VariableStatement: {
        const vs = node as TSVariableStatement;
        const decls = vs.declarations.map(d => gen(d, 0)).join(", ");
        return indent(level) + "const " + decls + ";";
      }
      
      case TSNodeType.VariableDeclaration: {
        const vd = node as TSVariableDeclaration;
        return gen(vd.name, 0) + " = " + gen(vd.initializer, 0);
      }
      
      case TSNodeType.FunctionDeclaration: {
        const fd = node as TSFunctionDeclaration;
        const params = fd.parameters.map(p => gen(p, 0)).join(", ");
        const body = gen(fd.body, level);
        return indent(level) + "function " + gen(fd.name, 0) + "(" + params + ") " + body;
      }
      
      case TSNodeType.Block: {
        const blk = node as TSBlock;
        if (blk.statements.length === 0) {
          return "{}";
        }
        
        const stmts = blk.statements
          .map(s => genWithIndent(s, level + 1))
          .filter(s => s.trim().length > 0)
          .join("\n");
          
        return "{\n" + stmts + "\n" + indent(level) + "}";
      }
      
      case TSNodeType.ExpressionStatement:
        return gen((node as TSExpressionStatement).expression, level) + ";";
        
      case TSNodeType.CallExpression: {
        const ce = node as TSCallExpression;
        const args = ce.arguments.map(arg => gen(arg, level)).join(", ");
        return gen(ce.expression, level) + "(" + args + ")";
      }
      
      case TSNodeType.Identifier:
        return (node as TSIdentifier).text;
        
      case TSNodeType.StringLiteral:
        return (node as TSStringLiteral).text;
        
      case TSNodeType.NumericLiteral:
        return (node as TSNumericLiteral).text;
        
      case TSNodeType.BooleanLiteral:
        return (node as TSBooleanLiteral).text;
        
      case TSNodeType.NullLiteral:
        return "null";
        
      case TSNodeType.BinaryExpression: {
        const bin = node as TSBinaryExpression;
        return "(" + gen(bin.left, level) + " " + bin.operator + " " + gen(bin.right, level) + ")";
      }
      
      case TSNodeType.Raw:
        return (node as TSRaw).code;
        
      case TSNodeType.ObjectLiteral: {
        const obj = node as TSObjectLiteral;
        if (obj.properties.length === 0) {
          return "{}";
        }
        
        if (formatting === "minimal") {
          const props = obj.properties.map(p => gen(p, level)).join(", ");
          return "{" + props + "}";
        } else {
          const props = obj.properties.map(p => genWithIndent(p, level + 1)).join(",\n");
          return "{\n" + props + "\n" + indent(level) + "}";
        }
      }
      
      case TSNodeType.PropertyAssignment: {
        const pa = node as TSPropertyAssignment;
        return gen(pa.key, 0) + ": " + gen(pa.initializer, 0);
      }
      
      default:
        console.warn(`Unhandled TSNode type: ${node.type}`);
        return "";
    }
  }

  let code = gen(ast, 0);
  
  // Simple cleanup - no fancy regex tricks, just basic formatting
  code = code
    // Remove excessive blank lines
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    // Ensure the file ends with a single newline
    .trim() + "\n";
    
  return code;
}