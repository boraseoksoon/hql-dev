// src/transpiler/ts-ast-to-code.ts - Improved to handle enhanced function syntax
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

// Cache for generated code fragments to avoid redundant string operations
const codeCache = new Map<TSNode, string>();

// Debug mode
const DEBUG = !!Deno.env.get("HQL_DEBUG");
function debugLog(module: string, ...args: any[]) {
  if (DEBUG) {
    console.log(`[DEBUG:${module}]`, ...args);
  }
}

export function generateTypeScript(ast: TSSourceFile, options?: CodeGenerationOptions): string {
  // Clear cache for a fresh generation
  codeCache.clear();
  
  const config = {
    indentSize: options?.indentSize ?? 2,
    useSpaces: options?.useSpaces !== false,
    formatting: options?.formatting ?? "standard",
    module: options?.module ?? "esm"
  };
  
  const indentChar = config.useSpaces ? " " : "\t";
  const result = gen(ast, 0, config, indentChar);
  
  // Final formatting pass
  let formatted = formatFinalOutput(result, config);
  
  // Apply our robust arrow type annotation removal
  formatted = removeArrowTypeAnnotations(formatted);
  
  // Additional cleanup: remove any lines with just type annotations
  formatted = formatted.replace(/^\s*:\s*\w+\s*;?\s*$/gm, '');
  
  // Clean up any multiple consecutive empty lines
  formatted = formatted.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return formatted;
}

/**
 * Filter out any arrow type annotations that might have leaked through the parser
 * This is a crucial function that prevents type annotations from appearing in JavaScript output
 */
function removeArrowTypeAnnotations(code: string): string {
  // First, fix the specific issue with extra parentheses after params destructuring
  let result = code.replace(/params\s*;\s*\)/g, 'params)');
  
  // Handle single-line arrow types (both simple and complex)
  result = result.replace(/\s*->\s*(?:\w+|\([^)]*\))\s*/g, ' ');
  
  // Handle arrow types that span multiple lines or have nested structures
  result = result.replace(/\s*->\s*[^;{]*(?=;|\{|$)/g, ' ');
  
  // Handle higher-order function type patterns like -> (-> Number Number)
  result = result.replace(/\s*->\s*\(\s*->\s*[^)]*\)/g, ' ');
  
  // Remove any standalone arrow lines in function bodies
  result = result.replace(/^\s*->.*$/gm, '');
  
  // Remove any higher-order function type patterns that might remain
  result = result.replace(/\(\s*->\s*\([^)]*\)[^)]*\)/g, '');
  
  // Remove any "HigherOrderFunctionType:" strings that we might have added
  result = result.replace(/["']HigherOrderFunctionType:.*?["']/g, '""');
  
  // Final cleanup: fix any extra closing parentheses that might have been left behind
  result = result.replace(/;\s*\)(\s*return|\s*{)/g, '$1');
  
  // Clean up any type annotations that were missed
  result = result.replace(/:\s*\w+\s*(?=[\),])/g, '');
  
  return result;
}

function formatFinalOutput(code: string, config: Required<CodeGenerationOptions>): string {
  // Remove excessive blank lines
  let formatted = code.replace(/\n\s*\n\s*\n/g, "\n\n");
  
  // Ensure there's a single newline at the end
  formatted = formatted.trim() + "\n";
  
  // Add spacing between major code sections for "pretty" formatting
  if (config.formatting === "pretty") {
    // Add spacing between function declarations
    formatted = formatted.replace(/}\n(function)/g, "}\n\n$1");
    
    // Add spacing between import sections and code
    formatted = formatted.replace(/((?:import|const).*;\n)\n*((?!import|const))/g, "$1\n\n$2");
    
    // Add spacing before exports
    formatted = formatted.replace(/\n(export)/g, "\n\n$1");
  }
  
  return formatted;
}

function gen(node: TSNode, level: number, config: Required<CodeGenerationOptions>, indentChar: string): string {
  if (!node) return "";
  
  // Check cache first
  const cacheKey = `${node.type}_${level}`;
  if (codeCache.has(node)) {
    return codeCache.get(node)!;
  }
  
  let result = "";
  
  switch (node.type) {
    case TSNodeType.SourceFile: {
      const src = node as TSSourceFile;
      result = src.statements
        .map(s => gen(s, level, config, indentChar))
        .filter(s => s.trim().length > 0)
        .join("\n");
      break;
    }
    
    case TSNodeType.VariableStatement: {
      const vs = node as TSVariableStatement;
      const decls = vs.declarations.map(d => gen(d, 0, config, indentChar)).join(", ");
      result = indent(level, indentChar, config.indentSize) + "const " + decls + ";";
      break;
    }
    
    case TSNodeType.VariableDeclaration: {
      const vd = node as TSVariableDeclaration;
      result = gen(vd.name, 0, config, indentChar) + " = " + gen(vd.initializer, 0, config, indentChar);
      break;
    }
    
    case TSNodeType.FunctionDeclaration: {
      const fn = node as TSFunctionDeclaration;
      result = generateFunctionDeclaration(fn, level, config, indentChar);
      break;
    }
    
    case TSNodeType.Block: {
      const blk = node as TSBlock;
      if (blk.statements.length === 0) {
        result = "{}";
      } else {
        const stmts = blk.statements
          .map(s => generateBlockStatement(s, level + 1, config, indentChar))
          .filter(s => s.length > 0)
          .join("\n");
        
        result = "{\n" + stmts + "\n" + indent(level, indentChar, config.indentSize) + "}";
      }
      break;
    }
    
    case TSNodeType.ExpressionStatement:
      result = gen((node as TSExpressionStatement).expression, level, config, indentChar) + ";";
      break;
      
    case TSNodeType.CallExpression: {
      const ce = node as TSCallExpression;
      result = generateCallExpression(ce, level, config, indentChar);
      break;
    }
    
    case TSNodeType.Identifier:
      result = (node as TSIdentifier).text;
      break;
      
    case TSNodeType.StringLiteral:
      result = (node as TSStringLiteral).text;
      break;
      
    case TSNodeType.NumericLiteral:
      result = (node as TSNumericLiteral).text;
      break;
      
    case TSNodeType.BooleanLiteral:
      result = (node as TSBooleanLiteral).text;
      break;
      
    case TSNodeType.NullLiteral:
      result = "null";
      break;
      
    case TSNodeType.BinaryExpression: {
      const bin = node as TSBinaryExpression;
      result = "(" + gen(bin.left, level, config, indentChar) + " " + bin.operator + " " + gen(bin.right, level, config, indentChar) + ")";
      break;
    }
    
    case TSNodeType.Raw:
      // Raw code can be multi-line, so we need special handling for indentation
      result = handleRawCode((node as TSRaw).code, level, config, indentChar);
      break;
      
    case TSNodeType.ObjectLiteral: {
      const obj = node as TSObjectLiteral;
      result = generateObjectLiteral(obj, level, config, indentChar);
      break;
    }
    
    case TSNodeType.PropertyAssignment: {
      const pa = node as TSPropertyAssignment;
      result = gen(pa.key, 0, config, indentChar) + ": " + gen(pa.initializer, 0, config, indentChar);
      break;
    }
    
    case TSNodeType.ExportDeclaration: {
      const exp = node as TSExportDeclaration;
      result = generateExportDeclaration(exp, level, config, indentChar);
      break;
    }
    
    default:
      console.warn(`Unhandled TSNode type: ${(node as any).type}`);
      result = "";
  }
  
  // Check for any arrow type annotations in the generated code and remove them
  if (typeof result === 'string' && result.includes('->')) {
    result = removeArrowTypeAnnotations(result);
  }
  
  // Cache the result
  codeCache.set(node, result);
  return result;
}

/**
 * Generate a function declaration with proper formatting for parameters
 */
function generateFunctionDeclaration(
  fn: TSFunctionDeclaration,
  level: number,
  config: Required<CodeGenerationOptions>,
  indentChar: string
): string {
  const indentStr = indent(level, indentChar, config.indentSize);
  const name = gen(fn.name, 0, config, indentChar);
  const params = fn.parameters.map(p => gen(p, 0, config, indentChar)).join(", ");
  
  let result = indentStr;
  
  // Handle function expressions vs declarations
  if ((fn as any).isAnonymous) {
    result += (fn as any).needsReturn ? "return " : "";
    result += `function(${params}) `;
  } else {
    result += `function ${name}(${params}) `;
  }
  
  result += gen(fn.body, level, config, indentChar);
  return result;
}

/**
 * Generate a block statement with proper indentation
 */
function generateBlockStatement(
  stmt: TSNode, 
  level: number,
  config: Required<CodeGenerationOptions>,
  indentChar: string
): string {
  const indentStr = indent(level, indentChar, config.indentSize);
  
  // Special handling for raw code
  if (stmt.type === TSNodeType.Raw) {
    const rawCode = (stmt as TSRaw).code;
    
    // Remove any arrow type annotations
    const cleanedCode = removeArrowTypeAnnotations(rawCode);
    
    if (cleanedCode.includes("\n")) {
      // Handle multi-line raw code
      return cleanedCode
        .split("\n")
        .map(line => line.trim() ? indentStr + line : "")
        .join("\n");
    }
    return indentStr + cleanedCode;
  }
  
  const code = gen(stmt, 0, config, indentChar);
  if (code.trim().length === 0) return "";
  
  return indentStr + code;
}

/**
 * Generate a call expression with proper formatting for arguments
 */
function generateCallExpression(
  ce: TSCallExpression,
  level: number,
  config: Required<CodeGenerationOptions>,
  indentChar: string
): string {
  const callee = gen(ce.expression, level, config, indentChar);
  const args = ce.arguments.map(arg => gen(arg, level, config, indentChar));
  
  // For object literals as the single argument, this might be a named parameter call
  const isNamedParamObject = ce.arguments.length === 1 && 
                           ce.arguments[0].type === TSNodeType.ObjectLiteral;
                           
  // For named parameter calls, format the object nicely
  if (isNamedParamObject) {
    const obj = ce.arguments[0] as TSObjectLiteral;
    const props = obj.properties;
    
    // For small objects, use inline format
    if (props.length <= 3 && config.formatting !== "pretty") {
      return `${nodeToString(callee)}({${props.map(p => 
        `${nodeToString(gen(p.key, 0, config, indentChar))}: ${nodeToString(gen(p.initializer, 0, config, indentChar))}`
      ).join(", ")}})`;
    }
    
    // For larger objects, use multi-line format
    const indentStr = indent(level + 1, indentChar, config.indentSize);
    return `${nodeToString(callee)}({\n${props.map(p => 
      `${indentStr}${nodeToString(gen(p.key, 0, config, indentChar))}: ${nodeToString(gen(p.initializer, 0, config, indentChar))}`
    ).join(",\n")}\n${indent(level, indentChar, config.indentSize)}})`;
  }
  
  // For simple calls with few args, use compact format
  if (args.length <= 3 && args.every(a => nodeToString(a).length < 30) && config.formatting !== "pretty") {
    return `${nodeToString(callee)}(${args.map(a => nodeToString(a)).join(", ")})`;
  }
  
  // For complex calls, use multi-line format
  const indentStr = indent(level + 1, indentChar, config.indentSize);
  return `${nodeToString(callee)}(\n${args.map(a => 
    `${indentStr}${nodeToString(a)}`
  ).join(",\n")}\n${indent(level, indentChar, config.indentSize)})`;
}

/**
 * Handle indentation for raw code that might have multiple lines
 */
function handleRawCode(
  rawCode: string,
  level: number,
  config: Required<CodeGenerationOptions>,
  indentChar: string
): string {
  // Clean the raw code of any arrow type annotations
  const cleanedCode = removeArrowTypeAnnotations(rawCode);
  
  if (!cleanedCode.includes("\n")) {
    return indent(level, indentChar, config.indentSize) + cleanedCode;
  }
  
  // For multi-line raw code, preserve its formatting
  // but ensure proper indentation
  const indentStr = indent(level, indentChar, config.indentSize);
  
  return cleanedCode
    .split("\n")
    .map((line, i) => {
      // First line is already indented properly by the caller
      if (i === 0) return line;
      return line.trim() ? indentStr + line : "";
    })
    .join("\n");
}

/**
 * Generate an object literal with proper formatting
 */
function generateObjectLiteral(
  obj: TSObjectLiteral,
  level: number,
  config: Required<CodeGenerationOptions>,
  indentChar: string
): string {
  if (obj.properties.length === 0) return "{}";
  
  // For minimal formatting, use single line
  if (config.formatting === "minimal" && obj.properties.length <= 3) {
    const props = obj.properties.map(p => gen(p, 0, config, indentChar)).join(", ");
    return `{${props}}`;
  }
  
  // Otherwise, use multi-line format
  const indentStr = indent(level + 1, indentChar, config.indentSize);
  const props = obj.properties
    .map(p => indentStr + gen(p, 0, config, indentChar))
    .join(",\n");
    
  return `{\n${props}\n${indent(level, indentChar, config.indentSize)}}`;
}

/**
 * Generate export declarations based on module type
 */
function generateExportDeclaration(
  exp: TSExportDeclaration,
  level: number,
  config: Required<CodeGenerationOptions>,
  indentChar: string
): string {
  const indentStr = indent(level, indentChar, config.indentSize);
  
  if (config.module === "commonjs") {
    // For CommonJS, generate multiple exports.X = Y assignments
    return exp.exports
      .map(e => `${indentStr}exports.${e.exported} = ${e.local};`)
      .join("\n");
  } else {
    // For ESM, generate a single export statement
    const items = exp.exports.map(e => 
      e.exported === e.local ? e.local : `${e.local} as ${e.exported}`
    );
    
    return `${indentStr}export { ${items.join(", ")} };`;
  }
}

/**
 * Helper function to generate indentation
 */
function indent(level: number, indentChar: string, indentSize: number): string {
  return indentChar.repeat(level * indentSize);
}

/**
 * Convert a node to a string 
 */
function nodeToString(node: TSNode | TSNode[] | null | undefined): string {
  // Handle undefined or null
  if (node === undefined || node === null) return "{}"; // Default to empty object
  
  // Handle arrays
  if (Array.isArray(node)) return node.map(n => nodeToString(n)).join("\n");
  
  // Handle individual nodes
  switch (node.type) {
    case TSNodeType.Raw:
      return (node as TSRaw).code;
    case TSNodeType.StringLiteral:
      return (node as TSStringLiteral).text;
    case TSNodeType.NumericLiteral:
      return (node as TSNumericLiteral).text;
    case TSNodeType.BooleanLiteral:
      return (node as TSBooleanLiteral).text;
    case TSNodeType.NullLiteral:
      return "null";
    case TSNodeType.Identifier:
      return (node as TSIdentifier).text;
    case TSNodeType.ExportDeclaration:
      return ""; // Export declarations are handled separately
    default:
      console.warn(`Unhandled TS node type in nodeToString: ${(node as any)?.type}`);
      return "{}"; // Default to empty object instead of empty string
  }
}

/**
 * Filter out all type annotations from generated code
 * This serves as a final safeguard against any type annotations leaking through
 * @param code The generated JavaScript code
 * @returns Clean JavaScript code without type annotations
 */
function filterTypeAnnotations(code: string): string {
  // First pass: Remove arrow type annotations
  let result = removeArrowTypeAnnotations(code);
  
  // Second pass: Remove any encoded type annotations (__TYPE__...)
  result = result.replace(/\s*__TYPE__\{.*?\}\s*/g, ' ');
  
  // Third pass: Remove any lines that only contain type annotations
  result = result.replace(/^\s*:?\s*\w+\s*;?\s*$/gm, '');
  
  // Cleanup: Remove empty lines and normalize whitespace
  result = result.replace(/\n\s*\n/g, '\n\n');
  
  return result;
}