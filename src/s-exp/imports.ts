// src/s-exp/imports.ts - Enhanced with better error handling

import * as path from "https://deno.land/std/path/mod.ts";
import { SExp, SList, SSymbol, isSymbol, isLiteral, isImport } from './types.ts';
import { Environment } from '../environment.ts';
import { evaluateForMacro, defineUserMacro } from './macro.ts';
import { parse } from './parser.ts';
import { Logger } from '../logger.ts';
import { ImportError, MacroError } from '../transpiler/errors.ts';

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
  
  // Store previous current file for restoration
  const previousCurrentFile = env.getCurrentFile();
  
  // Track processed imports to avoid duplicates
  const processedFiles = options.processedFiles || new Set<string>();
  const importMap = options.importMap || new Map<string, string>();
  
  try {
    // Set current file in environment if provided
    if (options.currentFile) {
      env.setCurrentFile(options.currentFile);
      logger.debug(`Processing imports in file: ${options.currentFile}`);
    }
    
    // Create temp directory if needed
    let tempDir = options.tempDir;
    if (!tempDir) {
      try {
        tempDir = await Deno.makeTempDir({ prefix: "hql_imports_" });
        logger.debug(`Created temporary directory: ${tempDir}`);
      } catch (error) {
        throw new ImportError(
          `Failed to create temporary directory: ${error instanceof Error ? error.message : String(error)}`,
          "temp_dir", 
          options.currentFile,
          error instanceof Error ? error : undefined
        );
      }
    }
    
    // Process all import expressions in sequence
    const importExprs = exprs.filter(expr => isImport(expr) && expr.type === 'list') as SList[];
    
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
        // Propagate ImportError directly, wrap other errors
        if (error instanceof ImportError) {
          throw error;
        }
        
        // Extract module path if possible for better error reporting
        let modulePath = "unknown";
        try {
          if (importExpr.elements.length >= 3) {
            // Handle vector imports: (import [symbols] from "path")
            if (importExpr.elements.length >= 4 && 
                importExpr.elements[2].type === "symbol" && 
                (importExpr.elements[2] as SSymbol).name === "from" &&
                importExpr.elements[3].type === "literal") {
              modulePath = String((importExpr.elements[3] as any).value);
            }
            // Handle legacy imports: (import name "path")
            else if (importExpr.elements[2].type === "literal") {
              modulePath = String((importExpr.elements[2] as any).value);
            }
          }
        } catch (e) {
          // Ignore errors in extracting the module path
        }
        
        throw new ImportError(
          `Error processing import: ${error instanceof Error ? error.message : String(error)}`,
          modulePath,
          options.currentFile,
          error instanceof Error ? error : undefined
        );
      }
    }
    
    // Process definitions and exports
    if (options.currentFile) {
      try {
        // First pass: register definitions for macros
        processFileDefinitions(exprs, env, logger);
        
        // Second pass: handle user-level macros and exports
        processFileExportsAndDefinitions(exprs, env, {}, options.currentFile, logger);
      } catch (error) {
        if (error instanceof MacroError || error instanceof ImportError) {
          throw error;
        }
        
        throw new ImportError(
          `Error processing file definitions or exports: ${error instanceof Error ? error.message : String(error)}`,
          options.currentFile,
          options.currentFile,
          error instanceof Error ? error : undefined
        );
      }
    }
  } finally {
    // Always restore the previous current file state
    env.setCurrentFile(previousCurrentFile);
  }
}

/**
 * Process definitions in the current file to make them available to macros
 */
function processFileDefinitions(exprs: SExp[], env: Environment, logger: Logger): void {
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
}

/**
 * Process a def declaration
 */
function processDefDeclaration(expr: SList, env: Environment, logger: Logger): void {
  if (!isSymbol(expr.elements[1])) return;
  
  const name = expr.elements[1].name;
  try {
    const value = evaluateForMacro(expr.elements[2], env, logger);
    if (isLiteral(value)) {
      env.define(name, value.value);
    } else {
      env.define(name, value);
    }
    logger.debug(`Registered variable for macros: ${name}`);
  } catch (error) {
    logger.warn(`Could not evaluate ${name} for macro use: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Process a defn declaration
 */
function processDefnDeclaration(expr: SList, env: Environment, logger: Logger): void {
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
  
  try {
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
  } catch (error) {
    if (error instanceof ImportError) {
      throw error;
    }
    
    // Determine module path for better error reporting
    let modulePath = "unknown";
    if (elements.length >= 4 && elements[3].type === "literal") {
      modulePath = String(elements[3].value);
    } else if (elements.length >= 3 && elements[2].type === "literal") {
      modulePath = String(elements[2].value);
    }
    
    throw new ImportError(
      `Failed to process import: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      options.currentFile,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Process elements in a vector, handling vector keyword and commas
 */
function processVectorElements(elements: SExp[]): SExp[] {
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
  
  try {
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
    
    try {
      const resolvedPath = resolveImportPath(modulePath, baseDir, logger);
      
      // Create a temporary module name and load the module
      const tempModuleName = `__temp_module_${Date.now()}`;
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
      
      // Process imports if this is an HQL file
      if (options.currentFile && modulePath.endsWith('.hql')) {
        // Only import the explicitly requested symbols
        for (const [symbolName, aliasName] of requestedSymbols.entries()) {
          // Check if this is a macro and import it with the proper alias
          if (env.hasModuleMacro(resolvedPath, symbolName)) {
            const success = env.importMacro(resolvedPath, symbolName, options.currentFile, aliasName || undefined);
            if (success) {
              logger.debug(`Imported macro ${symbolName}${aliasName ? ` as ${aliasName}` : ''}`);
            } else {
              logger.warn(`Failed to import macro ${symbolName} from ${resolvedPath}`);
            }
          }
          
          // Try to import as a regular value
          try {
            const value = env.lookup(`${tempModuleName}.${symbolName}`);
            env.define(aliasName || symbolName, value);
            logger.debug(`Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ''}`);
          } catch (error) {
            // Ignore lookup errors for macros - they're handled separately
            if (!env.hasModuleMacro(resolvedPath, symbolName)) {
              logger.debug(`Symbol not found in module: ${symbolName}`);
            }
          }
        }
      } else {
        // For non-HQL files, process regular imports
        for (const [symbolName, aliasName] of requestedSymbols.entries()) {
          try {
            const value = env.lookup(`${tempModuleName}.${symbolName}`);
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
    } catch (error) {
      if (error instanceof ImportError) {
        throw error;
      }
      
      throw new ImportError(
        `Failed to process vector import: ${error instanceof Error ? error.message : String(error)}`,
        modulePath,
        options.currentFile,
        error instanceof Error ? error : undefined
      );
    }
  } catch (error) {
    if (error instanceof ImportError) {
      throw error;
    }
    
    throw new ImportError(
      `Invalid vector import: ${error instanceof Error ? error.message : String(error)}`,
      "syntax-error",
      options.currentFile,
      error instanceof Error ? error : undefined
    );
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
  
  try {
    // Resolve the path and load the module
    const resolvedPath = resolveImportPath(modulePath, baseDir, logger);
    await loadModuleByType(moduleName, modulePath, resolvedPath, baseDir, env, options);
  } catch (error) {
    if (error instanceof ImportError) {
      throw error;
    }
    
    throw new ImportError(
      `Failed to process legacy import: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      options.currentFile,
      error instanceof Error ? error : undefined
    );
  }
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
  const processedFiles = options.processedFiles!;
  
  // Fast path for already processed files
  if (processedFiles.has(resolvedPath)) {
    logger.debug(`Skipping already processed import: ${resolvedPath}`);
    return;
  }
  
  // Mark as processed early to prevent circular imports
  processedFiles.add(resolvedPath);
  
  try {
    // Determine module type and process accordingly
    if (modulePath.startsWith('npm:')) {
      await processNpmImport(moduleName, modulePath, env, logger);
    } else if (modulePath.startsWith('jsr:')) {
      await processJsrImport(moduleName, modulePath, env, logger);
    } else if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
      await processHttpImport(moduleName, modulePath, env, logger);
    } else if (modulePath.endsWith('.hql')) {
      await processHqlImport(
        moduleName, modulePath, resolvedPath, baseDir, env, processedFiles,
        logger, options.tempDir!, options.importMap!, options
      );
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
  } catch (error) {
    if (error instanceof ImportError) {
      throw error;
    }
    
    throw new ImportError(
      `Failed to load module: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      options.currentFile,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Process HQL file import - REMOVE auto-import of all macros
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
  const previousCurrentFile = env.getCurrentFile();
  
  try {
    // Read and parse the file
    let fileContent: string;
    try {
      fileContent = await Deno.readTextFile(resolvedPath);
    } catch (error) {
      throw new ImportError(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        resolvedPath,
        options.currentFile,
        error instanceof Error ? error : undefined
      );
    }
    
    let importedExprs: SExp[];
    try {
      importedExprs = parse(fileContent);
    } catch (error) {
      throw new ImportError(
        `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`,
        resolvedPath,
        options.currentFile,
        error instanceof Error ? error : undefined
      );
    }
    
    // Set current file to imported file for correct context
    env.setCurrentFile(resolvedPath);
    
    // Process nested imports first
    const importDir = path.dirname(resolvedPath);
    try {
      await processImports(importedExprs, env, { 
        verbose: logger.enabled,
        baseDir: importDir,
        tempDir,
        keepTemp: options.keepTemp,
        processedFiles,
        importMap,
        currentFile: resolvedPath
      });
    } catch (error) {
      throw new ImportError(
        `Failed to process nested imports: ${error instanceof Error ? error.message : String(error)}`,
        resolvedPath,
        options.currentFile,
        error instanceof Error ? error : undefined
      );
    }
    
    // Process exports
    const moduleExports: Record<string, any> = {};
    try {
      processFileExportsAndDefinitions(importedExprs, env, moduleExports, resolvedPath, logger);
    } catch (error) {
      throw new ImportError(
        `Failed to process exports: ${error instanceof Error ? error.message : String(error)}`,
        resolvedPath,
        options.currentFile,
        error instanceof Error ? error : undefined
      );
    }
    
    // Register the module with its exports
    env.importModule(moduleName, moduleExports);
    
    logger.debug(`Imported HQL module: ${moduleName}`);
  } catch (error) {
    if (error instanceof ImportError) {
      throw error;
    }
    
    throw new ImportError(
      `Failed to process HQL import: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      options.currentFile,
      error instanceof Error ? error : undefined
    );
  } finally {
    // Restore original file context
    env.setCurrentFile(previousCurrentFile);
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
    const moduleUrl = `file://${resolvedPath}`;
    const module = await import(moduleUrl);
    env.importModule(moduleName, module);
    logger.debug(`Imported JS module: ${moduleName}`);
  } catch (error) {
    throw new ImportError(
      `Failed to import JS module: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      env.getCurrentFile(),
      error instanceof Error ? error : undefined
    );
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
    const packageName = modulePath.substring(4);
    
    // Try direct import first, then fall back to CDNs
    let module;
    try {
      module = await import(modulePath);
    } catch (firstError) {
      try {
        module = await import(`https://esm.sh/${packageName}`);
      } catch (secondError) {
        try {
          module = await import(`https://cdn.skypack.dev/${packageName}`);
        } catch (thirdError) {
          throw new ImportError(
            `Failed to import from all sources (npm, esm.sh, skypack)`,
            modulePath,
            env.getCurrentFile(),
            thirdError instanceof Error ? thirdError : undefined
          );
        }
      }
    }
    
    env.importModule(moduleName, module);
    logger.debug(`Imported NPM module: ${moduleName} (${packageName})`);
  } catch (error) {
    if (error instanceof ImportError) {
      throw error;
    }
    
    throw new ImportError(
      `Failed to import NPM module: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      env.getCurrentFile(),
      error instanceof Error ? error : undefined
    );
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
    logger.debug(`Imported JSR module: ${moduleName}`);
  } catch (error) {
    throw new ImportError(
      `Failed to import JSR module: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      env.getCurrentFile(),
      error instanceof Error ? error : undefined
    );
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
    logger.debug(`Imported HTTP module: ${moduleName}`);
  } catch (error) {
    throw new ImportError(
      `Failed to import HTTP module: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      env.getCurrentFile(),
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Resolve an import path to an absolute path efficiently
 */
function resolveImportPath(modulePath: string, baseDir: string, logger: Logger): string {
  // Fast path for special schemas and absolute paths
  if (modulePath.startsWith('npm:') || 
      modulePath.startsWith('jsr:') || 
      modulePath.startsWith('http:') || 
      modulePath.startsWith('https:') ||
      path.isAbsolute(modulePath)) {
    return modulePath;
  }
  
  // For relative paths, resolve them efficiently
  const resolvedPath = path.resolve(baseDir, modulePath);
  logger.debug(`Resolved import path: ${modulePath} -> ${resolvedPath}`);
  return resolvedPath;
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