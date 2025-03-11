// src/transpiler/ts-ast-to-code.ts
import * as ts from "npm:typescript";
import * as IR from "./hql_ir.ts";
import { convertHqlIRToTypeScript } from "./hql-ir-to-ts-ast.ts";

/**
 * Generate TypeScript code from HQL IR using the TypeScript Compiler API.
 * This version bypasses the proprietary TS AST step for better performance.
 */
export function generateTypeScript(ir: IR.IRProgram): string {
  try {
    // Convert HQL IR directly to official TS AST
    const tsAST = convertHqlIRToTypeScript(ir);
    
    // Create a printer
    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    });
    
    // Print the node to a string
    const resultFile = ts.createSourceFile(
      "output.ts", 
      "", 
      ts.ScriptTarget.Latest, 
      false
    );
    
    return printer.printNode(ts.EmitHint.Unspecified, tsAST, resultFile);
  } catch (error) {
    console.error("Error generating TypeScript:", error);
    throw new Error(`Failed to generate TypeScript: ${error.message}`);
  }
}