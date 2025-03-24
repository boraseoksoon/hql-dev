// src/s-exp/imports.ts - Refactored with better modularity and error handling

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { SExp, SList, SSymbol, isSymbol, isLiteral, isImport, isSExpVectorImport, isSExpNamespaceImport } from './types.ts';
import { Environment } from '../environment.ts';
import { evaluateForMacro, defineUserMacro } from './macro.ts';
import { parse } from './parser.ts';
import { Logger } from '../logger.ts';
import { ImportError, MacroError } from '../transpiler/errors.ts';
import { perform, performAsync } from '../transpiler/error-utils.ts';
import { registerImportSource } from "../transformer.ts";
import { 
  isRemoteModule, 
  isJavaScriptModule, 
  isRemotePath, 
} from '../utils.ts'

/**
 * Options for import processing
 */
interface ImportProcessorOptions {
  verbose?: boolean;
  baseDir?: string;
  tempDir?: string;
  keepTemp?: boolean;
  processedFiles?: Set<string>;
  inProgressFiles?: Set<string>; // Track files currently being processed
  importMap?: Map<string, string>;
  currentFile?: string; 
}

/**
 * Process all imports in a list of S-expressions
 * Balances parallel processing for I/O with sequential processing for dependencies
 */
export async function processImports(
  exprs: SExp[], 
  env: Environment, 
  options: ImportProcessorOptions = {}
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();
  
  // Store previous current file for restoration
  const previousCurrentFile = env.getCurrentFile();
  
  // Track processed imports to avoid duplicates
  const processedFiles = options.processedFiles || new Set<string>();
  const inProgressFiles = options.inProgressFiles || new Set<string>();
  const importMap = options.importMap || new Map<string, string>();
  
  return performAsync(async () => {
    try {
      setupEnvironmentAndTracking(env, options, inProgressFiles, logger);
      
      // Create temp directory in parallel with import analysis
      const [tempDir, importExprs] = await Promise.all([
        createTempDirIfNeeded(options, logger),
        analyzeImports(exprs, logger)
      ]);
      
      // Separate remote and local imports
      const { remoteImports, localImports } = categorizeImports(importExprs, logger);
      
      // Process remote imports in parallel - these don't have local dependencies
      if (remoteImports.length > 0) {
        await processRemoteImportsInParallel(remoteImports, env, baseDir, options, tempDir, processedFiles, inProgressFiles, importMap, logger);
      }
      
      // Process local imports sequentially to respect dependencies
      if (localImports.length > 0) {
        await processLocalImportsSequentially(localImports, env, baseDir, options, tempDir, processedFiles, inProgressFiles, importMap, logger);
      }
      
      // Process definitions and exports
      if (options.currentFile) {
        await processFileDefinitionsAndExports(exprs, env, options, logger);
      }
      
      // Mark current file as fully processed (not just in progress)
      finalizeFileProcessing(options.currentFile, inProgressFiles, processedFiles, logger);
    } finally {
      // Always restore the previous current file state
      env.setCurrentFile(previousCurrentFile);
    }
  }, "Processing imports", ImportError, ["imports", options.currentFile]);
}

/**
 * Set up environment with current file and add file to tracking
 */
function setupEnvironmentAndTracking(
  env: Environment, 
  options: ImportProcessorOptions, 
  inProgressFiles: Set<string>,
  logger: Logger
): void {
  // Set current file in environment if provided
  if (options.currentFile) {
    env.setCurrentFile(options.currentFile);
    logger.debug(`Processing imports in file: ${options.currentFile}`);
    
    // Add current file to in-progress set
    inProgressFiles.add(options.currentFile);
  }
}

/**
 * Create a temporary directory if needed
 */
async function createTempDirIfNeeded(
  options: ImportProcessorOptions,
  logger: Logger
): Promise<string> {
  if (!options.tempDir) {
    const tempDir = await performAsync(
      () => Deno.makeTempDir({ prefix: "hql_imports_" }),
      "Creating temporary directory",
      ImportError,
      ["temp_dir", options.currentFile]
    );
    logger.debug(`Created temporary directory: ${tempDir}`);
    return tempDir;
  } 
  
  logger.debug(`Using existing temp directory: ${options.tempDir}`);
  return options.tempDir;
}

/**
 * Analyze and identify import expressions
 */
function analyzeImports(exprs: SExp[], logger: Logger): SList[] {
  // Identify all import expressions
  const importExprs = exprs.filter(expr => isImport(expr) && expr.type === 'list') as SList[];
  logger.debug(`Found ${importExprs.length} import expressions to process`);
  return importExprs;
}

/**
 * Categorize imports into remote and local
 */
function categorizeImports(importExprs: SList[], logger: Logger): { 
  remoteImports: SList[], 
  localImports: SList[] 
} {
  const remoteImports: SList[] = [];
  const localImports: SList[] = [];
  
  for (const importExpr of importExprs) {
    const modulePath = getModulePathFromImport(importExpr);
    
    if (isRemotePath(modulePath)) {
      remoteImports.push(importExpr);
    } else {
      localImports.push(importExpr);
    }
  }
  
  logger.debug(`Categorized imports: ${remoteImports.length} remote, ${localImports.length} local`);
  return { remoteImports, localImports };
}

/**
 * Process remote imports in parallel
 */
async function processRemoteImportsInParallel(
  remoteImports: SList[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
  tempDir: string,
  processedFiles: Set<string>,
  inProgressFiles: Set<string>,
  importMap: Map<string, string>,
  logger: Logger
): Promise<void> {
  logger.debug(`Processing ${remoteImports.length} remote imports in parallel`);
  await Promise.all(remoteImports.map(async (importExpr) => {
    try {
      await processImport(importExpr, env, baseDir, {
        verbose: options.verbose,
        tempDir,
        keepTemp: options.keepTemp,
        processedFiles,
        inProgressFiles,
        importMap,
        currentFile: options.currentFile
      });
    } catch (error) {
      // Extract module path for better error reporting
      const modulePath = getModulePathFromImport(importExpr);
      
      // Re-throw ImportError directly, wrap other errors
      if (error instanceof ImportError) {
        throw error;
      } else {
        throw new ImportError(
          `Error processing import: ${error instanceof Error ? error.message : String(error)}`,
          modulePath,
          options.currentFile,
          error instanceof Error ? error : undefined
        );
      }
    }
  }));
}

/**
 * Process local imports sequentially to handle dependencies
 */
async function processLocalImportsSequentially(
  localImports: SList[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
  tempDir: string,
  processedFiles: Set<string>,
  inProgressFiles: Set<string>,
  importMap: Map<string, string>,
  logger: Logger
): Promise<void> {
  logger.debug(`Processing ${localImports.length} local imports sequentially`);
  
  for (const importExpr of localImports) {
    await performAsync(
      async () => {
        await processImport(importExpr, env, baseDir, {
          verbose: options.verbose,
          tempDir,
          keepTemp: options.keepTemp,
          processedFiles,
          inProgressFiles,
          importMap,
          currentFile: options.currentFile
        });
      },
      "Processing local import", 
      ImportError,
      [getModulePathFromImport(importExpr), options.currentFile]
    );
  }
}

/**
 * Process file definitions and exports
 */
async function processFileDefinitionsAndExports(
  exprs: SExp[],
  env: Environment,
  options: ImportProcessorOptions,
  logger: Logger
): Promise<void> {
  // Process file definitions for macros
  await performAsync(
    async () => processFileDefinitions(exprs, env, logger),
    "Processing file definitions",
    MacroError,
    [options.currentFile, options.currentFile]
  );
  
  // Handle user-level macros and exports
  await performAsync(
    async () => processFileExportsAndDefinitions(exprs, env, {}, options.currentFile!, logger),
    "Processing file exports and definitions",
    ImportError,
    [options.currentFile, options.currentFile]
  );
}

/**
 * Finalize file processing by marking complete and removing from in-progress
 */
function finalizeFileProcessing(
  currentFile: string | undefined,
  inProgressFiles: Set<string>,
  processedFiles: Set<string>,
  logger: Logger
): void {
  if (currentFile) {
    inProgressFiles.delete(currentFile);
    processedFiles.add(currentFile);
    logger.debug(`Completed processing imports for: ${currentFile}`);
  }
}

/**
 * Extract the module path from an import expression
 */
function getModulePathFromImport(importExpr: SList): string {
  try {
    if (importExpr.elements.length >= 4 && 
        importExpr.elements[2].type === "symbol" && 
        (importExpr.elements[2] as SSymbol).name === "from" &&
        importExpr.elements[3].type === "literal") {
      return String((importExpr.elements[3] as any).value);
    } else if (importExpr.elements.length === 3 && 
               importExpr.elements[2].type === "literal") {
      return String((importExpr.elements[2] as any).value);
    }
  } catch (e) {
    // Ignore errors
  }
  return "unknown";
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
  const elements = importExpr.elements;
  const logger = new Logger(options.verbose || false);
  
  return performAsync(async () => {
    // Determine import type and process accordingly
    if (isSExpVectorImport(elements)) {
      // Vector-based import with "from"
      await processVectorBasedImport(elements, env, baseDir, options);
    } else if (isSExpNamespaceImport(elements)) {
      // Namespace import with "from" syntax
      await processNamespaceImport(elements, env, baseDir, options);
    } else {
      throw new ImportError(
        "Invalid import syntax, expected either (import [symbols] from \"path\") or (import name from \"path\")",
        "syntax-error",
        options.currentFile
      );
    }
  }, "Processing import expression", ImportError, [getModulePathFromImport(importExpr), options.currentFile]);
}

/**
 * Process namespace import with "from" syntax
 * Format: (import name from "path")
 */
async function processNamespaceImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  
  return performAsync(async () => {
    if (!isSymbol(elements[1])) {
      throw new ImportError(
        "Module name must be a symbol",
        "namespace import",
        options.currentFile
      );
    }
    
    if (!isLiteral(elements[3]) || typeof elements[3].value !== 'string') {
      throw new ImportError(
        "Module path must be a string literal",
        "namespace import",
        options.currentFile
      );
    }
    
    const moduleName = (elements[1] as SSymbol).name;
    const modulePath = (elements[3] as any).value as string;
    
    registerImportSource(moduleName, modulePath);

    logger.debug(`Processing namespace import with "from": ${moduleName} from ${modulePath}`);

    const resolvedPath = path.resolve(baseDir, modulePath);
    
    // Load the module with the given name
    await loadModuleByType(moduleName, modulePath, resolvedPath, baseDir, env, options);
  }, "Processing namespace import", ImportError, [
    elements[3]?.type === "literal" ? String(elements[3].value) : "unknown", 
    options.currentFile
  ]);
}

/**
 * Process elements in a vector, handling vector keyword and commas
 */
function processVectorElements(elements: SExp[]): SExp[] {
  return perform(() => {
    // Skip "vector" symbol if present as first element
    let startIndex = 0;
    if (elements.length > 0 && 
        elements[0].type === "symbol" && 
        (elements[0] as SSymbol).name === "vector") {
      startIndex = 1;
    }
    
    // Filter out comma symbols
    return elements.slice(startIndex).filter(elem => 
      !(elem.type === "symbol" && (elem as SSymbol).name === ',')
    );
  }, "Processing vector elements", ImportError, ["vector", "unknown"]);
}

/**
 * Process vector-based import
 */
async function processVectorBasedImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions
): Promise<void> {
  const logger = new Logger(options.verbose);
  
  return performAsync(async () => {
    // Get the vector of symbols to import
    if (elements[1].type !== 'list') {
      throw new ImportError(
        "Import vector must be a list",
        "syntax-error",
        options.currentFile
      );
    }
    
    const symbolsVector = elements[1] as SList;
    
    // Get and validate the module path
    if (!isLiteral(elements[3]) || typeof elements[3].value !== 'string') {
      throw new ImportError(
        'Module path must be a string literal',
        "syntax-error",
        options.currentFile
      );
    }
    
    const modulePath = elements[3].value as string;

    const resolvedPath = path.resolve(baseDir, modulePath);
    
    console.log("resolvedPath : ", resolvedPath)
    console.log("modulePath : ", modulePath)

    // Use a consistent module name that doesn't depend on timestamps
    // Using a faster naming scheme than full path hashing
    const tempModuleName = `__temp_module_${modulePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    
    await loadModuleByType(tempModuleName, modulePath, resolvedPath, baseDir, env, options);

    // Process the vector elements
    const vectorElements = processVectorElements(symbolsVector.elements);
    
    // Extract symbols and aliases
    const requestedSymbols = extractSymbolsAndAliases(vectorElements);
    
    // Process imports with HQL-specific handling
    await processImportedSymbols(
      requestedSymbols, 
      modulePath, 
      resolvedPath, 
      tempModuleName, 
      env, 
      options.currentFile, 
      logger
    );
  }, "Processing vector import", ImportError, [elements[3]?.type === "literal" ? String(elements[3].value) : "unknown", options.currentFile]);
}

/**
 * Extract symbols and their aliases from vector elements
 */
function extractSymbolsAndAliases(
  vectorElements: SExp[]
): Map<string, string | null> {
  const requestedSymbols = new Map<string, string | null>();
  
  // Process vector elements to extract names and aliases
  let i = 0;
  while (i < vectorElements.length) {
    if (!isSymbol(vectorElements[i])) {
      i++;
      continue;
    }
    
    const symbolName = (vectorElements[i] as SSymbol).name;
    
    // Check if this has an alias
    if (i + 2 < vectorElements.length && 
        isSymbol(vectorElements[i+1]) && 
        (vectorElements[i+1] as SSymbol).name === 'as' &&
        isSymbol(vectorElements[i+2])) {
      
      const aliasName = (vectorElements[i+2] as SSymbol).name;
      requestedSymbols.set(symbolName, aliasName);
      
      i += 3; // Skip symbol, 'as', and alias
    } else {
      requestedSymbols.set(symbolName, null); // No alias
      i++;
    }
  }
  
  return requestedSymbols;
}

/**
 * Process and import the requested symbols
 */
async function processImportedSymbols(
  requestedSymbols: Map<string, string | null>,
  modulePath: string,
  resolvedPath: string,
  tempModuleName: string,
  env: Environment,
  currentFile: string | undefined,
  logger: Logger
): Promise<void> {
  // Process imports with HQL-specific handling
  if (currentFile && modulePath.endsWith('.hql')) {
    await processMacrosAndValuesFromHQL(
      requestedSymbols, 
      resolvedPath, 
      tempModuleName, 
      env, 
      currentFile, 
      logger
    );
  } else {
    // For non-HQL files, process regular imports
    await processRegularImports(
      requestedSymbols, 
      modulePath, 
      tempModuleName, 
      env, 
      currentFile, 
      logger
    );
  }
}

/**
 * Process macros and values imported from an HQL file
 */
async function processMacrosAndValuesFromHQL(
  requestedSymbols: Map<string, string | null>,
  resolvedPath: string,
  tempModuleName: string,
  env: Environment,
  currentFile: string,
  logger: Logger
): Promise<void> {
  // Only import the explicitly requested symbols
  for (const [symbolName, aliasName] of requestedSymbols.entries()) {
    // Check if this is a macro and import it with the proper alias
    const isMacro = env.hasModuleMacro(resolvedPath, symbolName);
    if (isMacro) {
      const success = env.importMacro(resolvedPath, symbolName, currentFile, aliasName || undefined);
      if (success) {
        logger.debug(`Imported macro ${symbolName}${aliasName ? ` as ${aliasName}` : ''}`);
      } else {
        logger.warn(`Failed to import macro ${symbolName} from ${resolvedPath}`);
      }
    }
    
    // Try to import as a regular value
    try {
      const moduleLookupKey = `${tempModuleName}.${symbolName}`;
      const value = env.lookup(moduleLookupKey);
      env.define(aliasName || symbolName, value);
      logger.debug(`Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ''}`);
    } catch (error) {
      // Ignore lookup errors only for confirmed macros
      if (!isMacro) {
        logger.debug(`Symbol not found in module: ${symbolName}`);
        
        // Only throw for non-macro symbols that weren't found
        throw new ImportError(
          `Symbol '${symbolName}' not found in module '${resolvedPath}'`,
          resolvedPath,
          currentFile,
          error instanceof Error ? error : undefined
        );
      }
    }
  }
}

/**
 * Process regular imports from non-HQL files
 */
async function processRegularImports(
  requestedSymbols: Map<string, string | null>,
  modulePath: string,
  tempModuleName: string,
  env: Environment,
  currentFile: string | undefined,
  logger: Logger
): Promise<void> {
  for (const [symbolName, aliasName] of requestedSymbols.entries()) {
    try {
      const moduleLookupKey = `${tempModuleName}.${symbolName}`;
      const value = env.lookup(moduleLookupKey);
      env.define(aliasName || symbolName, value);
      logger.debug(`Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ''}`);
    } catch (error) {
      logger.debug(`Symbol not found in module: ${symbolName}`);
      
      // Provide more helpful error for missing imports
      throw new ImportError(
        `Symbol '${symbolName}' not found in module '${modulePath}'`,
        modulePath,
        currentFile,
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * Load a module based on its file type, with improved circular dependency handling
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
  const processedFiles = options.processedFiles!;
  const inProgressFiles = options.inProgressFiles!;
  
  return performAsync(async () => {
    // Skip if already fully processed (not just in progress)
    if (processedFiles.has(resolvedPath)) {
      logger.debug(`Skipping already processed import: ${resolvedPath}`);
      return;
    }
    
    // Circular dependency detection - if already in progress elsewhere in the stack
    if (inProgressFiles.has(resolvedPath)) {
      logger.debug(`Detected circular import for ${resolvedPath}, will be resolved by parent process`);
      return;
    }
    
    // Determine module type and process accordingly
    if (isRemoteModule(modulePath)) {
      console.log("loadRemoteModule : ", resolvedPath)
      await loadRemoteModule(moduleName, modulePath, env, logger);
    } else if (modulePath.endsWith('.hql')) {
      console.log("loadHqlModule : ", resolvedPath)
      await loadHqlModule(
        moduleName, 
        modulePath, 
        resolvedPath, 
        baseDir, 
        env, 
        processedFiles, 
        inProgressFiles, 
        logger, 
        options
      );
    } else if (isJavaScriptModule(modulePath)) {
      console.log("loadJavaScriptModule : ", resolvedPath)
      await loadJavaScriptModule(
        moduleName, 
        modulePath, 
        resolvedPath, 
        env, 
        logger, 
        processedFiles
      );
    } else {
      console.log("else fuck! ", resolvedPath)
      throw new ImportError(
        `Unsupported import file type: ${modulePath}`,
        modulePath,
        options.currentFile
      );
    }
    
  }, `Loading module ${moduleName} from ${modulePath}`, ImportError, [modulePath, options.currentFile]);
}

/**
 * Load a remote module (npm:, jsr:, http:)
 */
async function loadRemoteModule(
  moduleName: string,
  modulePath: string,
  env: Environment,
  logger: Logger
): Promise<void> {
  if (modulePath.startsWith('npm:')) {
    await processNpmImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('jsr:')) {
    await processJsrImport(moduleName, modulePath, env, logger);
  } else {
    await processHttpImport(moduleName, modulePath, env, logger);
  }
}

/**
 * Load an HQL module
 */
async function loadHqlModule(
  moduleName: string, 
  modulePath: string,
  resolvedPath: string,
  baseDir: string, 
  env: Environment, 
  processedFiles: Set<string>,
  inProgressFiles: Set<string>,
  logger: Logger,
  options: ImportProcessorOptions
): Promise<void> {
  // Mark file as in-progress before processing
  inProgressFiles.add(resolvedPath);
  
  await processHqlImport(
    moduleName, 
    modulePath, 
    resolvedPath, 
    baseDir, 
    env, 
    processedFiles, 
    inProgressFiles,
    logger, 
    options.tempDir!, 
    options.importMap!, 
    options
  );
  
  // Mark as fully processed after completion
  inProgressFiles.delete(resolvedPath);
  processedFiles.add(resolvedPath);
}

/**
 * Load a JavaScript module
 */
async function loadJavaScriptModule(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  logger: Logger,
  processedFiles: Set<string>
): Promise<void> {
  await processJsImport(
    moduleName, 
    modulePath, 
    resolvedPath, 
    env, 
    logger, 
    processedFiles
  );
}

/**
 * Process HQL file import with improved circular dependency handling
 */
async function processHqlImport(
  moduleName: string, 
  modulePath: string,
  resolvedPath: string,
  baseDir: string, 
  env: Environment, 
  processedFiles: Set<string>,
  inProgressFiles: Set<string>,
  logger: Logger,
  tempDir: string,
  importMap: Map<string, string>,
  options: ImportProcessorOptions
): Promise<void> {
  const previousCurrentFile = env.getCurrentFile();
  
  return performAsync(async () => {
    try {
      // Read and parse the file
      const fileContent = await readFile(resolvedPath, options.currentFile);
      const importedExprs = parseHqlContent(fileContent, resolvedPath, options.currentFile);
      
      // Set current file to imported file for correct context
      env.setCurrentFile(resolvedPath);
      
      // First, process file definitions to make symbols available
      processFileDefinitions(importedExprs, env, logger);
      
      // Process nested imports
      await processNestedImports(importedExprs, env, resolvedPath, tempDir, options, processedFiles, inProgressFiles, importMap);
      
      // Process exports
      const moduleExports = processExports(importedExprs, env, resolvedPath, logger);
      
      // Register the module with its exports
      env.importModule(moduleName, moduleExports);
      
      logger.debug(`Imported HQL module: ${moduleName}`);
    } finally {
      // Restore original file context
      env.setCurrentFile(previousCurrentFile);
    }
  }, `Importing HQL module ${moduleName}`, ImportError, [modulePath, options.currentFile]);
}

/**
 * Read a file with error handling
 */
async function readFile(filePath: string, currentFile: string | undefined): Promise<string> {
  return await performAsync(
    async () => await Deno.readTextFile(filePath),
    `Reading file ${filePath}`,
    ImportError,
    [filePath, currentFile]
  );
}

/**
 * Parse HQL content
 */
function parseHqlContent(content: string, filePath: string, currentFile: string | undefined): SExp[] {
  return perform(
    () => parse(content),
    `Parsing file ${filePath}`,
    ImportError,
    [filePath, currentFile]
  );
}

/**
 * Process nested imports
 */
async function processNestedImports(
  importedExprs: SExp[],
  env: Environment,
  importDir: string,
  tempDir: string,
  options: ImportProcessorOptions,
  processedFiles: Set<string>,
  inProgressFiles: Set<string>,
  importMap: Map<string, string>
): Promise<void> {
  // Process nested imports
  await processImports(importedExprs, env, { 
    verbose: options.verbose,
    baseDir: path.dirname(importDir),
    tempDir,
    keepTemp: options.keepTemp,
    processedFiles,
    inProgressFiles,
    importMap,
    currentFile: importDir
  });
}

/**
 * Process exports and create module exports object
 */
function processExports(
  importedExprs: SExp[],
  env: Environment,
  resolvedPath: string,
  logger: Logger
): Record<string, any> {
  // Process exports
  const moduleExports: Record<string, any> = {};
  
  // Process exports and add them to moduleExports
  processFileExportsAndDefinitions(importedExprs, env, moduleExports, resolvedPath, logger);
  
  return moduleExports;
}

/**
 * Process JavaScript imports
 */
async function processJsImport(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  logger: Logger,
  processedFiles: Set<string>
): Promise<void> {
  return performAsync(async () => {
    const moduleUrl = `file://${resolvedPath}`;
    const module = await import(moduleUrl);
    env.importModule(moduleName, module);
    processedFiles.add(resolvedPath);
    logger.debug(`Imported JS module: ${moduleName}`);
  }, `Importing JS module ${moduleName}`, ImportError, [modulePath, env.getCurrentFile()]);
}

/**
 * Process npm: imports with parallel CDN fallbacks
 */
async function processNpmImport(
  moduleName: string,
  modulePath: string,
  env: Environment,
  logger: Logger
): Promise<void> {
  return performAsync(async () => {
    const packageName = modulePath.substring(4);
    
    // Try all possible sources in parallel
    const importResults = await Promise.allSettled([
      import(modulePath),
      import(`https://esm.sh/${packageName}`),
      import(`https://cdn.skypack.dev/${packageName}`)
    ]);
    
    // Find the first successful import
    const successfulImport = importResults.find(result => result.status === 'fulfilled');
    
    if (successfulImport && successfulImport.status === 'fulfilled') {
      const module = successfulImport.value;
      env.importModule(moduleName, module);
      logger.debug(`Imported NPM module: ${moduleName} (${packageName})`);
    } else {
      // Collect all errors for better diagnostics
      const errors = importResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason)
        .map(error => error instanceof Error ? error.message : String(error))
        .join('; ');
      
      throw new ImportError(
        `Failed to import from all sources (npm, esm.sh, skypack): ${errors}`,
        modulePath,
        env.getCurrentFile()
      );
    }
  }, `Importing NPM module ${moduleName}`, ImportError, [modulePath, env.getCurrentFile()]);
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
  return performAsync(async () => {
    const module = await import(modulePath);
    env.importModule(moduleName, module);
    logger.debug(`Imported JSR module: ${moduleName}`);
  }, `Importing JSR module ${moduleName}`, ImportError, [modulePath, env.getCurrentFile()]);
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
  return performAsync(async () => {
    const module = await import(modulePath);
    env.importModule(moduleName, module);
    logger.debug(`Imported HTTP module: ${moduleName}`);
  }, `Importing HTTP module ${moduleName}`, ImportError, [modulePath, env.getCurrentFile()]);
}

/**
 * Helper function to process file definitions for macros
 */
function processFileDefinitions(exprs: SExp[], env: Environment, logger: Logger): void {
  return perform(() => {
    logger.debug("Processing file definitions for macros and variables");
    
    // Process def and defn declarations
    for (const expr of exprs) {
      if (expr.type !== 'list' || expr.elements.length === 0 || !isSymbol(expr.elements[0])) continue;
      
      const op = expr.elements[0].name;
      
      if (op === 'def' && expr.elements.length === 3) {
        try {
          processDefDeclaration(expr, env, logger);
        } catch (error) {
          const symbolName = isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown";
          throw new MacroError(
            `Error processing def declaration for '${symbolName}': ${error instanceof Error ? error.message : String(error)}`,
            symbolName,
            env.getCurrentFile(),
            error instanceof Error ? error : undefined
          );
        }
      } else if (op === 'defn' && expr.elements.length >= 4) {
        try {
          processDefnDeclaration(expr, env, logger);
        } catch (error) {
          const symbolName = isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown";
          throw new MacroError(
            `Error processing defn declaration for '${symbolName}': ${error instanceof Error ? error.message : String(error)}`,
            symbolName,
            env.getCurrentFile(),
            error instanceof Error ? error : undefined
          );
        }
      }
    }
  }, "Processing file definitions", MacroError, ["", env.getCurrentFile()]);
}

/**
 * Process a def declaration
 */
function processDefDeclaration(expr: SList, env: Environment, logger: Logger): void {
  return perform(() => {
    if (!isSymbol(expr.elements[1])) return;
    
    const name = expr.elements[1].name;
    const value = evaluateForMacro(expr.elements[2], env, logger);
    if (isLiteral(value)) {
      env.define(name, value.value);
    } else {
      env.define(name, value);
    }
    logger.debug(`Registered variable for macros: ${name}`);
  }, `Processing def declaration for ${isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown"}`, 
  MacroError, [isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown", env.getCurrentFile()]);
}

/**
 * Process a defn declaration
 */
function processDefnDeclaration(expr: SList, env: Environment, logger: Logger): void {
  return perform(() => {
    if (!isSymbol(expr.elements[1]) || expr.elements[2].type !== 'list') return;
    
    const fnName = expr.elements[1].name;
    // Create a simplified function for macro evaluation
    const fn = (...args: any[]) => {
      try {
        return `${fnName}(${args.join(', ')})`;
      } catch (e) {
        logger.error(`Error executing function ${fnName}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    };
    
    // Mark as a function definition
    Object.defineProperty(fn, 'isDefFunction', { value: true });
    
    // Register in the environment
    env.define(fnName, fn);
    logger.debug(`Registered function for macros: ${fnName}`);
  }, `Processing defn declaration for ${isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown"}`,
  MacroError, [isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown", env.getCurrentFile()]);
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
  return perform(() => {
    // First pass: process user-level macros
    for (const expr of expressions) {
      if (expr.type === 'list' && expr.elements.length > 0 && 
          isSymbol(expr.elements[0]) && expr.elements[0].name === 'macro') {
        try {
          defineUserMacro(expr as SList, filePath, env, logger);
        } catch (error) {
          if (error instanceof MacroError) {
            throw error;
          }
          
          const macroName = expr.elements.length > 1 && isSymbol(expr.elements[1]) 
            ? expr.elements[1].name 
            : "unknown";
          
          throw new MacroError(
            `Error defining user macro: ${error instanceof Error ? error.message : String(error)}`,
            macroName,
            filePath,
            error instanceof Error ? error : undefined
          );
        }
      }
    }
    
    // Second pass: process exports
    for (const expr of expressions) {
      if (expr.type !== 'list' || expr.elements.length === 0 || !isSymbol(expr.elements[0])) continue;
      
      const op = expr.elements[0].name;
      
      // Vector-based exports: (export [symbol1, symbol2])
      if (op === 'export' && expr.elements.length === 2 && expr.elements[1].type === 'list') {
        try {
          processVectorExport(expr, env, moduleExports, filePath, logger);
        } catch (error) {
          throw new ImportError(
            `Error processing vector export: ${error instanceof Error ? error.message : String(error)}`,
            filePath,
            filePath,
            error instanceof Error ? error : undefined
          );
        }
      }
    }
  }, "Processing file exports and definitions", ImportError, [filePath, filePath]);
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
  return perform(() => {
    // Validate export structure
    if (expr.elements.length !== 2 || expr.elements[1].type !== 'list') {
      throw new ImportError(
        "Invalid export syntax, expected (export [symbol1, symbol2, ...])",
        filePath,
        filePath
      );
    }
    
    const exportVector = expr.elements[1] as SList;
    
    // Process vector elements in one pass
    const elements = processVectorElements(exportVector.elements);
    
    // Export each symbol that's not a macro
    for (const element of elements) {
      if (!isSymbol(element)) {
        throw new ImportError(
          `Export vector can only contain symbols, got: ${element.type}`,
          filePath,
          filePath
        );
      }
      
      const symbolName = (element as SSymbol).name;
      
      // Check if it's a macro first
      if (env.hasModuleMacro(filePath, symbolName)) {
        env.exportMacro(filePath, symbolName);
        logger.debug(`Marked macro ${symbolName} as exported from ${filePath}`);
        continue;
      }
      
      // Export regular values
      try {
        const value = env.lookup(symbolName);
        moduleExports[symbolName] = value;
        logger.debug(`Added export "${symbolName}" with value`);
      } catch (error) {
        logger.debug(`Failed to lookup symbol "${symbolName}" for export`);
        throw new ImportError(
          `Failed to export symbol "${symbolName}": ${error instanceof Error ? error.message : String(error)}`,
          filePath,
          filePath,
          error instanceof Error ? error : undefined
        );
      }
    }
  }, "Processing vector export", ImportError, [filePath, filePath]);
}