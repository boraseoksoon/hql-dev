// src/s-exp/main.ts - Updated to use the unified environment from environment.ts

import { sexpToString, isSymbol, isLiteral } from './types.ts';
import { parse } from './parser.ts';
import { Environment } from '../environment.ts'; // Correct import path
import { initializeCoreMacros } from './core-macros.ts';
import { expandMacros } from './macro.ts';
import { processImports } from './imports.ts';
import { convertToHqlAst } from './connector.ts';
import { transformAST } from '../transformer.ts';
import { Logger } from '../logger.ts';

/**
 * Options for processing HQL code through the S-expression layer
 */
export interface ProcessOptions {
  verbose?: boolean;
  baseDir?: string;
  module?: 'esm';
  includeSourceMap?: boolean;
  tempDir?: string;
  keepTemp?: boolean;
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
    
    // Step 2: Initialize the environment using unified Environment
    logger.debug('Initializing environment');
    const env = Environment.getInstance({ verbose: options.verbose });
    
    // Still run initializeCoreMacros for additional macros not in core.hql
    initializeCoreMacros(env, logger);
    
    // Step 3: Process imports - this must come AFTER environment initialization
    // to ensure core macros are available when processing imports
    logger.debug('Processing imports');
    await processImports(sexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd(),
      tempDir: options.tempDir,
      keepTemp: options.keepTemp
    });
    
    // Step 4: Expand macros
    logger.debug('Expanding macros');
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
    throw error;
  }
}