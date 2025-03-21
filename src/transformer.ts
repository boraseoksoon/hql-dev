// src/transformer.ts - Enhanced with improved error handling

import { transformToIR } from "./transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "./transpiler/ts-ast-to-ts-code.ts";
import { expandMacros } from "./s-exp/macro.ts";
import { Logger } from "./logger.ts";
import { Environment } from "./environment.ts";
import { convertAST } from "./converter.ts";
import { RUNTIME_FUNCTIONS } from "./transpiler/runtime.ts";
import { TranspilerError, TransformError, CodeGenError, MacroError, createErrorReport } from "./transpiler/errors.ts";

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
  
  try {
    // Track the transformation phases for better error reporting
    let currentPhase = "initialization";
    
    logger.debug(`Starting transformation with ${astNodes.length} AST nodes`);
    logger.debug(`Current directory: ${currentDir}`);
    
    // Get the global environment (reusing existing instance)
    currentPhase = "environment initialization";
    const envStartTime = performance.now();
    const env: Environment = Environment.getGlobalEnv() || 
                            await Environment.initializeGlobalEnv({ verbose: options.verbose });
    const envTime = performance.now() - envStartTime;
    logger.debug(`Environment initialized in ${envTime.toFixed(2)}ms`);
    
    // Expand macros using new macro.ts
    currentPhase = "macro expansion";
    const macroStartTime = performance.now();
    
    try {
      const macroExpandedAst = await expandMacros(astNodes, env, { 
        verbose: options.verbose,
        currentFile: currentDir
      });
      const macroTime = performance.now() - macroStartTime;
      logger.debug(`Macro expansion completed in ${macroTime.toFixed(2)}ms with ${macroExpandedAst.length} nodes`);
      
      // Convert the expanded AST (if needed)
      currentPhase = "AST conversion";
      const astConvStartTime = performance.now();
      const convertedAst = convertAST(macroExpandedAst);
      const astConvTime = performance.now() - astConvStartTime;
      logger.debug(`AST conversion completed in ${astConvTime.toFixed(2)}ms`);
      
      // Transform the converted AST into IR
      currentPhase = "IR transformation";
      const irStartTime = performance.now();
      
      try {
        const ir = transformToIR(convertedAst, currentDir);
        const irTime = performance.now() - irStartTime;
        logger.debug(`IR transformation completed in ${irTime.toFixed(2)}ms with ${ir.body.length} nodes`);
        
        // Generate TypeScript code from IR
        currentPhase = "TypeScript code generation";
        const tsGenStartTime = performance.now();
        
        try {
          const tsCode = generateTypeScript(ir);
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
          // Handle code generation errors
          if (error instanceof CodeGenError) {
            throw error; // Re-throw CodeGenError directly
          }
          
          throw new CodeGenError(
            `Failed to generate TypeScript code: ${error instanceof Error ? error.message : String(error)}`,
            "TypeScript generation",
            ir
          );
        }
      } catch (error) {
        // Handle IR transformation errors
        if (error instanceof TransformError) {
          throw error; // Re-throw TransformError directly
        }
        
        throw new TransformError(
          `Failed to transform AST to IR: ${error instanceof Error ? error.message : String(error)}`,
          `${convertedAst.length} AST nodes`,
          "AST to IR transformation",
          convertedAst
        );
      }
    } catch (error) {
      // Handle macro expansion errors
      if (error instanceof MacroError) {
        throw error; // Re-throw MacroError directly
      }
      
      throw new MacroError(
        `Failed to expand macros: ${error instanceof Error ? error.message : String(error)}`,
        "",
        currentDir,
        error instanceof Error ? error : undefined
      );
    }
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