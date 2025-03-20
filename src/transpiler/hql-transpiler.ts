// src/transpiler/hql-transpiler.ts - Updated with module-level macro support and fixes

import * as path from "https://deno.land/std/path/mod.ts";
import { sexpToString, isSymbol, isLiteral, isUserMacro } from '../s-exp/types.ts';
import { parse } from '../s-exp/parser.ts';
import { Environment } from '../environment.ts';
import { expandMacros } from '../s-exp/macro.ts';
import { processImports } from '../s-exp/imports.ts';
import { convertToHqlAst } from '../s-exp/front-to-middle-connector.ts';
import { transformAST } from '../transformer.ts';
import { Logger } from '../logger.ts';

// Create a global environment to ensure macros are consistently available
let globalEnv: Environment | null = null;
let coreHqlLoaded = false;

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
      for (const sexp of sexps) {
        logger.debug(`Parsed: ${sexpToString(sexp)}`);
      }
    }
    
    // Step 2: Get or initialize the global environment
    // This ensures core.hql is loaded exactly once and macros are always available
    logger.debug('Getting global environment with macros');
    const env = await getGlobalEnv(options);
    
    // Debug: Print registered macros
    if (options.verbose) {
      const macroKeys = Array.from(env.macros.keys());
      logger.debug("Available system macros: " + macroKeys.join(", "));
      
      // FIXED: Check if moduleMacros has any entries before trying to iterate
      if (env.moduleMacros && env.moduleMacros.size > 0) {
        let userMacroList: string[] = [];
        
        // Iterate over all module macros
        for (const [filePath, macroMap] of env.moduleMacros.entries()) {
          if (macroMap && macroMap.size > 0) {
            for (const macroName of macroMap.keys()) {
              userMacroList.push(`${macroName} (from ${path.basename(filePath)})`);
            }
          }
        }
        
        if (userMacroList.length > 0) {
          logger.debug("Available user macros: " + userMacroList.join(", "));
        } else {
          logger.debug("No user macros defined yet");
        }
      } else {
        logger.debug("No user macros defined yet");
      }
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
      currentFile: currentFile,
      keepTemp: true
    });
    
    // Step 4: Expand macros in the user code
    logger.debug('Expanding macros in user code');
    const expanded = expandMacros(sexps, env, currentFile, { 
      verbose: options.verbose,
      maxExpandDepth: 20 // Increased for complex macros
    });
    
    if (options.verbose) {
      for (const sexp of expanded) {
        logger.debug(`Expanded: ${sexpToString(sexp)}`);
      }
    }
    
    // Step 5: Post-process expanded expressions 
    // Filter out macro definitions - they shouldn't be in the output
    const processedExprs = expanded.filter(expr => {
      // Skip macro definitions
      if (isUserMacro(expr)) {
        logger.debug(`Filtering out user macro: ${sexpToString(expr)}`);
        return false;
      }
      return true;
    });
    
    // Step 6: Convert to HQL AST
    logger.debug('Converting to HQL AST');
    const hqlAst = convertToHqlAst(processedExprs, { verbose: options.verbose });
    
    // Step 7: Transform to JavaScript using existing pipeline
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
 * Load and process core.hql to establish the standard library
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
    
    // Process imports in core.hql
    await processImports(coreExps, env, {
      verbose: options.verbose || false,
      baseDir: path.dirname(corePath),
      currentFile: corePath  // Set current file to the core.hql path
    });
    
    // Register macros defined in core.hql
    const expanded = expandMacros(coreExps, env, corePath, { 
      verbose: options.verbose,
      maxExpandDepth: 20, // Increased for complex macros
      maxPasses: 3 // Multiple passes for recursive macros
    });
    
    // Print registered macros for debugging
    if (options.verbose) {
      const systemMacroKeys = Array.from(env.macros.keys());
      logger.debug(`Registered system macros: ${systemMacroKeys.join(", ")}`);
    }
    
    // Mark core as loaded
    coreHqlLoaded = true;
    
    logger.debug('Core.hql loaded and all macros registered');
  } catch (error) {
    logger.error(`Error loading core.hql: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Initialize the global environment once
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