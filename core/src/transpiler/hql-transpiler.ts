// core/src/transpiler/hql-transpiler.ts - Modified to remove user-level macro support
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { parse } from "./pipeline/parser.ts";
import { Environment } from "../environment.ts";
import { expandMacros } from "../s-exp/macro.ts";
import { processImports } from "../imports.ts";
import { convertToHqlAst as convert } from "../s-exp/macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { transformSyntax } from "./pipeline/syntax-transformer.ts";
import { SExp } from "../s-exp/types.ts";
import {
  ImportError,
  MacroError,
  TransformError,
  TranspilerError,
} from "../common/error-pipeline.ts";
import { globalLogger as logger } from "../logger.ts";
import { reportError } from "../common/error-pipeline.ts";
import { TranspileResult } from "./index.ts";
import { globalSymbolTable } from "../transpiler/symbol_table.ts";
import { HQLNode } from "@transpiler/type/hql_ast.ts";

let globalEnv: Environment | null = null;
let systemMacrosLoaded = false;

const macroExpressionsCache = new Map<string, any[]>();

interface ProcessOptions {
  verbose?: boolean;
  showTiming?: boolean;
  baseDir?: string;
  sourceDir?: string;
  tempDir?: string;
  currentFile?: string;
}

/**
 * Process HQL source code and return transpiled JavaScript
 */
export async function transpileToJavascript(
  hqlSource: string,
  options: ProcessOptions = {},
): Promise<TranspileResult> {
  logger.debug("Processing HQL source with S-expression layer");

  if (options.verbose) {
    logger.setEnabled(true);
  }
  
  if (options.showTiming) {
    logger.setTimingOptions({ showTiming: true });
    logger.startTiming("hql-process", "Total");
  }

  const sourceFilename = path.basename(options.baseDir || "unknown");

  const env = await setupEnvironment(options);
  const sexps = parseSource(hqlSource, options);
  const canonicalSexps = transform(sexps, options);
  
  await handleImports(canonicalSexps, env, options);

  const expanded = expand(canonicalSexps, env, options);
  const hqlAst = convertToHqlAst(expanded, options);
  const javascript = await transpile(hqlAst, options);

  if (options.baseDir) env.setCurrentFile(null);

  if (options.showTiming) {
    logger.endTiming("hql-process", "Total");
    logger.logPerformance("hql-process", sourceFilename);
  }
  
  return javascript;
}

/**
 * Set up the environment for HQL processing
 */
async function setupEnvironment(options: ProcessOptions): Promise<Environment> {
  if (options.showTiming) logger.startTiming("hql-process", "Environment setup");
  
  const env = await getGlobalEnv(options);
  if (options.baseDir) env.setCurrentFile(options.baseDir);
  
  if (options.showTiming) logger.endTiming("hql-process", "Environment setup");
  return env;
}

/**
 * Parse source code into S-expressions
 */
function parseSource(source: string, options: ProcessOptions): SExp[] {
  if (options.showTiming) logger.startTiming("hql-process", "Parsing");
  
  const sexps = parse(source, options.currentFile);
  logger.debug(`Parsed ${sexps.length} S-expressions`);
  
  if (options.showTiming) logger.endTiming("hql-process", "Parsing");
  return sexps;
}

/**
 * Transform parsed S-expressions into canonical form
 */
function transform(sexps: SExp[], options: ProcessOptions): SExp[] {
  if (options.showTiming) logger.startTiming("hql-process", "Syntax transform");
  
  const canonicalSexps = transformSyntax(sexps);
  
  if (options.showTiming) logger.endTiming("hql-process", "Syntax transform");
  return canonicalSexps;
}

/**
 * Process imports with error handling
 */
async function handleImports(sexps: SExp[], env: Environment, options: ProcessOptions): Promise<void> {
  if (options.showTiming) logger.startTiming("hql-process", "Import processing");
  
  await processImports(sexps, env, {
    verbose: options.verbose,
    baseDir: options.baseDir || Deno.cwd(),
    tempDir: options.tempDir,
    currentFile: options.baseDir,
  });
  
  if (options.showTiming) logger.endTiming("hql-process", "Import processing");
}

/**
 * Expand macros in the S-expressions
 */
function expand(sexps: SExp[], env: Environment, options: ProcessOptions): SExp[] {
  if (options.showTiming) logger.startTiming("hql-process", "Macro expansion");
  
  try {
    const expanded = expandMacros(sexps, env, {
      verbose: options.verbose,
      currentFile: options.baseDir,
      useCache: true,
    });
    
    if (options.showTiming) logger.endTiming("hql-process", "Macro expansion");
    return expanded;
  } catch (error) {
    if (options.showTiming) logger.endTiming("hql-process", "Macro expansion");
    
    // Handle macro errors specifically
    if (error instanceof MacroError) {
      reportError(error);
    }
    throw error;
  }
}

/**
 * Convert S-expressions to HQL AST
 */
function convertToHqlAst(sexps: SExp[], options: ProcessOptions): any {
  if (options.showTiming) logger.startTiming("hql-process", "AST conversion");
  
  try {
    const hqlAst = convert(sexps, { verbose: options.verbose });
    
    if (options.showTiming) logger.endTiming("hql-process", "AST conversion");
    return hqlAst;
  } catch (error) {
    if (options.showTiming) logger.endTiming("hql-process", "AST conversion");
    
    // Handle transform errors
    if (error instanceof TransformError) {
      reportError(error);
    }
    throw error;
  }
}

/**
 * Transform HQL AST to JavaScript
 */
async function transpile(hqlAst: HQLNode[], options: ProcessOptions): Promise<TranspileResult> {
  if (options.showTiming) logger.startTiming("hql-process", "JS transformation");
  
  try { 
    const result = await transformAST(
      hqlAst, 
      options.baseDir || Deno.cwd(), 
      { verbose: options.verbose, currentFile: options.currentFile }
    );
    
    if (options.showTiming) logger.endTiming("hql-process", "JS transformation");
    return result;
  } catch (error) {
    if (options.showTiming) logger.endTiming("hql-process", "JS transformation");
    
    // Handle transform errors
    if (error instanceof TransformError) {
      reportError(error);
    }
    throw error;
  }
}

/**
 * Load built-in system macros from the standard library files
 */
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

      const transformed = transformSyntax(macroExps);

      await processImports(transformed, env, {
        verbose: options.verbose || false,
        baseDir: path.dirname(macroPath),
        currentFile: macroPath,
      });

      // Process macros in system files - only macro is used
      expandMacros(transformed, env, { verbose: options.verbose, currentFile: macroPath });
      
      // Register in symbol table
      globalSymbolTable.set({
        name: path.basename(macroPath, '.hql'),
        kind: 'module',
        scope: 'global',
        meta: { isCore: true, isMacroModule: true }
      });
      
      // Mark as processed
      env.markFileProcessed(macroPath);
    }
    
    systemMacrosLoaded = true;
    logger.debug("System macros loaded successfully");
  } catch (error) {
    if (error instanceof Error) {
      throw new TranspilerError(`Loading system macro files: ${error.message}`);
    } else {
      throw new TranspilerError(`Loading system macro files: ${String(error)}`);
    }
  }
}

/**
 * Get or initialize the global environment
 */
async function getGlobalEnv(options: ProcessOptions): Promise<Environment> {
  if (globalEnv) {
    logger.debug("Reusing existing global environment");
    return globalEnv;
  }

  const t = performance.now();
  logger.debug("Initializing new global environment");
  globalEnv = await Environment.initializeGlobalEnv();
  await loadSystemMacros(globalEnv, options);
  logger.debug(`Global environment initialization took ${(performance.now() - t).toFixed(2)}ms`);

  return globalEnv;
}

/**
 * Get the absolute paths for all system macro files
 */
function getSystemMacroPaths(): string[] {
  const SYSTEM_MACRO_PATHS = [
    "core/lib/macro/core.hql",
    "core/lib/macro/loop.hql"
  ];

  const systemMacrosDir = path.dirname(path.fromFileUrl(import.meta.url));
  const projectRoot = path.resolve(systemMacrosDir, '../../..');
  return SYSTEM_MACRO_PATHS.map(macroPath => path.join(projectRoot, macroPath));
}
