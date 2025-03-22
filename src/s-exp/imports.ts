// src/s-exp/imports.ts - Fixed to balance parallel processing with correctness

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { SExp, SList, SSymbol, isSymbol, isLiteral, isImport } from './types.ts';
import { Environment } from '../environment.ts';
import { evaluateForMacro, defineUserMacro } from './macro.ts';
import { parse } from './parser.ts';
import { Logger } from '../logger.ts';
import { ImportError, MacroError } from '../transpiler/errors.ts';
import { perform, performAsync } from '../transpiler/error-utils.ts';

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
      // Set current file in environment if provided
      if (options.currentFile) {
        env.setCurrentFile(options.currentFile);
        logger.debug(`Processing imports in file: ${options.currentFile}`);
        
        // Add current file to in-progress set
        if (options.currentFile) {
          inProgressFiles.add(options.currentFile);
        }
      }
      
      // Create temp directory if needed - can do this in parallel with other initialization
      const tempDir = !options.tempDir ? 
        await performAsync(
          () => Deno.makeTempDir({ prefix: "hql_imports_" }),
          "Creating temporary directory",
          ImportError,
          ["temp_dir", options.currentFile]
        ) : 
        options.tempDir;
      
      logger.debug(options.tempDir ? `Using existing temp directory: ${tempDir}` : `Created temporary directory: ${tempDir}`);
      
      // Identify all import expressions
      const importExprs = exprs.filter(expr => isImport(expr) && expr.type === 'list') as SList[];
      logger.debug(`Found ${importExprs.length} import expressions to process`);
      
      // Group imports by type for optimized processing:
      // 1. Remote imports (npm:, jsr:, http:) can be processed in parallel
      // 2. Local imports need more careful handling for dependencies
      const remoteImports: SList[] = [];
      const localImports: SList[] = [];
      
      for (const importExpr of importExprs) {
        let modulePath = "unknown";
        
        try {
          if (importExpr.elements.length >= 4 && 
              importExpr.elements[2].type === "symbol" && 
              (importExpr.elements[2] as SSymbol).name === "from" &&
              importExpr.elements[3].type === "literal") {
            // Vector import
            modulePath = String((importExpr.elements[3] as any).value);
          } else if (importExpr.elements.length === 3 && 
                     importExpr.elements[2].type === "literal") {
            // Legacy import
            modulePath = String((importExpr.elements[2] as any).value);
          }
          
          if (modulePath.startsWith('npm:') || 
              modulePath.startsWith('jsr:') || 
              modulePath.startsWith('http:') || 
              modulePath.startsWith('https:')) {
            remoteImports.push(importExpr);
          } else {
            localImports.push(importExpr);
          }
        } catch (e) {
          // If we can't determine the type, treat it as local for safety
          localImports.push(importExpr);
        }
      }
      
      // Process remote imports in parallel - these don't have local dependencies
      if (remoteImports.length > 0) {
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
            let modulePath = "unknown";
            try {
              if (importExpr.elements.length >= 3) {
                if (importExpr.elements.length >= 4 && 
                    importExpr.elements[2].type === "symbol" && 
                    (importExpr.elements[2] as SSymbol).name === "from" &&
                    importExpr.elements[3].type === "literal") {
                  modulePath = String((importExpr.elements[3] as any).value);
                } else if (importExpr.elements[2].type === "literal") {
                  modulePath = String((importExpr.elements[2] as any).value);
                }
              }
            } catch (e) {
              // Ignore errors in extracting the module path
            }
            
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
      
      // Process local imports sequentially to respect dependencies
      if (localImports.length > 0) {
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
      
      // Process definitions and exports
      if (options.currentFile) {
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
      
      // Mark current file as fully processed (not just in progress)
      if (options.currentFile) {
        inProgressFiles.delete(options.currentFile);
        processedFiles.add(options.currentFile);
        logger.debug(`Completed processing imports for: ${options.currentFile}`);
      }
    } finally {
      // Always restore the previous current file state
      env.setCurrentFile(previousCurrentFile);
    }
  }, "Processing imports", ImportError, ["imports", options.currentFile]);
}

// Helper function to extract module path from import expression
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
    // Quickly determine import type and process accordingly
    if (elements.length >= 4 && elements[1].type === 'list' && 
        isSymbol(elements[2]) && elements[2].name === 'from') {
      // Vector-based import
      await processVectorBasedImport(elements, env, baseDir, options);
    } else if (elements.length === 3 && isSymbol(elements[1]) && 
              isLiteral(elements[2]) && typeof elements[2].value === 'string') {
      // Legacy import
      await processLegacyImport(elements, env, baseDir, options);
    } else {
      throw new ImportError(
        "Invalid import syntax, expected either (import [symbols] from \"path\") or (import name \"path\")",
        "syntax-error",
        options.currentFile
      );
    }
  }, "Processing import expression", ImportError, [getModulePathFromImport(importExpr), options.currentFile]);
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
    
    // Resolve the path and prepare module
    const resolvedPath = await resolveImportPath(modulePath, baseDir, logger);
    
    // Use a consistent module name that doesn't depend on timestamps
    // Using a faster naming scheme than full path hashing
    const tempModuleName = `__temp_module_${modulePath.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    
    // Load the module
    await loadModuleByType(tempModuleName, modulePath, resolvedPath, baseDir, env, options);
    
    // Process the vector elements
    const vectorElements = processVectorElements(symbolsVector.elements);
    
    // Track which symbols were explicitly requested with their aliases
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
    
    // Process imports with HQL-specific handling
    if (options.currentFile && modulePath.endsWith('.hql')) {
      // Only import the explicitly requested symbols
      for (const [symbolName, aliasName] of requestedSymbols.entries()) {
        // Check if this is a macro and import it with the proper alias
        const isMacro = env.hasModuleMacro(resolvedPath, symbolName);
        if (isMacro) {
          const success = env.importMacro(resolvedPath, symbolName, options.currentFile, aliasName || undefined);
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
              `Symbol '${symbolName}' not found in module '${modulePath}'`,
              modulePath,
              options.currentFile,
              error instanceof Error ? error : undefined
            );
          }
        }
      }
    } else {
      // For non-HQL files, process regular imports
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
            options.currentFile,
            error instanceof Error ? error : undefined
          );
        }
      }
    }
  }, "Processing vector import", ImportError, [elements[3]?.type === "literal" ? String(elements[3].value) : "unknown", options.currentFile]);
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
  
  return performAsync(async () => {
    if (!isSymbol(elements[1])) {
      throw new ImportError(
        "Module name must be a symbol",
        "syntax-error",
        options.currentFile
      );
    }
    
    const moduleName = (elements[1] as SSymbol).name;
    
    if (!isLiteral(elements[2]) || typeof elements[2].value !== 'string') {
      throw new ImportError(
        "Module path must be a string literal",
        "syntax-error",
        options.currentFile
      );
    }
    
    const modulePath = (elements[2] as any).value as string;
    
    logger.debug(`Processing legacy import: ${moduleName} from ${modulePath}`);
    
    // Resolve the path and load the module
    const resolvedPath = await resolveImportPath(modulePath, baseDir, logger);
    
    // Load the module with the given name
    await loadModuleByType(moduleName, modulePath, resolvedPath, baseDir, env, options);
  }, `Processing legacy import ${elements[1]?.type === "symbol" ? (elements[1] as SSymbol).name : "unknown"}`, 
  ImportError, [elements[2]?.type === "literal" ? String(elements[2].value) : "unknown", options.currentFile]);
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
    if (modulePath.startsWith('npm:')) {
      await processNpmImport(moduleName, modulePath, env, logger);
    } else if (modulePath.startsWith('jsr:')) {
      await processJsrImport(moduleName, modulePath, env, logger);
    } else if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
      await processHttpImport(moduleName, modulePath, env, logger);
    } else if (modulePath.endsWith('.hql')) {
      // Mark file as in-progress before processing
      inProgressFiles.add(resolvedPath);
      
      await processHqlImport(
        moduleName, modulePath, resolvedPath, baseDir, env, processedFiles, inProgressFiles,
        logger, options.tempDir!, options.importMap!, options
      );
      
      // Mark as fully processed after completion
      inProgressFiles.delete(resolvedPath);
      processedFiles.add(resolvedPath);
    } else if (modulePath.endsWith('.js') || modulePath.endsWith('.mjs') || modulePath.endsWith('.cjs')) {
      await processJsImport(
        moduleName, modulePath, resolvedPath, baseDir, env, logger, processedFiles
      );
    } else {
      throw new ImportError(
        `Unsupported import file type: ${modulePath}`,
        modulePath,
        options.currentFile
      );
    }
  }, `Loading module ${moduleName} from ${modulePath}`, ImportError, [modulePath, options.currentFile]);
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
      const fileContent = await performAsync(
        async () => await Deno.readTextFile(resolvedPath),
        `Reading file ${resolvedPath}`,
        ImportError,
        [resolvedPath, options.currentFile]
      );
      
      const importedExprs = perform(
        () => parse(fileContent),
        `Parsing file ${resolvedPath}`,
        ImportError,
        [resolvedPath, options.currentFile]
      );
      
      // Set current file to imported file for correct context
      env.setCurrentFile(resolvedPath);
      
      // First, process file definitions to make symbols available
      processFileDefinitions(importedExprs, env, logger);
      
      // Process nested imports
      const importDir = path.dirname(resolvedPath);
      await processImports(importedExprs, env, { 
        verbose: logger.enabled,
        baseDir: importDir,
        tempDir,
        keepTemp: options.keepTemp,
        processedFiles,
        inProgressFiles,
        importMap,
        currentFile: resolvedPath
      });
      
      // Process exports
      const moduleExports: Record<string, any> = {};
      
      // Process exports and add them to moduleExports
      processFileExportsAndDefinitions(importedExprs, env, moduleExports, resolvedPath, logger);
      
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
      // Strategy 1: Direct import
      import(modulePath),
      
      // Strategy 2: ESM.sh fallback
      import(`https://esm.sh/${packageName}`),
      
      // Strategy 3: Skypack fallback
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
 * Resolve an import path to an absolute path
 * This can be parallel since it's a pure computation with no side effects
 */
async function resolveImportPath(
  modulePath: string, 
  baseDir: string, 
  logger: Logger
): Promise<string> {
  return performAsync(async () => {
    // Fast path for special schemas and absolute paths
    if (modulePath.startsWith('npm:') || 
        modulePath.startsWith('jsr:') || 
        modulePath.startsWith('http:') || 
        modulePath.startsWith('https:') ||
        path.isAbsolute(modulePath)) {
      return modulePath;
    }
    
    // For relative paths, check multiple possible locations in parallel
    if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
      try {
        const resolvedPath = path.resolve(baseDir, modulePath);
        await Deno.stat(resolvedPath);
        logger.debug(`Resolved import path: ${modulePath} -> ${resolvedPath}`);
        return resolvedPath;
      } catch (_) {
        // Try other locations if the file doesn't exist at the primary location
        const alternateLocations = [
          Deno.cwd(),
          path.join(Deno.cwd(), 'src'),
          path.join(Deno.cwd(), 'lib')
        ];
        
        for (const location of alternateLocations) {
          try {
            const resolvedPath = path.resolve(location, modulePath);
            await Deno.stat(resolvedPath);
            logger.debug(`Resolved import path: ${modulePath} -> ${resolvedPath}`);
            return resolvedPath;
          } catch (_) {
            // Continue to the next location
          }
        }
      }
    }
    
    // Default resolution if all checks fail
    const resolvedPath = path.resolve(baseDir, modulePath);
    logger.debug(`Resolved import path: ${modulePath} -> ${resolvedPath}`);
    return resolvedPath;
  }, `Resolving import path: ${modulePath}`, ImportError, [modulePath, baseDir]);
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
      // Legacy string-based exports: (export "name" value)
      else if (op === 'export' && expr.elements.length === 3 && 
               isLiteral(expr.elements[1]) && typeof expr.elements[1].value === 'string') {
        try {
          processLegacyExport(expr, env, moduleExports, filePath, logger);
        } catch (error) {
          const exportName = isLiteral(expr.elements[1]) ? String(expr.elements[1].value) : "unknown";
          
          throw new ImportError(
            `Error processing legacy export '${exportName}': ${error instanceof Error ? error.message : String(error)}`,
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
  return perform(() => {
    // Validate export structure
    if (expr.elements.length !== 3 || !isLiteral(expr.elements[1])) {
      throw new ImportError(
        "Invalid legacy export syntax, expected (export \"name\" value)",
        filePath,
        filePath
      );
    }
    
    const exportName = expr.elements[1].value as string;
    const exportSymbol = expr.elements[2];
    
    // Handle symbol exports
    if (isSymbol(exportSymbol)) {
      const symbolName = exportSymbol.name;
      
      // Check if this is a macro first
      if (env.hasModuleMacro(filePath, symbolName)) {
        env.exportMacro(filePath, symbolName);
        logger.debug(`Marked macro ${symbolName} as exported from ${filePath} with name ${exportName}`);
        return;
      }
      
      // Regular value export
      try {
        moduleExports[exportName] = env.lookup(symbolName);
        logger.debug(`Added export "${exportName}" with value from ${symbolName}`);
      } catch (error) {
        logger.warn(`Failed to lookup symbol "${symbolName}" for export "${exportName}"`);
        throw new ImportError(
          `Failed to export "${exportName}" from symbol "${symbolName}": ${error instanceof Error ? error.message : String(error)}`,
          filePath,
          filePath,
          error instanceof Error ? error : undefined
        );
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
        logger.warn(`Failed to evaluate export "${exportName}": ${error instanceof Error ? error.message : String(error)}`);
        throw new ImportError(
          `Failed to evaluate export "${exportName}": ${error instanceof Error ? error.message : String(error)}`,
          filePath,
          filePath,
          error instanceof Error ? error : undefined
        );
      }
    }
  }, "Processing legacy export", ImportError, [filePath, filePath]);
}

/**
 * Check if a symbol is a macro in the environment
 */
export function isMacroSymbol(
  symbolName: string, 
  env: Environment, 
  filePath: string | null = null
): boolean {
  // Check global macros first (faster than isUserLevelMacro)
  if (env.hasMacro(symbolName)) return true;
  
  // Then check user-level macros
  return filePath !== null && env.isUserLevelMacro(symbolName, filePath);
}