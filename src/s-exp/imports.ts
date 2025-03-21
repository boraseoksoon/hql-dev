// src/s-exp/imports.ts - Updated with handling for user-level macros

import * as path from "https://deno.land/std/path/mod.ts";
import { SExp, SList, SSymbol, isSymbol, isLiteral, isImport, isUserMacro } from './types.ts';
import { Environment } from '../environment.ts';
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
  currentFile?: string; // Track the current file being processed
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
  
  // Set current file in environment if provided
  if (options.currentFile) {
    env.setCurrentFile(options.currentFile);
  }
  
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
        importMap,
        currentFile: options.currentFile
      });
    } catch (error) {
      logger.error(`Error processing import: ${error.message}`);
    }
  }
  
  // Process definitions in the current file to make them available to macros
  processFileDefinitions(exprs, env, logger);
  
  // Process user-level macros and exports
  if (options.currentFile) {
    processFileExportsAndDefinitions(exprs, env, {}, options.currentFile, logger);
  }
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
}

/**
 * Process file exports and definitions, including user-level macros
 */
function processFileExportsAndDefinitions(
  expressions: SExp[],
  env: Environment,
  moduleExports: Record<string, any>,
  filePath: string,
  logger: Logger
): void {
  // First pass: process user-level macros
  for (const expr of expressions) {
    if (expr.type !== 'list' || expr.elements.length === 0) continue;
    
    const first = expr.elements[0];
    if (!isSymbol(first)) continue;
    
    const op = first.name;
    
    // Process user-level macros: (macro name ...)
    if (op === 'macro') {
      try {
        defineUserMacro(expr as SList, filePath, env, logger);
      } catch (error) {
        logger.error(`Error defining user macro: ${error.message}`);
      }
    }
  }
  
  // Second pass: process regular definitions
  processFileDefinitions(expressions, env, logger);
  
  // Third pass: process exports
  for (const expr of expressions) {
    // Skip non-list expressions
    if (expr.type !== 'list' || expr.elements.length === 0) continue;
    
    const first = expr.elements[0];
    if (!isSymbol(first)) continue;
    
    const op = first.name;
    
    // Process vector-based exports: (export [symbol1, symbol2])
    if (op === 'export' && expr.elements.length === 2 && 
        expr.elements[1].type === 'list') {
      
      processVectorExport(expr, env, moduleExports, filePath, logger);
    }
    // Process legacy string-based exports: (export "name" value)
    else if (op === 'export' && expr.elements.length === 3 && 
             isLiteral(expr.elements[1]) && 
             typeof expr.elements[1].value === 'string') {
      
      processLegacyExport(expr, env, moduleExports, filePath, logger);
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
  const resolvedPath = resolveImportPath(modulePath, baseDir, logger);
  
  // We need this to track module-level macros properly
  await loadModuleByType(tempModuleName, modulePath, resolvedPath, baseDir, env, options);
  
  // Process the vector elements
  const vectorElements = processVectorElements(symbolsVector);
  
  // Process all imports, including macros
  if (options.currentFile && modulePath.endsWith('.hql')) {
    processVectorImportElements(vectorElements, resolvedPath, options.currentFile, env, logger);
  }
  
  // Process regular symbol imports
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
 * Process imports for a vector of symbols
 */
function processVectorImportElements(
  elements: SExp[],
  sourceFile: string,
  targetFile: string,
  env: Environment,
  logger: Logger
): void {
  // Use the shared helper for vector processing
  processVectorSymbols(elements, (symbolName, aliasName, _index) => {
    // Import the macro if it exists in source file
    if (env.hasModuleMacro(sourceFile, symbolName)) {
      env.importMacro(sourceFile, symbolName, targetFile);
      
      const displayName = aliasName ? 
        `${symbolName} as ${aliasName}` : symbolName;
      
      logger.debug(`Imported macro ${displayName} from ${sourceFile} to ${targetFile}`);
    }
  });
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
  
  // Resolve the path for module tracking
  const resolvedPath = resolveImportPath(modulePath, baseDir, logger);
  
  // Load the module based on file type
  await loadModuleByType(moduleName, modulePath, resolvedPath, baseDir, env, options);
}

/**
 * Load a module based on its file type
 */
async function loadModuleByType(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
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
      resolvedPath,
      baseDir, 
      env, 
      options.processedFiles!, 
      logger, 
      options.tempDir!, 
      options.importMap!, 
      options
    );
  } else if (modulePath.endsWith('.js') || modulePath.endsWith('.mjs') || modulePath.endsWith('.cjs')) {
    await processJsImport(
      moduleName, 
      modulePath, 
      resolvedPath,
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

// In imports.ts, modify the importSymbolDirectly function:

/**
 * Import a symbol directly (no alias)
 */
async function importSymbolDirectly(
  moduleName: string,
  symbolName: string,
  env: Environment,
  logger: Logger
): Promise<void> {
  // First check if it's a macro - if so, we don't need to import it as a runtime value
  const currentFile = env.getCurrentFile();
  if (currentFile && env.isUserLevelMacro(symbolName, currentFile)) {
    // It's a macro, already handled separately by processVectorImportElements
    logger.debug(`Skipping runtime import for macro: ${symbolName}`);
    return;
  }

  try {
    const value = env.lookup(`${moduleName}.${symbolName}`);
    env.define(symbolName, value);
    logger.debug(`Imported symbol: ${symbolName}`);
  } catch (error) {
    logger.debug(`Symbol not found in module: ${symbolName}`);
  }
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
  const currentFile = env.getCurrentFile();
  if (currentFile && env.isUserLevelMacro(symbolName, currentFile)) {
    // It's a macro, already handled separately by processVectorImportElements
    logger.debug(`Skipping runtime import for macro: ${symbolName} as ${aliasName}`);
    return;
  }

  try {
    const value = env.lookup(`${moduleName}.${symbolName}`);
    env.define(aliasName, value);
    logger.debug(`Imported symbol: ${symbolName} as ${aliasName}`);
  } catch (error) {
    logger.debug(`Symbol not found in module: ${symbolName}`);
  }
}

/**
 * Process an HQL file import
 */
async function processHqlImport(
  moduleName: string, 
  modulePath: string,
  resolvedPath: string,
  baseDir: string, 
  env: Environment, 
  processedFiles: Set<string>,
  logger: Logger,
  tempDir: string,
  importMap: Map<string, string>,
  options: ImportProcessorOptions
): Promise<void> {
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
    keepTemp: options.keepTemp,
    processedFiles,
    importMap,
    currentFile: resolvedPath  // Pass the imported file as the current file
  });
  
  // Create module object to store exports
  const moduleExports: Record<string, any> = {};
  
  // Process and extract exports
  processFileExportsAndDefinitions(importedExprs, env, moduleExports, resolvedPath, logger);
  
  // Register the module with its exports
  env.importModule(moduleName, moduleExports);
  
  // If we have a current file, process any macro imports
  if (options.currentFile) {
    processMacroImports(options.currentFile, resolvedPath, env, logger);
  }
  
  logger.debug(`Imported HQL module: ${moduleName} with exports: ${Object.keys(moduleExports).join(', ')}`);
}

/**
 * Process macro imports between files
 */
function processMacroImports(
  importingFile: string,
  exportingFile: string,
  env: Environment,
  logger: Logger
): void {
  // Get the exported macros from the source file
  const exportedMacros = env.getExportedMacros(exportingFile);
  if (!exportedMacros || exportedMacros.size === 0) {
    logger.debug(`No exported macros found in ${exportingFile}`);
    return;
  }
  
  logger.debug(`Exported macros found in ${exportingFile}: ${Array.from(exportedMacros).join(', ')}`);
  
  // For each exported macro, check if we should import it
  for (const macroName of exportedMacros) {
    if (env.hasModuleMacro(exportingFile, macroName)) {
      // Check if this importing file has explicitly imported this macro
      // This logic would depend on what imports are tracked
      
      // For now, we'll assume all exported macros are visible to importing files
      env.importMacro(exportingFile, macroName, importingFile);
      logger.debug(`Auto-imported macro ${macroName} from ${exportingFile} to ${importingFile}`);
    }
  }
}

/**
 * Resolve an import path to an absolute path
 */
function resolveImportPath(modulePath: string, baseDir: string, logger: Logger): string {
  // Simple implementation - in a real refactor we'd have fallbacks
  return path.resolve(baseDir, modulePath);
}

/**
 * Process a vector-based export
 */
function processVectorExport(
  expr: SList,
  env: Environment,
  moduleExports: Record<string, any>,
  filePath: string,
  logger: Logger
): void {
  const exportVector = expr.elements[1] as SList;
  logger.debug(`Processing vector export with ${exportVector.elements.length} elements`);
  
  // Filter and process the vector elements
  const elements = filterVectorElements(exportVector.elements);
  
  // Process each symbol in the export vector
  for (const element of elements) {
    if (!isSymbol(element)) {
      logger.debug(`Skipping non-symbol export: ${element}`);
      continue;
    }
    
    const symbolName = (element as SSymbol).name;
    // Use the shared helper for export handling
    handleExport(symbolName, env, moduleExports, filePath, logger);
  }
}

/**
 * Process a legacy string-based export
 */
function processLegacyExport(
  expr: SList,
  env: Environment,
  moduleExports: Record<string, any>,
  filePath: string,
  logger: Logger
): void {
  const exportName = expr.elements[1].value as string;
  const exportSymbol = expr.elements[2];
  
  logger.debug(`Processing legacy export: "${exportName}"`);
  
  // Handle symbol exports
  if (isSymbol(exportSymbol)) {
    const symbolName = exportSymbol.name;
    logger.debug(`Export symbol: ${symbolName}`);
    
    // Check if this is a macro first
    if (env.hasModuleMacro(filePath, symbolName)) {
      // Mark the macro as exported
      env.exportMacro(filePath, symbolName);
      logger.debug(`Marked macro ${symbolName} as exported from ${filePath} with name ${exportName}`);
      return;
    }
    
    // Regular value export
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
  resolvedPath: string,
  baseDir: string,
  env: Environment,
  logger: Logger,
  processedFiles: Set<string>
): Promise<void> {
  try {
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

export function isMacroSymbol(
  symbolName: string, 
  env: Environment, 
  filePath: string | null = null
): boolean {
  // Check global macros
  if (env.hasMacro(symbolName)) {
    return true;
  }
  
  // Check user-level macros if file path is provided
  if (filePath && env.isUserLevelMacro(symbolName, filePath)) {
    return true;
  }
  
  return false;
}

/**
 * Process a vector of symbols (with potential aliases)
 * This generalizes vector processing for both imports and exports
 */
function processVectorSymbols(
  vectorElements: SExp[],
  callback: (symbolName: string, aliasName: string | null, index: number) => void
): void {
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
        callback(symbolName, aliasName, i);
        i += 3; // Skip symbol, 'as', and alias
      } else {
        callback(symbolName, null, i);
        i++; // Next symbol
      }
    } else {
      i++; // Skip non-symbols
    }
  }
}

/**
 * Helper to handle exporting a symbol, checking if it's a macro or regular value
 */
function handleExport(
  symbolName: string, 
  env: Environment, 
  moduleExports: Record<string, any>,
  filePath: string,
  logger: Logger
): void {
  // Check if this is a macro first
  if (env.hasModuleMacro(filePath, symbolName)) {
    // Mark the macro as exported
    env.exportMacro(filePath, symbolName);
    logger.debug(`Marked macro ${symbolName} as exported from ${filePath}`);
    return; // Skip value export for macros
  }
  
  // Export regular values
  try {
    // Look up the value from the environment
    const value = env.lookup(symbolName);
    
    // Store in module exports
    moduleExports[symbolName] = value;
    logger.debug(`Added export "${symbolName}" with value`);
  } catch (error) {
    logger.debug(`Failed to lookup symbol "${symbolName}" for export`);
  }
}

/**
 * Helper to filter vector elements, handling commas and vector keyword
 */
function filterVectorElements(elements: SExp[]): SExp[] {
  // Skip "vector" symbol if present as first element
  let result = elements;
  if (elements.length > 0 && 
      isSymbol(elements[0]) && 
      elements[0].name === "vector") {
    result = elements.slice(1);
  }
  
  // Filter out comma symbols
  return result.filter(elem => 
    !(isSymbol(elem) && (elem as SSymbol).name === ',')
  );
}