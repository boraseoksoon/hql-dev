// src/transpiler/hql-transpiler.ts - Enhanced with better error handling and diagnostics
import * as path from "https://deno.land/std/path/mod.ts";
import { sexpToString } from '../s-exp/types.ts';
import { parse } from '../s-exp/parser.ts';
import { Environment } from '../environment.ts';
import { expandMacros } from '../s-exp/macro.ts';
import { processImports } from '../s-exp/imports.ts';
import { convertToHqlAst } from '../s-exp/macro-reader.ts';
import { transformAST } from '../transformer.ts';
import { Logger } from '../logger.ts';
import { TranspilerError, ParseError, MacroError, ImportError, createErrorReport } from './errors.ts';

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
  debugMode?: boolean; // Enable additional debugging output
}

/**
 * Process HQL source code through the S-expression layer
 * Enhanced with better error handling and diagnostic capabilities
 */
export async function processHql(
  source: string,
  options: ProcessOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.debug('Processing HQL source with S-expression layer');
  
  const startTotalTime = performance.now();
  let sourceFilename = options.baseDir ? path.basename(options.baseDir) : "unknown";
  
  try {
    // Step 1: Parse the source into S-expressions
    logger.debug(`Parsing HQL source (${source.length} characters)`);
    const startParseTime = performance.now();
    
    let sexps;
    try {
      sexps = parse(source);
      logger.debug(`Successfully parsed ${sexps.length} S-expressions`);
    } catch (error) {
      if (error instanceof ParseError) {
        throw error; // Re-throw ParseError with position info
      }
      throw new ParseError(
        `Failed to parse HQL source: ${error instanceof Error ? error.message : String(error)}`,
        { line: 1, column: 1, offset: 0 },
        source
      );
    }
    
    const parseTime = performance.now() - startParseTime;
    logger.debug(`Parsing completed in ${parseTime.toFixed(2)}ms`);
    
    if (options.verbose || options.debugMode) {
      logParsedExpressions(sexps, logger);
    }
    
    // Step 2: Get or initialize the global environment
    logger.debug('Getting global environment with macros');
    const startEnvTime = performance.now();
    
    let env;
    try {
      env = await getGlobalEnv(options);
    } catch (error) {
      throw new TranspilerError(
        `Failed to initialize global environment: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    
    const envTime = performance.now() - startEnvTime;
    logger.debug(`Environment initialization completed in ${envTime.toFixed(2)}ms`);
    
    // Set the current file if baseDir is provided
    const currentFile = options.baseDir || null;
    if (currentFile) {
      logger.debug(`Setting current file to: ${currentFile}`);
      env.setCurrentFile(currentFile);
    }
    
    // Step 3: Process imports in the user code
    logger.debug('Processing imports in user code');
    const startImportTime = performance.now();
    
    try {
      await processImports(sexps, env, {
        verbose: options.verbose,
        baseDir: options.baseDir || Deno.cwd(),
        tempDir: options.tempDir,
        currentFile: currentFile
      });
    } catch (error) {
      if (error instanceof ImportError) {
        throw error; // Re-throw ImportError with detailed info
      }
      throw new ImportError(
        `Failed to process imports: ${error instanceof Error ? error.message : String(error)}`,
        "unknown",
        currentFile,
        error instanceof Error ? error : undefined
      );
    }
    
    const importTime = performance.now() - startImportTime;
    logger.debug(`Import processing completed in ${importTime.toFixed(2)}ms`);
    
    // Step 4: Expand macros in the user code
    logger.debug('Expanding macros in user code');
    const startMacroTime = performance.now();
    
    let expanded;
    try {
      expanded = expandMacros(sexps, env, { 
        verbose: options.verbose,
        currentFile: currentFile,
        useCache: true // Use macro expansion cache
      });
    } catch (error) {
      if (error instanceof MacroError) {
        throw error; // Re-throw MacroError with detailed info
      }
      throw new MacroError(
        `Failed to expand macros: ${error instanceof Error ? error.message : String(error)}`,
        "",
        currentFile,
        error instanceof Error ? error : undefined
      );
    }
    
    const macroTime = performance.now() - startMacroTime;
    logger.debug(`Macro expansion completed in ${macroTime.toFixed(2)}ms`);
    
    if (options.verbose || options.debugMode) {
      logExpandedExpressions(expanded, logger);
    }
    
    // Step 5: Convert to HQL AST
    logger.debug('Converting to HQL AST');
    const startAstTime = performance.now();
    
    let hqlAst;
    try {
      hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
    } catch (error) {
      throw new TranspilerError(
        `Failed to convert to HQL AST: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    
    const astTime = performance.now() - startAstTime;
    logger.debug(`AST conversion completed in ${astTime.toFixed(2)}ms with ${hqlAst.length} nodes`);
    
    // Step 6: Transform to JavaScript using existing pipeline
    logger.debug('Transforming to JavaScript');
    const startTransformTime = performance.now();
    
    let jsCode;
    try {
      jsCode = await transformAST(hqlAst, options.baseDir || Deno.cwd(), {
        verbose: options.verbose,
        module: options.module || 'esm',
        bundle: false
      });
    } catch (error) {
      throw new TranspilerError(
        `Failed to transform to JavaScript: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    
    const transformTime = performance.now() - startTransformTime;
    logger.debug(`JavaScript transformation completed in ${transformTime.toFixed(2)}ms`);
    
    // Clear current file when done
    if (currentFile) {
      env.setCurrentFile(null);
    }
    
    const totalTime = performance.now() - startTotalTime;
    logger.debug(`Total processing completed in ${totalTime.toFixed(2)}ms`);
    
    // Log performance metrics
    if (options.verbose || options.debugMode) {
      console.log(`✅ Successfully processed ${sourceFilename} in ${totalTime.toFixed(2)}ms`);
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
    // Create a comprehensive error report
    let errorReport: string;
    
    if (error instanceof ParseError || 
        error instanceof MacroError || 
        error instanceof ImportError || 
        error instanceof TranspilerError) {
      // Use the formatMessage method for specific error types
      errorReport = error.formatMessage();
    } else {
      // Create a generic error report for unknown errors
      errorReport = createErrorReport(
        error instanceof Error ? error : new Error(String(error)),
        "HQL processing",
        {
          sourceLength: source.length,
          options: options,
          file: sourceFilename
        }
      );
    }
    
    // Always log the error
    logger.error(`❌ Error processing HQL: ${error instanceof Error ? error.message : String(error)}`);
    
    // Display detailed error report in verbose mode
    if (options.verbose || options.debugMode) {
      console.error("Detailed error report:");
      console.error(errorReport);
    }
    
    // Rethrow the original error or wrap it
    if (error instanceof ParseError || 
        error instanceof MacroError || 
        error instanceof ImportError ||
        error instanceof TranspilerError) {
      throw error;
    } else {
      throw new TranspilerError(
        `Error processing HQL: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
 * Enhanced with better error handling
 */
async function loadCoreHql(env: Environment, options: ProcessOptions): Promise<void> {
  const logger = new Logger(options.verbose || false);
  
  // Skip if already loaded to prevent duplicate loading
  if (coreHqlLoaded) {
    logger.debug('core.hql already loaded, skipping');
    return;
  }

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
        logger.debug(`Found core.hql at: ${corePath} (${coreSource.length} bytes)`);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        logger.error(`Could not find or read lib/core.hql at ${corePath}`);
        
        throw new ImportError(
          `Could not find lib/core.hql at ${corePath}. Make sure you are running from the project root.`,
          corePath,
          undefined,
          error
        );
      }
      
      // Parse the core.hql file
      try {
        coreExps = parse(coreSource);
        cachedCoreExpressions = coreExps; // Cache for future use
        logger.debug(`Parsed core.hql and cached ${coreExps.length} expressions`);
      } catch (error) {
        throw new ParseError(
          `Failed to parse core.hql: ${error instanceof Error ? error.message : String(error)}`,
          { line: 1, column: 1, offset: 0 },
          coreSource
        );
      }
    }
    
    // Use the environment's file tracking to avoid redundant processing
    if (env.hasProcessedFile(corePath)) {
      logger.debug(`Core.hql already processed in this environment, skipping`);
      coreHqlLoaded = true;
      return;
    }
    
    // Process imports in core.hql
    try {
      await processImports(coreExps, env, {
        verbose: options.verbose || false,
        baseDir: path.dirname(corePath),
        currentFile: corePath  // Set current file to the core.hql path
      });
    } catch (error) {
      if (error instanceof ImportError) {
        throw error;
      }
      throw new ImportError(
        `Failed to process imports in core.hql: ${error instanceof Error ? error.message : String(error)}`,
        corePath,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
    
    // Expand macros defined in core.hql
    try {
      expandMacros(coreExps, env, { 
        verbose: options.verbose,
        currentFile: corePath,
      });
    } catch (error) {
      if (error instanceof MacroError) {
        throw error;
      }
      throw new MacroError(
        `Failed to expand macros in core.hql: ${error instanceof Error ? error.message : String(error)}`,
        "",
        corePath,
        error instanceof Error ? error : undefined
      );
    }
    
    // Mark core as loaded and processed
    coreHqlLoaded = true;
    env.markFileProcessed(corePath);
    
    logger.debug('Core.hql loaded and all macros registered successfully');
  } catch (error) {
    // Create a comprehensive error report
    let errorMessage = `Failed to load core.hql: ${error instanceof Error ? error.message : String(error)}`;
    
    if (error instanceof ParseError || 
        error instanceof MacroError || 
        error instanceof ImportError) {
      // Use the specific error's formatMessage
      errorMessage = error.formatMessage();
    }
    
    logger.error(errorMessage);
    
    if (error instanceof ParseError || 
        error instanceof MacroError || 
        error instanceof ImportError) {
      throw error; // Re-throw specialized errors
    } else {
      throw new TranspilerError(errorMessage);
    }
  }
}

/**
 * Initialize the global environment once
 * Uses singleton pattern for consistency, with enhanced error handling
 */
async function getGlobalEnv(options: ProcessOptions): Promise<Environment> {
  const logger = new Logger(options.verbose);
  
  try {
    if (!globalEnv) {
      // Performance: measure environment initialization time
      const startTime = performance.now();
      
      logger.debug("Initializing new global environment");
      globalEnv = await Environment.initializeGlobalEnv({ verbose: options.verbose });
      
      // Load core.hql if not explicitly skipped
      if (!options.skipCoreHQL) {
        await loadCoreHql(globalEnv, options);
      }
      
      const endTime = performance.now();
      logger.debug(`Global environment initialization took ${(endTime - startTime).toFixed(2)}ms`);
    } else {
      logger.debug("Reusing existing global environment");
    }
    
    return globalEnv;
  } catch (error) {
    // Provide detailed error for initialization failures
    const errorMessage = `Failed to initialize global environment: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(errorMessage);
    
    if (error instanceof TranspilerError || 
        error instanceof ParseError || 
        error instanceof MacroError || 
        error instanceof ImportError) {
      throw error; // Re-throw specialized errors
    } else {
      throw new TranspilerError(errorMessage);
    }
  }
}