// src/transpiler/hql-transpiler.ts - Refactored
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { sexpToString } from "../s-exp/types.ts";
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
} from "./error/error-handling.ts";

let globalEnv: Environment | null = null;
let systemMacrosLoaded = false;
const macroExpressionsCache = new Map<string, any[]>();

interface ProcessOptions {
  verbose?: boolean;
  baseDir?: string;
  sourceDir?: string;
  tempDir?: string;
  skipRebuild?: boolean;
  skipErrorHandling?: boolean;
}

/**
 * Process HQL source code and return transpiled JavaScript
 */
export async function processHql(
  source: string,
  options: ProcessOptions = {},
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.debug("Processing HQL source with S-expression layer");

  const timings = new Map<string, number>();
  const start = () => performance.now();
  const end = (label: string, s: number) => {
    const t = performance.now() - s;
    timings.set(label, t);
    logger.debug(`${label} completed in ${t.toFixed(2)}ms`);
  };

  const sourceFilename = options.baseDir ? path.basename(options.baseDir) : "unknown";
  const sourceFilePath = options.baseDir || "unknown";
  
  // Register source for error enhancement
  registerSourceFile(sourceFilePath, source);

  try {
    // Process all stages with proper error handling
    const t0 = start();
    const sexps = parseWithHandling(source, logger);
    end("Parsing", t0);
    
    const t1 = start();
    const canonicalSexps = transformWithHandling(sexps, options.verbose, logger);
    end("Syntax transform", t1);
    
    const t2 = start();
    const env = await getGlobalEnv(options);
    if (options.baseDir) env.setCurrentFile(options.baseDir);
    end("Environment setup", t2);
    
    const t3 = start();
    await processImportsWithHandling(canonicalSexps, env, options);
    end("Import processing", t3);
    
    const t4 = start();
    const expanded = expandWithHandling(canonicalSexps, env, options, logger);
    end("Macro expansion", t4);
    
    const t5 = start();
    const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
    end("AST conversion", t5);
    
    const t6 = start();
    const jsCode = await transformAST(hqlAst, options.baseDir || Deno.cwd(), { verbose: options.verbose });
    end("JS transformation", t6);

    if (options.baseDir) env.setCurrentFile(null);

    if (options.verbose) logPerformance(timings, sourceFilename);
    return jsCode;
  } catch (error) {
    if (options.skipErrorHandling) {
      // Rethrow without additional handling
      throw error;
    }
    
    // Handle the error with enhanced details
    return handleProcessError(error, source, options, sourceFilename, logger);
  }
}

function parseWithHandling(source: string, logger: Logger) {
  try {
    const sexps = parse(source);
    logger.debug(`Parsed ${sexps.length} S-expressions`);
    return sexps;
  } catch (error: unknown) {
    if (error instanceof ParseError) {
      // Enhance the parse error with source context
      throw parseError(error, true);
    }
    
    if (error instanceof Error) {
      throw new ParseError(`Failed to parse HQL source: ${error.message}`, { line: 1, column: 1, offset: 0 }, source);
    }
    
    throw new ParseError(`Failed to parse HQL source: ${String(error)}`, { line: 1, column: 1, offset: 0 }, source);
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

function logExpressions(label: string, sexps: any[], logger: Logger) {
  const maxLog = 5;
  logger.debug(`${label} ${sexps.length} expressions`);
  sexps.slice(0, maxLog).forEach((s, i) => logger.debug(`${label} ${i + 1}: ${sexpToString(s)}`));
  if (sexps.length > maxLog) logger.debug(`...and ${sexps.length - maxLog} more expressions`);
}

function logPerformance(timings: Map<string, number>, file: string) {
  const total = Array.from(timings.values()).reduce((a, b) => a + b, 0);
  console.log(`✅ Successfully processed ${file} in ${total.toFixed(2)}ms`);
  console.log("Performance metrics:");
  for (const [label, time] of timings.entries()) {
    console.log(`  ${label.padEnd(20)} ${time.toFixed(2)}ms (${((time / total) * 100).toFixed(1)}%)`);
  }
  console.log(`  Total                ${total.toFixed(2)}ms`);
}

function handleProcessError(
  error: unknown,
  source: string,
  options: ProcessOptions,
  sourceFilename: string,
  logger: Logger,
): never {
  if (error instanceof Error) {
    // Format the error with enhanced details
    const formattedError = formatError(error, { 
      filePath: options.baseDir,
      useColors: true,
      includeStack: options.verbose 
    });
    
    // Log the enhanced error message
    logger.error(`❌ Error processing HQL: ${formattedError}`);
    
    // Add suggestion if verbose
    if (options.verbose) {
      const suggestion = getSuggestion(error);
      logger.info(`Suggestion: ${suggestion}`);
    }
    
    // Rethrow the original error
    throw error;
  } else {
    // For non-Error objects, convert to TranspilerError
    const genericError = new TranspilerError(`Error processing HQL: ${String(error)}`);
    logger.error(`❌ ${genericError.message}`);
    throw genericError;
  }
}

export async function loadSystemMacros(env: Environment, options: ProcessOptions): Promise<void> {
  const logger = new Logger(options.verbose || false);
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

      // Skip macros that reference example files when in REPL mode
      if (options.skipRebuild && 
          (macroSource.includes('/examples/') || 
           macroSource.includes('\\examples\\') || 
           macroSource.includes('examples/'))) {
        logger.debug(`Skipping macro that references example files: ${macroPath} (REPL mode)`);
        env.markFileProcessed(macroPath);
        continue;
      }

      const macroExps = macroExpressionsCache.get(macroPath) || parse(macroSource);
      macroExpressionsCache.set(macroPath, macroExps);

      const transformed = transformSyntax(macroExps, { verbose: options.verbose });

      // Skip rebuilding files when loading macros in REPL mode
      if (!options.skipRebuild) {
        await processImports(transformed, env, {
          verbose: options.verbose || false,
          baseDir: path.dirname(macroPath),
          currentFile: macroPath,
        });
      } else {
        // In skipRebuild mode, just process the macros without rebuilding dependencies
        logger.debug(`Skipping rebuild of imports for ${macroPath} in REPL mode`);
        await processImports(transformed, env, {
          verbose: options.verbose || false,
          baseDir: path.dirname(macroPath),
          currentFile: macroPath,
          skipRebuild: true,
        });
      }

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
  const logger = new Logger(options.verbose);
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
