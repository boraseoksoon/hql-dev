// src/transpiler/hql-transpiler.ts - Optimized with MacroRegistry integration
import * as path from "https://deno.land/std/path/mod.ts";
import { sexpToString } from '../s-exp/types.ts';
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

// Cache for parsed core.hql to avoid re-parsing
let cachedCoreExpressions: any[] | null = null;

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
  keepTemp?: boolean; // Whether to keep temporary files
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
    const startParseTime = performance.now();
    const sexps = parse(source);
    const parseTime = performance.now() - startParseTime;
    logger.debug(`Parsing completed in ${parseTime.toFixed(2)}ms`);
    
    if (options.verbose) {
      logParsedExpressions(sexps, logger);
    }
    
    // Step 2: Get or initialize the global environment
    logger.debug('Getting global environment with macros');
    const startEnvTime = performance.now();
    const env = await getGlobalEnv(options);
    const envTime = performance.now() - startEnvTime;
    logger.debug(`Environment initialization completed in ${envTime.toFixed(2)}ms`);
    
    // Set the current file if baseDir is provided
    const currentFile = options.baseDir || null;
    if (currentFile) {
      env.setCurrentFile(currentFile);
    }
    
    // Step 3: Process imports in the user code
    logger.debug('Processing imports in user code');
    const startImportTime = performance.now();
    await processImports(sexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd(),
      tempDir: options.tempDir,
      currentFile: currentFile
    });
    const importTime = performance.now() - startImportTime;
    logger.debug(`Import processing completed in ${importTime.toFixed(2)}ms`);
    
    // Step 4: Expand macros in the user code
    logger.debug('Expanding macros in user code');
    const startMacroTime = performance.now();
    const expanded = expandMacros(sexps, env, { 
      verbose: options.verbose,
      currentFile: currentFile,
      useCache: true // Use macro expansion cache
    });
    const macroTime = performance.now() - startMacroTime;
    logger.debug(`Macro expansion completed in ${macroTime.toFixed(2)}ms`);
    
    if (options.verbose) {
      logExpandedExpressions(expanded, logger);
    }
    
    // Step 5: Convert to HQL AST
    logger.debug('Converting to HQL AST');
    const startAstTime = performance.now();
    const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
    const astTime = performance.now() - startAstTime;
    logger.debug(`AST conversion completed in ${astTime.toFixed(2)}ms`);
    
    // Step 6: Transform to JavaScript using existing pipeline
    logger.debug('Transforming to JavaScript');
    const startTransformTime = performance.now();
    const jsCode = await transformAST(hqlAst, options.baseDir || Deno.cwd(), {
      verbose: options.verbose,
      module: options.module || 'esm',
      bundle: false
    });
    const transformTime = performance.now() - startTransformTime;
    logger.debug(`JavaScript transformation completed in ${transformTime.toFixed(2)}ms`);
    
    // Clear current file when done
    if (currentFile) {
      env.setCurrentFile(null);
    }
    
    const totalTime = parseTime + envTime + importTime + macroTime + astTime + transformTime;
    logger.debug(`Processing complete in ${totalTime.toFixed(2)}ms`);
    
    // Log performance metrics
    if (options.verbose) {
      console.log("Performance metrics:");
      console.log(`  Parsing:             ${parseTime.toFixed(2)}ms (${(parseTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  Environment setup:   ${envTime.toFixed(2)}ms (${(envTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  Import processing:   ${importTime.toFixed(2)}ms (${(importTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  Macro expansion:     ${macroTime.toFixed(2)}ms (${(macroTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  AST conversion:      ${astTime.toFixed(2)}ms (${(astTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  JS transformation:   ${transformTime.toFixed(2)}ms (${(transformTime/totalTime*100).toFixed(1)}%)`);
      console.log(`  Total:               ${totalTime.toFixed(2)}ms`);
    }
    
    return jsCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error processing HQL: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      logger.error(error.stack);
    }
    throw error;
  }
}

/**
 * Helper function to log parsed expressions when in verbose mode
 */
function logParsedExpressions(sexps: any[], logger: Logger): void {
  logger.debug(`Parsed ${sexps.length} expressions`);
  
  // Only log the first few expressions to avoid overwhelming output
  const MAX_EXPRESSIONS_TO_LOG = 5;
  for (let i = 0; i < Math.min(sexps.length, MAX_EXPRESSIONS_TO_LOG); i++) {
    logger.debug(`Expression ${i+1}: ${sexpToString(sexps[i])}`);
  }
  
  if (sexps.length > MAX_EXPRESSIONS_TO_LOG) {
    logger.debug(`...and ${sexps.length - MAX_EXPRESSIONS_TO_LOG} more expressions`);
  }
}

/**
 * Helper function to log expanded expressions when in verbose mode
 */
function logExpandedExpressions(expanded: any[], logger: Logger): void {
  logger.debug(`Expanded to ${expanded.length} expressions`);
  
  // Only log the first few expressions to avoid overwhelming output
  const MAX_EXPRESSIONS_TO_LOG = 5;
  for (let i = 0; i < Math.min(expanded.length, MAX_EXPRESSIONS_TO_LOG); i++) {
    logger.debug(`Expanded ${i+1}: ${sexpToString(expanded[i])}`);
  }
  
  if (expanded.length > MAX_EXPRESSIONS_TO_LOG) {
    logger.debug(`...and ${expanded.length - MAX_EXPRESSIONS_TO_LOG} more expressions`);
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
    
    // Check if we need to parse core.hql or if we can use cached expressions
    let coreExps;
    if (cachedCoreExpressions) {
      logger.debug('Using cached core.hql expressions');
      coreExps = cachedCoreExpressions;
    } else {
      let coreSource;
      try {
        coreSource = await Deno.readTextFile(corePath);
        logger.debug(`Found core.hql at: ${corePath}`);
      } catch (e) {
        throw new Error(`Could not find lib/core.hql at ${corePath}. Make sure you are running from the project root.`);
      }
      
      // Parse the core.hql file
      coreExps = parse(coreSource);
      cachedCoreExpressions = coreExps; // Cache for future use
      logger.debug('Parsed core.hql and cached expressions');
    }
    
    // Use the environment's file tracking to avoid redundant processing
    if (env.hasProcessedFile(corePath)) {
      logger.debug(`Core.hql already processed, skipping`);
      coreHqlLoaded = true;
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
    throw error;
  }
}

/**
 * Initialize the global environment once
 * Uses singleton pattern for consistency
 */
async function getGlobalEnv(options: ProcessOptions): Promise<Environment> {
  if (!globalEnv) {
    // Performance: measure environment initialization time
    const startTime = performance.now();
    
    globalEnv = await Environment.initializeGlobalEnv({ verbose: options.verbose });
    
    // Load core.hql if not explicitly skipped
    if (!options.skipCoreHQL) {
      await loadCoreHql(globalEnv, options);
    }
    
    const endTime = performance.now();
    if (options.verbose) {
      console.log(`Environment initialization took ${(endTime - startTime).toFixed(2)}ms`);
    }
  }
  
  return globalEnv;
}