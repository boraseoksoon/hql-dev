// src/transformer.ts - Refactored with error utilities

import { transformToIR } from "./transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "./transpiler/ts-ast-to-ts-code.ts";
import { expandMacros } from "./s-exp/macro.ts";
import { Logger } from "./logger.ts";
import { Environment } from "./environment.ts";
import { RUNTIME_FUNCTIONS } from "./transpiler/runtime.ts";
import { TranspilerError, TransformError, CodeGenError, MacroError, createErrorReport } from "./transpiler/errors.ts";
import { perform, performAsync } from "./transpiler/error-utils.ts";

/**
 * Options for code transformation.
 */
interface TransformOptions {
  verbose?: boolean;
  bundle?: boolean;
  module?: "esm"; // Only ESM supported
}

/**
 * Transforms HQL AST nodes through the new pipeline.
 * Enhanced with better error tracking and debugging.
 *
 * Steps:
 * 1. Get the global environment (avoids redundant initialization).
 * 2. Expand macros using the unified expansion.
 * 3. Transform the expanded AST into an IR.
 * 4. Generate TypeScript code.
 */
export async function transformAST(
  astNodes: any[],
  currentDir: string,
  options: TransformOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  const startTime = performance.now();
  let currentPhase = "initialization";
  
  try {
    logger.debug(`Starting transformation with ${astNodes.length} AST nodes`);
    logger.debug(`Current directory: ${currentDir}`);
    
    // Get the global environment (reusing existing instance)
    currentPhase = "environment initialization";
    const envStartTime = performance.now();
    
    const env = await performAsync(
      async () => Environment.getGlobalEnv() || 
                   await Environment.initializeGlobalEnv({ verbose: options.verbose }),
      "Failed to initialize environment",
      TranspilerError
    );
    
    const envTime = performance.now() - envStartTime;
    logger.debug(`Environment initialized in ${envTime.toFixed(2)}ms`);
    
    // Expand macros using new macro.ts
    currentPhase = "macro expansion";
    const macroStartTime = performance.now();
    
    const macroExpandedAst = await performAsync(
      async () => await expandMacros(astNodes, env, { 
        verbose: options.verbose,
        currentFile: currentDir
      }),
      "Failed to expand macros",
      MacroError,
      ["", currentDir]
    );
    
    const macroTime = performance.now() - macroStartTime;
    logger.debug(`Macro expansion completed in ${macroTime.toFixed(2)}ms with ${macroExpandedAst.length} nodes`);
    
    // Convert the expanded AST (if needed)
    currentPhase = "AST conversion";
    const astConvStartTime = performance.now();
    
    const convertedAst = perform(
      () => convertAST(macroExpandedAst),
      "Failed to convert AST",
      TranspilerError
    );
    
    const astConvTime = performance.now() - astConvStartTime;
    logger.debug(`AST conversion completed in ${astConvTime.toFixed(2)}ms`);
    
    // Transform the converted AST into IR
    currentPhase = "IR transformation";
    const irStartTime = performance.now();
    
    const ir = perform(
      () => transformToIR(convertedAst, currentDir),
      "Failed to transform AST to IR",
      TransformError,
      [`${convertedAst.length} AST nodes`, "AST to IR transformation", convertedAst]
    );
    
    const irTime = performance.now() - irStartTime;
    logger.debug(`IR transformation completed in ${irTime.toFixed(2)}ms with ${ir.body.length} nodes`);
    
    // Generate TypeScript code from IR
    currentPhase = "TypeScript code generation";
    const tsGenStartTime = performance.now();
    
    const tsCode = perform(
      () => generateTypeScript(ir),
      "Failed to generate TypeScript code",
      CodeGenError,
      ["TypeScript generation", ir]
    );
    
    const tsGenTime = performance.now() - tsGenStartTime;
    logger.debug(`TypeScript code generation completed in ${tsGenTime.toFixed(2)}ms`);
    
    // Prepend the runtime functions to the generated code
    const finalCode = `${RUNTIME_FUNCTIONS}\n\n${tsCode}`;
    
    // Calculate and log total time
    const totalTime = performance.now() - startTime;
    logger.debug(`Total transformation completed in ${totalTime.toFixed(2)}ms`);
    
    // If verbose, log a breakdown of the times
    if (options.verbose) {
      console.log("Transformation time breakdown:");
      console.log(`  Environment setup:   ${envTime.toFixed(2)}ms (${(envTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  Macro expansion:     ${macroTime.toFixed(2)}ms (${(macroTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  AST conversion:      ${astConvTime.toFixed(2)}ms (${(astConvTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  IR transformation:   ${irTime.toFixed(2)}ms (${(irTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  TS code generation:  ${tsGenTime.toFixed(2)}ms (${(tsGenTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  Total:               ${totalTime.toFixed(2)}ms`);
    }
    
    return finalCode;
  } catch (error) {
    // Create a detailed error report
    const errorReport = createErrorReport(
      error instanceof Error ? error : new Error(String(error)),
      `transformation phase: ${currentPhase}`,
      {
        currentDirectory: currentDir,
        options: options,
        nodeCount: astNodes.length
      }
    );
    
    // Always log detailed error report in verbose mode
    if (options.verbose) {
      console.error("Detailed transformation error report:");
      console.error(errorReport);
    }
    
    // Log a warning if this isn't a known TranspilerError type
    if (!(error instanceof TranspilerError)) {
      logger.error(`Unexpected error during ${currentPhase}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    throw error;
  }
}

/**
 * This module takes the raw HQL AST (possibly already macro-expanded)
 * and applies all necessary conversions (e.g., converting export forms, 
 * adjusting syntax, etc.) so that it becomes a "clean" AST ready for IR conversion.
 */
function convertAST(rawAst: any[]): any[] {
  return perform(
    () => {
      // Map through each node and transform export forms into standard HQL node types
      return rawAst.map(node => {
        if (
          node.type === "list" &&
          node.elements.length >= 3 &&
          node.elements[0].type === "symbol" &&
          node.elements[0].name === "export"
        ) {
          const exportNameNode = node.elements[1];
          const localNode = node.elements[2];
          if (exportNameNode.type === "literal" && typeof exportNameNode.value === "string") {
            // Instead of creating an ExportNamedDeclaration node type, create a js-export list
            // which is already handled by the transformation pipeline
            return {
              type: "list",
              elements: [
                { type: "symbol", name: "js-export" },
                exportNameNode,
                localNode
              ]
            };
          }
        }
        
        // Also handle vector exports if they exist in the code
        if (
          node.type === "ExportNamedDeclaration" && 
          node.specifiers && 
          Array.isArray(node.specifiers)
        ) {
          // Convert to a series of standard js-export list nodes
          const exportElements = node.specifiers.map(spec => {
            return {
              type: "list",
              elements: [
                { type: "symbol", name: "js-export" },
                { type: "literal", value: spec.exported.name },
                spec.local
              ]
            };
          });
          
          // If there's only one export, return it directly
          if (exportElements.length === 1) {
            return exportElements[0];
          }
          
          // If there are multiple exports, create a list of them
          return {
            type: "list",
            elements: [
              { type: "symbol", name: "do" },
              ...exportElements
            ]
          };
        }
        
        return node;
      });
    },
    "Error in AST conversion process",
    TranspilerError
  );
}