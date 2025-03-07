// src/transpiler/ir-to-ts-ast.ts

import * as IR from "./hql_ir.ts";
import {
  TSNodeType,
  TSSourceFile,
  TSNode,
  TSRaw,
  TSExportDeclaration
} from "./ts-ast-types.ts";

/**
 * Convert an IR program to a TypeScript AST.
 */
export function convertIRToTSAST(program: IR.IRProgram): TSSourceFile {
  const statements: TSNode[] = [];
  for (const node of program.body) {
    const converted = convertNode(node);
    if (converted) {
      if (Array.isArray(converted)) {
        statements.push(...converted);
      } else {
        statements.push(converted);
      }
    }
  }
  return { type: TSNodeType.SourceFile, statements };
}

/**
 * Convert an IR node into a TSRaw node (or array of TSRaw nodes).
 */
function convertNode(node: IR.IRNode): TSRaw | TSRaw[] | null {
  switch (node.type) {
    case IR.IRNodeType.Raw:
      return { type: TSNodeType.Raw, code: (node as IR.IRRaw).code };
    case IR.IRNodeType.NumericLiteral:
      return { type: TSNodeType.Raw, code: (node as IR.IRNumericLiteral).value.toString() };
    case IR.IRNodeType.StringLiteral:
      return { type: TSNodeType.Raw, code: JSON.stringify((node as IR.IRStringLiteral).value) };
    case IR.IRNodeType.Identifier:
      return { type: TSNodeType.Raw, code: (node as IR.IRIdentifier).name };
    case IR.IRNodeType.CallExpression:
      return convertCallExpression(node as IR.IRCallExpression);
    case IR.IRNodeType.NewExpression:
      return convertNewExpression(node as IR.IRNewExpression);
    case IR.IRNodeType.VariableDeclaration:
      return convertVariableDeclaration(node as IR.IRVariableDeclaration);
    case IR.IRNodeType.FunctionDeclaration:
      return convertFunctionDeclaration(node as IR.IRFunctionDeclaration);
    case IR.IRNodeType.ExportDeclaration:
      return convertExportDeclaration(node as IR.IRExportDeclaration);
    case IR.IRNodeType.ImportDeclaration:
      return convertImportDeclaration(node as IR.IRImportDeclaration);
    case IR.IRNodeType.ReturnExpression:
      return convertReturnExpression(node as IR.IRReturnExpression);
    default:
      console.warn(`Unknown IR node type: ${node.type}`);
      return null;
  }
}

/**
 * Convert a call expression.
 */
function convertCallExpression(call: IR.IRCallExpression): TSRaw {
  const callee = convertNode(call.callee);
  const args = call.arguments.map(arg => nodeToString(convertNode(arg)));
  return { type: TSNodeType.Raw, code: `${nodeToString(callee)}(${args.join(", ")})` };
}

/**
 * Convert a new expression.
 */
function convertNewExpression(newExpr: IR.IRNewExpression): TSRaw {
  const callee = nodeToString(convertNode(newExpr.callee));
  const args = newExpr.arguments.map(arg => nodeToString(convertNode(arg)));
  return { type: TSNodeType.Raw, code: `new ${callee}(${args.join(", ")})` };
}

/**
 * Convert a variable declaration.
 * Special handling if the initializer is an import.
 */
function convertVariableDeclaration(vd: IR.IRVariableDeclaration): TSRaw {
  if (vd.init.type === IR.IRNodeType.ImportDeclaration) {
    const varName = (vd.id as IR.IRIdentifier).name;
    const moduleVar = `${varName}_module`;
    const specifier = (vd.init as IR.IRImportDeclaration).specifier;
    const importCode = `import * as ${moduleVar} from "${specifier}";`;
    const assignCode = `const ${varName} = ${moduleVar}.default !== undefined ? ${moduleVar}.default : ${moduleVar};`;
    return { type: TSNodeType.Raw, code: `${importCode}\n${assignCode}` };
  }
  const id = convertNode(vd.id);
  const init = convertNode(vd.init);
  return { type: TSNodeType.Raw, code: `const ${id?.code} = ${init?.code};` };
}

/**
 * Convert a function declaration.
 */
function convertFunctionDeclaration(fn: IR.IRFunctionDeclaration): TSRaw {
  const id = convertNode(fn.id);
  const params = fn.params.map(p => nodeToString(convertNode(p))).join(", ");
  const bodyCode = fn.body.map(n => nodeToString(convertNode(n))).join("\n");
  return { type: TSNodeType.Raw, code: `function ${id?.code}(${params}) {\n${bodyCode}\n}` };
}

/**
 * Convert an export declaration.
 */
function convertExportDeclaration(exp: IR.IRExportDeclaration): TSExportDeclaration {
  return {
    type: TSNodeType.ExportDeclaration,
    exports: exp.exports.map(e => ({ local: e.local.name, exported: e.exported }))
  } as TSExportDeclaration;
}

/**
 * Convert an import declaration.
 * (In our minimal core, imports are handled in variable declarations.)
 */
function convertImportDeclaration(imp: IR.IRImportDeclaration): TSRaw {
  return { type: TSNodeType.Raw, code: `/* Imported module: ${imp.specifier} */` };
}

/**
 * Convert a ReturnExpression into a JS return statement.
 */
function convertReturnExpression(ret: IR.IRReturnExpression): TSRaw {
  const arg = nodeToString(convertNode(ret.argument));
  return { type: TSNodeType.Raw, code: `return ${arg};` };
}

/**
 * Helper to convert a TSRaw node or an array of TSRaw nodes into a string.
 */
function nodeToString(node: TSRaw | TSRaw[] | null): string {
  if (!node) return "";
  if (Array.isArray(node)) {
    return node.map(n => nodeToString(n)).join("\n");
  }
  return node.code || "";
}
