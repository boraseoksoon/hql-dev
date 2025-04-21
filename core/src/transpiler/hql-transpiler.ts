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
  parseError
} from "./error/errors.ts";
import { 
  registerSourceFile, 
  formatError, 
  getSuggestion, 
} from "./error/index.ts";
import { globalLogger as logger } from "../logger.ts";
import { ErrorPipeline } from "../common/error-pipeline.ts";

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
    const jsCode = await transformAST(hqlAst, options.baseDir || Deno.cwd(), { verbose: options.verbose });
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
    
    // Handle the error with enhanced details
    return handleProcessError(error, options, logger);
  }
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

function handleProcessError(
  error: unknown,
  options: ProcessOptions,
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
    
    // For all other errors, pretend they happened in the HQL file
    const errorMsg = `Error processing HQL: ${error.message}`;
    throw new ErrorPipeline.ParseError(errorMsg, {
      filePath: hqlFilePath,
      line: 1,
      column: 1,
      source: ErrorPipeline.getSourceFile(hqlFilePath)
    });
  }
  
  // For non-Error objects
  logger.error(`Unknown error: ${String(error)}`);
  throw new ErrorPipeline.ParseError(`Unknown error processing HQL: ${String(error)}`, {
    filePath: hqlFilePath,
    line: 1,
    column: 1,
    source: ErrorPipeline.getSourceFile(hqlFilePath)
  });
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
