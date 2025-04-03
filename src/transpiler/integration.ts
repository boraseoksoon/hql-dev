// src/transpiler/integration.ts
import { parse } from "./parser.ts";
import { transformSyntax } from "./syntax-transformer.ts";
import { transformToIR } from "./hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "./ts-ast-to-ts-code.ts";
import { transformAST } from "../transformer.ts";
import { processHql } from "./hql-transpiler.ts";
import { Logger } from "../logger.ts";
import { 
  ErrorUtils, 
  withErrorHandling, 
  registerSourceFile, 
  formatError, 
  getSuggestion,
  createStageErrorHandler
} from "../error-handling.ts";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

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