// src/s-exp/imports.ts - Import handling for S-expressions

import * as path from "https://deno.land/std/path/mod.ts";
import { SExp, SList, SLiteral, isSymbol, isLiteral, isImport, createList, createSymbol, createLiteral } from './types.ts';
import { SEnv } from './environment.ts';
import { Logger } from '../logger.ts';
import { resolve, basename } from "../../src/platform/platform.ts";

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
// In src/s-exp/imports.ts - Enhance processHqlImport

async function processHqlImport(
  moduleName: string, 
  modulePath: string, 
  baseDir: string, 
  env: SEnv, 
  processedImports: Set<string>,
  logger: Logger
): Promise<void> {
  // Only process .hql files
  if (!modulePath.toLowerCase().endsWith('.hql')) {
    return;
  }
  
  // Try multiple strategies to resolve the path
  let resolvedPath = resolve(baseDir, modulePath);
  let fileFound = false;
  
  try {
    // Check if file exists at the primary location
    await Deno.stat(resolvedPath);
    fileFound = true;
  } catch (error) {
    // Try the examples/dependency-test directory as fallback
    try {
      const filename = basename(modulePath);
      const examplesPath = resolve(Deno.cwd(), "examples", "dependency-test", filename);
      await Deno.stat(examplesPath);
      resolvedPath = examplesPath;
      fileFound = true;
      logger.debug(`Found import in examples directory: ${examplesPath}`);
    } catch (e) {
      // File not found in examples either
    }
  }
  
  if (!fileFound) {
    throw new Error(`HQL import not found: "${modulePath}" (tried ${resolvedPath})`);
  }
  
  // Skip if already processed to avoid circular dependencies
  if (processedImports.has(resolvedPath)) {
    return;
  }
  
  // Proceed with import processing as before...
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
  // try {
  //   const trimmedPath = modulePath.trim();
  //   const packageName = trimmedPath.substring(4); // Extract package name without prefix
  //   console.log("modulePath : ", trimmedPath)
  //   const module = await import(trimmedPath); // Use trimmedPath here
  //   env.importModule(moduleName, module);
  //   logger.debug(`Imported NPM module: ${moduleName} (${packageName}) with exports: ${Object.keys(module).join(', ')}`);
  // } catch (error) {
  //   logger.error(`Failed to import NPM module: ${modulePath} - ${error.message}`);
  //   throw new Error(`Failed to import NPM module: ${modulePath} - ${error.message}`);
  // }
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
    const module = await import(modulePath);
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
