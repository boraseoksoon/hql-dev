// src/transpiler/hql-transpiler.ts - Refactored
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { parse } from "./pipeline/parser.ts";
import { Environment } from "../environment.ts";
import { expandMacros } from "../s-exp/macro.ts";
import { processImports } from "../imports.ts";
import { convertToHqlAst } from "../s-exp/macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { Logger } from "../logger.ts";
import { transformSyntax } from "./pipeline/syntax-transformer.ts";
import { getSystemMacroPaths } from "../s-exp/system-macros.ts";
import {
  ImportError,
  MacroError,
  ParseError,
  TransformError,
  TranspilerError,
} from "../common/error-pipeline.ts";
import { 
  registerSourceFile, 
} from "../common/error-pipeline.ts";
import { globalLogger as logger } from "../logger.ts";
import { ErrorPipeline, RuntimeError } from "../common/error-pipeline.ts";

let globalEnv: Environment | null = null;
let systemMacrosLoaded = false;
const macroExpressionsCache = new Map<string, any[]>();

interface ProcessOptions {
  verbose?: boolean;
  showTiming?: boolean;
  baseDir?: string;
  sourceDir?: string;
  tempDir?: string;
  skipErrorHandling?: boolean;
}

function parseWithHandling(source: string, logger: Logger): any[] {
  try {
    // Use the enhanced error reporting to provide better suggestions
    const result = parse(source);
    logger.debug(`Parsed ${result.length} S-expressions`);
    return result;
  } catch (error: unknown) {
    // Make sure parse errors are always displayed clearly
    if (error instanceof Error) {
      console.error("\nParse Error: " + (error.message || "Unknown parsing error"));
      if (error instanceof ParseError && error.position) {
        const lineInfo = `at line ${error.position.line}, column ${error.position.column}`;
        console.error(lineInfo);
      }
    } else {
      console.error("\nUnknown Parse Error: " + String(error));
    }
    
    // Continue throwing for the rest of the pipeline
    throw error;
  }
}

function transformWithHandling(sexps: any[], verbose: boolean | undefined, logger: Logger) {
  try {
    const result = transformSyntax(sexps, { verbose });
    logger.debug(`Transformed ${result.length} expressions`);
    return result;
  } catch (error: unknown) {
    if (error instanceof TransformError) throw error;
    
    if (error instanceof Error) {
      throw new TransformError(`Failed to transform syntax: ${error.message}`, "syntax transformation", "valid HQL expressions", sexps);
    }
    
    throw new TransformError(`Failed to transform syntax: ${String(error)}`, "syntax transformation", "valid HQL expressions", sexps);
  }
}

async function processImportsWithHandling(sexps: any[], env: Environment, options: ProcessOptions) {
  try {
    await processImports(sexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd(),
      tempDir: options.tempDir,
      currentFile: options.baseDir,
    });
  } catch (error: unknown) {
    if (error instanceof ImportError) throw error;
    
    if (error instanceof Error) {
      throw new ImportError(`Failed to process imports: ${error.message}`, "unknown", options.baseDir, error);
    }
    
    throw new ImportError(`Failed to process imports: ${String(error)}`, "unknown", options.baseDir, undefined);
  }
}

function expandWithHandling(sexps: any[], env: Environment, options: ProcessOptions, logger: Logger) {
  try {
    return expandMacros(sexps, env, {
      verbose: options.verbose,
      currentFile: options.baseDir,
      useCache: true,
    });
  } catch (error: unknown) {
    if (error instanceof MacroError) throw error;
    
    if (error instanceof Error) {
      throw new MacroError(`Failed to expand macros: ${error.message}`, "", options.baseDir, error);
    }
    
    throw new MacroError(`Failed to expand macros: ${String(error)}`, "", options.baseDir, undefined);
  }
}

/**
 * Process HQL source code and return transpiled JavaScript
 */
export async function processHql(
  source: string,
  options: ProcessOptions = {},
): Promise<string> {
  logger.debug("Processing HQL source with S-expression layer");

  // Configure logger based on options
  if (options.verbose) {
    logger.setEnabled(true);
  }
  
  if (options.showTiming) {
    logger.setTimingOptions({ showTiming: true });
    logger.startTiming("hql-process", "Total");
  }

  const sourceFilename = path.basename(options.baseDir || "unknown");
  const sourceFilePath = options.baseDir || "unknown";
  
  // Register source for error enhancement
  registerSourceFile(sourceFilePath, source);

  try {
    // Initialize environment first to set current file
    if (options.showTiming) logger.startTiming("hql-process", "Environment setup");
    const env = await getGlobalEnv(options);
    if (options.baseDir) env.setCurrentFile(options.baseDir);
    if (options.showTiming) logger.endTiming("hql-process", "Environment setup");
    
    // Process all stages with proper error handling
    
    // IMPORTANT: Parse stage must complete successfully before proceeding
    // Syntax errors are fatal and should prevent further processing
    if (options.showTiming) logger.startTiming("hql-process", "Parsing");
    let sexps;
    try {
      sexps = parseWithHandling(source, logger);
      if (options.showTiming) logger.endTiming("hql-process", "Parsing");
    } catch (parseError) {
      // Special case for parse errors - propagate them with the correct file info
      throw handleProcessError(parseError, {
        ...options,
        baseDir: sourceFilePath // Ensure the correct file path is used
      }, logger);
    }
    
    // Only proceed with later stages if parsing succeeded
    if (options.showTiming) logger.startTiming("hql-process", "Syntax transform");
    const canonicalSexps = transformWithHandling(sexps, options.verbose, logger);
    if (options.showTiming) logger.endTiming("hql-process", "Syntax transform");
    
    if (options.showTiming) logger.startTiming("hql-process", "Import processing");
    await processImportsWithHandling(canonicalSexps, env, options);
    if (options.showTiming) logger.endTiming("hql-process", "Import processing");
    
    if (options.showTiming) logger.startTiming("hql-process", "Macro expansion");
    const expanded = expandWithHandling(canonicalSexps, env, options, logger);
    if (options.showTiming) logger.endTiming("hql-process", "Macro expansion");
    
    if (options.showTiming) logger.startTiming("hql-process", "AST conversion");
    const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
    if (options.showTiming) logger.endTiming("hql-process", "AST conversion");
    
    if (options.showTiming) logger.startTiming("hql-process", "JS transformation");
    
    // Define transform options with source map generation
    const transformOptions = {
      verbose: options.verbose,
      generateSourceMap: true,
      sourceFilePath: options.baseDir,
      originalSource: source
    };
    
    // Call transformAST with the enhanced options
    const jsResult = await transformAST(hqlAst, options.baseDir || Deno.cwd(), transformOptions);
    
    // Extract code and handle source map
    let jsCode;
    if (typeof jsResult === 'object' && jsResult !== null) {
      jsCode = jsResult.code;
      
      // Register source map if available
      if (jsResult.sourceMap && options.baseDir) {
        ErrorPipeline.registerSourceMap(
          `${options.baseDir}.js`,
          options.baseDir,
          jsResult.sourceMap,
          source
        );
      }
    } else {
      // Fallback for backward compatibility if transformAST returns a string
      jsCode = String(jsResult);
    }
    
    if (options.showTiming) logger.endTiming("hql-process", "JS transformation");

    if (options.baseDir) env.setCurrentFile(null);

    if (options.showTiming) {
      logger.endTiming("hql-process", "Total");
      logger.logPerformance("hql-process", sourceFilename);
    }
    
    return jsCode;
  } catch (error) {
    if (options.skipErrorHandling) {
      // Rethrow without additional handling
      throw error;
    }
    
    // Extract line and column information from error if available
    let line: number | undefined = undefined;
    let column: number | undefined = undefined;
    
    if (error instanceof Error) {
      // Extract from error message
      const lineMatch = error.message.match(/line\s+(\d+)/i);
      const columnMatch = error.message.match(/column\s+(\d+)/i);
      
      if (lineMatch) line = parseInt(lineMatch[1], 10);
      if (columnMatch) column = parseInt(columnMatch[1], 10);
      
      // Also try extracting from stack trace
      if ((!line || !column) && error.stack) {
        const stackMatch = error.stack.match(/:(\d+):(\d+)/);
        if (stackMatch) {
          line = parseInt(stackMatch[1], 10);
          column = parseInt(stackMatch[2], 10);
        }
      }
      
      // Try to transform error stack with source maps
      try {
        // This requires that transformErrorStack is properly imported from error-source-map-registry.ts
        // or defined in the current file
        if (typeof ErrorPipeline.transformErrorStack === 'function') {
          error = await ErrorPipeline.transformErrorStack(error);
        }
      } catch (transformError) {
        logger.debug(`Failed to transform error stack: ${transformError instanceof Error ? 
          transformError.message : String(transformError)}`);
      }
    }
    
    // Handle the error with enhanced details
    return handleProcessError(error, {
      ...options,
      line,
      column
    }, logger);
  }
}

function handleProcessError(
  error: unknown,
  options: ProcessOptions & { line?: number; column?: number },
  logger: Logger,
): never {
  // The most important thing is to focus ONLY on HQL file errors
  const hqlFilePath = options.baseDir || globalEnv?.getCurrentFile() || "unknown";
  
  if (error instanceof Error) {
    // Parse errors already have most of the info we need - just ensure the file path is correct
    if (error instanceof ParseError && error.position) {
      // Always override the file path to be the HQL file, never an internal implementation file
      const enhancedError = ErrorPipeline.enhanceError(error, {
        filePath: hqlFilePath,  // Force HQL file path
        source: ErrorPipeline.getSourceFile(hqlFilePath),
        // Keep original position info except for the file path
        line: error.position?.line,
        column: error.position?.column
      });
      
      if (enhancedError instanceof ErrorPipeline.HQLError) {
        enhancedError.reported = true;
      }
      
      throw enhancedError;
    }
    
    // For runtime errors that may have position info from source maps
    if (error instanceof RuntimeError || (error.name && error.name.includes('Error'))) {
      const enhancedError = ErrorPipeline.enhanceError(error, {
        filePath: hqlFilePath,
        source: ErrorPipeline.getSourceFile(hqlFilePath),
        line: options.line || (error as any).line,
        column: options.column || (error as any).column
      });
      
      if (enhancedError instanceof ErrorPipeline.HQLError) {
        enhancedError.reported = true;
      }
      
      // Make sure to extract context lines for the error location
      enhancedError.extractSourceAndContext();
      
      throw enhancedError;
    }
    
    // For all other errors, pretend they happened in the HQL file
    const errorMsg = `Error processing HQL: ${error.message}`;
    const errorWithContext = new ErrorPipeline.HQLError(errorMsg, {
      errorType: "RuntimeError",
      sourceLocation: {
        filePath: hqlFilePath,
        line: options.line || 1,
        column: options.column || 1,
        source: ErrorPipeline.getSourceFile(hqlFilePath)
      },
      originalError: error
    });
    
    // Make sure to extract context lines
    errorWithContext.extractSourceAndContext();
    errorWithContext.reported = true;
    
    throw errorWithContext;
  }
  
  // For non-Error objects
  logger.error(`Unknown error: ${String(error)}`);
  const genericError = new ErrorPipeline.HQLError(`Unknown error processing HQL: ${String(error)}`, {
    errorType: "Error",
    sourceLocation: {
      filePath: hqlFilePath,
      line: options.line || 1,
      column: options.column || 1,
      source: ErrorPipeline.getSourceFile(hqlFilePath)
    }
  });
  
  genericError.extractSourceAndContext();
  genericError.reported = true;
  
  throw genericError;
}

export async function loadSystemMacros(env: Environment, options: ProcessOptions): Promise<void> {
  if (systemMacrosLoaded) {
    logger.debug("System macros already loaded, skipping");
    return;
  }

  try {
    const macroPaths = getSystemMacroPaths();
    for (const macroPath of macroPaths) {
      if (env.hasProcessedFile(macroPath)) continue;

      const macroSource = await Deno.readTextFile(macroPath).catch(e => {
        throw new ImportError(`Could not find macro file at ${macroPath}.`, macroPath, undefined, e);
      });
      
      const macroExps = macroExpressionsCache.get(macroPath) || parse(macroSource);
      macroExpressionsCache.set(macroPath, macroExps);

      const transformed = transformSyntax(macroExps, { verbose: options.verbose });

      await processImports(transformed, env, {
        verbose: options.verbose || false,
        baseDir: path.dirname(macroPath),
        currentFile: macroPath,
      });

      expandMacros(transformed, env, { verbose: options.verbose, currentFile: macroPath });
      env.markFileProcessed(macroPath);
    }
    systemMacrosLoaded = true;
  } catch (error) {
    if (error instanceof Error) {
      throw new TranspilerError(`Loading system macro files: ${error.message}`);
    } else {
      throw new TranspilerError(`Loading system macro files: ${String(error)}`);
    }
  }
}

async function getGlobalEnv(options: ProcessOptions): Promise<Environment> {
  if (globalEnv) {
    logger.debug("Reusing existing global environment");
    return globalEnv;
  }

  const t = performance.now();
  logger.debug("Initializing new global environment");
  globalEnv = await Environment.initializeGlobalEnv({ verbose: options.verbose });
  await loadSystemMacros(globalEnv, options);
  logger.debug(`Global environment initialization took ${(performance.now() - t).toFixed(2)}ms`);

  return globalEnv;
}
