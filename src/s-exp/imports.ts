// src/s-exp/imports.ts - Refactored

import * as path from "https://deno.land/std/path/mod.ts";
import { SExp, SList, SLiteral, SSymbol, isSymbol, isLiteral, isList, isImport, isUserMacro, createList, createSymbol } from './types.ts';
import { Environment, MacroFn } from '../environment.ts';
import { evaluateForMacro, defineUserMacro } from './macro.ts';
import { parse } from './parser.ts';
import { Logger } from '../logger.ts';

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
  const importExprs: SList[] = collectImportExpressions(exprs);
  
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
 * Collect all import expressions from a list of S-expressions
 */
function collectImportExpressions(exprs: SExp[]): SList[] {
  const importExprs: SList[] = [];
  
  for (const expr of exprs) {
    if (isImport(expr) && expr.type === 'list') {
      importExprs.push(expr as SList);
    }
  }
  
  return importExprs;
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
          processDefDeclaration(expr, env, logger);
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
          processDefnDeclaration(expr, env, logger);
        } catch (error) {
          logger.error(`Error processing defn: ${error.message}`);
        }
      }
    }
  }
  
  // Third pass: Process user-level macro declarations
  for (const expr of exprs) {
    if (isUserMacro(expr) && isList(expr)) {
      try {
        defineUserMacro(expr as SList, env, logger);
      } catch (error) {
        logger.error(`Error processing user-level macro: ${error.message}`);
      }
    }
  }
}

/**
 * Process a def declaration
 */
function processDefDeclaration(expr: SList, env: Environment, logger: Logger): void {
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
    } catch (error) {
      logger.warn(`Could not evaluate ${name} for macro use: ${error.message}`);
    }
  }
}

/**
 * Process a defn declaration
 */
function processDefnDeclaration(expr: SList, env: Environment, logger: Logger): void {
  // Skip if not a proper defn
  if (!isSymbol(expr.elements[1]) || expr.elements[2].type !== 'list') {
    return;
  }
  
  const fnName = expr.elements[1].name;

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
}

/**
 * Process a single import expression with support for the new vector syntax
 */
async function processImport(
  importExpr: SList, 
  env: Environment, 
  baseDir: string, 
  options: ImportProcessorOptions
): Promise<void> {
  // Get the elements of the import expression
  const elements = importExpr.elements;
  
  // Determine the import type based on the syntax
  if (isVectorBasedImport(elements)) {
    await processVectorBasedImport(elements, env, baseDir, options);
  } else if (isLegacyImport(elements)) {
    await processLegacyImport(elements, env, baseDir, options);
  } else {
    throw new Error("Invalid import syntax");
  }
}

/**
 * Check if this is a vector-based import
 */
function isVectorBasedImport(elements: SExp[]): boolean {
  return elements.length >= 4 && 
      elements[1].type === 'list' && 
      isSymbol(elements[2]) && 
      elements[2].name === 'from';
}

/**
 * Check if this is a legacy import
 */
function isLegacyImport(elements: SExp[]): boolean {
  return elements.length === 3 && 
      isSymbol(elements[1]) && 
      isLiteral(elements[2]) && 
      typeof elements[2].value === 'string';
}

/**
 * Process a vector-based import
 */
async function processVectorBasedImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions
): Promise<void> {
  const logger = new Logger(options.verbose);
  
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
  
  // Create a temporary module name
  const tempModuleName = `__temp_module_${Date.now()}`;
  
  // Load the module based on file type
  await loadModuleByType(tempModuleName, modulePath, baseDir, env, options);
  
  // Process the vector elements
  const vectorElements = processVectorElements(symbolsVector);
  
  // Import each symbol
  let i = 0;
  while (i < vectorElements.length) {
    if (isSymbol(vectorElements[i])) {
      const symbolName = (vectorElements[i] as SSymbol).name;
      
      // Check for alias pattern: symbol as alias
      const hasAlias = i + 2 < vectorElements.length && 
                      isSymbol(vectorElements[i+1]) && 
                      (vectorElements[i+1] as SSymbol).name === 'as' &&
                      isSymbol(vectorElements[i+2]);
          
      if (hasAlias) {
        const aliasName = (vectorElements[i+2] as SSymbol).name;
        await importSymbolAs(tempModuleName, symbolName, aliasName, env, logger);
        i += 3; // Skip symbol, as, and alias
      } else {
        await importSymbolDirectly(tempModuleName, symbolName, env, logger);
        i++; // Next symbol
      }
    } else {
      i++; // Skip non-symbols
    }
  }
}

/**
 * Process a legacy import
 */
async function processLegacyImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions
): Promise<void> {
  const logger = new Logger(options.verbose);
  
  // Extract module name and path
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
  
  // Load the module based on file type
  await loadModuleByType(moduleName, modulePath, baseDir, env, options);
}

/**
 * Load a module based on its file type
 */
async function loadModuleByType(
  moduleName: string,
  modulePath: string,
  baseDir: string,
  env: Environment,
  options: ImportProcessorOptions
): Promise<void> {
  const logger = new Logger(options.verbose);
  
  if (modulePath.startsWith('npm:')) {
    await processNpmImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('jsr:')) {
    await processJsrImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
    await processHttpImport(moduleName, modulePath, env, logger);
  } else if (modulePath.endsWith('.hql')) {
    await processHqlImport(
      moduleName, 
      modulePath, 
      baseDir, 
      env, 
      options.processedFiles!, 
      logger, 
      options.tempDir!, 
      options.importMap!, 
      options.keepTemp
    );
  } else if (modulePath.endsWith('.js') || modulePath.endsWith('.mjs') || modulePath.endsWith('.cjs')) {
    await processJsImport(
      moduleName, 
      modulePath, 
      baseDir, 
      env, 
      logger, 
      options.processedFiles!
    );
  } else {
    throw new Error(`Unsupported import file type: ${modulePath}`);
  }
}

/**
 * Process vector elements, removing commas and handling the vector syntax
 */
function processVectorElements(vectorList: SList): SExp[] {
  // Skip the "vector" symbol if present
  let elements = vectorList.elements;
  if (elements.length > 0 && 
      isSymbol(elements[0]) && 
      elements[0].name === "vector") {
    elements = elements.slice(1);
  }
  
  // Filter out commas
  return elements.filter(elem => 
    !(isSymbol(elem) && (elem as SSymbol).name === ',')
  );
}

/**
 * Import a symbol with an alias
 */
async function importSymbolAs(
  moduleName: string,
  symbolName: string,
  aliasName: string,
  env: Environment,
  logger: Logger
): Promise<void> {
  try {
    // First check in the moduleExports map
    if (env.moduleExports.has(moduleName)) {
      const moduleExports = env.moduleExports.get(moduleName)!;
      if (symbolName in moduleExports) {
        const value = moduleExports[symbolName];
        
        // Handle user-level macros specially
        if (value && typeof value === 'object' && value.type === "user-macro") {
          // Create a copy of the macro data with the new name
          const aliasedMacroData = {
            ...value,
            name: aliasName
          };
          
          // Reconstruct with the new name
          reconstructUserMacro(aliasName, aliasedMacroData, env, logger);
          logger.debug(`Reconstructed user-level macro: ${symbolName} as ${aliasName}`);
          return;
        }
        
        // Otherwise, define as a regular value
        env.define(aliasName, value);
        logger.debug(`Imported symbol: ${symbolName} as ${aliasName}`);
        return;
      }
    }
    
    // Fallback to normal import
    try {
      const value = env.lookup(`${moduleName}.${symbolName}`);
      env.define(aliasName, value);
      logger.debug(`Imported symbol: ${symbolName} as ${aliasName}`);
    } catch (error) {
      logger.warn(`Symbol not found in module: ${symbolName}`);
    }
  } catch (error) {
    logger.warn(`Error importing symbol ${symbolName}: ${error.message}`);
  }
}

/**
 * Import a symbol directly (no alias)
 */
async function importSymbolDirectly(
  moduleName: string,
  symbolName: string,
  env: Environment,
  logger: Logger
): Promise<void> {
  try {
    // First check in the moduleExports map
    if (env.moduleExports.has(moduleName)) {
      const moduleExports = env.moduleExports.get(moduleName)!;
      if (symbolName in moduleExports) {
        const value = moduleExports[symbolName];
        
        // Handle user-level macros specially
        if (value && typeof value === 'object' && value.type === "user-macro") {
          reconstructUserMacro(symbolName, value, env, logger);
          logger.debug(`Reconstructed user-level macro: ${symbolName}`);
          return;
        }
        
        // Otherwise, define as a regular value
        env.define(symbolName, value);
        logger.debug(`Imported symbol: ${symbolName}`);
        return;
      }
    }
    
    // Fallback to normal import
    try {
      const value = env.lookup(`${moduleName}.${symbolName}`);
      env.define(symbolName, value);
      logger.debug(`Imported symbol: ${symbolName}`);
    } catch (error) {
      logger.warn(`Symbol not found in module: ${symbolName}`);
    }
  } catch (error) {
    logger.warn(`Error importing symbol ${symbolName}: ${error.message}`);
  }
}

function reconstructUserMacro(
  macroName: string,
  macroData: any,
  env: Environment,
  logger: Logger
): void {
  try {
    // Construct a macro definition S-expression
    const macroDefSExp = createList(
      createSymbol('macro'),
      createSymbol(macroName),
      macroData.definition.paramList,
      ...macroData.definition.bodyList
    );
    
    // Define the macro using the constructed definition
    defineUserMacro(macroDefSExp as SList, env, logger);
    logger.debug(`Reconstructed user macro: ${macroName}`);
  } catch (error) {
    logger.error(`Failed to reconstruct user macro ${macroName}: ${error.message}`);
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
  const resolvedPath = resolveImportPath(modulePath, baseDir, logger);
  
  logger.debug(`Resolving import: ${moduleName} from ${modulePath}`);
  logger.debug(`Base directory: ${baseDir}`);
  logger.debug(`Resolved path: ${resolvedPath}`);
  
  // Check for circular imports
  if (processedFiles.has(resolvedPath)) {
    logger.debug(`Skipping already processed import: ${resolvedPath}`);
    return;
  }

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
 * Resolve an import path to an absolute path
 */
function resolveImportPath(modulePath: string, baseDir: string, logger: Logger): string {
  // Simple implementation - in a real refactor we'd have fallbacks
  return path.resolve(baseDir, modulePath);
}

/**
 * Process exports and definitions in a file
 * Updated to handle the new vector-based export syntax
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
      
      processVectorExport(expr, env, moduleExports, logger);
      
    }
    // Process legacy string-based export syntax: (export "name" value)
    else if (op === 'export' && expr.elements.length === 3 && 
             isLiteral(expr.elements[1]) && 
             typeof expr.elements[1].value === 'string') {
      
      processLegacyExport(expr, env, moduleExports, logger);
      
    }
  }
}

/**
 * Process a vector-based export
 */
function processVectorExport(
  expr: SList,
  env: Environment,
  moduleExports: Record<string, any>,
  logger: Logger
): void {
  const exportVector = expr.elements[1] as SList;
  
  logger.debug(`Processing vector export with ${exportVector.elements.length} symbols`);
  
  // Process the vector elements
  const elementsToProcess = processVectorElements(exportVector);
  
  // Process each symbol in the export vector
  for (const symbolExpr of elementsToProcess) {
    // Skip non-symbol elements
    if (!isSymbol(symbolExpr)) {
      logger.warn(`Non-symbol found in export vector: ${sexpToString(symbolExpr)}`);
      continue;
    }
    
    const symbolName = (symbolExpr as SSymbol).name;
    logger.debug(`Processing export for symbol: ${symbolName}`);
    
    try {
      // Check if this is a user-level macro
      if (env.hasMacro(symbolName)) {
        const macroFn = env.getMacro(symbolName);
        if (macroFn && 'isUserMacro' in macroFn) {
          // For user macros, we create a special representation to be exported
          moduleExports[symbolName] = {
            type: "user-macro",
            name: symbolName,
            // Save the original macro definition elements for reconstruction
            definition: {
              paramList: macroFn['paramList'],
              bodyList: macroFn['bodyList']
            }
          };
          logger.debug(`Added export "${symbolName}" as user-level macro`);
          continue;
        }
      }
      
      // For regular values, look up in the environment
      try {
        const value = env.lookup(symbolName);
        moduleExports[symbolName] = value;
        logger.debug(`Added export "${symbolName}" with self-named value`);
      } catch (error) {
        logger.warn(`Failed to lookup symbol "${symbolName}" for export`);
      }
    } catch (error) {
      logger.warn(`Error processing export for "${symbolName}": ${error.message}`);
    }
  }
}

/**
 * Process a legacy string-based export
 */
function processLegacyExport(
  expr: SList,
  env: Environment,
  moduleExports: Record<string, any>,
  logger: Logger
): void {
  const exportName = expr.elements[1].value as string;
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

/**
 * Process JavaScript imports
 */
async function processJsImport(
  moduleName: string,
  modulePath: string,
  baseDir: string,
  env: Environment,
  logger: Logger,
  processedFiles: Set<string>
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
 * Convert an S-expression to a string representation for debugging
 */
function sexpToString(expr: SExp): string {
  if (isSymbol(expr)) {
    return (expr as SSymbol).name;
  } else if (isLiteral(expr)) {
    const lit = expr as SLiteral;
    if (lit.value === null) {
      return 'nil';
    } else if (typeof lit.value === 'string') {
      return `"${lit.value}"`;
    } else {
      return String(lit.value);
    }
  } else if (expr.type === 'list') {
    const list = expr as SList;
    return `(${list.elements.map(sexpToString).join(' ')})`;
  } else {
    return String(expr);
  }
}