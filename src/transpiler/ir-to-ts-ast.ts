// src/transpiler/ir-to-ts-ast.ts - Complete implementation with all logical operations handling
import * as IR from "./hql_ir.ts";
import {
  TSNodeType,
  TSSourceFile,
  TSNode,
  TSIdentifier,
  TSStringLiteral,
  TSNumericLiteral,
  TSBooleanLiteral,
  TSNullLiteral,
  TSObjectLiteral,
  TSPropertyAssignment,
  TSBinaryExpression,
  TSCallExpression,
  TSFunctionDeclaration,
  TSBlock,
  TSRaw
} from "./ts-ast-types.ts";

/**
 * Determines the appropriate import style for a given module URL.
 */
function determineImportStyle(url: string): 'default' | 'namespace' {
  // Deno standard library modules use namespace imports
  if (url.includes('deno.land/std')) {
    return 'namespace';
  }
  
  // Known modules with namespace exports
  const namespaceModules = [
    'path/', 'datetime/', 'uuid/', 'fs/', 'crypto/',
    'testing/', 'encoding/', 'io/', 'fmt/', 'flags/'
  ];
  
  for (const mod of namespaceModules) {
    if (url.includes(mod)) {
      return 'namespace';
    }
  }
  
  // Default to default imports for other modules
  return 'default';
}

/**
 * Convert an IRProgram into a TSSourceFile.
 */
export function convertIRToTSAST(program: IR.IRProgram): TSSourceFile {
  const statements: TSNode[] = [];
  
  // First pass: process imports to ensure they're at the top
  const imports: TSNode[] = [];
  for (const node of program.body) {
    if (isImport(node)) {
      const importNode = processImport(node);
      if (importNode) imports.push(importNode);
    }
  }
  
  // Second pass: process everything else
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
 */
function processImport(node: IR.IRNode): TSNode | null {
  if (node.type !== IR.IRNodeType.VariableDeclaration) return null;
  
  const vd = node as IR.IRVariableDeclaration;
  const varName = vd.id.name;
  
  const callExpr = vd.init as IR.IRCallExpression;
  if (callExpr.arguments.length !== 1 || callExpr.arguments[0].type !== IR.IRNodeType.StringLiteral) {
    return null;
  }
  
  const url = (callExpr.arguments[0] as IR.IRStringLiteral).value;
  
  if (url.endsWith(".hql")) {
    // HQL module import - bundled as IIFE with path info in comment
    return {
      type: TSNodeType.Raw,
      code: `const ${varName} = (function(){\n  const exports = {};\n  // bundled HQL module: ${url}\n  return exports;\n})();`
    };
  } else {
    // External module import
    const importStyle = determineImportStyle(url);
    if (importStyle === 'namespace') {
      return {
        type: TSNodeType.Raw,
        code: `import * as ${varName} from "${url}";`
      };
    } else {
      return {
        type: TSNodeType.Raw,
        code: `import ${varName} from "${url}";`
      };
    }
  }
}

/**
 * Main IR→TS dispatcher function.
 */
function convertNode(node: IR.IRNode): TSNode | TSNode[] | null {
  switch (node.type) {
    case IR.IRNodeType.StringLiteral:
      return { type: TSNodeType.StringLiteral, text: JSON.stringify((node as IR.IRStringLiteral).value) };

    case IR.IRNodeType.NumericLiteral:
      return { type: TSNodeType.NumericLiteral, text: (node as IR.IRNumericLiteral).value.toString() };

    case IR.IRNodeType.BooleanLiteral:
      return { type: TSNodeType.BooleanLiteral, text: (node as IR.IRBooleanLiteral).value ? "true" : "false" };

    case IR.IRNodeType.NullLiteral:
      return { type: TSNodeType.NullLiteral };

    case IR.IRNodeType.KeywordLiteral: {
      const kw = node as IR.IRKeywordLiteral;
      return { type: TSNodeType.StringLiteral, text: JSON.stringify(":" + kw.value) };
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

    case IR.IRNodeType.CallExpression:
      return convertCallExpression(node as IR.IRCallExpression);

    case IR.IRNodeType.NewExpression:
      return convertNewExpression(node as IR.IRNewExpression);

    case IR.IRNodeType.VariableDeclaration:
      return convertVariableDeclaration(node as IR.IRVariableDeclaration);

    case IR.IRNodeType.FunctionDeclaration:
      return convertFunctionDeclaration(node as IR.IRFunctionDeclaration);

    case IR.IRNodeType.EnumDeclaration:
      return convertEnumDeclaration(node as IR.IREnumDeclaration);

    case IR.IRNodeType.ExportDeclaration:
      return convertExportDeclaration(node as IR.IRExportDeclaration);

    case IR.IRNodeType.Block:
      return convertBlock(node as IR.IRBlock);

    default:
      return null;
  }
}

/**
 * Convert an array literal to a TS node.
 */
function convertArrayLiteral(arr: IR.IRArrayLiteral): TSNode {
  const elements = arr.elements.map(element => {
    const converted = convertNode(element);
    return nodeToString(converted);
  });
  
  return {
    type: TSNodeType.Raw,
    code: `[${elements.join(", ")}]`
  };
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
    if (key.type === TSNodeType.StringLiteral) {
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
  
  return {
    type: TSNodeType.Raw,
    code: `(${nodeToString(left)} ${bin.operator} ${nodeToString(right)})`
  };
}

/**
 * Convert a call expression to a TS node, with special handling for property access and returns.
 */
function convertCallExpression(call: IR.IRCallExpression): TSNode {
  // Skip $$IMPORT calls - they're handled separately
  if (isImportCall(call)) {
    return null;
  }
  
  // Handle property access via get() function
  if (isPropertyAccess(call)) {
    return handlePropertyAccess(call);
  }
  
  // Handle string concatenation via str() function
  if (isStringConcatenation(call)) {
    return handleStringConcatenation(call);
  }
  
  // Handle return statements
  if (isReturnCall(call)) {
    return handleReturnExpression(call);
  }
  
  // Handle higher-order function returns
  if (isHigherOrderReturnCall(call)) {
    return handleHigherOrderReturn(call);
  }
  
  // Handle logical operations
  if (isNotOperation(call)) {
    return handleNotOperation(call);
  }
  
  if (isEqualsOperation(call)) {
    return handleEqualsOperation(call);
  }
  
  // Normal function call
  const callee = convertNode(call.callee);
  const args = call.arguments.map(arg => convertNode(arg));
  
  return {
    type: TSNodeType.Raw,
    code: `${nodeToString(callee)}(${args.map(nodeToString).join(", ")})`
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
 * Check if a call is a property access.
 */
function isPropertyAccess(call: IR.IRCallExpression): boolean {
  return call.callee.type === IR.IRNodeType.Identifier &&
         (call.callee as IR.IRIdentifier).name === "get" &&
         call.arguments.length >= 2;
}

/**
 * Handle property access by generating obj.prop or obj["prop"] syntax.
 */
function handlePropertyAccess(call: IR.IRCallExpression): TSNode {
  const obj = convertNode(call.arguments[0]);
  const prop = call.arguments[1];
  
  // Use dot notation for valid identifiers
  if (prop.type === IR.IRNodeType.StringLiteral) {
    const propName = (prop as IR.IRStringLiteral).value;
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName)) {
      return {
        type: TSNodeType.Raw,
        code: `${nodeToString(obj)}.${propName}`
      };
    } else {
      return {
        type: TSNodeType.Raw,
        code: `${nodeToString(obj)}[${JSON.stringify(propName)}]`
      };
    }
  }
  
  // Use bracket notation for computed properties
  const propNode = convertNode(prop);
  return {
    type: TSNodeType.Raw,
    code: `${nodeToString(obj)}[${nodeToString(propNode)}]`
  };
}

/**
 * Check if a call is a string concatenation.
 */
function isStringConcatenation(call: IR.IRCallExpression): boolean {
  return call.callee.type === IR.IRNodeType.Identifier &&
         (call.callee as IR.IRIdentifier).name === "str";
}

/**
 * Handle string concatenation by using + operators.
 */
function handleStringConcatenation(call: IR.IRCallExpression): TSNode {
  if (call.arguments.length === 0) {
    return { type: TSNodeType.StringLiteral, text: '""' };
  }
  
  const args = call.arguments.map(arg => convertNode(arg));
  return {
    type: TSNodeType.Raw,
    code: args.map(nodeToString).join(" + ")
  };
}

/**
 * Check if a call is a return statement.
 */
function isReturnCall(call: IR.IRCallExpression): boolean {
  return call.callee.type === IR.IRNodeType.Identifier &&
         (call.callee as IR.IRIdentifier).name === "$$RETURN";
}

/**
 * Handle a return expression by generating `return expr;`.
 */
function handleReturnExpression(call: IR.IRCallExpression): TSNode {
  if (call.arguments.length === 0) {
    return { type: TSNodeType.Raw, code: "return" };
  }
  
  const arg = convertNode(call.arguments[0]);
  return {
    type: TSNodeType.Raw,
    code: `return ${nodeToString(arg)}`
  };
}

/**
 * Check if a call is a higher-order function return.
 */
function isHigherOrderReturnCall(call: IR.IRCallExpression): boolean {
  return call.callee.type === IR.IRNodeType.Identifier &&
         (call.callee as IR.IRIdentifier).name === "$RETURN_FUNCTION";
}

/**
 * Handle a higher-order function return without adding an extra "return" keyword.
 * This fixes the double return issue.
 */
function handleHigherOrderReturn(call: IR.IRCallExpression): TSNode {
  if (call.arguments.length === 0) {
    return { type: TSNodeType.Raw, code: "return" };
  }
  
  // If returning a function, handle specially
  const arg = call.arguments[0];
  if (arg.type === IR.IRNodeType.FunctionDeclaration) {
    const fn = arg as IR.IRFunctionDeclaration;
    
    // Process parameters and body
    let parameters: string;
    let body: string;
    
    // Handle named parameters
    if (fn.isNamedParams && fn.namedParamIds && fn.namedParamIds.length > 0) {
      parameters = "params";
      // Process function body with parameter destructuring
      const destructuring = `const { ${fn.namedParamIds.map(id => `${id}: ${id}`).join(", ")} } = params;`;
      body = convertFunctionBody(fn.body, destructuring);
    } else {
      parameters = fn.params.map(p => p.id.name).join(", ");
      body = convertFunctionBody(fn.body);
    }
    
    // Generate a proper function return without double "return" keyword
    return {
      type: TSNodeType.Raw,
      code: `return function(${parameters}) ${body}`
    };
  }
  
  // For non-function returns, handle normally
  const argNode = convertNode(arg);
  return {
    type: TSNodeType.Raw,
    code: `return ${nodeToString(argNode)}`
  };
}

/**
 * Check if a call is a logical not operation.
 */
function isNotOperation(call: IR.IRCallExpression): boolean {
  return call.callee.type === IR.IRNodeType.Identifier &&
         (call.callee as IR.IRIdentifier).name === "not" &&
         call.arguments.length === 1;
}

/**
 * Handle logical not operation.
 */
function handleNotOperation(call: IR.IRCallExpression): TSNode {
  const arg = convertNode(call.arguments[0]);
  return {
    type: TSNodeType.Raw,
    code: `!(${nodeToString(arg)})`
  };
}

/**
 * Check if a call is an equality operation.
 */
function isEqualsOperation(call: IR.IRCallExpression): boolean {
  return call.callee.type === IR.IRNodeType.Identifier &&
         (call.callee as IR.IRIdentifier).name === "=" &&
         call.arguments.length === 2;
}

/**
 * Handle equality operation.
 */
function handleEqualsOperation(call: IR.IRCallExpression): TSNode {
  const left = convertNode(call.arguments[0]);
  const right = convertNode(call.arguments[1]);
  return {
    type: TSNodeType.Raw,
    code: `(${nodeToString(left)} === ${nodeToString(right)})`
  };
}

/**
 * Convert a function declaration to a TS node.
 */
function convertFunctionDeclaration(fn: IR.IRFunctionDeclaration): TSNode {
  const functionName = fn.id.name;
  let parameters: string;
  let body: string;
  
  // Handle named parameters
  if (fn.isNamedParams && fn.namedParamIds && fn.namedParamIds.length > 0) {
    parameters = "params";
    
    // Process function body with parameter destructuring
    const destructuring = `const { ${fn.namedParamIds.map(id => `${id}: ${id}`).join(", ")} } = params;`;
    body = convertFunctionBody(fn.body, destructuring);
  } else {
    parameters = fn.params.map(p => p.id.name).join(", ");
    body = convertFunctionBody(fn.body);
  }
  
  // Anonymous functions use a different syntax
  if (fn.isAnonymous) {
    return {
      type: TSNodeType.Raw,
      code: `function(${parameters}) ${body}`
    };
  }
  
  return {
    type: TSNodeType.Raw,
    code: `function ${functionName}(${parameters}) ${body}`
  };
}

/**
 * Convert a function body to a string, with optional destructuring.
 */
function convertFunctionBody(block: IR.IRBlock, destructuring?: string): string {
  const statements = [...block.body];
  
  // If there are no statements, return empty body
  if (statements.length === 0) {
    return "{}";
  }
  
  // Add return to the last statement if needed
  if (statements.length > 0) {
    const lastIndex = statements.length - 1;
    const lastStmt = statements[lastIndex];
    
    if (!isStatementLike(lastStmt) && !isReturnStatement(lastStmt) && !isHigherOrderReturn(lastStmt)) {
      // Wrap in return statement
      statements[lastIndex] = {
        type: IR.IRNodeType.CallExpression,
        callee: { type: IR.IRNodeType.Identifier, name: "$$RETURN" },
        arguments: [lastStmt],
        isNamedArgs: false
      } as IR.IRCallExpression;
    }
  }
  
  // Convert statements to code
  const lines = statements.map(stmt => {
    const converted = convertNode(stmt);
    return converted ? nodeToString(converted) : "";
  }).filter(line => line.length > 0);
  
  // Add destructuring if provided
  if (destructuring) {
    lines.unshift(destructuring);
  }
  
  // Format with proper indentation
  const indentedLines = lines.map(line => `  ${line}`);
  return `{\n${indentedLines.join("\n")}\n}`;
}

/**
 * Check if a node is already a return statement.
 */
function isReturnStatement(node: IR.IRNode): boolean {
  if (node.type !== IR.IRNodeType.CallExpression) return false;
  const callExpr = node as IR.IRCallExpression;
  return isReturnCall(callExpr) || isHigherOrderReturnCall(callExpr);
}

/**
 * Check if a node is specifically a higher-order function return.
 */
function isHigherOrderReturn(node: IR.IRNode): boolean {
  if (node.type !== IR.IRNodeType.CallExpression) return false;
  return isHigherOrderReturnCall(node as IR.IRCallExpression);
}

/**
 * Convert a new expression to a TS node.
 */
function convertNewExpression(newExpr: IR.IRNewExpression): TSNode {
  const callee = convertNode(newExpr.callee);
  const args = newExpr.arguments.map(arg => convertNode(arg));
  
  return {
    type: TSNodeType.Raw,
    code: `new ${nodeToString(callee)}(${args.map(nodeToString).join(", ")})`
  };
}

/**
 * Convert a variable declaration to a TS node.
 */
function convertVariableDeclaration(vd: IR.IRVariableDeclaration): TSNode {
  // Skip import declarations - they're handled separately
  if (isImport(vd)) {
    return null;
  }
  
  const varName = vd.id.name;
  const initializer = convertNode(vd.init);
  
  // Handle string interpolation
  if (vd.init.type === IR.IRNodeType.StringLiteral) {
    const value = (vd.init as IR.IRStringLiteral).value;
    if (value.includes("\\(")) {
      // Convert \(var) to ${var}
      const templateStr = value.replace(/\\(\(.*?\))/g, "${$1}")
                              .replace(/\(([^)]+)\)/g, "$1");
      
      return {
        type: TSNodeType.Raw,
        code: `const ${varName} = \`${templateStr}\`;`
      };
    }
  }
  
  return {
    type: TSNodeType.Raw,
    code: `const ${varName} = ${nodeToString(initializer)};`
  };
}

/**
 * Convert an enum declaration to a TS node.
 */
function convertEnumDeclaration(enumDecl: IR.IREnumDeclaration): TSNode {
  const enumName = enumDecl.name.name;
  const members = enumDecl.members
    .map(member => `${member}: "${member}"`)
    .join(", ");
  
  return {
    type: TSNodeType.Raw,
    code: `const ${enumName} = { ${members} };`
  };
}

/**
 * Convert an export declaration to a TS node.
 */
function convertExportDeclaration(exportDecl: IR.IRExportDeclaration): TSNode {
  const exportItems = exportDecl.exports
    .map(exp => {
      if (exp.exported === exp.local.name) {
        return exp.local.name;
      } else {
        return `${exp.local.name} as ${exp.exported}`;
      }
    })
    .join(", ");
  
  return {
    type: TSNodeType.Raw,
    code: `export { ${exportItems} };`
  };
}

/**
 * Convert a block to a TS node.
 */
function convertBlock(block: IR.IRBlock): TSNode {
  const statements = block.body.map(stmt => {
    const converted = convertNode(stmt);
    return converted ? nodeToString(converted) : "";
  }).filter(line => line.length > 0);
  
  if (statements.length === 0) {
    return { type: TSNodeType.Raw, code: "{}" };
  }
  
  const indentedStatements = statements.map(stmt => `  ${stmt}`);
  return {
    type: TSNodeType.Raw,
    code: `{\n${indentedStatements.join("\n")}\n}`
  };
}

/**
 * Check if a node is a statement (as opposed to an expression).
 */
function isStatementLike(node: IR.IRNode): boolean {
  switch (node.type) {
    case IR.IRNodeType.VariableDeclaration:
    case IR.IRNodeType.FunctionDeclaration:
    case IR.IRNodeType.ExportDeclaration:
    case IR.IRNodeType.EnumDeclaration:
      return true;
    default:
      return false;
  }
}

/**
 * Convert a TS node to a string.
 */
function nodeToString(node: TSNode | TSNode[] | null): string {
  if (!node) return "";
  if (Array.isArray(node)) {
    return node.map(n => nodeToString(n)).join("\n");
  }
  
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
    default:
      return "";
  }
}