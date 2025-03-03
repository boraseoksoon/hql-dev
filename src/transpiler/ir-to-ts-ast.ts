// src/transpiler/ir-to-ts-ast.ts - Improved handling of function definitions
import * as IR from "./hql_ir.ts";
import {
  TSNodeType,
  TSSourceFile,
  TSNode,
  TSIdentifier,
  TSStringLiteral,
  TSNumericLiteral,
  TSBooleanLiteral,
  TSRaw,
  TSExportDeclaration
} from "./ts-ast-types.ts";
import { convertImportSpecifier } from "./path-utils.ts";

// Cache for node conversion results to avoid redundant transformations
const nodeConversionCache = new Map<IR.IRNode, TSNode | TSNode[] | null>();

// Debug logging for function conversion
const DEBUG = !!Deno.env.get("HQL_DEBUG");
function debugLog(module: string, ...args: any[]) {
  if (DEBUG) {
    console.log(`[DEBUG:${module}]`, ...args);
  }
}

/**
 * Convert an IRProgram into a TSSourceFile.
 */
export function convertIRToTSAST(program: IR.IRProgram): TSSourceFile {
  // Clear cache for a new conversion
  nodeConversionCache.clear();
  
  const statements: TSNode[] = [];
  
  // First pass: process imports so they're at the top
  const imports: TSNode[] = [];
  for (const node of program.body) {
    if (isImport(node)) {
      const importNode = processImport(node);
      if (importNode) imports.push(importNode);
    }
  }
  
  // Second pass: process all other nodes
  for (const node of program.body) {
    if (!isImport(node)) {
      const converted = convertNode(node);
      if (converted) {
        if (Array.isArray(converted)) statements.push(...converted);
        else statements.push(converted);
      }
    }
  }
  
  return { type: TSNodeType.SourceFile, statements: [...imports, ...statements] };
}

/**
 * Check if a node is an import statement.
 */
function isImport(node: IR.IRNode): boolean {
  if (node.type !== IR.IRNodeType.VariableDeclaration) return false;
  
  const vd = node as IR.IRVariableDeclaration;
  if (vd.init.type !== IR.IRNodeType.CallExpression) return false;
  
  const callExpr = vd.init as IR.IRCallExpression;
  if (callExpr.callee.type !== IR.IRNodeType.Identifier) return false;
  
  return (callExpr.callee as IR.IRIdentifier).name === "$$IMPORT";
}

/**
 * Process an import statement from IR to TS.
 * Enhanced to support all module systems and handle import types better.
 */
function processImport(node: IR.IRNode): TSNode | null {
  if (node.type !== IR.IRNodeType.VariableDeclaration) return null;
  
  const vd = node as IR.IRVariableDeclaration;
  const varName = vd.id.name;
  
  const callExpr = vd.init as IR.IRCallExpression;
  if (callExpr.arguments.length !== 1 || callExpr.arguments[0].type !== IR.IRNodeType.StringLiteral) {
    return null;
  }
  
  let url = (callExpr.arguments[0] as IR.IRStringLiteral).value;
  
  // Convert import specifiers to their canonical form
  url = convertImportSpecifier(url);
  
  // Generate appropriate import based on file type
  if (url.endsWith(".hql")) {
    // HQL imports
    return createNamespaceImport(varName, url);
  } else if (url.endsWith(".js") || url.endsWith(".ts") || url.endsWith(".mjs")) {
    // JavaScript/TypeScript imports
    return createNamespaceImport(varName, url);
  } else {
    // External module imports
    return createUniversalImport(varName, url);
  }
}

/**
 * Creates a standard namespace import.
 */
function createNamespaceImport(varName: string, url: string): TSNode {
  return {
    type: TSNodeType.Raw,
    code: `import * as ${varName}_module from "${url}";\n` +
          `const ${varName} = ${varName}_module.default !== undefined ? ${varName}_module.default : ${varName}_module;`
  };
}

/**
 * Creates a universal import that works with both default and namespace exports.
 */
function createUniversalImport(varName: string, url: string): TSNode {
  return {
    type: TSNodeType.Raw,
    code: `import * as ${varName}_module from "${url}";\n` +
          `const ${varName} = ${varName}_module.default !== undefined ? ${varName}_module.default : ${varName}_module;`
  };
}

/**
 * Main IR→TS dispatcher function.
 */
function convertNode(node: IR.IRNode): TSNode | TSNode[] | null {
  if (!node) return null;
  
  // Check cache first
  if (nodeConversionCache.has(node)) {
    return nodeConversionCache.get(node)!;
  }
  
  let result: TSNode | TSNode[] | null = null;
  
  switch (node.type) {
    case IR.IRNodeType.StringLiteral: {
      const lit = node as IR.IRStringLiteral;
      const value = lit.value;
      // If the string contains HQL interpolation markers, convert to a template literal.
      if (typeof value === "string" && value.includes("\\(")) {
        const converted = value.replace(/\\\((.*?)\)/g, '${$1}');
        result = { type: TSNodeType.Raw, code: `\`${converted}\`` };
      } else {
        result = { type: TSNodeType.StringLiteral, text: JSON.stringify(value) };
      }
      break;
    }
    case IR.IRNodeType.NumericLiteral:
      result = { type: TSNodeType.NumericLiteral, text: (node as IR.IRNumericLiteral).value.toString() };
      break;
    case IR.IRNodeType.BooleanLiteral:
      result = { type: TSNodeType.BooleanLiteral, text: (node as IR.IRBooleanLiteral).value ? "true" : "false" };
      break;
    case IR.IRNodeType.NullLiteral:
      result = { type: TSNodeType.NullLiteral };
      break;
    case IR.IRNodeType.KeywordLiteral: {
      const kw = node as IR.IRKeywordLiteral;
      result = { type: TSNodeType.StringLiteral, text: JSON.stringify(kw.value) };
      break;
    }
    case IR.IRNodeType.Identifier: {
      const idNode = node as IR.IRIdentifier;
      let name = idNode.name;
      
      // Remove leading dot for enum values
      if (name.startsWith(".")) {
        name = name.slice(1);
        // Return as a string literal since this is an enum value
        result = { type: TSNodeType.StringLiteral, text: JSON.stringify(name) };
      } else {
        result = { type: TSNodeType.Identifier, text: name };
      }
      break;
    }
    case IR.IRNodeType.ArrayLiteral:
      result = convertArrayLiteral(node as IR.IRArrayLiteral);
      break;
    case IR.IRNodeType.ObjectLiteral:
      result = convertObjectLiteral(node as IR.IRObjectLiteral);
      break;
    case IR.IRNodeType.BinaryExpression:
      result = convertBinaryExpression(node as IR.IRBinaryExpression);
      break;
    case IR.IRNodeType.AssignmentExpression:
      result = convertAssignmentExpression(node as IR.IRAssignmentExpression);
      break;
    case IR.IRNodeType.ConditionalExpression:
      result = convertConditionalExpression(node as IR.IRConditionalExpression);
      break;
    case IR.IRNodeType.CallExpression:
      result = convertCallExpression(node as IR.IRCallExpression);
      break;
    case IR.IRNodeType.NewExpression:
      result = convertNewExpression(node as IR.IRNewExpression);
      break;
    case IR.IRNodeType.PropertyAccess:
      result = convertPropertyAccess(node as IR.IRPropertyAccess);
      break;
    case IR.IRNodeType.VariableDeclaration:
      result = convertVariableDeclaration(node as IR.IRVariableDeclaration);
      break;
    case IR.IRNodeType.FunctionDeclaration:
      result = convertFunctionDeclaration(node as IR.IRFunctionDeclaration);
      break;
    case IR.IRNodeType.EnumDeclaration:
      result = convertEnumDeclaration(node as IR.IREnumDeclaration);
      break;
    case IR.IRNodeType.ExportDeclaration:
      result = convertExportDeclaration(node as IR.IRExportDeclaration);
      break;
    case IR.IRNodeType.ReturnStatement:
      result = convertReturnStatement(node as IR.IRReturnStatement);
      break;
    case IR.IRNodeType.IfStatement:
      result = convertIfStatement(node as IR.IRIfStatement);
      break;
    case IR.IRNodeType.ForStatement:
      result = convertForStatement(node as IR.IRForStatement);
      break;
    case IR.IRNodeType.Block:
      result = convertBlock(node as IR.IRBlock);
      break;
    default:
      console.warn(`Unknown IR node type: ${node.type}`);
      result = null;
  }
  
  // Cache the result
  nodeConversionCache.set(node, result);
  return result;
}

/**
 * Convert a PropertyAccess node to TS AST.
 */
function convertPropertyAccess(propAccess: IR.IRPropertyAccess): TSNode {
  const obj = nodeToString(convertNode(propAccess.object));
  const prop = convertNode(propAccess.property);
  
  if (propAccess.computed) {
    // Use bracket notation: obj[prop]
    return { 
      type: TSNodeType.Raw, 
      code: `${obj}[${nodeToString(prop)}]` 
    };
  } else {
    // Use dot notation: obj.prop - for string literals
    if (prop?.type === TSNodeType.StringLiteral) {
      try {
        const propName = JSON.parse((prop as TSStringLiteral).text);
        
        // Check if property name is valid for dot notation
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName)) {
          return { type: TSNodeType.Raw, code: `${obj}.${propName}` };
        }
      } catch (e) {
        // If parsing fails, fall back to bracket notation
      }
    }
    
    // Fallback to bracket notation if not a string literal or not a valid identifier
    return { 
      type: TSNodeType.Raw, 
      code: `${obj}[${nodeToString(prop)}]` 
    };
  }
}

/**
 * Convert an assignment expression to TS AST.
 */
function convertAssignmentExpression(assign: IR.IRAssignmentExpression): TSNode {
  const left = convertNode(assign.left);
  const right = convertNode(assign.right);
  
  return { 
    type: TSNodeType.Raw, 
    code: `${nodeToString(left)} = ${nodeToString(right)}` 
  };
}

/**
 * Convert a conditional expression to TS AST.
 */
function convertConditionalExpression(cond: IR.IRConditionalExpression): TSNode {
  const test = convertNode(cond.test);
  const consequent = convertNode(cond.consequent);
  const alternate = convertNode(cond.alternate);
  
  return { 
    type: TSNodeType.Raw, 
    code: `${nodeToString(test)} ? ${nodeToString(consequent)} : ${nodeToString(alternate)}` 
  };
}

/**
 * Convert a ReturnStatement node to TS AST.
 */
function convertReturnStatement(returnStmt: IR.IRReturnStatement): TSNode {
  if (returnStmt.argument === null) {
    return { type: TSNodeType.Raw, code: "return;" };
  }
  
  const arg = nodeToString(convertNode(returnStmt.argument));
  return { type: TSNodeType.Raw, code: `return ${arg};` };
}

/**
 * Convert an if statement to TS AST.
 */
function convertIfStatement(ifStmt: IR.IRIfStatement): TSNode {
  const test = nodeToString(convertNode(ifStmt.test));
  const consequent = nodeToString(convertNode(ifStmt.consequent));
  
  if (ifStmt.alternate) {
    const alternate = nodeToString(convertNode(ifStmt.alternate));
    return { 
      type: TSNodeType.Raw, 
      code: `if (${test}) ${consequent} else ${alternate}` 
    };
  } else {
    return { 
      type: TSNodeType.Raw, 
      code: `if (${test}) ${consequent}` 
    };
  }
}

/**
 * Convert a for statement to TS AST.
 */
function convertForStatement(forStmt: IR.IRForStatement): TSNode {
  const init = nodeToString(convertNode(forStmt.init));
  const test = nodeToString(convertNode(forStmt.test));
  const update = forStmt.update ? nodeToString(convertNode(forStmt.update)) : '';
  const body = nodeToString(convertNode(forStmt.body));
  
  return { 
    type: TSNodeType.Raw, 
    code: `for (${init}; ${test}; ${update}) ${body}` 
  };
}

/**
 * Convert an array literal to a TS node.
 */
function convertArrayLiteral(arr: IR.IRArrayLiteral): TSNode {
  const elements = arr.elements.map(element => nodeToString(convertNode(element)));
  return { type: TSNodeType.Raw, code: `[${elements.join(", ")}]` };
}

/**
 * Convert an object literal to a TS node.
 */
function convertObjectLiteral(obj: IR.IRObjectLiteral): TSNode {
  if (obj.properties.length === 0) {
    return { type: TSNodeType.Raw, code: "{}" };
  }
  
  // Generate properties
  const props = obj.properties.map(prop => {
    const key = convertNode(prop.key);
    const value = convertNode(prop.value);
    
    let keyStr: string;
    
    // Handle different key types
    if (prop.key.type === IR.IRNodeType.StringLiteral) {
      const strValue = (prop.key as IR.IRStringLiteral).value;
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(strValue)) {
        // Use identifier format for valid property names
        keyStr = strValue;
      } else {
        // Use quoted format for other property names
        keyStr = JSON.stringify(strValue);
      }
    } else {
      // Use computed property for other key types
      keyStr = nodeToString(key);
    }
    
    return `${keyStr}: ${nodeToString(value)}`;
  });
  
  // Format as object literal
  return { 
    type: TSNodeType.Raw, 
    code: `{${props.join(", ")}}` 
  };
}

/**
 * Convert a binary expression to a TS node.
 */
function convertBinaryExpression(bin: IR.IRBinaryExpression): TSNode {
  const left = convertNode(bin.left);
  const right = convertNode(bin.right);
  
  // Convert HQL operators to JavaScript operators
  let operator = bin.operator;
  switch (operator) {
    case '=': operator = '==='; break;
    case '!=': operator = '!=='; break;
    default: break;
  }
  
  return { type: TSNodeType.Raw, code: `(${nodeToString(left)} ${operator} ${nodeToString(right)})` };
}

/**
 * Convert a call expression to a TS node, with special handling.
 */
function convertCallExpression(call: IR.IRCallExpression): TSNode {
  // Skip import calls - handled separately
  if (isImportCall(call)) return { type: TSNodeType.Raw, code: "" };
  
  // Handle string concatenation special case
  if (isStringConcatenation(call)) return handleStringConcatenation(call);
  
  // Regular function call
  const callee = convertNode(call.callee);
  
  // Special handling for named parameter calls
  if (call.isNamedArgs && call.arguments.length === 1 && 
      call.arguments[0].type === IR.IRNodeType.ObjectLiteral) {
    const objLiteral = call.arguments[0] as IR.IRObjectLiteral;
    const objStr = nodeToString(convertNode(objLiteral));
    return { type: TSNodeType.Raw, code: `${nodeToString(callee)}(${objStr})` };
  }
  
  // Regular argument list
  const args = call.arguments.map(arg => nodeToString(convertNode(arg)));
  
  // For very long argument lists, format with line breaks
  if (args.length > 3) {
    return { 
      type: TSNodeType.Raw, 
      code: `${nodeToString(callee)}(\n  ${args.join(",\n  ")}\n)` 
    };
  }
  
  return { 
    type: TSNodeType.Raw, 
    code: `${nodeToString(callee)}(${args.join(", ")})` 
  };
}

/**
 * Check if a call is an import call.
 */
function isImportCall(call: IR.IRCallExpression): boolean {
  return call.callee.type === IR.IRNodeType.Identifier &&
         (call.callee as IR.IRIdentifier).name === "$$IMPORT";
}

/**
 * Check if a call is a string concatenation.
 */
function isStringConcatenation(call: IR.IRCallExpression): boolean {
  return call.callee.type === IR.IRNodeType.Identifier &&
         (call.callee as IR.IRIdentifier).name === "str";
}

/**
 * Handle string concatenation - use template literals when possible.
 */
function handleStringConcatenation(call: IR.IRCallExpression): TSNode {
  if (call.arguments.length === 0) return { type: TSNodeType.StringLiteral, text: '""' };
  
  // Check if all items are string literals or identifiers
  const allSimpleTypes = call.arguments.every(arg => 
    arg.type === IR.IRNodeType.StringLiteral || 
    arg.type === IR.IRNodeType.Identifier);
  
  // If simple types, use template literal
  if (allSimpleTypes) {
    const parts = call.arguments.map(arg => {
      if (arg.type === IR.IRNodeType.StringLiteral) {
        return (arg as IR.IRStringLiteral).value;
      } else {
        return "${" + (arg as IR.IRIdentifier).name + "}";
      }
    });
    
    return { type: TSNodeType.Raw, code: "`" + parts.join('') + "`" };
  }
  
  // Otherwise use standard concatenation
  const args = call.arguments.map(arg => nodeToString(convertNode(arg)));
  return { type: TSNodeType.Raw, code: args.join(" + ") };
}

/**
 * Convert a new expression.
 */
function convertNewExpression(newExpr: IR.IRNewExpression): TSNode {
  const callee = nodeToString(convertNode(newExpr.callee));
  const args = newExpr.arguments.map(arg => nodeToString(convertNode(arg)));
  
  if (args.length > 3) {
    return { 
      type: TSNodeType.Raw, 
      code: `new ${callee}(\n  ${args.join(",\n  ")}\n)` 
    };
  }
  
  return { 
    type: TSNodeType.Raw, 
    code: `new ${callee}(${args.join(", ")})` 
  };
}

/**
 * Convert a variable declaration.
 */
function convertVariableDeclaration(vd: IR.IRVariableDeclaration): TSNode {
  if (isImport(vd)) return null;
  const varName = vd.id.name;
  const initializer = nodeToString(convertNode(vd.init));
  return { type: TSNodeType.Raw, code: `${vd.kind} ${varName} = ${initializer};` };
}

/**
 * Convert a function declaration with improved named parameter support.
 */
function convertFunctionDeclaration(fn: IR.IRFunctionDeclaration): TSNode {
  const functionName = fn.id.name;
  
  // Log function details for debugging
  if (DEBUG) {
    debugLog('convertFunctionDeclaration', `Converting function: ${functionName}`);
    debugLog('convertFunctionDeclaration', `isNamedParams: ${fn.isNamedParams}`);
    debugLog('convertFunctionDeclaration', `isAnonymous: ${fn.isAnonymous}`);
    debugLog('convertFunctionDeclaration', `params: ${fn.params.map(p => p.id.name).join(', ')}`);
    if (fn.namedParamIds) {
      debugLog('convertFunctionDeclaration', `namedParamIds: ${fn.namedParamIds.join(', ')}`);
    }
  }
  
  // Generate appropriate function signature based on whether it has named parameters
  if (fn.isNamedParams && fn.namedParamIds && fn.namedParamIds.length > 0) {
    // For named parameters, use a single 'params' parameter and destructure
    const paramsDestructuring = `const { ${fn.namedParamIds.join(", ")} } = params;`;
    let bodyCode = convertFunctionBodyWithExtraCode(fn.body, paramsDestructuring);
    
    // For anonymous functions
    if (fn.isAnonymous) {
      return { 
        type: TSNodeType.Raw, 
        code: `function(params) ${bodyCode}` 
      };
    }
    
    // For named functions
    return { 
      type: TSNodeType.Raw, 
      code: `function ${functionName}(params) ${bodyCode}` 
    };
  } else {
    // Regular parameters
    const paramNames = fn.params.map(p => p.id.name).join(", ");
    let bodyCode = convertFunctionBody(fn.body);
    
    // For anonymous functions
    if (fn.isAnonymous) {
      return { 
        type: TSNodeType.Raw, 
        code: `function(${paramNames}) ${bodyCode}` 
      };
    }
    
    // For named functions
    return { 
      type: TSNodeType.Raw, 
      code: `function ${functionName}(${paramNames}) ${bodyCode}` 
    };
  }
}

/**
 * Convert a function body to JS code.
 */
function convertFunctionBody(block: IR.IRBlock): string {
  const statements = [...block.body];
  if (statements.length === 0) return "{}";
  
  const lines = statements
    .map(stmt => {
      const converted = convertNode(stmt);
      return converted ? nodeToString(converted) : "";
    })
    .filter(line => line.length > 0);
  
  // For single-line bodies, use compact format if short enough
  if (lines.length === 1 && lines[0].length < 40 && !lines[0].includes("\n")) {
    return `{ ${lines[0]} }`;
  }
  
  // For multi-line bodies, indent properly
  const indentedLines = lines.map(line => `  ${line}`);
  return `{\n${indentedLines.join("\n")}\n}`;
}

/**
 * Convert a function body with extra setup code (like destructuring for named params).
 */
function convertFunctionBodyWithExtraCode(block: IR.IRBlock, setupCode: string): string {
  const statements = [...block.body];
  if (statements.length === 0) return `{\n  ${setupCode}\n}`;
  
  const lines = statements
    .map(stmt => {
      const converted = convertNode(stmt);
      return converted ? nodeToString(converted) : "";
    })
    .filter(line => line.length > 0);
  
  // Always use multi-line format with setup code
  const indentedLines = lines.map(line => `  ${line}`);
  return `{\n  ${setupCode}\n${indentedLines.join("\n")}\n}`;
}

/**
 * Convert an enum declaration.
 */
function convertEnumDeclaration(enumDecl: IR.IREnumDeclaration): TSNode {
  const enumName = enumDecl.name.name;
  const members = enumDecl.members.map(member => `${member}: "${member}"`).join(", ");
  
  // For short enums, use single-line format
  if (enumDecl.members.length <= 3) {
    return { type: TSNodeType.Raw, code: `const ${enumName} = { ${members} };` };
  }
  
  // For longer enums, use multi-line format
  const formattedMembers = enumDecl.members.map(member => `  ${member}: "${member}"`).join(",\n");
  return { 
    type: TSNodeType.Raw, 
    code: `const ${enumName} = {\n${formattedMembers}\n};` 
  };
}

/**
 * Convert an export declaration into a structured export node.
 */
function convertExportDeclaration(exportDecl: IR.IRExportDeclaration): TSNode {
  return {
    type: TSNodeType.ExportDeclaration,
    exports: exportDecl.exports.map(exp => ({
      local: exp.local.name,
      exported: exp.exported
    }))
  } as TSExportDeclaration;
}

/**
 * Convert a block with improved formatting for nested blocks.
 */
function convertBlock(block: IR.IRBlock): TSNode {
  const statements = block.body.map(stmt => nodeToString(convertNode(stmt))).filter(line => line.length > 0);
  if (statements.length === 0) return { type: TSNodeType.Raw, code: "{}" };
  
  // For very short blocks with a single statement, consider inline format
  if (statements.length === 1 && statements[0].length < 40 && !statements[0].includes("\n")) {
    return { type: TSNodeType.Raw, code: `{ ${statements[0]} }` };
  }
  
  const indentedStatements = statements.map(stmt => `  ${stmt}`);
  return { type: TSNodeType.Raw, code: `{\n${indentedStatements.join("\n")}\n}` };
}

/**
 * Convert a TS node (or array of nodes) to a string.
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