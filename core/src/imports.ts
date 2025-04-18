// src/s-exp/imports.ts

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { globalLogger as logger } from "./logger.ts";
import { Environment, Value } from "./environment.ts";
import { defineUserMacro, evaluateForMacro } from "./s-exp/macro.ts";
import { parse } from "./transpiler/pipeline/parser.ts";
import { readFile } from "./common/utils.ts";
import {
  processJavaScriptFile,
  getImportMapping,
  createTempDirIfNeeded
} from "./common/temp-file-tracker.ts";
import {
  isImport,
  isLiteral,
  isSExpNamespaceImport,
  isSExpVectorImport,
  isSymbol,
  SExp,
  SList,
  SSymbol,
} from "./s-exp/types.ts";
import {
  ImportError,
  MacroError,
  ValidationError,
} from "./transpiler/error/errors.ts";
import {
  isHqlFile,
  isJavaScriptModule,
  isRemoteModule,
  isRemoteUrl,
  registerModulePath,
} from "./common/import-utils.ts";
import { 
  wrapError, 
  formatErrorMessage 
} from "./common/common-utils.ts";
export interface ImportProcessorOptions {
  verbose?: boolean;
  baseDir?: string;
  tempDir?: string;
  processedFiles?: Set<string>;
  inProgressFiles?: Set<string>;
  importMap?: Map<string, string>;
  currentFile?: string;
}

interface SLiteral {
  type: "literal";
  value: string | number | boolean | null;
}

/**
 * Main function to process imports in S-expressions
 */
export async function processImports(
  exprs: SExp[],
  env: Environment,
  options: ImportProcessorOptions = {},
): Promise<void> {
  // Always resolve baseDir relative to this file if not explicitly provided
  const baseDir = options.baseDir || path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), '../../');
  const processedFiles = options.processedFiles || new Set<string>();
  const inProgressFiles = options.inProgressFiles || new Set<string>();
  const importMap = options.importMap || new Map<string, string>();
  
  try {
    // Set up current file context
    if (options.currentFile) {
      env.setCurrentFile(options.currentFile);
      logger.debug(`Processing imports in file: ${options.currentFile}`);
      inProgressFiles.add(options.currentFile);
    }
    
    // Initialize temp directory and analyze imports
    const tempDirResult = await createTempDirIfNeeded(options, "hql_imports_", logger);
    const tempDir = tempDirResult.tempDir;
    const importExprs = filterImportExpressions(exprs);
    
    // Categorize imports and process them
    const { remoteImports, localImports } = categorizeImports(importExprs);
    
    // Process remote imports in parallel
    if (remoteImports.length > 0) {
      await processImportsInParallel(
        remoteImports,
        env,
        baseDir,
        { 
          ...options, 
          tempDir, 
          processedFiles, 
          inProgressFiles, 
          importMap 
        },
      );
    }
    
    // Process local imports sequentially
    if (localImports.length > 0) {
      await processImportsSequentially(
        localImports,
        env,
        baseDir,
        { 
          ...options, 
          tempDir, 
          processedFiles, 
          inProgressFiles, 
          importMap 
        },
      );
    }
    
    // Process definitions and exports for current file
    if (options.currentFile) {
      processFileContent(exprs, env, options);
    }
    
    // Mark file as processed
    if (options.currentFile) {
      inProgressFiles.delete(options.currentFile);
      processedFiles.add(options.currentFile);
      logger.debug(`Completed processing imports for: ${options.currentFile}`);
    }
  } catch (error) {
    wrapError("Processing file exports and definitions", error, options.currentFile || "unknown", options.currentFile);
  }
}

/**
 * Collect export definitions from expressions
 */
function collectExportDefinitions(expressions: SExp[]): { name: string; value: SExp | null }[] {
  const exportDefinitions: { name: string; value: SExp | null }[] = [];
  
  for (const expr of expressions) {
    if (expr.type !== "list" || expr.elements.length === 0 || 
        !isSymbol(expr.elements[0]) || expr.elements[0].name !== "export") {
      continue;
    }
    
    // Handle vector exports
    if (expr.elements.length === 2 && expr.elements[1].type === "list") {
      const vectorElements = (expr.elements[1] as SList).elements;
      const elements = processVectorElements(vectorElements);
      
      for (const elem of elements) {
        if (isSymbol(elem)) {
          exportDefinitions.push({ name: (elem as SSymbol).name, value: null });
          logger.debug(`Collected vector export: ${(elem as SSymbol).name}`);
        }
      }
    } 
    // Handle named exports
    else if (expr.elements.length === 3 && 
             expr.elements[1].type === "literal" && 
             typeof (expr.elements[1] as SLiteral).value === "string") {
      const exportName = (expr.elements[1] as SLiteral).value as string;
      exportDefinitions.push({ name: exportName, value: expr.elements[2] });
      logger.debug(`Collected string export with expression: "${exportName}"`);
    }
  }
  
  return exportDefinitions;
}

/**
 * Filter import expressions from S-expressions
 */
function filterImportExpressions(exprs: SExp[]): SList[] {
  const importExprs = exprs.filter(
    (expr) => isImport(expr) && expr.type === "list",
  ) as SList[];
  logger.debug(`Found ${importExprs.length} import expressions to process`);
  return importExprs;
}

/**
 * Categorize imports into remote and local types
 */
function categorizeImports(importExprs: SList[]): {
  remoteImports: SList[];
  localImports: SList[];
} {
  const remoteImports: SList[] = [];
  const localImports: SList[] = [];
  
  for (const importExpr of importExprs) {
    const modulePath = getModulePathFromImport(importExpr);
    if (isRemoteUrl(modulePath) || isRemoteModule(modulePath)) {
      remoteImports.push(importExpr);
    } else {
      localImports.push(importExpr);
    }
  }
  
  logger.debug(
    `Categorized imports: ${remoteImports.length} remote, ${localImports.length} local`,
  );
  return { remoteImports, localImports };
}

/**
 * Process imports in parallel (for remote imports)
 */
async function processImportsInParallel(
  imports: SList[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  logger.debug(`Processing ${imports.length} imports in parallel`);
  await Promise.all(
    imports.map(async (importExpr) => {
      try {
        await processImport(importExpr, env, baseDir, options);
      } catch (error) {
        const modulePath = getModulePathFromImport(importExpr);
        wrapError("Error processing import", error, modulePath, options.currentFile);
      }
    }),
  );
}

/**
 * Process imports sequentially (for local imports)
 */
async function processImportsSequentially(
  imports: SList[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  logger.debug(`Processing ${imports.length} imports sequentially`);
  for (const importExpr of imports) {
    try {
      await processImport(importExpr, env, baseDir, options);
    } catch (error) {
      const modulePath = getModulePathFromImport(importExpr);
      wrapError("Processing sequential import", error, modulePath, options.currentFile);
    }
  }
}

/**
 * Process file content, including definitions and exports
 */
function processFileContent(
  exprs: SExp[],
  env: Environment,
  options: ImportProcessorOptions,
): void {
  try {
    // Process definitions
    processFileDefinitions(exprs, env);
    
    // Process exports if current file is defined
    if (options.currentFile) {
      const moduleExports = {};
      processFileExportsAndDefinitions(exprs, env, moduleExports, options.currentFile);
    }
  } catch (error) {
    if (error instanceof MacroError) throw error;
    wrapError(
      "Processing file definitions and exports",
      error,
      options.currentFile || "unknown",
      options.currentFile
    );
  }
}

/**
 * Extract module path from import expression
 */
function getModulePathFromImport(importExpr: SList): string {
  try {
    if (
      importExpr.elements.length >= 4 &&
      importExpr.elements[2].type === "symbol" &&
      (importExpr.elements[2] as SSymbol).name === "from" &&
      importExpr.elements[3].type === "literal"
    ) {
      return String((importExpr.elements[3] as SLiteral).value);
    } else if (
      importExpr.elements.length === 3 &&
      importExpr.elements[2].type === "literal"
    ) {
      return String((importExpr.elements[2] as SLiteral).value);
    } else if (
      importExpr.elements.length === 2 &&
      importExpr.elements[1].type === "literal"
    ) {
      return String((importExpr.elements[1] as SLiteral).value);
    }
  } catch (_e) {
    // Error parsing import expression, fall back to "unknown"
  }
  return "unknown";
}

/**
 * Process a single import expression
 */
async function processImport(
  importExpr: SList,
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  const elements = importExpr.elements;
  
  if (elements.length <= 1) {
    throw new MacroError(
      "Invalid import statement format. Expected (import ...)",
      "import",
      options.currentFile,
    );
  }

  try {
    // Determine import type and process accordingly
    if (elements.length === 2 && elements[1].type === "literal") {
      await processSimpleImport(elements, env, baseDir, options);
    } else if (isSExpNamespaceImport(elements)) {
      await processNamespaceImport(elements, env, baseDir, options);
    } else if (isSExpVectorImport(elements)) {
      await processVectorBasedImport(elements, env, baseDir, options);
    } else {
      throw new ImportError(
        `Invalid import statement format: ${JSON.stringify(importExpr)}`,
        "syntax-error",
        options.currentFile
      );
    }
  } catch (error) {
    const modulePath = getModulePathFromImport(importExpr);
    wrapError("Processing import", error, modulePath, options.currentFile);
  }
}

/**
 * Process a simple import statement (import "module-path")
 */
async function processSimpleImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  const modulePath = (elements[1] as SLiteral).value as string;
  const resolvedPath = path.resolve(baseDir, modulePath);
  
  logger.debug(`Simple import of full module: ${modulePath} => ${resolvedPath}`);
  
  registerModulePath(modulePath, resolvedPath);

  await loadModule(
    modulePath,
    modulePath,
    resolvedPath,
    env,
    options
  );
}

/**
 * Process a namespace import statement (import name from "module-path")
 */
async function processNamespaceImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  try {
    if (!isSymbol(elements[1])) {
      throw new ImportError("Module name must be a symbol", "namespace import", options.currentFile);
    }
    if (!isLiteral(elements[3]) || typeof elements[3].value !== "string") {
      throw new ImportError("Module path must be a string literal", "namespace import", options.currentFile);
    }
    
    const moduleName = (elements[1] as SSymbol).name;
    const modulePath = (elements[3] as SLiteral).value as string;
    
    registerModulePath(moduleName, modulePath);
    logger.debug(`Processing namespace import with "from": ${moduleName} from ${modulePath}`);
    
    const resolvedPath = path.resolve(baseDir, modulePath);
    await loadModule(moduleName, modulePath, resolvedPath, env, options);
  } catch (error) {
    const modulePath = elements[3]?.type === "literal" ? String(elements[3].value) : "unknown";
    wrapError("Processing namespace import", error, modulePath, options.currentFile);
  }
}

/**
 * Process vector-based import statements (import [a b c] from "module-path")
 */
async function processVectorBasedImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  try {
    if (elements[1].type !== "list") {
      throw new ImportError("Import vector must be a list", "syntax-error", options.currentFile);
    }
    const symbolsVector = elements[1] as SList;
    if (!isLiteral(elements[3]) || typeof elements[3].value !== "string") {
      throw new ImportError("Module path must be a string literal", "syntax-error", options.currentFile);
    }
    
    const modulePath = elements[3].value as string;
    const resolvedPath = path.resolve(baseDir, modulePath);
    const tempModuleName = `__temp_module_${modulePath.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    
    await loadModule(tempModuleName, modulePath, resolvedPath, env, options);
    
    const vectorElements = processVectorElements(symbolsVector.elements);
    const requestedSymbols = extractSymbolsAndAliases(vectorElements);
    
    importSymbols(
      requestedSymbols,
      modulePath,
      resolvedPath,
      tempModuleName,
      env,
      options.currentFile || "",
    );
  } catch (error) {
    const modulePath = elements[3]?.type === "literal" ? String(elements[3].value) : "unknown";
    wrapError("Processing vector import", error, modulePath, options.currentFile);
  }
}

/**
 * Clean vector elements for processing
 */
function processVectorElements(elements: SExp[]): SExp[] {
  let startIndex = 0;
  if (elements.length > 0 && elements[0].type === "symbol" && (elements[0] as SSymbol).name === "vector") {
    startIndex = 1;
  }
  return elements.slice(startIndex).filter(
    (elem) => !(elem.type === "symbol" && (elem as SSymbol).name === ","),
  );
}

/**
 * Extract symbol names and their aliases from vector elements
 */
function extractSymbolsAndAliases(vectorElements: SExp[]): Map<string, string | null> {
  const requestedSymbols = new Map<string, string | null>();
  let i = 0;
  
  while (i < vectorElements.length) {
    if (!isSymbol(vectorElements[i])) {
      i++;
      continue;
    }
    
    const symbolName = (vectorElements[i] as SSymbol).name;
    if (
      i + 2 < vectorElements.length &&
      isSymbol(vectorElements[i + 1]) &&
      (vectorElements[i + 1] as SSymbol).name === "as" &&
      isSymbol(vectorElements[i + 2])
    ) {
      const aliasName = (vectorElements[i + 2] as SSymbol).name;
      requestedSymbols.set(symbolName, aliasName);
      i += 3;
    } else {
      requestedSymbols.set(symbolName, null);
      i++;
    }
  }
  
  return requestedSymbols;
}

/**
 * Import symbols from a module
 */
function importSymbols(
  requestedSymbols: Map<string, string | null>,
  modulePath: string,
  resolvedPath: string,
  tempModuleName: string,
  env: Environment,
  currentFile: string,
): void {
  const isHqlModule = modulePath.endsWith(".hql");
  
  for (const [symbolName, aliasName] of requestedSymbols.entries()) {
    try {
      // Check for macros in HQL files
      if (isHqlModule && env.hasModuleMacro(resolvedPath, symbolName)) {
        const success = env.importMacro(resolvedPath, symbolName, currentFile, aliasName || undefined);
        if (success) {
          logger.debug(`Imported macro ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`);
        } else {
          logger.warn(`Failed to import macro ${symbolName} from ${resolvedPath}`);
        }
      }
      
      // Try to import the symbol value
      const moduleLookupKey = `${tempModuleName}.${symbolName}`;
      try {
        const value = env.lookup(moduleLookupKey);
        env.define(aliasName || symbolName, value);
        logger.debug(`Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`);
      } catch (lookupError) {
        // Only throw for non-macros or non-HQL files
        if (!(isHqlModule && env.hasModuleMacro(resolvedPath, symbolName))) {
          logger.debug(`Symbol not found in module: ${symbolName}`);
          wrapError(
            `Symbol '${symbolName}' not found in module '${modulePath}'`,
            lookupError,
            modulePath,
            currentFile,
          );
        }
      }
    } catch (error) {
      wrapError(
        `Importing symbol '${symbolName}' from '${modulePath}'`,
        error,
        modulePath,
        currentFile,
      );
    }
  }
}

/**
 * Load a module based on its type
 */
async function loadModule(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  options: ImportProcessorOptions,
): Promise<void> {
  const processedFiles = options.processedFiles || new Set<string>();
  const inProgressFiles = options.inProgressFiles || new Set<string>();
  
  try {
    // Skip already processed modules
    if (processedFiles.has(resolvedPath)) {
      logger.debug(`Skipping already processed import: ${resolvedPath}`);
      return;
    }
    
    // Handle circular imports
    if (inProgressFiles.has(resolvedPath)) {
      logger.debug(`Detected circular import for ${resolvedPath}, will be resolved by parent process`);
      return;
    }
    
    // Choose loading strategy based on module type
    if (isRemoteModule(modulePath)) {
      await loadRemoteModule(moduleName, modulePath, env);
    } else if (isHqlFile(modulePath)) {
      await loadHqlModule(moduleName, modulePath, resolvedPath, env, options);
    } else if (isJavaScriptModule(modulePath)) {
      await loadJavaScriptModule(moduleName, modulePath, resolvedPath, env, processedFiles);
    } else {
      throw new ImportError(`Unsupported import file type: ${modulePath}`, modulePath, options.currentFile);
    }
  } catch (error) {
    wrapError(`Loading module ${moduleName} from ${modulePath}`, error, modulePath, options.currentFile);
  }
}

/**
 * Load remote modules (npm, jsr, http)
 */
async function loadRemoteModule(
  moduleName: string,
  modulePath: string,
  env: Environment,
): Promise<void> {
  if (modulePath.startsWith("npm:")) {
    await loadNpmModule(moduleName, modulePath, env);
  } else if (modulePath.startsWith("jsr:")) {
    await loadJsrModule(moduleName, modulePath, env);
  } else {
    await loadHttpModule(moduleName, modulePath, env);
  }
}

/**
 * Load an HQL module
 */
async function loadHqlModule(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  options: ImportProcessorOptions,
): Promise<void> {
  const processedFiles = options.processedFiles || new Set<string>();
  const inProgressFiles = options.inProgressFiles || new Set<string>();
  const tempDir = options.tempDir || "";
  const importMap = options.importMap || new Map<string, string>();
  
  // Mark as in progress to detect circular imports
  inProgressFiles.add(resolvedPath);
  
  const previousCurrentFile = env.getCurrentFile();
  try {
    // Read and parse the HQL file
    const fileContent = await readFile(resolvedPath, options.currentFile);
    const importedExprs = parse(fileContent);
    
    // Set context for processing
    env.setCurrentFile(resolvedPath);
    
    // Process definitions and imports
    processFileDefinitions(importedExprs, env);
    await processImports(importedExprs, env, {
      verbose: options.verbose,
      baseDir: path.dirname(resolvedPath),
      tempDir,
      processedFiles,
      inProgressFiles,
      importMap,
      currentFile: resolvedPath,
    });
    
    // Process exports and define module
    const moduleExports = {};
    processFileExportsAndDefinitions(importedExprs, env, moduleExports, resolvedPath);
    env.importModule(moduleName, moduleExports);
    
    logger.debug(`Imported HQL module: ${moduleName}`);
  } catch (error) {
    wrapError(`Importing HQL module ${moduleName}`, error, modulePath, options.currentFile);
  } finally {
    env.setCurrentFile(previousCurrentFile);
    inProgressFiles.delete(resolvedPath);
    processedFiles.add(resolvedPath);
  }
}

/**
 * Load a JavaScript or TypeScript module
 */
async function loadJavaScriptModule(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  processedFiles: Set<string>,
): Promise<void> {
  try {
    // Handle TypeScript files specially
    if (resolvedPath.endsWith('.ts')) {
      logger.debug(`TypeScript import detected: ${resolvedPath}`);
      
      // Convert TypeScript to JavaScript
      const jsOutPath = resolvedPath.replace(/\.ts$/, '.js');
      await transpileTypeScriptToJavaScript(resolvedPath, jsOutPath);
      
      // Use the JavaScript file instead
      logger.debug(`Using transpiled JavaScript: ${jsOutPath}`);
      resolvedPath = jsOutPath;
      modulePath = modulePath.replace(/\.ts$/, '.js');
    }
    
    let finalModuleUrl = `file://${resolvedPath}`;
    
    // Check if JS file contains HQL imports or needs processing
    const jsSource = await Deno.readTextFile(resolvedPath);
    if (hasHqlImports(jsSource) || jsSource.includes('import') && jsSource.includes('from')) {
      logger.debug(`JS file ${resolvedPath} needs import processing.`);
      
      // Process the file and its imports recursively
      await processJavaScriptFile(resolvedPath);
      
      // Get the cached path
      const cachedPath = getImportMapping(resolvedPath);
      if (cachedPath) {
        finalModuleUrl = `file://${cachedPath}`;
        logger.debug(`Using cached JS file: ${cachedPath}`);
      }
    }
    
    // Import and register the module
    const module = await import(finalModuleUrl);
    env.importModule(moduleName, module);
    processedFiles.add(resolvedPath);
    
    logger.debug(`Imported JS module: ${moduleName} from ${finalModuleUrl}`);
  } catch (error) {
    throw new ImportError(
      `Importing JS module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      env.getCurrentFile(),
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Check if source code has HQL imports (local implementation)
 */
function hasHqlImports(source: string): boolean {
  return source.includes('.hql') && (
    source.includes('import') || 
    source.includes('require')
  );
}

/**
 * Transpile TypeScript to JavaScript using esbuild
 */
async function transpileTypeScriptToJavaScript(
  tsPath: string,
  jsPath: string
): Promise<void> {
  try {
    const esbuild = await import("https://deno.land/x/esbuild@v0.17.19/mod.js");
    
    await esbuild.build({
      entryPoints: [tsPath],
      outfile: jsPath,
      format: 'esm',
      target: 'es2020',
      bundle: false,
      platform: 'neutral',
    });
    
    logger.debug(`Transpiled ${tsPath} to ${jsPath}`);
  } catch (error) {
    throw new Error(`Failed to transpile TypeScript: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Load an NPM module
 */
async function loadNpmModule(
  moduleName: string,
  modulePath: string,
  env: Environment,
): Promise<void> {
  try {
    const packageName = modulePath.substring(4);
    
    // Try multiple CDNs in parallel for better reliability
    const importResults = await Promise.allSettled([
      import(modulePath),
      import(`https://esm.sh/${packageName}`),
      import(`https://cdn.skypack.dev/${packageName}`),
    ]);
    
    const successfulImport = importResults.find((result) => result.status === "fulfilled");
    
    if (successfulImport && successfulImport.status === "fulfilled") {
      env.importModule(moduleName, successfulImport.value);
      logger.debug(`Imported NPM module: ${moduleName} (${packageName})`);
    } else {
      const errors = importResults
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => formatErrorMessage(result.reason))
        .join("; ");
      
      throw new ImportError(
        `Failed to import from all sources (npm, esm.sh, skypack): ${errors}`,
        modulePath,
        env.getCurrentFile()
      );
    }
  } catch (error) {
    wrapError(`Importing NPM module ${moduleName}`, error, modulePath, env.getCurrentFile());
  }
}

/**
 * Load a JSR module
 */
async function loadJsrModule(
  moduleName: string,
  modulePath: string,
  env: Environment,
): Promise<void> {
  try {
    const module = await import(modulePath);
    env.importModule(moduleName, module);
    logger.debug(`Imported JSR module: ${moduleName}`);
  } catch (error) {
    wrapError(`Importing JSR module ${moduleName}`, error, modulePath, env.getCurrentFile());
  }
}

/**
 * Load an HTTP module
 */
async function loadHttpModule(
  moduleName: string,
  modulePath: string,
  env: Environment,
): Promise<void> {
  try {
    const module = await import(modulePath);
    env.importModule(moduleName, module);
    logger.debug(`Imported HTTP module: ${moduleName}`);
  } catch (error) {
    wrapError(`Importing HTTP module ${moduleName}`, error, modulePath, env.getCurrentFile());
  }
}

/**
 * Process file definitions (let, fn) for macros and variables
 */
function processFileDefinitions(
  exprs: SExp[],
  env: Environment,
): void {
  try {
    logger.debug("Processing file definitions for macros and variables");
    
    for (const expr of exprs) {
      if (expr.type !== "list" || expr.elements.length === 0 || !isSymbol(expr.elements[0])) {
        continue;
      }
      
      const op = expr.elements[0].name;
      
      if (op === "let" && expr.elements.length === 3) {
        processLetDefinition(expr, env);
      } else if (op === "fn" && expr.elements.length >= 4) {
        processFunctionDefinition(expr, env);
      }
    }
  } catch (error) {
    wrapError("Processing file definitions", error, env.getCurrentFile() || "");
  }
}

/**
 * Process a let definition
 */
function processLetDefinition(
  expr: SList,
  env: Environment,
): void {
  try {
    if (!isSymbol(expr.elements[1])) return;
    
    const name = expr.elements[1].name;
    const value = evaluateForMacro(expr.elements[2], env, logger);
    
    env.define(name, isLiteral(value) ? value.value : value);
    logger.debug(`Registered variable for macros: ${name}`);
  } catch (error) {
    const symbolName = isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown";
    wrapError(`Processing let declaration for '${symbolName}'`, error, env.getCurrentFile() || "");
  }
}

/**
 * Process a function definition
 */
function processFunctionDefinition(
  expr: SList,
  env: Environment,
): void {
  try {
    if (!isSymbol(expr.elements[1]) || expr.elements[2].type !== "list") return;
    
    const fnName = expr.elements[1].name;
    const fn = (...args: unknown[]) => {
      try {
        return `${fnName}(${args.join(", ")})`;
      } catch (error) {
        logger.error(`Error executing function ${fnName}: ${formatErrorMessage(error)}`);
        return null;
      }
    };
    
    Object.defineProperty(fn, "isDefFunction", { value: true });
    env.define(fnName, fn);
    
    logger.debug(`Registered function for macros: ${fnName}`);
  } catch (error) {
    const symbolName = isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown";
    wrapError(`Processing function declaration for '${symbolName}'`, error, env.getCurrentFile() || "");
  }
}

/**
 * Process file exports and definitions including macros
 */
function processFileExportsAndDefinitions(
  expressions: SExp[],
  env: Environment,
  moduleExports: Record<string, Value>,
  filePath: string,
): void {
  try {
    // Process macro definitions
    for (const expr of expressions) {
      if (expr.type === "list" && expr.elements.length > 0 && 
          isSymbol(expr.elements[0]) && expr.elements[0].name === "macro") {
        try {
          defineUserMacro(expr as SList, filePath, env, logger);
        } catch (error) {
          const macroName = expr.elements.length > 1 && isSymbol(expr.elements[1])
            ? expr.elements[1].name
            : "unknown";
          wrapError(`Error defining user macro for '${macroName}'`, error, filePath, filePath);
        }
      }
    }
    
    // Collect and process exports
    const exportDefinitions = collectExportDefinitions(expressions);
    
    for (const { name, value } of exportDefinitions) {
      try {
        // Check if it's a macro export
        if (env.hasModuleMacro(filePath, name)) {
          env.exportMacro(filePath, name);
          logger.debug(`Marked macro ${name} as exported from ${filePath}`);
          continue;
        }
        
        // Try to evaluate the export expression if present
        if (value) {
          try {
            const evaluatedValue = evaluateForMacro(value, env, logger);
            moduleExports[name] = evaluatedValue;
            logger.debug(`Added export "${name}" with evaluated expression`);
            continue;
          } catch (evalError) {
            logger.debug(`Failed to evaluate expression for export "${name}": ${formatErrorMessage(evalError)}`);
          }
        }
        
        // Fall back to looking up the value from environment
        try {
          const lookupValue = env.lookup(name);
          moduleExports[name] = lookupValue;
          logger.debug(`Added export "${name}" with looked-up value`);
        } catch (lookupError) {
          logger.warn(`Symbol not found for export: "${name}"`);
          
          // Special handling for HQL files
          if (filePath.endsWith(".hql")) {
            moduleExports[name] = null;
          } else {
            wrapError(`Lookup failed for export "${name}"`, lookupError, filePath, filePath);
          }
        }
      } catch (error) {
        if (!(error instanceof ValidationError && error.message.includes("Symbol not found"))) {
          wrapError(`Failed to export symbol "${name}"`, error, filePath, filePath);
        }
      }
    }
  } catch (error) {
    wrapError("Processing file exports and definitions", error, filePath, filePath);
  }
}