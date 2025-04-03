// src/transpiler/hql-transpiler.ts - Refactored
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { SExp } from "../s-exp/types.ts";
import { parse } from "./parser.ts";
import { Environment } from "../environment.ts";
import { transformSyntax } from "./syntax-transformer.ts";
import { expandMacros } from "../s-exp/macro.ts";
import { processImports } from "../s-exp/imports.ts";
import { convertToHqlAst } from "../s-exp/macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { Logger } from "../logger.ts";
import { 
  formatError, 
  getSuggestion, 
  registerSourceFile
} from "../error-handling.ts";
import { enhanceParseError } from "./enhanced-errors.ts";
import { getSystemMacroPaths } from "../s-exp/system-macros.ts";
import {
  TranspilerError,
  ParseError,
  ImportError,
  MacroError as _MacroError,
  TransformError as _TransformError,
  createErrorReport as _createErrorReport
} from "./errors.ts";

let globalEnv: Environment | null = null;
let systemMacrosLoaded = false;
const macroExpressionsCache = new Map<string, SExp[]>();

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
  _source: string,
  _sourceFilename: string,
  options: ProcessOptions = {},
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.debug("Processing HQL source with S-expression layer");

  const timings = new Map<string, number>();
  const sourceFilePath = options.baseDir || "unknown";
  
  // Register source for error enhancement
  registerSourceFile(sourceFilePath, _source);

  // Get environment in parallel with parsing
  const envPromise = getGlobalEnv(options);
  
  try {
    // Parse, transform, and prepare - measure each operation
    const t0 = performance.now();
    const sexps = parse(_source);
    timings.set("Parsing", performance.now() - t0);
    logger.debug(`Parsed ${sexps.length} S-expressions`);
    
    const t1 = performance.now();
    const canonicalSexps = transformSyntax(sexps, { verbose: options.verbose });
    timings.set("Syntax transform", performance.now() - t1);
    logger.debug(`Transformed to ${canonicalSexps.length} expressions`);
    
    // Wait for environment
    const t2 = performance.now();
    const env = await envPromise;
    timings.set("Environment setup", performance.now() - t2);
    
    // Set current file before processing imports
    if (options.baseDir) env.setCurrentFile(options.baseDir);
    
    // Process imports, expand macros, and generate code - measure each step
    const t3 = performance.now();
    await processImports(canonicalSexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd(),
      tempDir: options.tempDir,
      currentFile: options.baseDir,
    });
    timings.set("Import processing", performance.now() - t3);
    
    const t4 = performance.now();
    const expanded = expandMacros(canonicalSexps, env, {
      verbose: options.verbose,
      currentFile: options.baseDir,
      useCache: true,
    });
    timings.set("Macro expansion", performance.now() - t4);
    
    const t5 = performance.now();
    const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
    timings.set("AST conversion", performance.now() - t5);
    
    const t6 = performance.now();
    const jsCode = await transformAST(hqlAst, options.baseDir || Deno.cwd(), { 
      verbose: options.verbose 
    });
    timings.set("JS transformation", performance.now() - t6);

    // Reset current file
    if (options.baseDir) env.setCurrentFile(null);

    // Log performance metrics if verbose
    if (options.verbose) {
      logPerformance(timings, _sourceFilename);
    }
    
    return jsCode;
  } catch (error) {
    // Single error handling path with consistent behavior
    if (options.baseDir) {
      try { 
        await envPromise.then(env => env.setCurrentFile(null));
      } catch {
        // Ignore errors when resetting current file
      }
    }
    
    if (options.skipErrorHandling) {
      throw error;
    }
    
    return handleProcessError(error, _source, options, _sourceFilename, logger);
  }
}

// Keep these internal functions with underscore prefix since they're unused
function _parseWithHandling(source: string, logger: Logger) {
  try {
    const sexps = parse(source);
    logger.debug(`Parsed ${sexps.length} S-expressions`);
    return sexps;
  } catch (error: unknown) {
    if (error instanceof ParseError) {
      // Enhance the parse error with source context
      throw enhanceParseError(error, true);
    }
    
    if (error instanceof Error) {
      throw new ParseError(`Failed to parse HQL source: ${error.message}`, { line: 1, column: 1, offset: 0 }, source);
    }
    
    throw new ParseError(`Failed to parse HQL source: ${String(error)}`, { line: 1, column: 1, offset: 0 }, source);
  }
}

function _transformWithHandling(sexps: SExp[], verbose: boolean | undefined, logger: Logger) {
  try {
    const result = transformSyntax(sexps, { verbose });
    return result;
  } catch (error) {
    logger.error(`Error during syntax transformation: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function _processImportsWithHandling(sexps: SExp[], env: Environment, options: ProcessOptions, logger: Logger) {
  try {
    await processImports(sexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd(),
      tempDir: options.tempDir,
      currentFile: options.baseDir,
    });
  } catch (error) {
    logger.error(`Error processing imports: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

function _expandWithHandling(sexps: SExp[], env: Environment, options: ProcessOptions, logger: Logger) {
  try {
    return expandMacros(sexps, env, {
      verbose: options.verbose,
      currentFile: options.baseDir,
      useCache: true,
    });
  } catch (error) {
    logger.error(`Error expanding macros: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

function _logExpressions(label: string, sexps: SExp[], logger: Logger) {
  const maxLog = 5;
  logger.debug(`${label} ${sexps.length} expressions`);
  
  if (sexps.length <= maxLog) {
    sexps.forEach((exp, i) => logger.debug(`  ${i}: ${JSON.stringify(exp)}`));
  } else {
    sexps.slice(0, maxLog).forEach((exp, i) => logger.debug(`  ${i}: ${JSON.stringify(exp)}`));
    logger.debug(`  ... and ${sexps.length - maxLog} more`);
  }
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
  _source: string,
  options: ProcessOptions,
  _sourceFilename: string,
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
