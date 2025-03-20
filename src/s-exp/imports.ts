// src/s-exp/imports.ts - Refactored

import * as path from "https://deno.land/std/path/mod.ts";
import { SExp, SList, SLiteral, SSymbol, isSymbol, isLiteral, isImport } from './types.ts';
import { Environment } from '../environment.ts';
import { defineMacro, expandMacro, evaluateForMacro } from './macro.ts';
import { parse } from './parser.ts';
import { Logger } from '../logger.ts';
import { isUrl, escapeRegExp } from '../utils.ts';

/**
 * Options for import processing
 */
interface ImportProcessorOptions {
  verbose?: boolean;
  baseDir?: string;
  tempDir?: string;
  keepTemp?: boolean;
  processedFiles?: Set<string>;
  importMap?: Map<string, string>;
}

/**
 * Process all imports in a list of S-expressions
 */
export async function processImports(
  exprs: SExp[], 
  env: Environment, 
  options: ImportProcessorOptions = {}
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();
  
  // Track processed imports to avoid duplicates
  const processedFiles = options.processedFiles || new Set<string>();
  const importMap = options.importMap || new Map<string, string>();
  
  // Create temp directory if needed
  let tempDir = options.tempDir;
  if (!tempDir) {
    tempDir = await Deno.makeTempDir({ prefix: "hql_imports_" });
    logger.debug(`Created temporary directory: ${tempDir}`);
  }
  
  // Collect all import expressions
  const importExprs: SList[] = [];
  
  for (const expr of exprs) {
    if (isImport(expr) && expr.type === 'list') {
      importExprs.push(expr as SList);
    }
  }
  
  // Process imports in order
  for (const importExpr of importExprs) {
    try {
      await processImport(importExpr, env, baseDir, {
        verbose: options.verbose,
        tempDir,
        keepTemp: options.keepTemp,
        processedFiles,
        importMap
      });
    } catch (error) {
      logger.error(`Error processing import: ${error.message}`);
    }
  }
  
  // Process definitions in the current file to make them available to macros
  processFileDefinitions(exprs, env, logger);
}

/**
 * Process definitions in the current file to make them available to macros
 */
function processFileDefinitions(exprs: SExp[], env: Environment, logger: Logger): void {
  logger.debug("Processing file definitions for macros and variables");
  
  // First pass: Process def declarations to register variables
  for (const expr of exprs) {
    if (expr.type === 'list' && 
        expr.elements.length > 0 &&
        isSymbol(expr.elements[0])) {
      const op = expr.elements[0].name;
      
      if (op === 'def' && expr.elements.length === 3) {
        try {
          // Get the name and value
          if (isSymbol(expr.elements[1])) {
            const name = expr.elements[1].name;
            // Evaluate the value for use by macros
            try {
              const value = evaluateForMacro(expr.elements[2], env, logger);
              if (isLiteral(value)) {
                env.define(name, value.value);
                logger.debug(`Registered variable for macros: ${name} = ${value.value}`);
              } else {
                env.define(name, value);
                logger.debug(`Registered complex variable for macros: ${name}`);
              }
            } catch (evalError) {
              logger.warn(`Could not evaluate ${name} for macro use: ${evalError.message}`);
            }
          }
        } catch (error) {
          logger.error(`Error processing def: ${error.message}`);
        }
      }
    }
  }
  
  // Second pass: Process defn declarations to register functions
  for (const expr of exprs) {
    if (expr.type === 'list' && 
        expr.elements.length > 0 &&
        isSymbol(expr.elements[0])) {
      const op = expr.elements[0].name;
      
      if (op === 'defn' && expr.elements.length >= 4) {
        try {
          // Skip if not a proper defn
          if (!isSymbol(expr.elements[1]) || expr.elements[2].type !== 'list') {
            continue;
          }
          
          const fnName = expr.elements[1].name;
          const params = expr.elements[2];
          const body = expr.elements.slice(3);
          
          // Create a simplified function for macro evaluation
          const fn = (...args: any[]) => {
            try {
              return `${fnName}(${args.join(', ')})`;
            } catch (e) {
              logger.error(`Error executing function ${fnName}: ${e.message}`);
              return null;
            }
          };
          
          // Mark as a function definition
          Object.defineProperty(fn, 'isDefFunction', { value: true });
          
          // Register in the environment
          env.define(fnName, fn);
          logger.debug(`Registered function for macros: ${fnName}`);
        } catch (error) {
          logger.error(`Error processing defn: ${error.message}`);
        }
      }
    }
  }
}

// Modified processImport function in src/s-exp/imports.ts

/**
 * Process a single import expression with support for the new vector syntax
 */
async function processImport(
  importExpr: SList, 
  env: Environment, 
  baseDir: string, 
  options: ImportProcessorOptions
): Promise<void> {
  const logger = new Logger(options.verbose);
  const processedFiles = options.processedFiles!;
  const importMap = options.importMap!;
  const tempDir = options.tempDir!;
  
  // Get the elements of the import expression
  const elements = importExpr.elements;
  
  // Check if this is the new vector-based syntax:
  // (import [symbol1, symbol2 as alias2] from "./path.hql")
  if (elements.length >= 4 && 
      elements[1].type === 'list' && 
      isSymbol(elements[2]) && 
      elements[2].name === 'from') {
    
    // This is the new syntax
    logger.debug(`Processing new vector-based import syntax`);
    
    // Get the vector of symbols to import
    const symbolsVector = elements[1] as SList;
    // Get the module path
    const modulePathExp = elements[3];
    
    // Validate the module path
    if (!isLiteral(modulePathExp) || typeof modulePathExp.value !== 'string') {
      throw new Error('Module path must be a string literal');
    }
    
    const modulePath = modulePathExp.value;
    logger.debug(`Importing symbols from: ${modulePath}`);
    
    // Process the module path to load the module
    // This is similar to the original code but with a temporary module name
    const tempModuleName = `__temp_module_${Date.now()}`;
    
    // Determine file type and process accordingly
    if (modulePath.endsWith('.hql')) {
      await processHqlImport(tempModuleName, modulePath, baseDir, env, processedFiles, logger, tempDir, importMap, options.keepTemp);
    } else if (modulePath.endsWith('.js') || modulePath.endsWith('.mjs') || modulePath.endsWith('.cjs')) {
      await processJsImport(tempModuleName, modulePath, baseDir, env, logger, processedFiles, tempDir, importMap, options.keepTemp);
    } else if (modulePath.startsWith('npm:')) {
      await processNpmImport(tempModuleName, modulePath, env, logger);
    } else if (modulePath.startsWith('jsr:')) {
      await processJsrImport(tempModuleName, modulePath, env, logger);
    } else if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
      await processHttpImport(tempModuleName, modulePath, env, logger);
    } else {
      throw new Error(`Unsupported import file type: ${modulePath}`);
    }
    
    // Get the vector elements, skipping the "vector" symbol if present
    let vectorElements = symbolsVector.elements;
    if (vectorElements.length > 0 && 
        isSymbol(vectorElements[0]) && 
        vectorElements[0].name === "vector") {
      vectorElements = vectorElements.slice(1);
    }
    
    // Filter out commas
    vectorElements = vectorElements.filter(elem => 
      !(isSymbol(elem) && (elem as SSymbol).name === ',')
    );
    
    // Now process each symbol in the vector and import it directly
    let i = 0;
    while (i < vectorElements.length) {
      // Handle simple symbol without alias: symbol
      if (isSymbol(vectorElements[i])) {
        const symbolName = (vectorElements[i] as SSymbol).name;
        
        // Check if this is followed by "as" and an alias
        if (i + 2 < vectorElements.length && 
            isSymbol(vectorElements[i+1]) && 
            (vectorElements[i+1] as SSymbol).name === 'as' &&
            isSymbol(vectorElements[i+2])) {
            
          const aliasName = (vectorElements[i+2] as SSymbol).name;
          
          try {
            // Get the value from the temporary module
            const value = env.lookup(`${tempModuleName}.${symbolName}`);
            
            // Register the symbol with the alias in the current environment
            env.define(aliasName, value);
            logger.debug(`Imported symbol: ${symbolName} as ${aliasName}`);
            
            i += 3; // Skip symbol, 'as', and alias
          } catch (error) {
            logger.warn(`Symbol not found in module: ${symbolName}`);
            i += 3; // Still skip all three elements
          }
        } else {
          // Simple symbol without alias
          try {
            // Get the value from the temporary module
            const value = env.lookup(`${tempModuleName}.${symbolName}`);
            
            // Register the symbol directly in the current environment
            env.define(symbolName, value);
            logger.debug(`Imported symbol: ${symbolName}`);
            
            i++; // Move to next element
          } catch (error) {
            logger.warn(`Symbol not found in module: ${symbolName}`);
            i++; // Still move to next element
          }
        }
      } else {
        // Skip unrecognized element
        i++;
      }
    }
    
    return;
  }
  
  // If we reach here, this is the old syntax: (import moduleName "./path.hql")
  // Use the original implementation for backward compatibility
  
  if (elements.length !== 3) {
    throw new Error('import requires exactly two arguments: module name and path');
  }
  
  // Extract module name and path (original code)
  const moduleNameExp = elements[1];
  const modulePathExp = elements[2];
  
  if (!isSymbol(moduleNameExp)) {
    throw new Error('Module name must be a symbol');
  }
  
  if (!isLiteral(modulePathExp) || typeof modulePathExp.value !== 'string') {
    throw new Error('Module path must be a string literal');
  }
  
  const moduleName = moduleNameExp.name;
  const modulePath = modulePathExp.value;
  
  logger.debug(`Processing legacy import: ${moduleName} from ${modulePath}`);
  
  // Continue with original implementation...
  if (modulePath.startsWith('npm:')) {
    await processNpmImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('jsr:')) {
    await processJsrImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
    await processHttpImport(moduleName, modulePath, env, logger);
  } else {
    // Local file import
    if (modulePath.endsWith('.hql')) {
      await processHqlImport(moduleName, modulePath, baseDir, env, processedFiles, logger, tempDir, importMap, options.keepTemp);
    } else if (modulePath.endsWith('.js') || modulePath.endsWith('.mjs') || modulePath.endsWith('.cjs')) {
      await processJsImport(moduleName, modulePath, baseDir, env, logger, processedFiles, tempDir, importMap, options.keepTemp);
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
  env: Environment, 
  processedFiles: Set<string>,
  logger: Logger,
  tempDir: string,
  importMap: Map<string, string>,
  keepTemp: boolean = false
): Promise<void> {
  // Resolve the absolute path relative to the importing file's directory
  const resolvedPath = path.resolve(baseDir, modulePath);
  
  logger.debug(`Resolving import: ${moduleName} from ${modulePath}`);
  logger.debug(`Base directory: ${baseDir}`);
  logger.debug(`Resolved path: ${resolvedPath}`);
  
  // Check for circular imports
  if (processedFiles.has(resolvedPath)) {
    logger.debug(`Skipping already processed import: ${resolvedPath}`);
    return;
  }
  
  // Check if this is a core.hql import
  const isCoreMacros = modulePath.endsWith('/core.hql') || 
                       modulePath.endsWith('\\core.hql') || 
                       modulePath === 'core.hql' || 
                       modulePath === './core.hql' || 
                       modulePath === 'lib/core.hql' || 
                       moduleName === 'core';
  
  // Mark as processed
  processedFiles.add(resolvedPath);
  
  // Read the file
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
    baseDir: importDir,
    tempDir,
    keepTemp,
    processedFiles,
    importMap
  });
  
  // Create module object to store exports
  const moduleExports: Record<string, any> = {};
  
  // Process and extract exports
  processFileExportsAndDefinitions(importedExprs, env, moduleExports, logger);
  
  // Register the module with its exports
  env.importModule(moduleName, moduleExports);
  
  logger.debug(`Imported HQL module: ${moduleName} with exports: ${Object.keys(moduleExports).join(', ')}`);
}

/**
 * Process exports and definitions in a file
 * Updated to handle the new vector-based export syntax
 */
/**
 * Process exports and definitions in a file
 * Updated to correctly handle the new vector-based export syntax
 */
function processFileExportsAndDefinitions(
  expressions: SExp[],
  env: Environment,
  moduleExports: Record<string, any>,
  logger: Logger
): void {
  // First pass: register all definitions for use by macros
  processFileDefinitions(expressions, env, logger);
  
  // Second pass: process exports
  for (const expr of expressions) {
    // Skip non-list expressions
    if (expr.type !== 'list' || expr.elements.length === 0) continue;
    
    const first = expr.elements[0];
    if (!isSymbol(first)) continue;
    
    const op = first.name;
    
    // Process new vector-based export syntax: (export [symbol1, symbol2])
    if (op === 'export' && expr.elements.length === 2 && 
        expr.elements[1].type === 'list') {
      
      const exportVector = expr.elements[1] as SList;
      
      logger.debug(`Processing vector export with ${exportVector.elements.length} symbols`);
      
      // Get the elements inside the vector, skipping the "vector" keyword if present
      let elementsToProcess = exportVector.elements;
      
      // Skip the first element if it's the "vector" symbol since it's part of syntax, not content
      if (elementsToProcess.length > 0 && 
          isSymbol(elementsToProcess[0]) && 
          elementsToProcess[0].name === "vector") {
        elementsToProcess = elementsToProcess.slice(1);
      }
      
      // Process each symbol in the export vector
      for (const symbolExpr of elementsToProcess) {
        // Skip non-symbol elements (like commas)
        if (!isSymbol(symbolExpr)) {
          // Check if it's a comma (which should be ignored)
          if (isSymbol(symbolExpr) && symbolExpr.name === ',') {
            continue;
          }
          
          logger.warn(`Non-symbol found in export vector: ${sexpToString(symbolExpr)}`);
          continue;
        }
        
        const symbolName = (symbolExpr as SSymbol).name;
        logger.debug(`Processing export for symbol: ${symbolName}`);
        
        try {
          // Look up the value from the environment
          const value = env.lookup(symbolName);
          
          // Store in module exports with the symbol name as the export name
          moduleExports[symbolName] = value;
          logger.debug(`Added export "${symbolName}" with self-named value`);
        } catch (error) {
          logger.warn(`Failed to lookup symbol "${symbolName}" for export`);
        }
      }
    }
    // Process legacy string-based export syntax: (export "name" value)
    else if (op === 'export' && expr.elements.length === 3 && 
             isLiteral(expr.elements[1]) && 
             typeof expr.elements[1].value === 'string') {
      
      const exportName = expr.elements[1].value;
      const exportSymbol = expr.elements[2];
      
      logger.debug(`Processing legacy export: "${exportName}"`);
      
      // Handle symbol exports
      if (isSymbol(exportSymbol)) {
        const symbolName = exportSymbol.name;
        logger.debug(`Export symbol: ${symbolName}`);
        
        try {
          // Look up the value from the environment
          const value = env.lookup(symbolName);
          
          // Store in module exports
          moduleExports[exportName] = value;
          logger.debug(`Added export "${exportName}" with value from ${symbolName}`);
        } catch (error) {
          logger.warn(`Failed to lookup symbol "${symbolName}" for export "${exportName}"`);
        }
      } else {
        // For non-symbol exports, evaluate the expression
        try {
          const value = evaluateForMacro(exportSymbol, env, logger);
          
          if (isLiteral(value)) {
            moduleExports[exportName] = value.value;
          } else {
            moduleExports[exportName] = value;
          }
          
          logger.debug(`Added export "${exportName}" with direct value`);
        } catch (error) {
          logger.warn(`Failed to evaluate export "${exportName}": ${error.message}`);
        }
      }
    }
  }
}

/**
 * Process JavaScript imports
 */
async function processJsImport(
  moduleName: string,
  modulePath: string,
  baseDir: string,
  env: Environment,
  logger: Logger,
  processedFiles: Set<string>,
  tempDir: string,
  importMap: Map<string, string>,
  keepTemp: boolean = false
): Promise<void> {
  try {
    // Resolve the absolute path
    const resolvedPath = path.resolve(baseDir, modulePath);
    
    // Check for circular imports
    if (processedFiles.has(resolvedPath)) {
      logger.debug(`Skipping already processed JS import: ${resolvedPath}`);
      return;
    }
    
    // Mark as processed
    processedFiles.add(resolvedPath);
    
    // Import the module dynamically
    const moduleUrl = `file://${resolvedPath}`;
    const module = await import(moduleUrl);
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported JS module: ${moduleName} with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import JS module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Process npm: imports
 */
async function processNpmImport(
  moduleName: string,
  modulePath: string,
  env: Environment,
  logger: Logger
): Promise<void> {
  try {
    // Extract the package name without the npm: prefix
    const packageName = modulePath.substring(4);
    
    // Try direct import (for Deno compatibility)
    let module;
    try {
      module = await import(modulePath);
    } catch (error) {
      // Fallback to ESM.sh CDN
      try {
        const esmUrl = `https://esm.sh/${packageName}`;
        module = await import(esmUrl);
      } catch (esmError) {
        // Fallback to Skypack CDN
        const skypackUrl = `https://cdn.skypack.dev/${packageName}`;
        module = await import(skypackUrl);
      }
    }
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported NPM module: ${moduleName} (${packageName}) with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import NPM module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Process jsr: imports
 */
async function processJsrImport(
  moduleName: string,
  modulePath: string,
  env: Environment,
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
 * Process http(s): imports
 */
async function processHttpImport(
  moduleName: string,
  modulePath: string,
  env: Environment,
  logger: Logger
): Promise<void> {
  try {
    const module = await import(modulePath);
    env.importModule(moduleName, module);
    logger.debug(`Imported HTTP module: ${moduleName} (${modulePath}) with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import HTTP module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Simple string hash function
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Cleanup temporary files
 */
export async function cleanupImportTemp(tempDir: string, logger: Logger): Promise<void> {
  if (tempDir) {
    try {
      await Deno.remove(tempDir, { recursive: true });
      logger.debug(`Cleaned up temporary directory: ${tempDir}`);
    } catch (error) {
      logger.error(`Failed to clean up temporary directory: ${error.message}`);
    }
  }
}