// src/s-exp/imports.ts - Refactored with better modularity and error handling

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { writeTextFile } from "../platform/platform.ts";
import {
  isImport,
  isLiteral,
  isSExpNamespaceImport,
  isSExpVectorImport,
  isSymbol,
  SExp,
  SList,
  SSymbol,
} from "./types.ts";
import { Environment, Value } from "../environment.ts";
import { defineUserMacro, evaluateForMacro } from "./macro.ts";
import { parse } from "./parser.ts";
import { Logger } from "../logger.ts";
import {
  ImportError,
  MacroError,
  ValidationError,
} from "../transpiler/errors.ts";
import { checkForHqlImports, processHqlImportsInJs } from "../bundler.ts";
import { registerTempFile } from "../temp-file-tracker.ts";
import {
  isHqlFile,
  isJavaScriptModule,
  isRemoteModule,
  isRemoteUrl,
  registerModulePath,
} from "../utils/import-utils.ts";

/**
 * Options for import processing
 */
interface ImportProcessorOptions {
  verbose?: boolean;
  baseDir?: string;
  tempDir?: string;
  processedFiles?: Set<string>;
  inProgressFiles?: Set<string>; // Track files currently being processed
  importMap?: Map<string, string>;
  currentFile?: string;
}

/**
 * Process all imports in a list of S-expressions
 */
export async function processImports(
  exprs: SExp[],
  env: Environment,
  options: ImportProcessorOptions = {},
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();

  // Store previous current file for restoration
  const previousCurrentFile = env.getCurrentFile();

  // Track processed imports to avoid duplicates
  const processedFiles = options.processedFiles || new Set<string>();
  const inProgressFiles = options.inProgressFiles || new Set<string>();
  const importMap = options.importMap || new Map<string, string>();

  try {
    setupEnvironmentAndTracking(env, options, inProgressFiles, logger);

    // Create temp directory in parallel with import analysis
    const [tempDir, importExprs] = await Promise.all([
      createTempDirIfNeeded(options, logger),
      analyzeImports(exprs, logger),
    ]);

    // Separate remote and local imports
    const { remoteImports, localImports } = categorizeImports(
      importExprs,
      logger,
    );

    // Process remote imports in parallel - these don't have local dependencies
    if (remoteImports.length > 0) {
      await processRemoteImportsInParallel(
        remoteImports,
        env,
        baseDir,
        options,
        tempDir,
        processedFiles,
        inProgressFiles,
        importMap,
        logger,
      );
    }

    // Process local imports sequentially to respect dependencies
    if (localImports.length > 0) {
      await processLocalImportsSequentially(
        localImports,
        env,
        baseDir,
        options,
        tempDir,
        processedFiles,
        inProgressFiles,
        importMap,
        logger,
      );
    }

    // Process definitions and exports
    if (options.currentFile) {
      processFileDefinitionsAndExports(exprs, env, options, logger);
    }

    // Mark current file as fully processed (not just in progress)
    finalizeFileProcessing(
      options.currentFile,
      inProgressFiles,
      processedFiles,
      logger,
    );
  } catch (error) {
    throw new ImportError(
      `Processing imports: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "imports",
      options.currentFile,
    );
  } finally {
    // Always restore the previous current file state
    env.setCurrentFile(previousCurrentFile);
  }
}

/**
 * Set up environment with current file and add file to tracking
 */
function setupEnvironmentAndTracking(
  env: Environment,
  options: ImportProcessorOptions,
  inProgressFiles: Set<string>,
  logger: Logger,
): void {
  if (options.currentFile) {
    env.setCurrentFile(options.currentFile);
    logger.debug(`Processing imports in file: ${options.currentFile}`);
    inProgressFiles.add(options.currentFile);
  }
}

/**
 * Create a temporary directory if needed
 */
async function createTempDirIfNeeded(
  options: ImportProcessorOptions,
  logger: Logger,
): Promise<string> {
  if (!options.tempDir) {
    try {
      const tempDir = await Deno.makeTempDir({ prefix: "hql_imports_" });
      logger.debug(`Created temporary directory: ${tempDir}`);
      return tempDir;
    } catch (error) {
      throw new ImportError(
        `Creating temporary directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "temp_dir",
        options.currentFile,
      );
    }
  }
  logger.debug(`Using existing temp directory: ${options.tempDir}`);
  return options.tempDir;
}

/**
 * Analyze and identify import expressions
 */
function analyzeImports(exprs: SExp[], logger: Logger): SList[] {
  const importExprs = exprs.filter((expr) =>
    isImport(expr) && expr.type === "list"
  ) as SList[];
  logger.debug(`Found ${importExprs.length} import expressions to process`);
  return importExprs;
}

/**
 * Categorize imports into remote and local
 */
function categorizeImports(importExprs: SList[], logger: Logger): {
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
  logger: Logger,
): Promise<void> {
  logger.debug(`Processing ${remoteImports.length} remote imports in parallel`);
  await Promise.all(remoteImports.map(async (importExpr) => {
    try {
      await processImport(importExpr, env, baseDir, {
        verbose: options.verbose,
        tempDir,
        processedFiles,
        inProgressFiles,
        importMap,
        currentFile: options.currentFile,
      });
    } catch (error) {
      const modulePath = getModulePathFromImport(importExpr);
      if (error instanceof ImportError) {
        throw error;
      } else {
        throw new ImportError(
          `Error processing import: ${
            error instanceof Error ? error.message : String(error)
          }`,
          modulePath,
          options.currentFile,
          error instanceof Error ? error : undefined,
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
  logger: Logger,
): Promise<void> {
  logger.debug(`Processing ${localImports.length} local imports sequentially`);
  for (const importExpr of localImports) {
    try {
      await processImport(importExpr, env, baseDir, {
        verbose: options.verbose,
        tempDir,
        processedFiles,
        inProgressFiles,
        importMap,
        currentFile: options.currentFile,
      });
    } catch (error) {
      const modulePath = getModulePathFromImport(importExpr);
      throw new ImportError(
        `Processing local import: ${
          error instanceof Error ? error.message : String(error)
        }`,
        modulePath,
        options.currentFile,
      );
    }
  }
}

/**
 * Process file definitions and exports
 */
function processFileDefinitionsAndExports(
  exprs: SExp[],
  env: Environment,
  options: ImportProcessorOptions,
  logger: Logger,
): void {
  try {
    processFileDefinitions(exprs, env, logger);
    processFileExportsAndDefinitions(
      exprs,
      env,
      {},
      options.currentFile!,
      logger,
    );
  } catch (error) {
    if (error instanceof MacroError) {
      throw error;
    }
    throw new ImportError(
      `Processing file definitions and exports: ${
        error instanceof Error ? error.message : String(error)
      }`,
      options.currentFile || "unknown",
      options.currentFile,
    );
  }
}

/**
 * Finalize file processing by marking complete and removing from in-progress
 */
function finalizeFileProcessing(
  currentFile: string | undefined,
  inProgressFiles: Set<string>,
  processedFiles: Set<string>,
  logger: Logger,
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
    }
  } catch (_e) {
    // Ignore errors
  }
  return "unknown";
}

// Type definition for SLiteral
interface SLiteral {
  type: "literal";
  value: string | number | boolean | null;
}

/**
 * Process a single import expression with support for the new vector syntax
 */
async function processImport(
  importExpr: SList,
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  const elements = importExpr.elements;
  const logger = new Logger(options.verbose || false);
  try {
    if (isSExpVectorImport(elements)) {
      await processVectorBasedImport(elements, env, baseDir, options);
    } else if (isSExpNamespaceImport(elements)) {
      await processNamespaceImport(elements, env, baseDir, options);
    } else {
      throw new ImportError(
        'Invalid import syntax, expected either (import [symbols] from "path") or (import name from "path")',
        "syntax-error",
        options.currentFile,
      );
    }
  } catch (error) {
    const modulePath = getModulePathFromImport(importExpr);
    throw new ImportError(
      `Processing import expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      modulePath,
      options.currentFile,
    );
  }
}

/**
 * Process namespace import with "from" syntax
 * Format: (import name from "path")
 */
async function processNamespaceImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  try {
    if (!isSymbol(elements[1])) {
      throw new ImportError(
        "Module name must be a symbol",
        "namespace import",
        options.currentFile,
      );
    }
    if (!isLiteral(elements[3]) || typeof elements[3].value !== "string") {
      throw new ImportError(
        "Module path must be a string literal",
        "namespace import",
        options.currentFile,
      );
    }
    const moduleName = (elements[1] as SSymbol).name;
    const modulePath = (elements[3] as SLiteral).value as string;
    registerModulePath(moduleName, modulePath);
    logger.debug(
      `Processing namespace import with "from": ${moduleName} from ${modulePath}`,
    );
    const resolvedPath = path.resolve(baseDir, modulePath);
    await loadModuleByType(
      moduleName,
      modulePath,
      resolvedPath,
      baseDir,
      env,
      options,
    );
  } catch (error) {
    throw new ImportError(
      `Processing namespace import: ${
        error instanceof Error ? error.message : String(error)
      }`,
      elements[3]?.type === "literal" ? String(elements[3].value) : "unknown",
      options.currentFile,
    );
  }
}

/**
 * Process elements in a vector, handling vector keyword and commas
 */
function processVectorElements(elements: SExp[]): SExp[] {
  try {
    let startIndex = 0;
    if (
      elements.length > 0 &&
      elements[0].type === "symbol" &&
      (elements[0] as SSymbol).name === "vector"
    ) {
      startIndex = 1;
    }
    return elements.slice(startIndex).filter((elem) =>
      !(elem.type === "symbol" && (elem as SSymbol).name === ",")
    );
  } catch (error) {
    throw new ImportError(
      `Processing vector elements: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "vector",
      "unknown",
    );
  }
}

/**
 * Process vector-based import
 */
async function processVectorBasedImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  const logger = new Logger(options.verbose);
  try {
    if (elements[1].type !== "list") {
      throw new ImportError(
        "Import vector must be a list",
        "syntax-error",
        options.currentFile,
      );
    }
    const symbolsVector = elements[1] as SList;
    if (!isLiteral(elements[3]) || typeof elements[3].value !== "string") {
      throw new ImportError(
        "Module path must be a string literal",
        "syntax-error",
        options.currentFile,
      );
    }
    const modulePath = elements[3].value as string;
    const resolvedPath = path.resolve(baseDir, modulePath);
    const tempModuleName = `__temp_module_${
      modulePath.replace(/[^a-zA-Z0-9_]/g, "_")
    }`;
    await loadModuleByType(
      tempModuleName,
      modulePath,
      resolvedPath,
      baseDir,
      env,
      options,
    );
    const vectorElements = processVectorElements(symbolsVector.elements);
    const requestedSymbols = extractSymbolsAndAliases(vectorElements);
    if (options.currentFile && modulePath.endsWith(".hql")) {
      processMacrosAndValuesFromHQL(
        requestedSymbols,
        resolvedPath,
        tempModuleName,
        env,
        options.currentFile,
        logger,
      );
    } else {
      processRegularImports(
        requestedSymbols,
        modulePath,
        tempModuleName,
        env,
        options.currentFile,
        logger,
      );
    }
  } catch (error) {
    throw new ImportError(
      `Processing vector import: ${
        error instanceof Error ? error.message : String(error)
      }`,
      elements[3]?.type === "literal" ? String(elements[3].value) : "unknown",
      options.currentFile,
    );
  }
}

/**
 * Extract symbols and their aliases from vector elements
 */
function extractSymbolsAndAliases(
  vectorElements: SExp[],
): Map<string, string | null> {
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
 * Process and import the requested symbols for HQL files
 */
function processMacrosAndValuesFromHQL(
  requestedSymbols: Map<string, string | null>,
  resolvedPath: string,
  tempModuleName: string,
  env: Environment,
  currentFile: string,
  logger: Logger,
): void {
  for (const [symbolName, aliasName] of requestedSymbols.entries()) {
    const isMacro = env.hasModuleMacro(resolvedPath, symbolName);
    if (isMacro) {
      const success = env.importMacro(
        resolvedPath,
        symbolName,
        currentFile,
        aliasName || undefined,
      );
      if (success) {
        logger.debug(
          `Imported macro ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`,
        );
      } else {
        logger.warn(
          `Failed to import macro ${symbolName} from ${resolvedPath}`,
        );
      }
    }
    try {
      const moduleLookupKey = `${tempModuleName}.${symbolName}`;
      const value = env.lookup(moduleLookupKey);
      env.define(aliasName || symbolName, value);
      logger.debug(
        `Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`,
      );
    } catch (error) {
      if (!isMacro) {
        logger.debug(`Symbol not found in module: ${symbolName}`);
        throw new ImportError(
          `Symbol '${symbolName}' not found in module '${resolvedPath}'`,
          resolvedPath,
          currentFile,
          error instanceof Error ? error : undefined,
        );
      }
    }
  }
}

/**
 * Process regular imports from non-HQL files
 */
function processRegularImports(
  requestedSymbols: Map<string, string | null>,
  modulePath: string,
  tempModuleName: string,
  env: Environment,
  currentFile: string | undefined,
  logger: Logger,
): void {
  for (const [symbolName, aliasName] of requestedSymbols.entries()) {
    try {
      const moduleLookupKey = `${tempModuleName}.${symbolName}`;
      const value = env.lookup(moduleLookupKey);
      env.define(aliasName || symbolName, value);
      logger.debug(
        `Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`,
      );
    } catch (error) {
      logger.debug(`Symbol not found in module: ${symbolName}`);
      throw new ImportError(
        `Symbol '${symbolName}' not found in module '${modulePath}'`,
        modulePath,
        currentFile,
        error instanceof Error ? error : undefined,
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
  options: ImportProcessorOptions,
): Promise<void> {
  const logger = new Logger(options.verbose);
  const processedFiles = options.processedFiles!;
  const inProgressFiles = options.inProgressFiles!;
  try {
    if (processedFiles.has(resolvedPath)) {
      logger.debug(`Skipping already processed import: ${resolvedPath}`);
      return;
    }
    if (inProgressFiles.has(resolvedPath)) {
      logger.debug(
        `Detected circular import for ${resolvedPath}, will be resolved by parent process`,
      );
      return;
    }
    if (isRemoteModule(modulePath)) {
      await loadRemoteModule(moduleName, modulePath, env, logger);
    } else if (isHqlFile(modulePath)) {
      await loadHqlModule(
        moduleName,
        modulePath,
        resolvedPath,
        baseDir,
        env,
        processedFiles,
        inProgressFiles,
        logger,
        options,
      );
    } else if (isJavaScriptModule(modulePath)) {
      await loadJavaScriptModule(
        moduleName,
        modulePath,
        resolvedPath,
        env,
        logger,
        processedFiles,
      );
    } else {
      throw new ImportError(
        `Unsupported import file type: ${modulePath}`,
        modulePath,
        options.currentFile,
      );
    }
  } catch (error) {
    throw new ImportError(
      `Loading module ${moduleName} from ${modulePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      modulePath,
      options.currentFile,
    );
  }
}

/**
 * Load a remote module (npm:, jsr:, http:)
 */
async function loadRemoteModule(
  moduleName: string,
  modulePath: string,
  env: Environment,
  logger: Logger,
): Promise<void> {
  if (modulePath.startsWith("npm:")) {
    await processNpmImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith("jsr:")) {
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
  options: ImportProcessorOptions,
): Promise<void> {
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
    options,
  );
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
  processedFiles: Set<string>,
): Promise<void> {
  await processJsImport(
    moduleName,
    modulePath,
    resolvedPath,
    env,
    logger,
    processedFiles,
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
  options: ImportProcessorOptions,
): Promise<void> {
  const previousCurrentFile = env.getCurrentFile();
  try {
    const fileContent = await readFile(resolvedPath, options.currentFile);
    const importedExprs = parseHqlContent(
      fileContent,
      resolvedPath,
      options.currentFile,
    );
    env.setCurrentFile(resolvedPath);
    processFileDefinitions(importedExprs, env, logger);
    // Inlined nested imports instead of using a separate wrapper
    await processImports(importedExprs, env, {
      verbose: options.verbose,
      baseDir: path.dirname(resolvedPath),
      tempDir,
      processedFiles,
      inProgressFiles,
      importMap,
      currentFile: resolvedPath,
    });
    const moduleExports = processExports(
      importedExprs,
      env,
      resolvedPath,
      logger,
    );
    env.importModule(moduleName, moduleExports);
    logger.debug(`Imported HQL module: ${moduleName}`);
  } catch (error) {
    throw new ImportError(
      `Importing HQL module ${moduleName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      modulePath,
      options.currentFile,
    );
  } finally {
    env.setCurrentFile(previousCurrentFile);
  }
}

/**
 * Read a file with error handling
 */
async function readFile(
  filePath: string,
  currentFile: string | undefined,
): Promise<string> {
  try {
    return await Deno.readTextFile(filePath);
  } catch (error) {
    throw new ImportError(
      `Reading file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath,
      currentFile,
    );
  }
}

/**
 * Parse HQL content
 */
function parseHqlContent(
  content: string,
  filePath: string,
  currentFile: string | undefined,
): SExp[] {
  try {
    return parse(content);
  } catch (error) {
    throw new ImportError(
      `Parsing file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath,
      currentFile,
    );
  }
}

/**
 * Process exports and create module exports object
 */
function processExports(
  importedExprs: SExp[],
  env: Environment,
  resolvedPath: string,
  logger: Logger,
): Record<string, Value> {
  const moduleExports: Record<string, Value> = {};
  processFileExportsAndDefinitions(
    importedExprs,
    env,
    moduleExports,
    resolvedPath,
    logger,
  );
  return moduleExports;
}

/**
 * Process JavaScript imports with temporary file tracking
 */
async function processJsImport(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  logger: Logger,
  processedFiles: Set<string>,
): Promise<void> {
  try {
    let finalModuleUrl = `file://${resolvedPath}`;
    const jsSource = await Deno.readTextFile(resolvedPath);
    if (checkForHqlImports(jsSource, logger)) {
      logger.debug(
        `JS file ${resolvedPath} contains nested HQL imports. Pre-processing them.`,
      );
      const processedSource = await processHqlImportsInJs(
        jsSource,
        resolvedPath,
        {},
        logger,
      );
      const tempFilePath = resolvedPath.replace(/\.js$/, ".temp.js");
      await writeTextFile(tempFilePath, processedSource);
      registerTempFile(tempFilePath);
      finalModuleUrl = `file://${tempFilePath}`;
      logger.debug(
        `Wrote pre-processed JS to temporary file: ${tempFilePath}`,
      );
    }
    const module = await import(finalModuleUrl);
    env.importModule(moduleName, module);
    processedFiles.add(resolvedPath);
    logger.debug(`Imported JS module: ${moduleName} from ${finalModuleUrl}`);
  } catch (error) {
    throw new ImportError(
      `Importing JS module ${moduleName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      modulePath,
      env.getCurrentFile(),
    );
  }
}

/**
 * Process npm: imports with parallel CDN fallbacks
 */
async function processNpmImport(
  moduleName: string,
  modulePath: string,
  env: Environment,
  logger: Logger,
): Promise<void> {
  try {
    const packageName = modulePath.substring(4);
    const importResults = await Promise.allSettled([
      import(modulePath),
      import(`https://esm.sh/${packageName}`),
      import(`https://cdn.skypack.dev/${packageName}`),
    ]);
    const successfulImport = importResults.find((result) =>
      result.status === "fulfilled"
    );
    if (successfulImport && successfulImport.status === "fulfilled") {
      const module = successfulImport.value;
      env.importModule(moduleName, module);
      logger.debug(`Imported NPM module: ${moduleName} (${packageName})`);
    } else {
      const errors = importResults
        .filter((result): result is PromiseRejectedResult =>
          result.status === "rejected"
        )
        .map((result) => result.reason)
        .map((error) => error instanceof Error ? error.message : String(error))
        .join("; ");
      throw new ImportError(
        `Failed to import from all sources (npm, esm.sh, skypack): ${errors}`,
        modulePath,
        env.getCurrentFile(),
      );
    }
  } catch (error) {
    throw new ImportError(
      `Importing NPM module ${moduleName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      modulePath,
      env.getCurrentFile(),
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
  logger: Logger,
): Promise<void> {
  try {
    const module = await import(modulePath);
    env.importModule(moduleName, module);
    logger.debug(`Imported JSR module: ${moduleName}`);
  } catch (error) {
    throw new ImportError(
      `Importing JSR module ${moduleName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      modulePath,
      env.getCurrentFile(),
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
  logger: Logger,
): Promise<void> {
  try {
    const module = await import(modulePath);
    env.importModule(moduleName, module);
    logger.debug(`Imported HTTP module: ${moduleName}`);
  } catch (error) {
    throw new ImportError(
      `Importing HTTP module ${moduleName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      modulePath,
      env.getCurrentFile(),
    );
  }
}

/**
 * Helper function to process file definitions for macros
 */
function processFileDefinitions(
  exprs: SExp[],
  env: Environment,
  logger: Logger,
): void {
  try {
    logger.debug("Processing file definitions for macros and variables");
    for (const expr of exprs) {
      if (
        expr.type !== "list" || expr.elements.length === 0 ||
        !isSymbol(expr.elements[0])
      ) continue;
      const op = expr.elements[0].name;
      if (op === "def" && expr.elements.length === 3) {
        try {
          processDefDeclaration(expr, env, logger);
        } catch (error) {
          const symbolName = isSymbol(expr.elements[1])
            ? expr.elements[1].name
            : "unknown";
          throw new MacroError(
            `Error processing def declaration for '${symbolName}': ${
              error instanceof Error ? error.message : String(error)
            }`,
            symbolName,
            env.getCurrentFile(),
            error instanceof Error ? error : undefined,
          );
        }
      } else if (op === "defn" && expr.elements.length >= 4) {
        try {
          processDefnDeclaration(expr, env, logger);
        } catch (error) {
          const symbolName = isSymbol(expr.elements[1])
            ? expr.elements[1].name
            : "unknown";
          throw new MacroError(
            `Error processing defn declaration for '${symbolName}': ${
              error instanceof Error ? error.message : String(error)
            }`,
            symbolName,
            env.getCurrentFile(),
            error instanceof Error ? error : undefined,
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof MacroError) {
      throw error;
    }
    throw new MacroError(
      `Processing file definitions: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "",
      env.getCurrentFile(),
    );
  }
}

/**
 * Process a def declaration
 */
function processDefDeclaration(
  expr: SList,
  env: Environment,
  logger: Logger,
): void {
  try {
    if (!isSymbol(expr.elements[1])) return;
    const name = expr.elements[1].name;
    const value = evaluateForMacro(expr.elements[2], env, logger);
    if (isLiteral(value)) {
      env.define(name, value.value);
    } else {
      env.define(name, value);
    }
    logger.debug(`Registered variable for macros: ${name}`);
  } catch (error) {
    const symbolName = isSymbol(expr.elements[1])
      ? expr.elements[1].name
      : "unknown";
    throw new MacroError(
      `Processing def declaration for ${symbolName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      symbolName,
      env.getCurrentFile(),
    );
  }
}

/**
 * Process a defn declaration
 */
function processDefnDeclaration(
  expr: SList,
  env: Environment,
  logger: Logger,
): void {
  try {
    if (!isSymbol(expr.elements[1]) || expr.elements[2].type !== "list") {
      return;
    }
    const fnName = expr.elements[1].name;
    const fn = (...args: unknown[]) => {
      try {
        return `${fnName}(${args.join(", ")})`;
      } catch (e) {
        logger.error(
          `Error executing function ${fnName}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        return null;
      }
    };
    Object.defineProperty(fn, "isDefFunction", { value: true });
    env.define(fnName, fn);
    logger.debug(`Registered function for macros: ${fnName}`);
  } catch (error) {
    const symbolName = isSymbol(expr.elements[1])
      ? expr.elements[1].name
      : "unknown";
    throw new MacroError(
      `Processing defn declaration for ${symbolName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      symbolName,
      env.getCurrentFile(),
    );
  }
}

// Enhanced export tracking in src/s-exp/imports.ts

function processFileExportsAndDefinitions(
  expressions: SExp[],
  env: Environment,
  moduleExports: Record<string, Value>,
  filePath: string,
  logger: Logger,
): void {
  try {
    // First register all exports to collect them
    const exportDefinitions: { name: string; value: SExp | null }[] = [];

    // Process macros first to make them available early
    for (const expr of expressions) {
      if (
        expr.type === "list" && expr.elements.length > 0 &&
        isSymbol(expr.elements[0]) && expr.elements[0].name === "macro"
      ) {
        try {
          defineUserMacro(expr as SList, filePath, env, logger);
        } catch (error) {
          if (error instanceof MacroError) {
            throw error;
          }

          const macroName =
            expr.elements.length > 1 && isSymbol(expr.elements[1])
              ? expr.elements[1].name
              : "unknown";
          throw new MacroError(
            `Error defining user macro: ${
              error instanceof Error ? error.message : String(error)
            }`,
            macroName,
            filePath,
            error instanceof Error ? error : undefined,
          );
        }
      }
    }

    // Collect all exports
    for (const expr of expressions) {
      if (
        expr.type === "list" && expr.elements.length > 0 &&
        isSymbol(expr.elements[0]) && expr.elements[0].name === "export"
      ) {
        // Handle vector exports: (export [symbol1, symbol2, ...])
        if (expr.elements.length === 2 && expr.elements[1].type === "list") {
          const vectorElements = (expr.elements[1] as SList).elements;
          const elements = processVectorElements(vectorElements);

          for (const elem of elements) {
            if (isSymbol(elem)) {
              const symbolName = (elem as SSymbol).name;
              exportDefinitions.push({ name: symbolName, value: null });
              logger.debug(`Collected vector export: ${symbolName}`);
            }
          }
        } // Handle string-based exports with expression: (export "name" expr)
        else if (
          expr.elements.length === 3 &&
          expr.elements[1].type === "literal" &&
          typeof (expr.elements[1] as SLiteral).value === "string"
        ) {
          const exportName = (expr.elements[1] as SLiteral).value as string;
          const exportValue = expr.elements[2]; // Store the actual expression

          // Store both the name and expression for later evaluation
          exportDefinitions.push({ name: exportName, value: exportValue });
          logger.debug(
            `Collected string export with expression: "${exportName}"`,
          );
        }
      }
    }

    // Process all exports
    for (const { name, value } of exportDefinitions) {
      try {
        // Handle macro exports
        if (env.hasModuleMacro(filePath, name)) {
          env.exportMacro(filePath, name);
          logger.debug(`Marked macro ${name} as exported from ${filePath}`);
          continue;
        }

        // Handle exports with expressions
        if (value) {
          try {
            // Evaluate the expression to get the result
            const evaluatedValue = evaluateForMacro(value, env, logger);
            moduleExports[name] = evaluatedValue;
            logger.debug(`Added export "${name}" with evaluated expression`);
            continue;
          } catch (evalError) {
            logger.debug(
              `Failed to evaluate expression for export "${name}": ${
                evalError instanceof Error
                  ? evalError.message
                  : String(evalError)
              }`,
            );
            // Fall through to symbol lookup as fallback
          }
        }

        // Fall back to symbol lookup for regular variables
        try {
          const lookupValue = env.lookup(name);
          moduleExports[name] = lookupValue;
          logger.debug(`Added export "${name}" with looked-up value`);
        } catch (lookupError) {
          // If symbol doesn't exist in a .hql file, just log a warning
          logger.warn(`Symbol not found for export: "${name}"`);
          if (filePath.endsWith(".hql")) {
            // Add a placeholder to maintain backward compatibility
            moduleExports[name] = null;
          } else {
            throw lookupError;
          }
        }
      } catch (error) {
        // Only throw if we can't recover
        if (
          !(error instanceof ValidationError &&
            error.message.includes("Symbol not found"))
        ) {
          logger.debug(
            `Failed to export symbol "${name}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw new ImportError(
            `Failed to export symbol "${name}": ${
              error instanceof Error ? error.message : String(error)
            }`,
            filePath,
            filePath,
            error instanceof Error ? error : undefined,
          );
        }
      }
    }
  } catch (error) {
    throw new ImportError(
      `Processing file exports and definitions: ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath,
      filePath,
    );
  }
}

// Helper function to collect exported symbol names
function collectExportedSymbols(
  exportExpr: SList,
  exportedSymbols: Set<string>,
  logger: Logger,
): void {
  try {
    // Handle vector-based exports: (export [symbol1, symbol2, ...])
    if (
      exportExpr.elements.length === 2 && exportExpr.elements[1].type === "list"
    ) {
      const vectorElements = (exportExpr.elements[1] as SList).elements;
      // Process the vector elements, filtering out commas
      const elements = processVectorElements(vectorElements);

      for (const elem of elements) {
        if (isSymbol(elem)) {
          const symbolName = (elem as SSymbol).name;
          exportedSymbols.add(symbolName);
          logger.debug(`Collected vector export: ${symbolName}`);
        }
      }
    } // Handle string-based exports: (export "name" value)
    else if (
      exportExpr.elements.length === 3 &&
      exportExpr.elements[1].type === "literal" &&
      typeof (exportExpr.elements[1] as SLiteral).value === "string"
    ) {
      const exportName = (exportExpr.elements[1] as SLiteral).value as string;

      // If the third element is a symbol, use its name
      if (exportExpr.elements[2].type === "symbol") {
        const symbolName = (exportExpr.elements[2] as SSymbol).name;
        exportedSymbols.add(symbolName);
        logger.debug(
          `Collected string export: "${exportName}" -> ${symbolName}`,
        );
      } else {
        // Otherwise use the export name itself
        exportedSymbols.add(exportName);
        logger.debug(`Collected string export: ${exportName}`);
      }
    }
  } catch (error) {
    logger.warn(
      `Error collecting exported symbols: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
