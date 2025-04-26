// src/transpiler/ts-ast-to-ts-code.ts - Simplified version without perform utility or explicit error handling

import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { convertIRNode } from "../pipeline/hql-ir-to-ts-ast.ts";
import { globalLogger as logger } from "../../logger.ts";
import { globalSymbolTable } from "@transpiler/symbol_table.ts";

/**
 * The output of TypeScript code generation, including code and optional source map.
 */
export interface TypeScriptOutput {
  code: string;
  sourceMap?: string;
}

/**
 * Generate TypeScript code from HQL IR using the TypeScript Compiler API.
 * @param ir - The IR program to convert to TypeScript
 * @param options - Generation options including source file path
 */
export async function generateTypeScript(
  ir: IR.IRProgram,
  options: { sourceFilePath?: string; currentFilePath?: string } = {},
): Promise<TypeScriptOutput> {
  logger.debug(`Starting TypeScript code generation from IR with ${ir.body.length} nodes`);

  // Convert HQL IR directly to TypeScript AST
  logger.debug("Converting HQL IR to TypeScript AST");
  const startTime = performance.now();
  const tsAST = await convertHqlIRToTypeScript(ir);
  const conversionTime = performance.now() - startTime;
  logger.debug(`IR to TS AST conversion completed in ${conversionTime.toFixed(2)}ms`);

  
  // Create a printer with formatting options
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
    omitTrailingSemicolon: false,
    noEmitHelpers: true,
  });

  logger.debug("Printing TypeScript AST to code string");
  const printStartTime = performance.now();
  const resultFile = ts.createSourceFile(
    options.sourceFilePath || "output.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
  );

  const code = printer.printNode(ts.EmitHint.Unspecified, tsAST, resultFile);
  const printTime = performance.now() - printStartTime;
  logger.debug(`TS AST printing completed in ${printTime.toFixed(2)}ms with ${code.length} characters`);

  logger.log({
    text: "dump : " + JSON.stringify(globalSymbolTable.dump(), null, 2),
    namespace: "symbol-table",
  });

  return { code };
}

/**
 * Converts HQL IR directly to the official TypeScript AST.
 * @param program - The IR program to convert
 * @returns TypeScript SourceFile
 */
export async function convertHqlIRToTypeScript(
  program: IR.IRProgram,
): Promise<ts.SourceFile> {
  logger.debug(`Converting ${program.body.length} IR nodes to TypeScript statements`);

  const statements: ts.Statement[] = [];

  for (let i = 0; i < program.body.length; i++) {
    const node = program.body[i];
    if (!node) continue;

    const statement = convertIRNode(node);

    if (Array.isArray(statement)) {
      statements.push(...statement);
    } else if (statement) {
      statements.push(statement);
    }
  }

  logger.debug(`Creating source file with ${statements.length} statements`);

  return ts.factory.createSourceFile(
    statements,
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );
}
