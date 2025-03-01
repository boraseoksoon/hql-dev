// src/transpiler/ir-to-ts-ast.ts
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

/**
 * Convert an IRProgram into a TSSourceFile.
 */
export function convertIRToTSAST(program: IR.IRProgram): TSSourceFile {
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
  
  switch (node.type) {
    case IR.IRNodeType.StringLiteral: {
      const lit = node as IR.IRStringLiteral;
      const value = lit.value;
      // ★ NEW: If the string contains HQL interpolation markers, convert to a template literal.
      if (typeof value === "string" && value.includes("\\(")) {
        const converted = value.replace(/\\\((.*?)\)/g, '${$1}');
        return { type: TSNodeType.Raw, code: `\`${converted}\`` };
      }
      return { type: TSNodeType.StringLiteral, text: JSON.stringify(value) };
    }
    case IR.IRNodeType.NumericLiteral:
      return { type: TSNodeType.NumericLiteral, text: (node as IR.IRNumericLiteral).value.toString() };
    case IR.IRNodeType.BooleanLiteral:
      return { type: TSNodeType.BooleanLiteral, text: (node as IR.IRBooleanLiteral).value ? "true" : "false" };
    case IR.IRNodeType.NullLiteral:
      return { type: TSNodeType.NullLiteral };
      case IR.IRNodeType.KeywordLiteral: {
        const kw = node as IR.IRKeywordLiteral;
        return { type: TSNodeType.StringLiteral, text: JSON.stringify(kw.value) };
      }
      
    case IR.IRNodeType.Identifier: {
      const idNode = node as IR.IRIdentifier;
      let name = idNode.name;
      
      // Remove leading dot for enum values
      if (name.startsWith(".")) {
        name = name.slice(1);
        // Return as a string literal since this is an enum value
        return { type: TSNodeType.StringLiteral, text: JSON.stringify(name) };
      }
      
      return { type: TSNodeType.Identifier, text: name };
    }
    case IR.IRNodeType.ArrayLiteral:
      return convertArrayLiteral(node as IR.IRArrayLiteral);
    case IR.IRNodeType.ObjectLiteral:
      return convertObjectLiteral(node as IR.IRObjectLiteral);
    case IR.IRNodeType.BinaryExpression:
      return convertBinaryExpression(node as IR.IRBinaryExpression);
    case IR.IRNodeType.AssignmentExpression:
      return convertAssignmentExpression(node as IR.IRAssignmentExpression);
    case IR.IRNodeType.ConditionalExpression:
      return convertConditionalExpression(node as IR.IRConditionalExpression);
    case IR.IRNodeType.CallExpression:
      return convertCallExpression(node as IR.IRCallExpression);
    case IR.IRNodeType.NewExpression:
      return convertNewExpression(node as IR.IRNewExpression);
    case IR.IRNodeType.PropertyAccess:
      return convertPropertyAccess(node as IR.IRPropertyAccess);
    case IR.IRNodeType.VariableDeclaration:
      return convertVariableDeclaration(node as IR.IRVariableDeclaration);
    case IR.IRNodeType.FunctionDeclaration:
      return convertFunctionDeclaration(node as IR.IRFunctionDeclaration);
    case IR.IRNodeType.EnumDeclaration:
      return convertEnumDeclaration(node as IR.IREnumDeclaration);
    case IR.IRNodeType.ExportDeclaration:
      return convertExportDeclaration(node as IR.IRExportDeclaration);
    case IR.IRNodeType.ReturnStatement:
      return convertReturnStatement(node as IR.IRReturnStatement);
    case IR.IRNodeType.IfStatement:
      return convertIfStatement(node as IR.IRIfStatement);
    case IR.IRNodeType.ForStatement:
      return convertForStatement(node as IR.IRForStatement);
    case IR.IRNodeType.Block:
      return convertBlock(node as IR.IRBlock);
    default:
      console.warn(`Unknown IR node type: ${node.type}`);
      return null;
  }
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
      const propName = JSON.parse((prop as TSStringLiteral).text);
      return { 
        type: TSNodeType.Raw, 
        code: `${obj}.${propName}` 
      };
    } else {
      // Fallback to bracket notation if not a string literal
      return { 
        type: TSNodeType.Raw, 
        code: `${obj}[${nodeToString(prop)}]` 
      };
    }
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
  const props = obj.properties.map(prop => {
    const key = convertNode(prop.key);
    const value = convertNode(prop.value);
    
    // Handle computed properties
    if (prop.computed) {
      return `[${nodeToString(key)}]: ${nodeToString(value)}`;
    }
    
    // If key is a string literal without special characters, we can use normal syntax
    if (key?.type === TSNodeType.StringLiteral) {
      const keyStr = (key as TSStringLiteral).text;
      const unquoted = keyStr.slice(1, -1); // Remove quotes
      
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(unquoted)) {
        return `${unquoted}: ${nodeToString(value)}`;
      } else {
        return `[${keyStr}]: ${nodeToString(value)}`;
      }
    }
    
    return `${nodeToString(key)}: ${nodeToString(value)}`;
  });
  
  return { type: TSNodeType.Raw, code: `{${props.join(", ")}}` };
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
  const args = call.arguments.map(arg => nodeToString(convertNode(arg)));
  
  return { type: TSNodeType.Raw, code: `${nodeToString(callee)}(${args.join(", ")})` };
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
 * Handle string concatenation.
 */
function handleStringConcatenation(call: IR.IRCallExpression): TSNode {
  if (call.arguments.length === 0) return { type: TSNodeType.StringLiteral, text: '""' };
  const args = call.arguments.map(arg => nodeToString(convertNode(arg)));
  return { type: TSNodeType.Raw, code: args.join(" + ") };
}

/**
 * Convert a new expression.
 */
function convertNewExpression(newExpr: IR.IRNewExpression): TSNode {
  const callee = nodeToString(convertNode(newExpr.callee));
  const args = newExpr.arguments.map(arg => nodeToString(convertNode(arg)));
  return { type: TSNodeType.Raw, code: `new ${callee}(${args.join(", ")})` };
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
 * Convert a function declaration.
 */
function convertFunctionDeclaration(fn: IR.IRFunctionDeclaration): TSNode {
  const functionName = fn.id.name;
  let parameters: string;
  let body: string;
  
  if (fn.isNamedParams && fn.namedParamIds && fn.namedParamIds.length > 0) {
    parameters = "params";
    const destructuring = `const { ${fn.namedParamIds.join(", ")} } = params;`;
    body = convertFunctionBody(fn.body, destructuring);
  } else {
    parameters = fn.params.map(p => p.id.name).join(", ");
    body = convertFunctionBody(fn.body);
  }
  
  // If the function is anonymous and is used as an expression (not declaration)
  if (fn.isAnonymous) {
    // ★ UPDATED: Removed erroneous "return" keyword.
    return { type: TSNodeType.Raw, code: `function(${parameters}) ${body}` };
  }
  
  return { type: TSNodeType.Raw, code: `function ${functionName}(${parameters}) ${body}` };
}

/**
 * Convert a function body to a string.
 */
function convertFunctionBody(block: IR.IRBlock, destructuring?: string): string {
  const statements = [...block.body];
  if (statements.length === 0) return "{}";
  
  const lines = statements
    .map(stmt => {
      const converted = convertNode(stmt);
      return converted ? nodeToString(converted) : "";
    })
    .filter(line => line.length > 0);
  
  if (destructuring) lines.unshift(destructuring);
  const indentedLines = lines.map(line => `  ${line}`);
  return `{\n${indentedLines.join("\n")}\n}`;
}

/**
 * Convert an enum declaration.
 */
function convertEnumDeclaration(enumDecl: IR.IREnumDeclaration): TSNode {
  const enumName = enumDecl.name.name;
  const members = enumDecl.members.map(member => `${member}: "${member}"`).join(", ");
  return { type: TSNodeType.Raw, code: `const ${enumName} = { ${members} };` };
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
 * Convert a block.
 */
function convertBlock(block: IR.IRBlock): TSNode {
  const statements = block.body.map(stmt => nodeToString(convertNode(stmt))).filter(line => line.length > 0);
  if (statements.length === 0) return { type: TSNodeType.Raw, code: "{}" };
  const indentedStatements = statements.map(stmt => `  ${stmt}`);
  return { type: TSNodeType.Raw, code: `{\n${indentedStatements.join("\n")}\n}` };
}

/**
 * Convert a TS node (or array of nodes) to a string.
 */
function nodeToString(node: TSNode | TSNode[] | null): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(n => nodeToString(n)).join("\n");
  
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
      return "";
    default:
      console.warn(`Unhandled TS node type in nodeToString: ${(node as any).type}`);
      return "";
  }
}
