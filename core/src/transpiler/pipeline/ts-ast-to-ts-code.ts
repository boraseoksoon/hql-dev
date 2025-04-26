// src/transpiler/ts-ast-to-ts-code.ts - Refactored with perform and performAsync utilities
import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { convertIRNode } from "../pipeline/hql-ir-to-ts-ast.ts";
import { globalLogger as logger } from "../../logger.ts";
import { 
  errorManager, 
  sourceMapper, 
  rewriteJavaScriptSourceMap 
} from "../../error/index.ts";
import { CodeGenError } from "../../error/error-types.ts";

/**
 * The output of TypeScript code generation, including code and optional source map.
 */
export interface TypeScriptOutput {
  code: string;
  sourceMap?: string;
}

/**
 * Generate TypeScript code from HQL IR using the TypeScript Compiler API.
 * Enhanced with better error handling, diagnostics, and source map generation.
 * @param ir - The IR program to convert to TypeScript
 * @param options - Generation options including source file path and source map generation
 */
export async function generateTypeScript(
  ir: IR.IRProgram,
  options: { sourceFilePath?: string, currentFilePath?: string } = {}
): Promise<TypeScriptOutput> {
  const { currentFilePath } = options;  
  
  try {
    logger.debug(
      `Starting TypeScript code generation from IR with ${ir.body.length} nodes`,
    );

    // Validate the IR input
    if (!ir || !ir.body) {
      const location = {
        filePath: options.sourceFilePath || "unknown",
        line: 1,
        column: 1
      };
      
      const codeGenError = errorManager.createCodeGenError(
        "Invalid IR program input: missing or invalid IR structure",
        location
      );
      
      errorManager.reportError(codeGenError);
      throw codeGenError;
    }

    // Convert HQL IR directly to official TS AST
    logger.debug("Converting HQL IR to TypeScript AST");
    const startTime = performance.now();

    const tsAST = await convertHqlIRToTypeScript(ir);

    const conversionTime = performance.now() - startTime;
    logger.debug(
      `IR to TS AST conversion completed in ${conversionTime.toFixed(2)}ms`,
    );

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

    logger.debug(
      `TS AST printing completed in ${
        printTime.toFixed(2)
      }ms with ${code.length} characters`,
    );

    // Generate source map for HQL files
    let sourceMap: string | undefined = undefined;
    
    const isStdlib = currentFilePath && (
      currentFilePath.includes("/lib/stdlib") ||
      currentFilePath.includes("/lib/macro")
    );

    if (!isStdlib && isHqlFile(currentFilePath)) {
      // Create a source map that maps back to HQL
      sourceMap = sourceMapper.generateSourceMapComment(
        options.sourceFilePath || "output.ts"
      );
    }

    return { code, sourceMap };
  } catch (error: unknown) {
    // Get a default location for the error
    const location = {
      filePath: options.sourceFilePath || options.currentFilePath || "unknown",
      line: 1,
      column: 1
    };
    
    // If it's already a HQL error, just rethrow
    if (error instanceof CodeGenError) {
      throw error;
    }
    
    // Create and report a code generation error
    const codeGenError = errorManager.createCodeGenError(
      `Failed to generate TypeScript code: ${
        error instanceof Error ? error.message : String(error)
      }`,
      location
    );
    
    errorManager.reportError(codeGenError);
    throw codeGenError;
  }
}

/**
 * Converts HQL IR directly to the official TypeScript AST.
 * Enhanced with better error handling and diagnostics.
 * @param program - The IR program to convert
 * @returns TypeScript SourceFile
 */
export async function convertHqlIRToTypeScript(program: IR.IRProgram): Promise<ts.SourceFile> {
  try {
    // Validate program input
    if (!program || program.type !== IR.IRNodeType.Program) {
      throw new CodeGenError(
        "Invalid program input: expected IR Program node",
        {
          filePath: "unknown",
          line: 1,
          column: 1
        }
      );
    }

    if (!program.body || !Array.isArray(program.body)) {
      throw new CodeGenError(
        "Invalid program body: expected array of IR nodes",
        {
          filePath: "unknown",
          line: 1,
          column: 1
        }
      );
    }

    logger.debug(
      `Converting ${program.body.length} IR nodes to TypeScript statements`,
    );

    // Process each node, collecting statements
    const statements: ts.Statement[] = [];
    const conversionErrors: string[] = [];

    for (let i = 0; i < program.body.length; i++) {
      const node = program.body[i];

      if (!node) {
        logger.warn(`Skipping null or undefined node at index ${i}`);
        continue;
      }

      try {
        const statement = convertIRNode(node);

        if (Array.isArray(statement)) {
          if (statement.length > 0) {
            statements.push(...statement);
            logger.debug(
              `Converted node ${i} (${
                IR.IRNodeType[node.type]
              }) to ${statement.length} statements`,
            );
          } else {
            logger.debug(
              `Node ${i} (${
                IR.IRNodeType[node.type]
              }) produced empty statement array`,
            );
          }
        } else if (statement) {
          statements.push(statement);
          logger.debug(
            `Converted node ${i} (${
              IR.IRNodeType[node.type]
            }) to single statement`,
          );
        } else {
          logger.debug(
            `Node ${i} (${
              IR.IRNodeType[node.type]
            }) produced null or undefined statement`,
          );
        }
      } catch (error: unknown) {
        // Get source location for error reporting
        const location = (node as any)._sourceLocation || {
          filePath: "unknown",
          line: 1,
          column: 1
        };
        
        // Create and report a code generation error
        const errorMessage = error instanceof Error ? error.message : String(error);
        const codeGenError = errorManager.createCodeGenError(
          `Error converting node ${i} (${IR.IRNodeType[node.type] || "unknown"}): ${errorMessage}`,
          location
        );
        
        errorManager.reportError(codeGenError);
        
        // Collect error but continue processing other nodes
        conversionErrors.push(errorMessage);
      }
    }

    // If there were errors during conversion, log them
    if (conversionErrors.length > 0) {
      logger.error(
        `${conversionErrors.length} errors occurred during IR to TS conversion`,
      );

      // If all nodes failed, throw an error
      if (statements.length === 0) {
        throw new CodeGenError(
          `Failed to convert any nodes to TypeScript. ${conversionErrors.length} errors occurred.`,
          {
            filePath: "unknown",
            line: 1,
            column: 1
          }
        );
      }

      // Otherwise, warn about the errors but continue
      logger.warn(
        `Some nodes failed to convert (${conversionErrors.length} errors), but ${statements.length} statements were generated`,
      );
    }

    // Create the source file using the factory
    logger.debug(
      `Creating source file with ${statements.length} statements`,
    );

    return ts.factory.createSourceFile(
      statements,
      ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None,
    );
  } catch (error: unknown) {
    // If it's already a CodeGenError, just rethrow
    if (error instanceof CodeGenError) {
      throw error;
    }
    
    // Otherwise create a new error
    throw new CodeGenError(
      `Failed to convert IR to TypeScript: ${error instanceof Error ? error.message : String(error)}`,
      {
        filePath: "unknown",
        line: 1,
        column: 1
      }
    );
  }
}

/**
 * Helper function to check if a file is an HQL file
 */
function isHqlFile(filePath?: string): boolean {
  if (!filePath) return false;
  return filePath.endsWith('.hql');
}
