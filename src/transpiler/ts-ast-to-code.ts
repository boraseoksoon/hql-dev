// src/transpiler/ts-ast-to-code.ts
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
  TSRaw,
  TSObjectLiteral,
  TSPropertyAssignment,
  TSBinaryExpression,
  TSExportDeclaration
} from "./ts-ast-types.ts";

export interface CodeGenerationOptions {
  indentSize?: number;
  useSpaces?: boolean;
  formatting?: "minimal" | "standard" | "pretty";
  module?: "esm" | "commonjs";
}

/**
 * Generate TypeScript/JavaScript code from a TS AST
 */
export function generateTypeScript(ast: TSSourceFile, options?: CodeGenerationOptions): string {
  const config = {
    indentSize: options?.indentSize ?? 2,
    useSpaces: options?.useSpaces !== false,
    formatting: options?.formatting ?? "standard",
    module: options?.module ?? "esm"
  };
  
  const indentChar = config.useSpaces ? " " : "\t";

  /**
   * Generate indentation based on level
   */
  function indent(level: number): string {
    return indentChar.repeat(level * config.indentSize);
  }

  /**
   * Generate code with indentation
   */
  function genWithIndent(node: TSNode, level: number): string {
    const code = gen(node, level);
    if (code.trim().length === 0) return "";
    
    // Skip indentation for raw nodes that already contain newlines
    if (node.type === TSNodeType.Raw && code.includes("\n")) return code;
    
    return indent(level) + code;
  }

  /**
   * Main code generation function
   */
  function gen(node: TSNode, level: number): string {
    if (!node) return "";
    
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
        if (blk.statements.length === 0) return "{}";
        
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
        if (obj.properties.length === 0) return "{}";
        
        // Different formatting options for objects
        if (config.formatting === "minimal") {
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
      
      case TSNodeType.ExportDeclaration: {
        const exp = node as TSExportDeclaration;
        
        // Handle ESM vs CommonJS exports
        if (config.module === "commonjs") {
          return exp.exports
            .map(e => `exports.${e.exported} = ${e.local};`)
            .join("\n");
        } else {
          // ESM exports (default)
          const items = exp.exports.map(e => 
            e.exported === e.local ? e.local : `${e.local} as ${e.exported}`
          );
          return `export { ${items.join(", ")} };`;
        }
      }
      
      default:
        console.warn(`Unhandled TSNode type: ${(node as any).type}`);
        return "";
    }
  }

  // Generate code and clean up multiple newlines
  let code = gen(ast, 0);
  code = code.replace(/\n\s*\n\s*\n/g, "\n\n").trim() + "\n";
  return code;
}