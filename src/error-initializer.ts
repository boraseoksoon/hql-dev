// src/error-initializer.ts
// Central module for initializing and setting up error handling throughout the system

import { 
  setupErrorHandling,
  ErrorUtils 
} from "./error-handling.ts";
import { setupEnhancedErrorHandling, enhanceReplErrorReporting } from "./transpiler/integration.ts";
import { Logger } from "./logger.ts";

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

// Export error utilities for convenience
export { ErrorUtils }; 