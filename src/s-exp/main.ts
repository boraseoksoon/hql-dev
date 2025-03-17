// src/s-exp/main.ts - Main entry point for the S-expression layer

import { sexpToString, isSymbol, isLiteral } from './types.ts';
import { parse } from './parser.ts';
import { initializeGlobalEnv } from './environment.ts';
import { initializeCoreMacros } from './core-macros.ts';
import { expandMacros } from './macro.ts';
import { processImports } from './imports.ts';
import { convertToHqlAst } from './connector.ts';
import { transformAST } from '../transformer.ts'; // Use existing transformer for final output
import { Logger } from '../logger.ts';

/**
 * Options for processing HQL code through the S-expression layer
 */
export interface ProcessOptions {
  verbose?: boolean;
  baseDir?: string;
  module?: 'esm'; // Only ESM supported for now
  includeSourceMap?: boolean;
}

/**
 * Process HQL source code through the S-expression layer
 * 
 * This is the main entry point for using the new S-expression frontend
 * with the existing HQL transpiler backend
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
      logger.debug(`Parsed ${sexps.length} S-expressions`);
      for (const sexp of sexps) {
        logger.debug(`Parsed: ${sexpToString(sexp)}`);
      }
    }
    
    // Step 2: Initialize the environment
    logger.debug('Initializing environment');
    const env = initializeGlobalEnv({ verbose: options.verbose });
    initializeCoreMacros(env, logger);
    
    // Step 3: Process imports
    logger.debug('Processing imports');
    await processImports(sexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd()
    });
    
    // Step 4: Expand macros
    logger.debug('Expanding macros');
    const expanded = expandMacros(sexps, env, { verbose: options.verbose });
    
    if (options.verbose) {
      logger.debug(`Expanded to ${expanded.length} S-expressions`);
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
      bundle: false // Don't bundle here, we're just transpiling
    });
    
    // Step 7: Ensure proper exports are included (extraction from expanded S-expressions)
    const exportStatements: Array<{exportName: string, symbolName: string}> = [];
    
    for (const expr of sexps) {
      if (expr.type === 'list' && 
          expr.elements.length >= 3 &&
          isSymbol(expr.elements[0]) && 
          expr.elements[0].name === 'export' &&
          isLiteral(expr.elements[1]) &&
          isSymbol(expr.elements[2])) {
        
        const exportName = (expr.elements[1] as SLiteral).value as string;
        const symbolName = (expr.elements[2] as SSymbol).name;
        
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

/**
 * A simplified API for quick transpilation
 */
export async function transpileHql(
  source: string,
  baseDir: string = Deno.cwd(),
  verbose: boolean = false
): Promise<string> {
  return processHql(source, { baseDir, verbose });
}

if (import.meta.main) {
  console.log("hey");
  const jsCode = await processHql(
    `
      (defn greet [name]
        (console.log "Hello," name))
      
      (greet "World")
    `,
    { 
      verbose: true,
      baseDir: Deno.cwd()
    }
  );
  
  console.log(jsCode);
}
