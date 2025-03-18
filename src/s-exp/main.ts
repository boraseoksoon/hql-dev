import { sexpToString, isSymbol, isLiteral } from './types.ts';
import { parse } from './parser.ts';
import { Environment } from '../environment.ts';
import { initializeCoreMacros } from './core-macros.ts';
import { expandMacros } from './macro.ts';
import { processImports } from './imports.ts';
import { convertToHqlAst } from './connector.ts';
import { transformAST } from '../transformer.ts';
import { Logger } from '../logger.ts';
import * as path from "https://deno.land/std/path/mod.ts";

// Create a global environment to ensure macros are consistently available
let globalEnv: Environment | null = null;
let coreHqlLoaded = false;

/**
 * Options for processing HQL code through the S-expression layer
 */
export interface ProcessOptions {
  verbose?: boolean;
  baseDir?: string;
  module?: 'esm';
  includeSourceMap?: boolean;
  skipCoreHQL?: boolean; // Optional flag to skip core.hql loading (for testing)
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
    console.log("Available macros before processing:", 
                Array.from(env.macros.keys()).join(", "));
    
    // Step 3: Process imports in the user code
    logger.debug('Processing imports in user code');
    await processImports(sexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd()
    });
    
    // Step 4: Expand macros in the user code
    logger.debug('Expanding macros in user code');
    const expanded = expandMacros(sexps, env, { verbose: options.verbose });
    
    if (options.verbose) {
      for (const sexp of expanded) {
        logger.debug(`Expanded: ${sexpToString(sexp)}`);
      }
    }
    
    // Step 5: Convert to HQL AST
    logger.debug('Converting to HQL AST');
    const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
    
    // Step 6: Transform to JavaScript using existing pipeline
    logger.debug('Transforming to JavaScript');
    const baseDir = options.baseDir || Deno.cwd();
    let jsCode = await transformAST(hqlAst, baseDir, {
      verbose: options.verbose,
      module: options.module || 'esm',
      bundle: false
    });
    
    // Step 7: Ensure proper exports are included
    const exportStatements: Array<{exportName: string, symbolName: string}> = [];
    
    for (const expr of sexps) {
      if (expr.type === 'list' && 
          expr.elements.length >= 3 &&
          isSymbol(expr.elements[0]) && 
          expr.elements[0].name === 'export' &&
          isLiteral(expr.elements[1]) &&
          isSymbol(expr.elements[2])) {
        
        const exportName = (expr.elements[1] as any).value as string;
        const symbolName = (expr.elements[2] as any).name;
        
        // Sanitize symbol name for JavaScript
        const sanitizedSymbol = symbolName.replace(/-/g, '_');
        
        exportStatements.push({
          exportName,
          symbolName: sanitizedSymbol
        });
      }
    }
    
    logger.debug(`Found ${exportStatements.length} export statements`);
    
    // If we have export statements, ensure they're properly included in the JS output
    if (exportStatements.length > 0) {
      // Add explicit export statements to the end
      jsCode += '\n\n// Explicit ES Module exports\n';
      
      exportStatements.forEach(({exportName, symbolName}) => {
        logger.debug(`Adding export for "${exportName}" from symbol "${symbolName}"`);
        jsCode += `export { ${symbolName} as "${exportName}" };\n`;
      });
    }
    
    logger.debug('Processing complete');
    return jsCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error processing HQL: ${errorMessage}`);
    console.error(error.stack);
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
    // Just look for lib/core.hql from the current directory
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
    
    console.log("Core HQL expressions loaded from:", corePath);
    
    // Process imports in core.hql
    await processImports(coreExps, env, {
      verbose: options.verbose || false,
      baseDir: path.dirname(corePath)
    });
    
    // Register macros in core.hql
    const { defineMacro } = await import('./macro.ts');
    
    for (const expr of coreExps) {
      if (expr.type === 'list' && 
          expr.elements.length > 0 &&
          expr.elements[0].type === 'symbol' &&
          expr.elements[0].name === 'defmacro') {
        try {
          defineMacro(expr, env, logger);
          if (expr.elements[1].type === 'symbol') {
            console.log(`Registered core macro: ${expr.elements[1].name}`);
          }
        } catch (error) {
          logger.error(`Error registering macro: ${error.message}`);
        }
      }
    }
    
    // Expand macros to ensure they're processed
    expandMacros(coreExps, env, { verbose: options.verbose });
    
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
    // Create and initialize the environment
    globalEnv = await Environment.initializeGlobalEnv({ verbose: options.verbose });
    
    // Initialize bootstrap macros
    initializeCoreMacros(globalEnv, new Logger(options.verbose));
    
    // CRITICAL: Load core.hql and wait for it to complete
    if (!options.skipCoreHQL) {
      await loadCoreHql(globalEnv, options);
    }
  }
  
  return globalEnv;
}