// src/transpiler/integration.ts
import { parse } from "./parser.ts";
import { transformSyntax } from "./syntax-transformer.ts";
import { transformToIR } from "./hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "./ts-ast-to-ts-code.ts";
import { transformAST } from "../transformer.ts";
import { processHql } from "./hql-transpiler.ts";
import { Logger } from "../logger.ts";
import { 
  // Keeping but not using directly
  ErrorUtils as _ErrorUtils, 
  withErrorHandling, 
  registerSourceFile, 
  formatError, 
  getSuggestion,
  createStageErrorHandler
} from "../error-handling.ts";
import { withTypeScriptErrorTranslation } from "./typescript-error-translator.ts";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Process options for HQL transpilation
 */
interface ProcessOptions {
  verbose?: boolean;
  baseDir?: string;
  sourceDir?: string;
  tempDir?: string;
  [key: string]: unknown;
}

/**
 * Enhanced version of existing processHql that adds better error handling
 * This is a drop-in replacement for the original function
 */
export async function enhancedProcessHql(
  source: string, 
  options: ProcessOptions = {}
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
  // Create error handlers for each stage - these are defined but not currently used
  // keeping them for potential future use or to guide developers about intended usage
  const parseErrorHandler = createStageErrorHandler("parsing");
  const _syntaxTransformErrorHandler = createStageErrorHandler("syntax transformation");
  const _irTransformErrorHandler = createStageErrorHandler("IR transformation");
  const _tsGenerationErrorHandler = createStageErrorHandler("TypeScript generation");
  const _astTransformErrorHandler = createStageErrorHandler("AST transformation");
  
  // Create enhanced versions of core functions with proper error handling
  // These are not directly used but are defined to demonstrate how error handling can be applied
  const _enhancedParse = withErrorHandling(
    (input: string) => {
      try {
        return parse(input);
      } catch (error) {
        parseErrorHandler(error instanceof Error ? error : new Error(String(error)));
        throw error; // Never reached, but TypeScript wants it
      }
    },
    { context: "parsing" }
  );
  
  const _enhancedTransformSyntax = withErrorHandling(
    transformSyntax,
    { context: "syntax transformation" }
  );
  
  const _enhancedTransformToIR = withErrorHandling(
    transformToIR,
    { context: "IR transformation" }
  );
  
  const _enhancedGenerateTypeScript = withTypeScriptErrorTranslation(
    withErrorHandling(
      generateTypeScript,
      { context: "TypeScript generation" }
    )
  );
  
  const _enhancedTransformAST = withErrorHandling(
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
export function enhanceTranspilation<T, Args extends unknown[]>(
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
 * REPL instance interface
 */
interface ReplInstance {
  eval: (cmd: string, context: Record<string, unknown>, filename: string, callback: (err: Error | null, result: unknown) => void) => void;
  // Other properties as needed
}

/**
 * Integrate error handling into the REPL
 */
export function enhanceReplErrorReporting(repl: ReplInstance): void {
  // Save the original eval function
  const originalEval = repl.eval;
  
  // Replace with enhanced version
  repl.eval = (
    cmd: string, 
    context: Record<string, unknown>, 
    filename: string, 
    callback: (err: Error | null, result: unknown) => void
  ) => {
    // Register the REPL command as a source
    registerSourceFile("REPL", cmd);
    
    // Call the original with a wrapped callback
    originalEval(cmd, context, filename, (err: Error | null, result: unknown) => {
      if (err) {
        // Get an enhanced version of the error
        const enhancedError = err;
        
        // Format the error for display
        const formattedError = formatError(enhancedError, { useColors: true });
        
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