// src/error-initializer.ts
// Central module for initializing and setting up error handling throughout the system

import { 
  setupErrorHandling,
  ErrorUtils, 
  withErrorHandling, 
  registerSourceFile, 
  formatError, 
  getSuggestion,
  createStageErrorHandler
} from "./error-handling.ts";
import { Logger } from "../../logger.ts";
import { parse } from "../pipeline/parser.ts";
import { transformSyntax } from "../pipeline/syntax-transformer.ts";
import { transformToIR } from "../pipeline/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../pipeline/ts-ast-to-ts-code.ts";
import { transformAST } from "../../transformer.ts";
import { processHql } from "../hql-transpiler.ts";


// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Initialize error handling throughout the system
 * This should be called once at application startup
 */
export function initializeErrorHandling(options: {
  enableGlobalHandlers?: boolean; 
  enableReplEnhancement?: boolean;
  repl?: any;
} = {}): void {
  // Set up global error handling if requested
  if (options.enableGlobalHandlers !== false) {
    setupErrorHandling();
  }
  
  // Set up enhanced error handling for the transpiler pipeline
  setupEnhancedErrorHandling();
  
  // Enhance REPL error reporting if requested and REPL is provided
  if (options.enableReplEnhancement !== false && options.repl) {
    enhanceReplErrorReporting(options.repl);
  }
  
  logger.info("Error handling system has been initialized");
}

/**
 * Get enhanced versions of core functions with proper error handling
 * Use this instead of directly importing the original functions
 */
export async function getEnhancedFunctions() {
  // Import core functions using Deno's dynamic import
  const parserModule = await import("./transpiler/parser.ts");
  const syntaxTransformerModule = await import("./transpiler/syntax-transformer.ts");
  const irTransformerModule = await import("./transpiler/hql-ast-to-hql-ir.ts");
  const tsGeneratorModule = await import("./transpiler/ts-ast-to-ts-code.ts");
  const astTransformerModule = await import("./transformer.ts");
  const hqlTranspilerModule = await import("./transpiler/hql-transpiler.ts");
  
  // Return enhanced versions
  return {
    parse: ErrorUtils.withErrorHandling(parserModule.parse, { context: "parsing" }),
    transformSyntax: ErrorUtils.withErrorHandling(syntaxTransformerModule.transformSyntax, { context: "syntax transformation" }),
    transformToIR: ErrorUtils.withErrorHandling(irTransformerModule.transformToIR, { context: "IR transformation" }),
    generateTypeScript: ErrorUtils.withTypeScriptErrorTranslation(
      ErrorUtils.withErrorHandling(tsGeneratorModule.generateTypeScript, { context: "TypeScript generation" })
    ),
    transformAST: ErrorUtils.withErrorHandling(astTransformerModule.transformAST, { context: "AST transformation" }),
    processHql: async (source: string, options: any = {}) => {
      // Register the source for error reporting
      const sourceId = options.baseDir || "unknown";
      ErrorUtils.registerSourceFile(sourceId, source);
      
      return await ErrorUtils.withErrorHandling(
        async () => await hqlTranspilerModule.processHql(source, options),
        { source, filePath: sourceId, context: "HQL processing" }
      )();
    }
  };
}

/**
 * Enhanced version of existing processHql that adds better error handling
 * This is a drop-in replacement for the original function
 */
export async function enhancedProcessHql(
  source: string, 
  options: { 
    verbose?: boolean; 
    baseDir?: string; 
    sourceDir?: string; 
    tempDir?: string;
  } = {}
): Promise<string> {
  try {
    // Register the source for error reporting
    const sourceId = options.baseDir || "unknown";
    registerSourceFile(sourceId, source);
    
    // Use the original function but with error handling
    return await withErrorHandling(
      async () => await processHql(source, options),
      { source, filePath: sourceId, context: "HQL processing" }
    )();
  } catch (error) {
    // Format error better but still throw
    if (error instanceof Error) {
      // Log the enhanced error
      logger.error(formatError(error, { 
        filePath: options.baseDir,
        useColors: true 
      }));
      
      // Add a better suggestion
      if (options.verbose) {
        logger.info(`Suggestion: ${getSuggestion(error)}`);
      }
    }
    
    throw error;
  }
}

/**
 * Set up enhanced error handling for the core transpiler pipeline
 */
export function setupEnhancedErrorHandling(): void {
  // Create error handlers for each stage
  const parseErrorHandler = createStageErrorHandler("parsing");
  const syntaxTransformErrorHandler = createStageErrorHandler("syntax transformation");
  const irTransformErrorHandler = createStageErrorHandler("IR transformation");
  const tsGenerationErrorHandler = createStageErrorHandler("TypeScript generation");
  const astTransformErrorHandler = createStageErrorHandler("AST transformation");
  
  // Create enhanced versions of core functions with proper error handling
  const enhancedParse = withErrorHandling(
    (input: string) => {
      try {
        return parse(input);
      } catch (error) {
        parseErrorHandler(error, { input: input.substring(0, 100) + "..." });
        throw error; // Never reached, but TypeScript wants it
      }
    },
    { context: "parsing" }
  );
  
  const enhancedTransformSyntax = withErrorHandling(
    transformSyntax,
    { context: "syntax transformation" }
  );
  
  const enhancedTransformToIR = withErrorHandling(
    transformToIR,
    { context: "IR transformation" }
  );
  
  const enhancedGenerateTypeScript = ErrorUtils.withTypeScriptErrorTranslation(
    withErrorHandling(
      generateTypeScript,
      { context: "TypeScript generation" }
    )
  );
  
  const enhancedTransformAST = withErrorHandling(
    transformAST,
    { context: "AST transformation" }
  );
  
  logger.debug("Enhanced error handling has been set up");
  
  // Note: In a production implementation, we'd need to find a way to 
  // replace or monkey-patch the original functions at runtime.
  // One approach is module augmentation if the system supports it.
}

/**
 * Apply error enhancement to a specific transpilation function
 */
export function enhanceTranspilation<T, Args extends any[]>(
  transpileFn: (...args: Args) => Promise<T> | T,
  source: string,
  filePath: string
): (...args: Args) => Promise<T> {
  // Register the source
  registerSourceFile(filePath, source);
  
  // Return a wrapped function
  return withErrorHandling(
    transpileFn,
    { source, filePath, context: "transpilation" }
  );
}

/**
 * Integrate error handling into the REPL
 */
export function enhanceReplErrorReporting(repl: any): void {
  // Save the original eval function
  const originalEval = repl.eval;
  
  // Replace with enhanced version
  repl.eval = (cmd: string, context: any, filename: string, callback: Function) => {
    // Register the REPL command as a source
    registerSourceFile("REPL", cmd);
    
    // Call the original with a wrapped callback
    originalEval(cmd, context, filename, (err: Error | null, result: any) => {
      if (err) {
        const enhancedErr = ErrorUtils.enhanceError(err, { 
          source: cmd,
          filePath: "REPL"
        });
        
        // Format the error for display
        const formattedError = formatError(enhancedErr, { useColors: true });
        
        // Add suggestion
        const suggestion = getSuggestion(err);
        
        // Pass both to the callback
        callback(new Error(formattedError + "\n\nSuggestion: " + suggestion), null);
      } else {
        callback(null, result);
      }
    });
  };
  
  logger.debug("REPL error reporting has been enhanced");
}

export { ErrorUtils }; 

