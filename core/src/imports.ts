// core/src/imports.ts - Enhanced error handling for imports

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { globalLogger as logger } from "./logger.ts";
import { Environment, Value } from "./environment.ts";
import { evaluateForMacro } from "./s-exp/macro.ts";
import { parse } from "./transpiler/pipeline/parser.ts";
import { readFile } from "./common/utils.ts";
import {
  processJavaScriptFile,
  getImportMapping,
  createTempDirIfNeeded
} from "./common/hql-cache-tracker.ts";
import {
  isImport,
  isLiteral,
  isSymbol,
  SExp,
  SList,
  SSymbol,
  SLiteral,
  isSExpNamespaceImport,
  isSExpVectorImport
} from "./s-exp/types.ts";
import {
  isRemoteUrl,
  registerModulePath,
  isRemoteModule,
  isHqlFile,
  isJsFile,
  isTypeScriptFile
} from "./common/import-utils.ts";
import { 
  wrapError, 
  formatErrorMessage, 
  ValidationError, 
  SourceLocationInfo
} from "./common/error.ts";
import { MacroError, ImportError } from "./common/error.ts";
import { globalSymbolTable } from "./transpiler/symbol_table.ts";
import { createBasicSymbolInfo, enrichImportedSymbolInfo } from "./transpiler/utils/symbol_info_utils.ts";

// Generate a consistent internal module name from a path
function generateModuleId(modulePath: string): string {
  // Clean up path to create a valid identifier
  return `__module_${modulePath.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export interface ImportProcessorOptions {
  verbose?: boolean;
  baseDir?: string;
  tempDir?: string;
  processedFiles?: Set<string>;
  inProgressFiles?: Set<string>;
  importMap?: Map<string, string>;
  currentFile?: string;
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
    wrapImportError("Processing file exports and definitions", error, options.currentFile || "unknown", options.currentFile);
  }
}

/**
 * Enhanced error wrapping with source location information
 */
function wrapImportError(
  context: string,
  error: unknown,
  resource: string,
  currentFile?: string,
  lineInfo?: { line: number; column: number }
): never {
  // If error is already an HQLError with a filePath different from the importer, preserve it
  if (
    error instanceof Error &&
    (error as any).sourceLocation &&
    (error as any).sourceLocation.filePath &&
    currentFile &&
    (error as any).sourceLocation.filePath !== currentFile
  ) {
    throw error;
  }
  // For validation errors related to imports, enhance with location info
  if (error instanceof ValidationError) {
    if (error.message.includes("not found in module") || 
        error.message.includes("Symbol not found") ||
        error.message.includes("Property") || 
        error.message.includes("Cannot access")) {
      
      // Extract the symbol or property name from the error message
      const symbolMatch = error.message.match(/['"]([^'"]+)['"]/);
      const symbol = symbolMatch ? symbolMatch[1] : "";
      
      if (currentFile) {
        let sourceLoc: SourceLocationInfo;
        if (lineInfo) {
          // Use provided line info
          sourceLoc = new SourceLocationInfo({
            filePath: currentFile,
            line: lineInfo.line,
            column: lineInfo.column
          });
        } else {
          // Create location info without line/column
          sourceLoc = new SourceLocationInfo({
            filePath: currentFile
          });
        }
        
        // Enhanced error with context information
        throw new ImportError(
          `Failed to import symbol '${symbol}' from '${resource}':\n  ${error.message}`,
          resource,
          sourceLoc,
          error
        );
      }
    }
  }
  
  // Use the original error for other cases
  if (error instanceof Error) {
    throw error;
  } else {
    throw new Error(`${context}: ${String(error)}`);
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
          
          // Add to symbol table as exported
          globalSymbolTable.update((elem as SSymbol).name, { isExported: true });
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
      
      // Add to symbol table as exported
      globalSymbolTable.update(exportName, { isExported: true });
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
        // Keep the original line information if available
        const importLine = findImportLineInfo(importExpr, options.currentFile);
        wrapImportError("Error processing import", error, modulePath, options.currentFile, importLine);
      }
    }),
  );
}

/**
 * Find line information for an import expression
 */
function findImportLineInfo(importExpr: SList, currentFile?: string): { line: number; column: number } | undefined {
  if (!currentFile) return undefined;
  
  try {
    // Read the file and look for the import expression
    const fileContent = Deno.readTextFileSync(currentFile);
    const lines = fileContent.split('\n');
    
    // Get the import module path to search for
    const modulePath = getModulePathFromImport(importExpr);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for vector imports [name1 name2] from "./path"
      if (line.includes('import') && line.includes('[') && line.includes('from') && line.includes(modulePath)) {
        // Find the specific symbol in the import vector
        const openBracketPos = line.indexOf('[');
        const closeBracketPos = line.indexOf(']');
        
        if (openBracketPos > 0 && closeBracketPos > openBracketPos) {
          const importVector = line.substring(openBracketPos + 1, closeBracketPos);
          
          // If we're dealing with a vector import that has a non-existent symbol
          if (isSExpVectorImport(importExpr)) {
            for (const elem of (importExpr.elements[1] as SList).elements) {
              if (isSymbol(elem)) {
                const symbolName = (elem as SSymbol).name;
                const symbolPos = importVector.indexOf(symbolName);
                
                if (symbolPos >= 0) {
                  // Return the position of the symbol in the import vector
                  return {
                    line: i + 1,
                    column: openBracketPos + 1 + symbolPos
                  };
                }
              }
            }
          }
        }
        
        // If we didn't find the specific symbol but found the import line
        return {
          line: i + 1,
          column: line.indexOf('import') + 1
        };
      }
      
      // Look for namespace imports: import name from "./path"
      if (line.includes('import') && line.includes('from') && line.includes(modulePath)) {
        return {
          line: i + 1,
          column: line.indexOf('import') + 1
        };
      }
    }
  } catch (error) {
    logger.debug(`Error finding import line info: ${error.message}`);
  }
  
  return undefined;
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
      const importLine = findImportLineInfo(importExpr, options.currentFile);
      wrapImportError("Processing sequential import", error, modulePath, options.currentFile, importLine);
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
    wrapImportError(
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
      const line = findImportLineInfo(importExpr, options.currentFile);
      throw new ImportError(
        `Invalid import statement format: ${JSON.stringify(importExpr)}`,
        "syntax-error",
        { 
          filePath: options.currentFile, 
          line: line?.line, 
          column: line?.column 
        }
      );
    }
  } catch (error) {
    // If the error is already an HQLError with a different filePath, preserve it
    if (
      error instanceof Error &&
      (error as any).sourceLocation &&
      (error as any).sourceLocation.filePath &&
      options.currentFile &&
      (error as any).sourceLocation.filePath !== options.currentFile
    ) {
      throw error;
    }
    const modulePath = getModulePathFromImport(importExpr);
    const line = findImportLineInfo(importExpr, options.currentFile);
    wrapImportError("Processing import", error, modulePath, options.currentFile, line);
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
  
  // Register in symbol table
  globalSymbolTable.set({
    name: path.basename(modulePath, path.extname(modulePath)),
    kind: 'module',
    scope: 'global',
    isImported: true,
    sourceModule: modulePath,
    meta: { importedInFile: options.currentFile }
  });
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
      throw new ImportError("Module name must be a symbol", "namespace import");
    }
    if (!isLiteral(elements[3]) || typeof elements[3].value !== "string") {
      throw new ImportError("Module path must be a string literal", "namespace import");
    }
    
    const moduleName = (elements[1] as SSymbol).name;
    const modulePath = (elements[3] as SLiteral).value as string;
    
    registerModulePath(moduleName, modulePath);
    logger.debug(`Processing namespace import with "from": ${moduleName} from ${modulePath}`);
    
    const resolvedPath = path.resolve(baseDir, modulePath);
    // First load the module with a consistent internal ID
    const moduleId = generateModuleId(modulePath);
    await loadModule(moduleId, modulePath, resolvedPath, env, options);
    
    // Then create an alias with the user-provided name
    // This allows both naming schemes to point to the same module
    if (moduleId !== moduleName) {
      // Copy module exports from the internal ID to the user-facing name
      if (env.moduleExports.has(moduleId)) {
        const exports = env.moduleExports.get(moduleId)!;
        env.importModule(moduleName, exports);
        logger.debug(`Created module alias: ${moduleName} → ${moduleId}`);
      }
    }
    
    // Register in symbol table
    globalSymbolTable.set({
      name: moduleName,
      kind: 'module',
      scope: 'global',
      isImported: true,
      sourceModule: modulePath,
      meta: { importedInFile: options.currentFile }
    });
  } catch (error) {
    // If the error is already an HQLError with a different filePath, preserve it
    if (
      error instanceof Error &&
      (error as any).sourceLocation &&
      (error as any).sourceLocation.filePath &&
      options.currentFile &&
      (error as any).sourceLocation.filePath !== options.currentFile
    ) {
      throw error;
    }
    const modulePath = elements[3]?.type === "literal" ? String(elements[3].value) : "unknown";
    // Try to get line information
    let line = undefined;
    if (options.currentFile) {
      try {
        const content = Deno.readTextFileSync(options.currentFile);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('import') && lines[i].includes('from') && lines[i].includes(modulePath)) {
            line = { line: i + 1, column: lines[i].indexOf('import') + 1 };
            break;
          }
        }
      } catch (_) {
        // Ignore errors reading the file
      }
    }
    wrapImportError("Processing namespace import", error, modulePath, options.currentFile, line);
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
      throw new ImportError("Import vector must be a list", "syntax-error");
    }
    const symbolsVector = elements[1] as SList;
    if (!isLiteral(elements[3]) || typeof elements[3].value !== "string") {
      throw new ImportError("Module path must be a string literal", "syntax-error");
    }
    
    const modulePath = elements[3].value as string;
    const resolvedPath = path.resolve(baseDir, modulePath);
    // Use a consistent module ID for all import styles
    const moduleId = generateModuleId(modulePath);
    
    await loadModule(moduleId, modulePath, resolvedPath, env, options);
    
    const vectorElements = processVectorElements(symbolsVector.elements);
    const requestedSymbols = extractSymbolsAndAliases(vectorElements);
    
    // Find line and column information before importing symbols
    const lineInfo = options.currentFile ? findImportVectorPosition(
      options.currentFile, 
      modulePath, 
      Array.from(requestedSymbols.keys())
    ) : undefined;
    
    importSymbols(
      requestedSymbols,
      modulePath,
      moduleId,
      env,
      options.currentFile || "",
      lineInfo
    );
    
    // Register in symbol table for each imported symbol
    for (const [symbolName, aliasName] of requestedSymbols.entries()) {
      const finalName = aliasName || symbolName;
      
      // Check if this is a system macro
      const isMacro = env.isSystemMacro(symbolName);
      
       // Get the actual value from the environment to determine its type
      // Use a try-catch to handle cases where the symbol might not be available yet
      let importedValue;
      try {
        importedValue = env.lookup(symbolName);
      } catch (_e) {
        // If symbol is not found, we'll proceed with minimal type information
        logger.debug(`Warning: Symbol ${symbolName} not fully resolved during import. Using basic type information.`);
        importedValue = undefined;
      }
      
      // Create basic symbol info
      const basicSymbolInfo = createBasicSymbolInfo(finalName, 'local', options.currentFile);
      
      // Add macro type if detected
      if (isMacro) {
        basicSymbolInfo.kind = 'macro';
      }
      
      // Use the utility function to create properly enriched import symbol info
      const enrichedSymbolInfo = enrichImportedSymbolInfo(
        basicSymbolInfo,
        importedValue,
        symbolName,
        modulePath,
        aliasName || undefined // Convert null to undefined
      );
      
      // Add import-specific metadata
      if (!enrichedSymbolInfo.meta) enrichedSymbolInfo.meta = {};
      enrichedSymbolInfo.meta.importedInFile = options.currentFile;
      enrichedSymbolInfo.meta.originalName = symbolName;
      
      // For functions, mark as JS function for better code generation
      if (enrichedSymbolInfo.kind === 'function') {
        enrichedSymbolInfo.meta.isJsFunction = true;
      }
      
      // For object types with properties, add property information
      if (importedValue !== undefined && typeof importedValue === 'object' && importedValue !== null) {
        // For small objects, capture property names to help with type checking
        if (!Array.isArray(importedValue) && Object.keys(importedValue).length <= 10) {
          enrichedSymbolInfo.meta.properties = Object.keys(importedValue);
        }
      }
      
      // Cast to proper SymbolInfo type when setting in table
      globalSymbolTable.set(enrichedSymbolInfo);
    }
  } catch (error) {
    // If the error is already an HQLError with a different filePath, preserve it
    if (
      error instanceof Error &&
      (error as any).sourceLocation &&
      (error as any).sourceLocation.filePath &&
      options.currentFile &&
      (error as any).sourceLocation.filePath !== options.currentFile
    ) {
      throw error;
    }
    const modulePath = elements[3]?.type === "literal" ? String(elements[3].value) : "unknown";
    // Try to find the import position
    let lineInfo = undefined;
    if (options.currentFile) {
      const symbolsVector = elements[1] as SList;
      const vectorElements = processVectorElements(symbolsVector.elements);
      const symbols = Array.from(extractSymbolsAndAliases(vectorElements).keys());
      lineInfo = findImportVectorPosition(options.currentFile, modulePath, symbols);
    }
    wrapImportError("Processing vector import", error, modulePath, options.currentFile, lineInfo);
  }
}

/**
 * Find the position of a symbol in an import vector
 */
function findImportVectorPosition(
  filePath: string, 
  modulePath: string, 
  symbols: string[]
): { line: number; column: number } | undefined {
  try {
    const content = Deno.readTextFileSync(filePath);
    const lines = content.split('\n');
    
    // Find the import statement with both vector and module path
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('[') && line.includes('from') && line.includes(modulePath)) {
        // First check if any of the symbols are in this line
        for (const symbol of symbols) {
          const symbolPos = line.indexOf(symbol);
          if (symbolPos >= 0) {
            return { line: i + 1, column: symbolPos + 1 };
          }
        }
        
        // If no specific symbol found, return position of the vector
        const vectorPos = line.indexOf('[');
        if (vectorPos >= 0) {
          return { line: i + 1, column: vectorPos + 1 };
        }
        
        // Fallback to import keyword position
        return { line: i + 1, column: line.indexOf('import') + 1 };
      }
    }
  } catch (error) {
    logger.debug(`Error finding import vector position: ${error.message}`);
  }
  
  return undefined;
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
 * Import symbols from a module with enhanced error context
 */
function importSymbols(
  requestedSymbols: Map<string, string | null>,
  modulePath: string,
  tempModuleName: string,
  env: Environment,
  currentFile: string,
  lineInfo?: { line: number; column: number },
): void {
  for (const [symbolName, aliasName] of requestedSymbols.entries()) {
    try {
      // Check for system macros
      if (env.isSystemMacro(symbolName)) {
        const success = env.importMacro("system", symbolName, currentFile, aliasName || undefined);
        if (success) {
          logger.debug(`Imported system macro ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`);
        } else {
          logger.warn(`Failed to import system macro ${symbolName}`);
        }
      }
      
      // Try to import the symbol value
      const moduleLookupKey = `${tempModuleName}.${symbolName}`;
      try {
        const value = env.lookup(moduleLookupKey);
        env.define(aliasName || symbolName, value);
        logger.debug(`Imported symbol: ${symbolName}${aliasName ? ` as ${aliasName}` : ""}`);
      } catch (lookupError) {
        // Only throw for non-macros
        if (!env.isSystemMacro(symbolName)) {
          logger.debug(`Symbol not found in module: ${symbolName}`);
          
          // Create a validation error with precise information
          let errorMessage = `Symbol '${symbolName}' not found in module '${modulePath}'`;
          
          // Try to get a list of available exports
          const availableExports = env.moduleExports.get(tempModuleName);
          if (availableExports) {
            const exportsList = Object.keys(availableExports).join(", ");
            if (exportsList) {
              errorMessage += `\nAvailable exports: ${exportsList}`;
            }
          }
          
          const error = new ValidationError(
            errorMessage,
            "import symbol lookup",
            "defined symbol",
            "undefined symbol",
            {
              filePath: currentFile,
              line: lineInfo?.line,
              column: lineInfo?.column
            }
          );
          
          throw error;
        }
      }
    } catch (error) {
      // If the error is already an HQLError with a different filePath, preserve it
      if (
        error instanceof Error &&
        (error as any).sourceLocation &&
        (error as any).sourceLocation.filePath &&
        currentFile &&
        (error as any).sourceLocation.filePath !== currentFile
      ) {
        throw error;
      }
      // Determine if this is an import error (we want specific line info)
      if (error instanceof ValidationError || error instanceof ImportError) {
        // Create a source location with the correct information
        const loc = new SourceLocationInfo({
          filePath: currentFile,
          line: lineInfo?.line,
          column: lineInfo?.column
        });
        throw new ImportError(
          `Importing '${symbolName}' from '${modulePath}': ${error.message}`,
          modulePath,
          loc,
          error
        );
      }
      wrapImportError(
        `Importing symbol '${symbolName}' from '${modulePath}'`,
        error,
        modulePath,
        currentFile,
        lineInfo
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
    // Skip already processed modules (except HQL which handles this internally)
    if (!isHqlFile(modulePath) && processedFiles.has(resolvedPath)) {
      logger.debug(`Skipping already processed import: ${resolvedPath}`);
      return;
    }
    
    // Handle circular imports (except HQL which handles this internally)
    if (!isHqlFile(modulePath) && inProgressFiles.has(resolvedPath)) {
      logger.debug(`Detected circular import for ${resolvedPath}, will be resolved by parent process`);
      return;
    }
    
    // Choose loading strategy based on module type
    if (isRemoteModule(modulePath)) {
      await loadRemoteModule(moduleName, modulePath, env);
    } else if (isHqlFile(modulePath)) {
      await loadHqlModule(moduleName, modulePath, resolvedPath, env, options);
    } else if (isJsFile(modulePath)) {
      await loadJavaScriptModule(moduleName, modulePath, resolvedPath, env, processedFiles);
    } else if (isTypeScriptFile(modulePath)) {
      try {
        await loadTypeScriptModule(moduleName, modulePath, resolvedPath, env, processedFiles);
      } catch (_error) {
        logger.error(`Error loading module: ${_error}`);
        throw new ImportError(`Failed to load module: ${modulePath}\nDetails: ${_error}`);
      }
    } else {
      throw new ImportError(`Unsupported import file type: ${modulePath}`, modulePath);
    }
  } catch (error) {
    wrapError(`Loading module ${moduleName} from ${modulePath}`, error, modulePath);
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
  
  // Skip if already processed
  if (processedFiles.has(resolvedPath)) {
    logger.debug(`Skipping already processed module: ${resolvedPath}`);
    return;
  }
  
  // Check for circular imports
  if (inProgressFiles.has(resolvedPath)) {
    logger.debug(`Detected circular import for ${resolvedPath}, handling with pre-registration`);
    
    try {
      // For circular imports, we need to pre-register empty module
      // to allow imports to succeed, then fill it later
      const emptyExports: Record<string, any> = {};
      env.importModule(moduleName, emptyExports);
      
      // Read and parse to find exports for pre-registration
      const fileContent = await readFile(resolvedPath, options.currentFile);
      const importedExprs = parse(fileContent);
      
      // Extract exports ahead of time
      const exportDefinitions = collectExportDefinitions(importedExprs);
      for (const { name } of exportDefinitions) {
        logger.debug(`Pre-registering export for circular dependency: ${name}`);
        // Register placeholder null values that will be replaced later when fully processed
        emptyExports[name] = null;
      }
      
      return;
    } catch (error) {
      logger.warn(`Failed to pre-register exports for circular dependency: ${resolvedPath}`);
      return;
    }
  }
  
  // Mark as in progress to detect circular imports
  inProgressFiles.add(resolvedPath);
  
  const previousCurrentFile = env.getCurrentFile();
  try {
    // Read and parse the HQL file
    const fileContent = await readFile(resolvedPath, options.currentFile);
    const importedExprs = parse(fileContent, resolvedPath);
    
    // Set context for processing
    env.setCurrentFile(resolvedPath);
    
    // Process definitions first - create stubs for functions and variables
    processFileDefinitions(importedExprs, env);
    
    // Create module exports object early for circular dependencies
    const moduleExports = {};
    env.importModule(moduleName, moduleExports);
    
    // Process imports - allow circular references to find the pre-registered module
    await processImports(importedExprs, env, {
      verbose: options.verbose,
      baseDir: path.dirname(resolvedPath),
      tempDir,
      processedFiles,
      inProgressFiles,
      importMap,
      currentFile: resolvedPath,
    });
    
    // Now process exports and fill in the module exports
    processFileExportsAndDefinitions(importedExprs, env, moduleExports, resolvedPath);
    
    logger.debug(`Imported HQL module: ${moduleName}`);
  } catch (error) {
    // If the error is a ParseError or HQLError with a different filePath, preserve it
    if (
      (error instanceof Error &&
        (error.name === "ParseError" || error.name === "HQLError") &&
        (error as any).sourceLocation &&
        (error as any).sourceLocation.filePath &&
        (error as any).sourceLocation.filePath !== options.currentFile)
    ) {
      throw error;
    }
    wrapError(`Importing HQL module ${moduleName}`, error, modulePath, options.currentFile);
  } finally {
    env.setCurrentFile(previousCurrentFile);
    inProgressFiles.delete(resolvedPath);
    processedFiles.add(resolvedPath);
  }
}

/**
 * Load a TypeScript module by transpiling it to JavaScript first
 */
async function loadTypeScriptModule(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  processedFiles: Set<string>,
): Promise<void> {
  try {
    logger.debug(`TypeScript import detected: ${resolvedPath}`);
    
    // Convert TypeScript to JavaScript
    const jsOutPath = resolvedPath.replace(/\.tsx?$/, '.js');
    await transpileTypeScriptToJavaScript(resolvedPath, jsOutPath);
    
    // Use the JavaScript file instead
    logger.debug(`Using transpiled JavaScript: ${jsOutPath}`);
    const jsModulePath = modulePath.replace(/\.tsx?$/, '.js');
    
    // Use the standard JavaScript module loader for the transpiled file
    await loadJavaScriptModule(moduleName, jsModulePath, jsOutPath, env, processedFiles);
  } catch (error) {
    throw new ImportError(
      `Importing TypeScript module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
      modulePath
    );
  }
}

/**
 * Load a JavaScript module
 */
async function loadJavaScriptModule(
  moduleName: string,
  modulePath: string,
  resolvedPath: string,
  env: Environment,
  processedFiles: Set<string>,
): Promise<void> {
  try {
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
      `Importing JS module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`, modulePath
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
 * Helper function to try importing from multiple sources
 */
async function tryImportSources(
  sources: (() => Promise<any>)[],
  moduleName: string,
  modulePath: string,
  env: Environment,
  loggerMsg: string,
  errorMsg: string,
  ImportErrorClass: typeof Error = Error
): Promise<void> {
  try {
    const importResults = await Promise.allSettled(sources.map(fn => fn()));
    const successfulImport = importResults.find((result) => result.status === "fulfilled");
    if (successfulImport && successfulImport.status === "fulfilled") {
      env.importModule(moduleName, successfulImport.value);
      logger.debug(loggerMsg);
    } else {
      const errors = importResults
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => typeof result.reason === "string" ? result.reason : (result.reason?.message || String(result.reason)))
        .join("; ");
      throw new ImportErrorClass(`${errorMsg}: ${errors}`, modulePath);
    }
  } catch (error) {
    wrapError(loggerMsg, error, modulePath);
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
  const packageName = modulePath.substring(4);
  await tryImportSources(
    [
      () => import(modulePath),
      () => import(`https://esm.sh/${packageName}`),
      () => import(`https://cdn.skypack.dev/${packageName}`),
    ],
    moduleName,
    modulePath,
    env,
    `Imported NPM module: ${moduleName} (${packageName})`,
    `Failed to import from all sources (npm, esm.sh, skypack)`,
    ImportError
  );
}

/**
 * Load a JSR module
 */
async function loadJsrModule(
  moduleName: string,
  modulePath: string,
  env: Environment,
): Promise<void> {
  await tryImportSources(
    [() => import(modulePath)],
    moduleName,
    modulePath,
    env,
    `Imported JSR module: ${moduleName}`,
    `Failed to import JSR module`,
    Error
  );
}

/**
 * Load an HTTP module
 */
async function loadHttpModule(
  moduleName: string,
  modulePath: string,
  env: Environment,
): Promise<void> {
  await tryImportSources(
    [() => import(modulePath)],
    moduleName,
    modulePath,
    env,
    `Imported HTTP module: ${moduleName}`,
    `Failed to import HTTP module`,
    Error
  );
}

/**
 * Process file definitions (let, fn, macro) for variables, functions and macros
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
 * Process file exports and definitions
 */
function processFileExportsAndDefinitions(
  expressions: SExp[],
  env: Environment,
  moduleExports: Record<string, Value>,
  filePath: string,
): void {
  try {
    // Collect and process exports
    const exportDefinitions = collectExportDefinitions(expressions);
    
    // For handling circular dependencies, we should first pre-register
    // all exports with placeholder values if they're not already in the moduleExports
    for (const { name } of exportDefinitions) {
      if (moduleExports[name] === undefined) {
        moduleExports[name] = null;
      }
    }
    
    for (const { name, value } of exportDefinitions) {
      try {
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
          // Only warn if the export wasn't pre-registered (which would indicate a circular dependency)
          if (moduleExports[name] === undefined) {
            logger.warn(`Symbol not found for export: "${name}"`);
          } else {
            logger.debug(`Symbol not found for export "${name}", using placeholder for circular dependency`);
          }
          
          // Special handling for HQL files
          if (filePath.endsWith(".hql")) {
            // Only assign null if not already set (preserve pre-registered values)
            if (moduleExports[name] === undefined) {
              moduleExports[name] = null;
            }
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