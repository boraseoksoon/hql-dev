// src/s-exp/imports.ts - Import handling for S-expressions

import * as path from "https://deno.land/std/path/mod.ts";
import { 
  SExp, SList, SLiteral, isSymbol, isLiteral, isImport, createList, createSymbol, createLiteral 
} from './types';
import { SEnv } from './environment';
import { defineMacro } from './macro';
import { parse } from './parser';
import { Logger } from '../logger';

/**
 * Options for import processing
 */
export interface ImportProcessorOptions {
  verbose?: boolean;
  baseDir?: string;
}

/**
 * Process all imports in a list of S-expressions
 */
export async function processImports(
  exprs: SExp[], 
  env: SEnv, 
  options: ImportProcessorOptions = {}
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();
  
  // Track processed imports to avoid duplicates and circular dependencies
  const processedImports = new Set<string>();
  
  // First pass: collect all import expressions
  const importExprs: SList[] = [];
  
  for (const expr of exprs) {
    if (isImport(expr) && expr.type === 'list') {
      importExprs.push(expr as SList);
    }
  }
  
  // Second pass: process imports in order
  for (const importExpr of importExprs) {
    try {
      await processImport(importExpr, env, baseDir, processedImports, logger);
    } catch (error) {
      logger.error(`Error processing import: ${error.message}`);
      // Continue with other imports
    }
  }
}

/**
 * Process a single import expression
 */
async function processImport(
  importExpr: SList, 
  env: SEnv, 
  baseDir: string, 
  processedImports: Set<string>,
  logger: Logger
): Promise<void> {
  if (importExpr.elements.length !== 3) {
    throw new Error('import requires exactly two arguments: module name and path');
  }
  
  // Extract module name and path
  const moduleNameExp = importExpr.elements[1];
  const modulePathExp = importExpr.elements[2];
  
  if (!isSymbol(moduleNameExp)) {
    throw new Error('Module name must be a symbol');
  }
  
  if (!isLiteral(modulePathExp) || typeof modulePathExp.value !== 'string') {
    throw new Error('Module path must be a string literal');
  }
  
  const moduleName = moduleNameExp.name;
  const modulePath = modulePathExp.value;
  
  logger.debug(`Processing import: ${moduleName} from ${modulePath}`);
  
  // Determine import type and process accordingly
  if (modulePath.startsWith('npm:')) {
    await processNpmImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('jsr:')) {
    await processJsrImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
    await processHttpImport(moduleName, modulePath, env, logger);
  } else {
    // Local file import
    if (modulePath.endsWith('.hql')) {
      await processHqlImport(moduleName, modulePath, baseDir, env, processedImports, logger);
    } else if (modulePath.endsWith('.js') || modulePath.endsWith('.mjs') || modulePath.endsWith('.cjs')) {
      await processJsImport(moduleName, modulePath, baseDir, env, logger);
    } else {
      throw new Error(`Unsupported import file type: ${modulePath}`);
    }
  }
}

/**
 * Process an HQL file import
 */
async function processHqlImport(
  moduleName: string, 
  modulePath: string, 
  baseDir: string, 
  env: SEnv, 
  processedImports: Set<string>,
  logger: Logger
): Promise<void> {
  // Resolve the absolute path
  const resolvedPath = path.resolve(baseDir, modulePath);
  
  // Check for circular imports
  if (processedImports.has(resolvedPath)) {
    logger.debug(`Skipping already processed import: ${resolvedPath}`);
    return;
  }
  
  // Mark as processed
  processedImports.add(resolvedPath);
  
  // Read the file using Deno's API
  let fileContent: string;
  try {
    fileContent = await Deno.readTextFile(resolvedPath);
  } catch (error) {
    throw new Error(`Failed to read HQL file: ${resolvedPath} - ${error.message}`);
  }
  
  // Parse it into S-expressions
  const importedExprs = parse(fileContent);
  
  // Process nested imports first
  const importDir = path.dirname(resolvedPath);
  await processImports(importedExprs, env, { 
    verbose: logger.enabled,
    baseDir: importDir 
  });
  
  // Create module object to store exports
  const moduleExports: Record<string, any> = {};
  
  // Process macro definitions and collect the exports
  for (const expr of importedExprs) {
    // Skip imports (already processed)
    if (isImport(expr)) {
      continue;
    }
    
    // Handle macro definitions
    if (expr.type === 'list' && 
        expr.elements.length > 0 &&
        isSymbol(expr.elements[0]) &&
        expr.elements[0].name === 'defmacro') {
      try {
        // Define the macro in the environment
        defineMacro(expr as SList, env, logger);
        
        // Extract macro name for exports
        if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
          const macroName = expr.elements[1].name;
          const macroFn = env.getMacro(macroName);
          
          if (macroFn) {
            moduleExports[macroName] = macroFn;
          }
        }
      } catch (error) {
        logger.error(`Error defining macro in ${modulePath}: ${error.message}`);
      }
    }
    
    // Handle function definitions through defn
    else if (expr.type === 'list' && 
             expr.elements.length > 0 &&
             isSymbol(expr.elements[0]) &&
             expr.elements[0].name === 'defn') {
      try {
        // Extract function name and body
        if (expr.elements.length > 2 && isSymbol(expr.elements[1])) {
          const fnName = expr.elements[1].name;
          
          // We don't evaluate the function here, just register it for exports
          moduleExports[fnName] = expr;
        }
      } catch (error) {
        logger.error(`Error processing function in ${modulePath}: ${error.message}`);
      }
    }
    
    // Handle export directives
    else if (expr.type === 'list' && 
             expr.elements.length > 0 &&
             isSymbol(expr.elements[0]) &&
             expr.elements[0].name === 'export') {
      try {
        // Format: (export "name" value)
        if (expr.elements.length === 3 && 
            isLiteral(expr.elements[1]) && 
            typeof expr.elements[1].value === 'string') {
          const exportName = expr.elements[1].value;
          const exportValueExpr = expr.elements[2];
          
          // If the export value is a symbol, look it up
          if (isSymbol(exportValueExpr)) {
            try {
              const symbolName = exportValueExpr.name;
              const value = env.lookup(symbolName);
              moduleExports[exportName] = value;
            } catch (error) {
              logger.error(`Error resolving export symbol in ${modulePath}: ${error.message}`);
            }
          } else {
            // Use the expression directly
            moduleExports[exportName] = exportValueExpr;
          }
        }
      } catch (error) {
        logger.error(`Error processing export in ${modulePath}: ${error.message}`);
      }
    }
  }
  
  // Register the module with its exports
  env.importModule(moduleName, moduleExports);
  logger.debug(`Imported HQL module: ${moduleName} with exports: ${Object.keys(moduleExports).join(', ')}`);
}

/**
 * Process a JavaScript file import
 */
async function processJsImport(
  moduleName: string,
  modulePath: string,
  baseDir: string,
  env: SEnv,
  logger: Logger
): Promise<void> {
  try {
    // Resolve the absolute path
    const resolvedPath = path.resolve(baseDir, modulePath);
    
    // Import the module dynamically
    // Note: In a browser environment, a different approach would be needed
    const moduleUrl = new URL(`file://${resolvedPath}`);
    
    // This is a simplified version; real implementations may need to handle different module systems
    const module = await import(moduleUrl.href);
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported JS module: ${moduleName} with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import JS module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Process an NPM package import
 */
async function processNpmImport(
  moduleName: string,
  modulePath: string,
  env: SEnv,
  logger: Logger
): Promise<void> {
  try {
    // Extract the package name without the npm: prefix
    const packageName = modulePath.substring(4);
    
    // Import the module dynamically
    const module = await import(packageName);
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported NPM module: ${moduleName} (${packageName}) with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import NPM module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Process a JSR package import
 */
async function processJsrImport(
  moduleName: string,
  modulePath: string,
  env: SEnv,
  logger: Logger
): Promise<void> {
  try {
    // Import the module dynamically
    const module = await import(modulePath);
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported JSR module: ${moduleName} (${modulePath}) with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import JSR module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Process an HTTP/HTTPS import
 */
async function processHttpImport(
  moduleName: string,
  modulePath: string,
  env: SEnv,
  logger: Logger
): Promise<void> {
  try {
    // Import the module dynamically
    const module = await import(modulePath);
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported HTTP module: ${moduleName} (${modulePath}) with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import HTTP module: ${modulePath} - ${error.message}`);
  }
}
