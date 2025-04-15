// src/s-exp/imports.ts

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { globalLogger as logger } from "./logger.ts";
import { writeTextFile } from "./platform/platform.ts";
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
import { Environment, Value } from "./environment.ts";
import { defineUserMacro, evaluateForMacro } from "./s-exp/macro.ts";
import { parse } from "./transpiler/pipeline/parser.ts";
import { Logger } from "./logger.ts";
import {
  ImportError,
  MacroError,
  ValidationError,
} from "./transpiler/error/errors.ts";
import { checkForHqlImports, processHqlImportsInJs } from "./bundler.ts";
import { registerTempFile } from "./common/temp-file-tracker.ts";
import {
  isHqlFile,
  isJavaScriptModule,
  isRemoteModule,
  isRemoteUrl,
  registerModulePath,
} from "./common/import-utils.ts";
import { formatErrorMessage } from "./common/common-utils.ts";

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

export async function processImports(
  exprs: SExp[],
  env: Environment,
  options: ImportProcessorOptions = {},
): Promise<void> {

  const baseDir = options.baseDir || Deno.cwd();
  const previousCurrentFile = env.getCurrentFile();
  const processedFiles = options.processedFiles || new Set<string>();
  const inProgressFiles = options.inProgressFiles || new Set<string>();
  const importMap = options.importMap || new Map<string, string>();
  try {
    if (options.currentFile) {
      env.setCurrentFile(options.currentFile);
      logger.debug(`Processing imports in file: ${options.currentFile}`);
      inProgressFiles.add(options.currentFile);
    }
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

function analyzeImports(exprs: SExp[], logger: Logger): SList[] {
  const importExprs = exprs.filter(
    (expr) => isImport(expr) && expr.type === "list",
  ) as SList[];
  logger.debug(`Found ${importExprs.length} import expressions to process`);
  return importExprs;
}

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

function processFileDefinitionsAndExports(
  exprs: SExp[],
  env: Environment,
  options: ImportProcessorOptions,
  logger: Logger,
): void {
  try {
    processFileDefinitions(exprs, env, logger);
    processFileExportsAndDefinitions(exprs, env, {}, options.currentFile!, logger);
  } catch (error) {
    if (error instanceof MacroError) throw error;
    wrapError("Processing file definitions and exports", error, options.currentFile || "unknown", options.currentFile);
  }
}

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
    // Error parsing the import expression, fall back to "unknown"
  }
  return "unknown";
}

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
    // Handle different import syntaxes
    if (elements.length === 2 && elements[1].type === "literal") {
      // Simple import statement like (import "module-path")
      const modulePath = (elements[1] as SLiteral).value as string;
      const resolvedPath = path.resolve(baseDir, modulePath);
      
      logger.debug(`Simple import of full module: ${modulePath} => ${resolvedPath}`);
      
      // Register the module path for later reference
      registerModulePath(modulePath, resolvedPath);
      
      // Load the module based on its type
      await loadModuleByType(
        modulePath, // Use the path as the module name
        modulePath,
        resolvedPath,
        baseDir,
        env,
        options
      );
    } else if (isSExpNamespaceImport(elements)) {
      // Namespace import like (import name from "module-path")
      await processNamespaceImport(elements, env, baseDir, options);
    } else if (isSExpVectorImport(elements)) {
      // Vector import like (import [a b c] from "module-path")
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
    await loadModuleByType(moduleName, modulePath, resolvedPath, baseDir, env, options);
  } catch (error) {
    const modulePath = elements[3]?.type === "literal" ? String(elements[3].value) : "unknown";
    wrapError("Processing namespace import", error, modulePath, options.currentFile);
  }
}

function processVectorElements(elements: SExp[]): SExp[] {
  try {
    let startIndex = 0;
    if (elements.length > 0 && elements[0].type === "symbol" && (elements[0] as SSymbol).name === "vector") {
      startIndex = 1;
    }
    return elements.slice(startIndex).filter(
      (elem) => !(elem.type === "symbol" && (elem as SSymbol).name === ","),
    );
  } catch (error) {
    wrapError("Processing vector elements", error, "vector", "unknown");
  }
}

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
    await loadModuleByType(tempModuleName, modulePath, resolvedPath, baseDir, env, options);
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
      processRegularImports(requestedSymbols, modulePath, tempModuleName, env, options.currentFile, logger);
    }
  } catch (error) {
    const modulePath = elements[3]?.type === "literal" ? String(elements[3].value) : "unknown";
    wrapError("Processing vector import", error, modulePath, options.currentFile);
  }
}

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

async function loadModuleByType(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  baseDir: string,
  env: Environment,
  options: ImportProcessorOptions,
): Promise<void> {
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
      await loadHqlModule(moduleName, modulePath, resolvedPath, baseDir, env, processedFiles, inProgressFiles, logger, options);
    } else if (isJavaScriptModule(modulePath)) {
      await loadJavaScriptModule(moduleName, modulePath, resolvedPath, env, logger, processedFiles);
    } else {
      throw new ImportError(`Unsupported import file type: ${modulePath}`, modulePath, options.currentFile);
    }
  } catch (error) {
    wrapError(`Loading module ${moduleName} from ${modulePath}`, error, modulePath, options.currentFile);
  }
}

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
      const processedSource = await processHqlImportsInJs(
        jsSource,
        resolvedPath,
        {
          verbose: logger.enabled,
        },
        logger,
      );
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
    throw new ImportError(
      `Importing JS module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
      modulePath,
      env.getCurrentFile(),
      error instanceof Error ? error : undefined
    );
  }
}

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

function processFileDefinitions(
  exprs: SExp[],
  env: Environment,
  logger: Logger,
): void {
  try {
    logger.debug("Processing file definitions for macros and variables");
    for (const expr of exprs) {
      if (expr.type !== "list" || expr.elements.length === 0 || !isSymbol(expr.elements[0])) continue;
      const op = expr.elements[0].name;
      if (op === "let" && expr.elements.length === 3) {
        processLetDeclaration(expr, env, logger);
      } else if (op === "fn" && expr.elements.length >= 4) {
        processFnDeclaration(expr, env, logger);
      }
    }
  } catch (error) {
    wrapError("Processing file definitions", error, env.getCurrentFile() || "");
  }
}

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

function processFileExportsAndDefinitions(
  expressions: SExp[],
  env: Environment,
  moduleExports: Record<string, Value>,
  filePath: string,
  logger: Logger,
): void {
  try {
    for (const expr of expressions) {
      if (expr.type === "list" && expr.elements.length > 0 && isSymbol(expr.elements[0]) && expr.elements[0].name === "macro") {
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
    const exportDefinitions: { name: string; value: SExp | null }[] = [];
    for (const expr of expressions) {
      if (expr.type === "list" && expr.elements.length > 0 && isSymbol(expr.elements[0]) && expr.elements[0].name === "export") {
        if (expr.elements.length === 2 && expr.elements[1].type === "list") {
          const vectorElements = (expr.elements[1] as SList).elements;
          const elements = processVectorElements(vectorElements);
          for (const elem of elements) {
            if (isSymbol(elem)) {
              exportDefinitions.push({ name: (elem as SSymbol).name, value: null });
              logger.debug(`Collected vector export: ${(elem as SSymbol).name}`);
            }
          }
        } else if (expr.elements.length === 3 && expr.elements[1].type === "literal" && typeof (expr.elements[1] as SLiteral).value === "string") {
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
