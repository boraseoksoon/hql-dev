// src/transpiler/hql-transpiler.ts - Optimized with MacroRegistry integration
import * as path from "https://deno.land/std/path/mod.ts";
import { sexpToString, isUserMacro } from '../s-exp/types.ts';
import { parse } from '../s-exp/parser.ts';
import { Environment } from '../environment.ts';
import { expandMacros } from '../s-exp/macro.ts';
import { processImports } from '../s-exp/imports.ts';
import { convertToHqlAst } from '../s-exp/front-to-middle-connector.ts';
import { transformAST } from '../transformer.ts';
import { Logger } from '../logger.ts';

// Environment singleton for consistent state
let globalEnv: Environment | null = null;
let coreHqlLoaded = false;

// Cache for processed files to avoid redundant operations
const processedFiles = new Set<string>();

/**
 * Options for processing HQL source code
 */
interface ProcessOptions {
  verbose?: boolean;
  baseDir?: string;
  module?: 'esm';
  includeSourceMap?: boolean;
  skipCoreHQL?: boolean; // Optional flag to skip core.hql loading (for testing)
  sourceDir?: string; // Original source directory for imports
  tempDir?: string; // Temporary directory for processing
}

/**
 * Process HQL source code through the S-expression layer
 * Optimized for better performance and reduced redundant operations
 */
export async function processHql(
  source: string,
  options: ProcessOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.debug('Processing HQL source with S-expression layer');
  
  try {
    // Step 1: Parse the source into S-expressions
    logger.debug('Parsing HQL source');
    const sexps = parse(source);
    
    if (options.verbose) {
      logParsedExpressions(sexps, logger);
    }
    
    // Step 2: Get or initialize the global environment
    logger.debug('Getting global environment with macros');
    const env = await getGlobalEnv(options);
    
    // Log available macros in verbose mode
    if (options.verbose) {
      logAvailableMacros(env, logger);
    }
    
    // Set the current file if baseDir is provided
    const currentFile = options.baseDir || null;
    if (currentFile) {
      env.setCurrentFile(currentFile);
    }
    
    // Step 3: Process imports in the user code
    logger.debug('Processing imports in user code');
    await processImports(sexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd(),
      tempDir: options.tempDir,
      currentFile: currentFile
    });
    
    // Step 4: Expand macros in the user code
    logger.debug('Expanding macros in user code');
    const expanded = expandMacros(sexps, env, { 
      verbose: options.verbose,
      currentFile: currentFile
    });
    
    if (options.verbose) {
      logExpandedExpressions(expanded, logger);
    }
    
    // Step 5: Convert to HQL AST
    logger.debug('Converting to HQL AST');
    const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
    
    // Step 6: Transform to JavaScript using existing pipeline
    logger.debug('Transforming to JavaScript');
    const jsCode = await transformAST(hqlAst, options.baseDir || Deno.cwd(), {
      verbose: options.verbose,
      module: options.module || 'esm',
      bundle: false
    });
    
    // Clear current file when done
    if (currentFile) {
      env.setCurrentFile(null);
    }
    
    logger.debug('Processing complete');
    return jsCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error processing HQL: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

/**
 * Helper function to log parsed expressions when in verbose mode
 */
function logParsedExpressions(sexps: any[], logger: Logger): void {
  for (const sexp of sexps) {
    logger.debug(`Parsed: ${sexpToString(sexp)}`);
  }
}

/**
 * Helper function to log expanded expressions when in verbose mode
 */
function logExpandedExpressions(expanded: any[], logger: Logger): void {
  for (const sexp of expanded) {
    logger.debug(`Expanded: ${sexpToString(sexp)}`);
  }
}

/**
 * Helper function to log available macros when in verbose mode
 */
function logAvailableMacros(env: Environment, logger: Logger): void {
  const systemMacros = Array.from(env.macroRegistry.systemMacros.keys())
    .filter(name => !name.includes('_')) // Skip sanitized duplicates
    .sort();
  
  logger.debug(`Available system macros: ${systemMacros.join(', ')}`);
  
  // Log user macros if any
  if (env.macroRegistry.moduleMacros.size > 0) {
    let userMacroList: string[] = [];
    
    for (const [filePath, macroMap] of env.macroRegistry.moduleMacros.entries()) {
      if (macroMap.size > 0) {
        for (const macroName of macroMap.keys()) {
          userMacroList.push(`${macroName} (from ${path.basename(filePath)})`);
        }
      }
    }
    
    if (userMacroList.length > 0) {
      logger.debug(`Available user macros: ${userMacroList.join(', ')}`);
    } else {
      logger.debug("No user macros defined yet");
    }
  } else {
    logger.debug("No user macros defined yet");
  }
}

/**
 * Load and process core.hql to establish the standard library
 * Optimized to only load once and cache results
 */
async function loadCoreHql(env: Environment, options: ProcessOptions): Promise<void> {
  // Skip if already loaded to prevent duplicate loading
  if (coreHqlLoaded) {
    return;
  }

  const logger = new Logger(options.verbose || false);
  logger.debug('Loading core.hql standard library');
  
  try {
    // Look for lib/core.hql from the current directory
    const cwd = Deno.cwd();
    const corePath = path.join(cwd, 'lib/core.hql');
    
    logger.debug(`Looking for core.hql at: ${corePath}`);
    
    let coreSource;
    try {
      coreSource = await Deno.readTextFile(corePath);
      logger.debug(`Found core.hql at: ${corePath}`);
    } catch (e) {
      throw new Error(`Could not find lib/core.hql at ${corePath}. Make sure you are running from the project root.`);
    }
    
    // Parse the core.hql file
    const coreExps = parse(coreSource);
    
    if (options.verbose) {
      console.log("Core HQL expressions loaded from:", corePath);
    }
    
    // Use the environment's file tracking to avoid redundant processing
    if (env.hasProcessedFile(corePath)) {
      logger.debug(`Core.hql already processed, skipping`);
      return;
    }
    
    // Process imports in core.hql
    await processImports(coreExps, env, {
      verbose: options.verbose || false,
      baseDir: path.dirname(corePath),
      currentFile: corePath  // Set current file to the core.hql path
    });
    
    // Expand macros defined in core.hql
    expandMacros(coreExps, env, { 
      verbose: options.verbose,
      currentFile: corePath,
      maxPasses: 3 // Multiple passes for recursive macros
    });
    
    // Mark core as loaded and processed
    coreHqlLoaded = true;
    env.markFileProcessed(corePath);
    
    logger.debug('Core.hql loaded and all macros registered');
  } catch (error) {
    logger.error(`Error loading core.hql: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Initialize the global environment once
 * Uses singleton pattern for consistency
 */
async function getGlobalEnv(options: ProcessOptions): Promise<Environment> {
  if (!globalEnv) {
    globalEnv = await Environment.initializeGlobalEnv({ verbose: options.verbose });
    
    if (!options.skipCoreHQL) {
      await loadCoreHql(globalEnv, options);
    }
  }
  
  return globalEnv;
}