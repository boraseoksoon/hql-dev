// src/transpiler/ts-ast-to-ts-code.ts - Refactored with perform and performAsync utilities
import * as ts from "npm:typescript";
import * as IR from "./hql_ir.ts";
import { convertIRNode } from "./hql-ir-to-ts-ast.ts";
import { CodeGenError, createErrorReport } from "./errors.ts";
import { Logger } from "../logger.ts";
import { perform, performAsync } from "./error-utils.ts";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Generate TypeScript code from HQL IR using the TypeScript Compiler API.
 * Enhanced with better error handling and diagnostics using perform utility.
 */
export function generateTypeScript(ir: IR.IRProgram): string {
  try {
    logger.debug(`Starting TypeScript code generation from IR with ${ir.body.length} nodes`);
    
    // Validate the IR input
    if (!ir || !ir.body) {
      throw new CodeGenError(
        "Invalid IR program input: missing or invalid IR structure",
        "IR validation",
        ir
      );
    }
    
    // Convert HQL IR directly to official TS AST
    logger.debug("Converting HQL IR to TypeScript AST");
    const startTime = performance.now();
    
    const tsAST = perform(
      () => convertHqlIRToTypeScript(ir),
      "IR to TS AST conversion",
      CodeGenError,
      [ir]
    );
    
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
    
    const code = perform(
      () => {
        // Create an empty source file for printing
        const resultFile = ts.createSourceFile(
          "output.ts", 
          "", 
          ts.ScriptTarget.Latest, 
          false
        );
        
        // Generate the code
        return printer.printNode(ts.EmitHint.Unspecified, tsAST, resultFile);
      },
      "TS AST printing",
      CodeGenError,
      [tsAST]
    );
    
    const printTime = performance.now() - printStartTime;
    logger.debug(`TS AST printing completed in ${printTime.toFixed(2)}ms with ${code.length} characters`);
    
    return code;
  } catch (error) {
    // Create a comprehensive error report
    const errorReport = createErrorReport(
      error instanceof Error ? error : new Error(String(error)),
      "TypeScript code generation",
      {
        irNodeCount: ir?.body?.length || 0,
        irType: ir?.type ? IR.IRNodeType[ir.type] : "unknown"
      }
    );
    
    // Log the error report for detailed diagnostics
    logger.error(`Failed to generate TypeScript code: ${error instanceof Error ? error.message : String(error)}`);
    if (Deno.env.get("HQL_DEBUG") === "1") {
      console.error(errorReport);
    }
    
    // Re-throw CodeGenError, otherwise wrap in CodeGenError
    if (error instanceof CodeGenError) {
      throw error;
    } else {
      throw new CodeGenError(
        `Failed to generate TypeScript code: ${error instanceof Error ? error.message : String(error)}`,
        "TypeScript code generation",
        ir
      );
    }
  }
}

/**
 * Converts HQL IR directly to the official TypeScript AST.
 * Enhanced with better error handling and diagnostics using perform utility.
 */
export function convertHqlIRToTypeScript(program: IR.IRProgram): ts.SourceFile {
  return perform(() => {
    // Validate program input
    if (!program || program.type !== IR.IRNodeType.Program) {
      throw new CodeGenError(
        "Invalid program input: expected IR Program node",
        "IR program validation",
        program
      );
    }
    
    if (!program.body || !Array.isArray(program.body)) {
      throw new CodeGenError(
        "Invalid program body: expected array of IR nodes",
        "IR program body validation",
        program
      );
    }
    
    logger.debug(`Converting ${program.body.length} IR nodes to TypeScript statements`);
    
    // Store any errors that occur during conversion
    const conversionErrors: string[] = [];
    
    // Process each node, collecting statements
    const statements: ts.Statement[] = [];
    
    for (let i = 0; i < program.body.length; i++) {
      const node = program.body[i];
      
      if (!node) {
        logger.warn(`Skipping null or undefined node at index ${i}`);
        continue;
      }
      
      try {
        const statement = perform(
          () => convertIRNode(node),
          `Converting node ${i} (${IR.IRNodeType[node.type] || 'unknown type'})`,
          null // We'll handle errors manually for node conversion
        );
        
        if (Array.isArray(statement)) {
          if (statement.length > 0) {
            statements.push(...statement);
            logger.debug(`Converted node ${i} (${IR.IRNodeType[node.type]}) to ${statement.length} statements`);
          } else {
            logger.debug(`Node ${i} (${IR.IRNodeType[node.type]}) produced empty statement array`);
          }
        } else if (statement) {
          statements.push(statement);
          logger.debug(`Converted node ${i} (${IR.IRNodeType[node.type]}) to single statement`);
        } else {
          logger.debug(`Node ${i} (${IR.IRNodeType[node.type]}) produced null or undefined statement`);
        }
      } catch (error) {
        // Collect errors but continue processing other nodes
        const errorMessage = error instanceof Error ? error.message : String(error);
        conversionErrors.push(`Error converting node ${i} (${IR.IRNodeType[node.type] || 'unknown type'}): ${errorMessage}`);
        logger.error(`Error converting node ${i}: ${errorMessage}`);
      }
    }
    
    // If there were any errors during conversion, log them and throw an error
    if (conversionErrors.length > 0) {
      const errorSummary = conversionErrors.join("\n");
      logger.error(`${conversionErrors.length} errors occurred during IR to TS conversion`);
      
      // If all nodes failed, throw an error
      if (statements.length === 0) {
        throw new CodeGenError(
          `Failed to convert any nodes to TypeScript. Errors:\n${errorSummary}`,
          "IR to TS conversion",
          program.body
        );
      }
      
      // Otherwise, warn about the errors but continue
      logger.warn(`Some nodes failed to convert (${conversionErrors.length} errors), but ${statements.length} statements were generated`);
    }
    
    // Create the source file using the factory
    return perform(
      () => {
        logger.debug(`Creating source file with ${statements.length} statements`);
        
        return ts.factory.createSourceFile(
          statements,
          ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
          ts.NodeFlags.None
        );
      },
      "source file creation",
      CodeGenError,
      [statements]
    );
  }, "IR to TS conversion", CodeGenError, [program]);
}