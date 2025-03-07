// src/transpiler/ts-ast-to-code.ts

import {
  TSSourceFile,
  TSNode,
  TSNodeType,
  TSRaw,
  TSExportDeclaration
} from "./ts-ast-types.ts";

export interface CodeGenerationOptions {
  indentSize: number;
  useSpaces: boolean;
  formatting: "minimal" | "standard" | "pretty";
  module: "esm" | "commonjs";
}

export function generateTypeScript(ast: TSSourceFile, options?: CodeGenerationOptions): string {
  return ast.statements.map(node => nodeToString(node)).join("\n");
}

function nodeToString(node: TSNode): string {
  if (node.type === TSNodeType.Raw && node.code) {
    return node.code;
  }
  if (node.type === TSNodeType.ExportDeclaration) {
    const exp = node as TSExportDeclaration;
    const exports = exp.exports.map(e => e.exported === e.local ? e.local : `${e.local} as ${e.exported}`).join(", ");
    return `export { ${exports} };`;
  }
  if (node.text) return node.text;
  return "";
}
