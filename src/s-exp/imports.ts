// src/s-exp/imports.ts

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
 * --- Helper Functions ---
 */

/** Creates a logger instance from options */
function createLogger(options: ImportProcessorOptions): Logger {
  return new Logger(options.verbose || false);
}

/** Formats an error message */
function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Throws a new ImportError with a formatted message.
 * This helps remove duplicate try/catch error message formatting.
 */
function wrapError(
  context: string,
  error: unknown,
  modulePath: string,
  currentFile?: string,
): never {
  throw new ImportError(
    `${context}: ${formatErrorMessage(error)}`,
    modulePath,
    currentFile,
    error instanceof Error ? error : undefined,
  );
}

/**
 * Process all imports in a list of S-expressions.
 */
export async function processImports(
  exprs: SExp[],
  env: Environment,
  options: ImportProcessorOptions = {},
): Promise<void> {
  const logger = createLogger(options);
  const baseDir = options.baseDir || Deno.cwd();
  const previousCurrentFile = env.getCurrentFile();

  const processedFiles = options.processedFiles || new Set<string>();
  const inProgressFiles = options.inProgressFiles || new Set<string>();
  const importMap = options.importMap || new Map<string, string>();

  try {
    // Setup environment and tracking for current file
    if (options.currentFile) {
      env.setCurrentFile(options.currentFile);
      logger.debug(`Processing imports in file: ${options.currentFile}`);
      inProgressFiles.add(options.currentFile);
    }

    // In parallel: create a temporary directory (if needed) and analyze imports
    const [tempDir, importExprs] = await Promise.all([
      createTempDirIfNeeded(options, logger),
      analyzeImports(exprs, logger),
    ]);

    const { remoteImports, localImports } = categorizeImports(importExprs, logger);

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

    if (options.currentFile) {
      processFileDefinitionsAndExports(exprs, env, options, logger);
    }

    finalizeFileProcessing(options.currentFile, inProgressFiles, processedFiles, logger);
  } catch (error) {
    wrapError("Processing imports", error, options.currentFile || "imports", options.currentFile);
  } finally {
    env.setCurrentFile(previousCurrentFile);
  }
}

/**
 * Create a temporary directory if needed.
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
      wrapError("Creating temporary directory", error, "temp_dir", options.currentFile);
    }
  }
  logger.debug(`Using existing temp directory: ${options.tempDir}`);
  return options.tempDir;
}

/**
 * Analyze and identify import expressions.
 */
function analyzeImports(exprs: SExp[], logger: Logger): SList[] {
  const importExprs = exprs.filter((expr) => isImport(expr) && expr.type === "list") as SList[];
  logger.debug(`Found ${importExprs.length} import expressions to process`);
  return importExprs;
}

/**
 * Categorize imports into remote and local.
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
 * Process remote imports in parallel.
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
  await Promise.all(
    remoteImports.map(async (importExpr) => {
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
        wrapError("Error processing import", error, modulePath, options.currentFile);
      }
    }),
  );
}

/**
 * Process local imports sequentially.
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
      wrapError("Processing local import", error, modulePath, options.currentFile);
    }
  }
}

/**
 * Process file definitions and exports.
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
    if (error instanceof MacroError) throw error;
    wrapError("Processing file definitions and exports", error, options.currentFile || "unknown", options.currentFile);
  }
}

/**
 * Finalize file processing by updating tracking sets.
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
 * Extract the module path from an import expression.
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
    // Ignore errors and fall through.
  }
  return "unknown";
}

// --- Type definition for literals ---
interface SLiteral {
  type: "literal";
  value: string | number | boolean | null;
}

/**
 * Process a single import expression.
 */
async function processImport(
  importExpr: SList,
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  const elements = importExpr.elements;
  const logger = createLogger(options);
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
    wrapError("Processing import expression", error, modulePath, options.currentFile);
  }
}

/**
 * Process namespace import with "from" syntax.
 * Format: (import name from "path")
 */
async function processNamespaceImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  const logger = createLogger(options);
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
    await loadModuleByType(
      moduleName,
      modulePath,
      resolvedPath,
      baseDir,
      env,
      options,
    );
  } catch (error) {
    const modulePath =
      elements[3]?.type === "literal" ? String(elements[3].value) : "unknown";
    wrapError("Processing namespace import", error, modulePath, options.currentFile);
  }
}

/**
 * Process elements in a vector, handling vector keyword and commas.
 */
function processVectorElements(elements: SExp[]): SExp[] {
  try {
    let startIndex = 0;
    if (elements.length > 0 && elements[0].type === "symbol" && (elements[0] as SSymbol).name === "vector") {
      startIndex = 1;
    }
    return elements.slice(startIndex).filter((elem) =>
      !(elem.type === "symbol" && (elem as SSymbol).name === ",")
    );
  } catch (error) {
    wrapError("Processing vector elements", error, "vector", "unknown");
  }
}

/**
 * Process vector-based import.
 */
async function processVectorBasedImport(
  elements: SExp[],
  env: Environment,
  baseDir: string,
  options: ImportProcessorOptions,
): Promise<void> {
  const logger = createLogger(options);
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
    const modulePath =
      elements[3]?.type === "literal" ? String(elements[3].value) : "unknown";
    wrapError("Processing vector import", error, modulePath, options.currentFile);
  }
}

/**
 * Extract symbols and their aliases from vector elements.
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
 * Process and import the requested symbols for HQL files.
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
      const success = env.importMacro(resolvedPath, symbolName, currentFile, aliasName || undefined);
      if (success) {
        logger.debug(`Imported macro ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`);
      } else {
        logger.warn(`Failed to import macro ${symbolName} from ${resolvedPath}`);
      }
    }
    try {
      const moduleLookupKey = `${tempModuleName}.${symbolName}`;
      const value = env.lookup(moduleLookupKey);
      env.define(aliasName || symbolName, value);
      logger.debug(`Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`);
    } catch (error) {
      if (!isMacro) {
        logger.debug(`Symbol not found in module: ${symbolName}`);
        wrapError(
          `Symbol '${symbolName}' not found in module '${resolvedPath}'`,
          error,
          resolvedPath,
          currentFile,
        );
      }
    }
  }
}

/**
 * Process regular imports from non-HQL files.
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
      logger.debug(`Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`);
    } catch (error) {
      logger.debug(`Symbol not found in module: ${symbolName}`);
      wrapError(
        `Symbol '${symbolName}' not found in module '${modulePath}'`,
        error,
        modulePath,
        currentFile,
      );
    }
  }
}

/**
 * Load a module based on its file type, with improved circular dependency handling.
 */
async function loadModuleByType(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  baseDir: string,
  env: Environment,
  options: ImportProcessorOptions,
): Promise<void> {
  const logger = createLogger(options);
  const processedFiles = options.processedFiles!;
  const inProgressFiles = options.inProgressFiles!;
  try {
    if (processedFiles.has(resolvedPath)) {
      logger.debug(`Skipping already processed import: ${resolvedPath}`);
      return;
    }
    if (inProgressFiles.has(resolvedPath)) {
      logger.debug(`Detected circular import for ${resolvedPath}, will be resolved by parent process`);
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
      await loadJavaScriptModule(moduleName, modulePath, resolvedPath, env, logger, processedFiles);
    } else {
      throw new ImportError(`Unsupported import file type: ${modulePath}`, modulePath, options.currentFile);
    }
  } catch (error) {
    wrapError(`Loading module ${moduleName} from ${modulePath}`, error, modulePath, options.currentFile);
  }
}

/**
 * Load a remote module (npm:, jsr:, http:).
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
 * Load an HQL module.
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
 * Load a JavaScript module.
 */
async function loadJavaScriptModule(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  logger: Logger,
  processedFiles: Set<string>,
): Promise<void> {
  await processJsImport(moduleName, modulePath, resolvedPath, env, logger, processedFiles);
}

/**
 * Process HQL file import with improved circular dependency handling.
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
    const importedExprs = parseHqlContent(fileContent, resolvedPath, options.currentFile);
    env.setCurrentFile(resolvedPath);
    processFileDefinitions(importedExprs, env, logger);
    await processImports(importedExprs, env, {
      verbose: options.verbose,
      baseDir: path.dirname(resolvedPath),
      tempDir,
      processedFiles,
      inProgressFiles,
      importMap,
      currentFile: resolvedPath,
    });
    const moduleExports = processExports(importedExprs, env, resolvedPath, logger);
    env.importModule(moduleName, moduleExports);
    logger.debug(`Imported HQL module: ${moduleName}`);
  } catch (error) {
    wrapError(`Importing HQL module ${moduleName}`, error, modulePath, options.currentFile);
  } finally {
    env.setCurrentFile(previousCurrentFile);
  }
}

/**
 * Read a file with error handling.
 */
async function readFile(
  filePath: string,
  currentFile: string | undefined,
): Promise<string> {
  try {
    return await Deno.readTextFile(filePath);
  } catch (error) {
    wrapError(`Reading file ${filePath}`, error, filePath, currentFile);
  }
}

/**
 * Parse HQL content.
 */
function parseHqlContent(
  content: string,
  filePath: string,
  currentFile: string | undefined,
): SExp[] {
  try {
    return parse(content);
  } catch (error) {
    wrapError(`Parsing file ${filePath}`, error, filePath, currentFile);
  }
}

/**
 * Process exports and create a module exports object.
 */
function processExports(
  importedExprs: SExp[],
  env: Environment,
  resolvedPath: string,
  logger: Logger,
): Record<string, Value> {
  const moduleExports: Record<string, Value> = {};
  processFileExportsAndDefinitions(importedExprs, env, moduleExports, resolvedPath, logger);
  return moduleExports;
}

/**
 * Process JavaScript imports with temporary file tracking.
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
      logger.debug(`JS file ${resolvedPath} contains nested HQL imports. Pre-processing them.`);
      const processedSource = await processHqlImportsInJs(jsSource, resolvedPath, {}, logger);
      const tempFilePath = resolvedPath.replace(/\.js$/, ".temp.js");
      await writeTextFile(tempFilePath, processedSource);
      registerTempFile(tempFilePath);
      finalModuleUrl = `file://${tempFilePath}`;
      logger.debug(`Wrote pre-processed JS to temporary file: ${tempFilePath}`);
    }
    const module = await import(finalModuleUrl);
    env.importModule(moduleName, module);
    processedFiles.add(resolvedPath);
    logger.debug(`Imported JS module: ${moduleName} from ${finalModuleUrl}`);
  } catch (error) {
    wrapError(`Importing JS module ${moduleName}`, error, modulePath, env.getCurrentFile());
  }
}

/**
 * Process npm: imports with parallel CDN fallbacks.
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
    const successfulImport = importResults.find((result) => result.status === "fulfilled");
    if (successfulImport && successfulImport.status === "fulfilled") {
      env.importModule(moduleName, successfulImport.value);
      logger.debug(`Imported NPM module: ${moduleName} (${packageName})`);
    } else {
      const errors = importResults
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => formatErrorMessage(result.reason))
        .join("; ");
      throw new ImportError(`Failed to import from all sources (npm, esm.sh, skypack): ${errors}`, modulePath, env.getCurrentFile());
    }
  } catch (error) {
    wrapError(`Importing NPM module ${moduleName}`, error, modulePath, env.getCurrentFile());
  }
}

/**
 * Process jsr: imports.
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
    wrapError(`Importing JSR module ${moduleName}`, error, modulePath, env.getCurrentFile());
  }
}

/**
 * Process http(s): imports.
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
    wrapError(`Importing HTTP module ${moduleName}`, error, modulePath, env.getCurrentFile());
  }
}

/**
 * Process file definitions for macros and variables.
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
        expr.type !== "list" || expr.elements.length === 0 || !isSymbol(expr.elements[0])
      ) continue;
      const op = expr.elements[0].name;
      if (op === "let" && expr.elements.length === 3) {
        processLetDeclaration(expr, env, logger);
      } else if (op === "fn" && expr.elements.length >= 4) {
        processFnDeclaration(expr, env, logger);
      }
    }
  } catch (error) {
    if (error instanceof MacroError) throw error;
    wrapError("Processing file definitions", error, env.getCurrentFile() || "");
  }
}

/**
 * Process a let declaration.
 */
function processLetDeclaration(
  expr: SList,
  env: Environment,
  logger: Logger,
): void {
  try {
    if (!isSymbol(expr.elements[1])) return;
    const name = expr.elements[1].name;
    const value = evaluateForMacro(expr.elements[2], env, logger);
    env.define(name, isLiteral(value) ? value.value : value);
    logger.debug(`Registered variable for macros: ${name}`);
  } catch (error) {
    const symbolName = isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown";
    wrapError(`Processing def declaration for '${symbolName}'`, error, env.getCurrentFile() || "");
  }
}

/**
 * Process a fn declaration.
 */
function processFnDeclaration(
  expr: SList,
  env: Environment,
  logger: Logger,
): void {
  try {
    if (!isSymbol(expr.elements[1]) || expr.elements[2].type !== "list") return;
    const fnName = expr.elements[1].name;
    const fn = (...args: unknown[]) => {
      try {
        return `${fnName}(${args.join(", ")})`;
      } catch (e) {
        logger.error(`Error executing function ${fnName}: ${formatErrorMessage(e)}`);
        return null;
      }
    };
    Object.defineProperty(fn, "isDefFunction", { value: true });
    env.define(fnName, fn);
    logger.debug(`Registered function for macros: ${fnName}`);
  } catch (error) {
    const symbolName = isSymbol(expr.elements[1]) ? expr.elements[1].name : "unknown";
    wrapError(`Processing defn declaration for '${symbolName}'`, error, env.getCurrentFile() || "");
  }
}

/**
 * Enhanced export tracking.
 */
function processFileExportsAndDefinitions(
  expressions: SExp[],
  env: Environment,
  moduleExports: Record<string, Value>,
  filePath: string,
  logger: Logger,
): void {
  try {
    // First process user macros
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
    const exportDefinitions: { name: string; value: SExp | null }[] = [];
    for (const expr of expressions) {
      if (
        expr.type === "list" && expr.elements.length > 0 &&
        isSymbol(expr.elements[0]) && expr.elements[0].name === "export"
      ) {
        if (expr.elements.length === 2 && expr.elements[1].type === "list") {
          const vectorElements = (expr.elements[1] as SList).elements;
          const elements = processVectorElements(vectorElements);
          for (const elem of elements) {
            if (isSymbol(elem)) {
              exportDefinitions.push({ name: (elem as SSymbol).name, value: null });
              logger.debug(`Collected vector export: ${(elem as SSymbol).name}`);
            }
          }
        } else if (
          expr.elements.length === 3 &&
          expr.elements[1].type === "literal" &&
          typeof (expr.elements[1] as SLiteral).value === "string"
        ) {
          const exportName = (expr.elements[1] as SLiteral).value as string;
          exportDefinitions.push({ name: exportName, value: expr.elements[2] });
          logger.debug(`Collected string export with expression: "${exportName}"`);
        }
      }
    }

    for (const { name, value } of exportDefinitions) {
      try {
        if (env.hasModuleMacro(filePath, name)) {
          env.exportMacro(filePath, name);
          logger.debug(`Marked macro ${name} as exported from ${filePath}`);
          continue;
        }
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
        try {
          const lookupValue = env.lookup(name);
          moduleExports[name] = lookupValue;
          logger.debug(`Added export "${name}" with looked-up value`);
        } catch (lookupError) {
          logger.warn(`Symbol not found for export: "${name}"`);
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
