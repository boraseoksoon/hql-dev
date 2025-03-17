// src/s-exp/imports.ts
// Updated with full bidirectional import support and improved macro handling

import * as path from "https://deno.land/std/path/mod.ts";
import { SExp, SList, SLiteral, SSymbol, isSymbol, isLiteral, isList, isImport, createList, createSymbol, createLiteral } from './types.ts';
import { SEnv } from './environment.ts';
import { defineMacro, expandMacro, evaluateForMacro } from './macro.ts';
import { parse } from './parser.ts';
import { Logger } from '../logger.ts';
import { isUrl, escapeRegExp } from '../utils.ts';

/**
 * Options for import processing
 */
export interface ImportProcessorOptions {
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
  env: SEnv, 
  options: ImportProcessorOptions = {}
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();
  
  // Track processed imports to avoid duplicates and circular dependencies
  const processedFiles = options.processedFiles || new Set<string>();
  const importMap = options.importMap || new Map<string, string>();
  
  // Create temp directory if needed and not provided
  let tempDir = options.tempDir;
  if (!tempDir) {
    tempDir = await Deno.makeTempDir({ prefix: "hql_imports_" });
    logger.debug(`Created temporary directory: ${tempDir}`);
  }
  
  // First pass: collect all import expressions
  const importExprs: SList[] = [];
  
  for (const expr of exprs) {
    if (isImport(expr) && expr.type === 'list') {
      importExprs.push(expr as SList);
    }
  }
  
  // Second pass: process imports in order
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
}

/**
 * Process a single import expression
 */
async function processImport(
  importExpr: SList, 
  env: SEnv, 
  baseDir: string, 
  options: ImportProcessorOptions
): Promise<void> {
  const logger = new Logger(options.verbose);
  const processedFiles = options.processedFiles!;
  const importMap = options.importMap!;
  const tempDir = options.tempDir!;
  
  if (importExpr.elements.length !== 3) {
    throw new Error('import requires exactly two arguments: module name and path');
  }
  
  // Extract module name and path
  const moduleNameExp = importExpr.elements[1];
  const modulePathExp = importExpr.elements[2];
  
  if (!isSymbol(moduleNameExp)) {
    throw new Error('Module name must be a symbol');
  }
  
  if (!isLiteral(modulePathExp) || typeof modulePathExp.value !== 'string') {
    throw new Error('Module path must be a string literal');
  }
  
  const moduleName = moduleNameExp.name;
  const modulePath = modulePathExp.value;
  
  logger.debug(`Processing import: ${moduleName} from ${modulePath}`);
  
  // Determine import type and process accordingly
  if (modulePath.startsWith('npm:')) {
    await processNpmImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('jsr:')) {
    await processJsrImport(moduleName, modulePath, env, logger);
  } else if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
    await processHttpImport(moduleName, modulePath, env, logger);
  } else {
    // Local file import
    if (modulePath.endsWith('.hql')) {
      await processHqlImport(moduleName, modulePath, baseDir, env, processedFiles, logger, tempDir, importMap, options.keepTemp);
    } else if (modulePath.endsWith('.js') || modulePath.endsWith('.mjs') || modulePath.endsWith('.cjs')) {
      await processJsImport(moduleName, modulePath, baseDir, env, logger, processedFiles, tempDir, importMap, options.keepTemp);
    } else {
      throw new Error(`Unsupported import file type: ${modulePath}`);
    }
  }
}

/**
 * Process an HQL file import with improved macro handling
 */
async function processHqlImport(
  moduleName: string, 
  modulePath: string, 
  baseDir: string, 
  env: SEnv, 
  processedFiles: Set<string>,
  logger: Logger,
  tempDir: string,
  importMap: Map<string, string>,
  keepTemp: boolean = false
): Promise<void> {
  // Resolve the absolute path relative to the importing file's directory
  const resolvedPath = path.resolve(baseDir, modulePath);
  
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
  
  // Process nested imports first - this is the critical fix
  // Use the directory of the current file as the new base directory
  const importDir = path.dirname(resolvedPath);
  await processImports(importedExprs, env, { 
    verbose: logger.enabled,
    baseDir: importDir,  // Key fix: Use the directory of the imported file for nested imports
    tempDir,
    keepTemp,
    processedFiles,
    importMap
  });
  
  // Create module object to store exports
  const moduleExports: Record<string, any> = {};
  
  // Process expressions in the file to populate moduleExports
  await processFileExpressions(importedExprs, env, moduleExports, resolvedPath, logger);
  
  // Debug log the exports
  logger.debug(`Exports from ${moduleName}:`);
  for (const [key, value] of Object.entries(moduleExports)) {
    logger.debug(`  ${key}: ${JSON.stringify(value)}`);
  }
  
  // Register the module with its exports
  env.importModule(moduleName, moduleExports);
  
  logger.debug(`Imported HQL module: ${moduleName} with exports: ${Object.keys(moduleExports).join(', ')}`);
  
  // For bidirectional support: Generate a JS file if this HQL is imported from JS
  await generateJsVersionOfHql(resolvedPath, fileContent, tempDir, importMap, logger);
}

/**
 * Process all expressions in an HQL file
 */
async function processFileExpressions(
  expressions: SExp[],
  env: SEnv,
  moduleExports: Record<string, any>,
  filePath: string,
  logger: Logger
): Promise<void> {
  // Process all expressions
  for (const expr of expressions) {
    // Skip imports (already processed)
    if (isImport(expr)) {
      continue;
    }
    
    // Process macro definitions
    if (expr.type === 'list' && 
        expr.elements.length > 0 &&
        isSymbol(expr.elements[0]) &&
        expr.elements[0].name === 'defmacro') {
      try {
        // Define the macro in the environment
        defineMacro(expr as SList, env, logger);
        
        // Extract macro name for exports
        if (expr.elements.length > 1 && isSymbol(expr.elements[1])) {
          const macroName = expr.elements[1].name;
          const macroFn = env.getMacro(macroName);
          
          if (macroFn) {
            moduleExports[macroName] = macroFn;
          }
        }
      } catch (error) {
        logger.error(`Error defining macro in ${filePath}: ${error.message}`);
      }
    }
    
    // Process direct def statements
    else if (expr.type === 'list' && 
             expr.elements.length > 0 &&
             isSymbol(expr.elements[0]) &&
             expr.elements[0].name === 'def') {
      try {
        // Extract variable name and value expression
        if (expr.elements.length >= 3 && isSymbol(expr.elements[1])) {
          const varName = expr.elements[1].name;
          const valueExpr = expr.elements[2];
          
          // If the value expression is a list that starts with a macro name,
          // expand it and evaluate the result
          if (valueExpr.type === 'list' && 
              valueExpr.elements.length > 0 && 
              isSymbol(valueExpr.elements[0])) {
            const fnName = valueExpr.elements[0].name;
            
            if (env.hasMacro(fnName)) {
              try {
                // This is a macro call - expand it
                const expanded = expandMacro(valueExpr as SList, env, logger);
                const evaluated = evaluateForMacro(expanded, env, logger);
                
                // Define the value in the environment
                if (evaluated) {
                  env.define(varName, evaluated);
                  
                  // If it's a literal, extract the primitive value
                  if (isLiteral(evaluated)) {
                    const literal = evaluated as SLiteral;
                    env.define(varName, literal.value);
                  }
                }
              } catch (error) {
                logger.error(`Error expanding macro in def: ${error.message}`);
              }
            } else {
              // Not a macro call, define as is
              env.define(varName, valueExpr);
            }
          } else {
            // Not a list expression, define as is
            env.define(varName, valueExpr);
          }
        }
      } catch (error) {
        logger.error(`Error processing def in ${filePath}: ${error.message}`);
      }
    }
    
    // Process function definitions
    else if (expr.type === 'list' && 
             expr.elements.length > 0 &&
             isSymbol(expr.elements[0]) &&
             expr.elements[0].name === 'defn') {
      try {
        // Extract function name
        if (expr.elements.length > 2 && isSymbol(expr.elements[1])) {
          const fnName = expr.elements[1].name;
          // Register in exports
          moduleExports[fnName] = expr;
        }
      } catch (error) {
        logger.error(`Error processing function in ${filePath}: ${error.message}`);
      }
    }
    
    // Process export statements
    else if (expr.type === 'list' && 
             expr.elements.length > 0 &&
             isSymbol(expr.elements[0]) &&
             expr.elements[0].name === 'export') {
      try {
        // Format: (export "name" value)
        if (expr.elements.length === 3 && 
            isLiteral(expr.elements[1]) && 
            typeof expr.elements[1].value === 'string') {
          const exportName = expr.elements[1].value;
          const exportValueExpr = expr.elements[2];
          
          logger.debug(`Processing export: "${exportName}"`);
          
          // If export value is a symbol, look it up
          if (isSymbol(exportValueExpr)) {
            try {
              const symbolName = exportValueExpr.name;
              logger.debug(`Export symbol: ${symbolName}`);
              
              // Sanitize symbol name (replace dashes with underscores)
              const sanitizedSymbol = symbolName.replace(/-/g, '_');
              
              try {
                // Try to look up the value in the environment
                const value = env.lookup(sanitizedSymbol);
                logger.debug(`Found value for ${sanitizedSymbol}: ${JSON.stringify(value)}`);
                
                // Store the value in the module exports
                moduleExports[exportName] = value;
                logger.debug(`Added export "${exportName}" with value from symbol "${sanitizedSymbol}": ${JSON.stringify(value)}`);
              } catch (lookupError) {
                // Try with original symbol name if sanitized lookup fails
                try {
                  const value = env.lookup(symbolName);
                  logger.debug(`Found value for original symbol ${symbolName}: ${JSON.stringify(value)}`);
                  
                  // Store the value in the module exports
                  moduleExports[exportName] = value;
                  logger.debug(`Added export "${exportName}" with value from original symbol "${symbolName}": ${JSON.stringify(value)}`);
                } catch (originalLookupError) {
                  // If both lookups fail, log warning but don't fail
                  logger.warn(`Failed to lookup symbol "${symbolName}" or "${sanitizedSymbol}" for export "${exportName}"`);
                }
              }
            } catch (error) {
              logger.error(`Error resolving export symbol in ${filePath}: ${error.message}`);
            }
          } else {
            // For non-symbols, evaluate the expression directly
            try {
              const evaluated = evaluateForMacro(exportValueExpr, env, logger);
              
              // If it's a literal, use its primitive value
              if (isLiteral(evaluated)) {
                moduleExports[exportName] = (evaluated as SLiteral).value;
                logger.debug(`Added export "${exportName}" with literal value: ${JSON.stringify(moduleExports[exportName])}`);
              } else {
                moduleExports[exportName] = evaluated;
                logger.debug(`Added export "${exportName}" with non-literal value: ${JSON.stringify(moduleExports[exportName])}`);
              }
            } catch (evalError) {
              logger.error(`Error evaluating export value: ${evalError.message}`);
            }
          }
        }
      } catch (error) {
        logger.error(`Error processing export in ${filePath}: ${error.message}`);
      }
    }
  }
  
  // Debug log all exports
  logger.debug(`Module exports after processing: ${Object.keys(moduleExports).join(', ')}`);
  for (const [key, value] of Object.entries(moduleExports)) {
    logger.debug(`  ${key}: ${JSON.stringify(value)}`);
  }
}

/**
 * Generate a JavaScript version of the HQL file for bidirectional imports
 */
async function generateJsVersionOfHql(
  hqlPath: string,
  hqlContent: string,
  tempDir: string,
  importMap: Map<string, string>,
  logger: Logger
): Promise<string> {
  // Create a JS output path in the temp directory
  const fileName = path.basename(hqlPath).replace(/\.hql$/, '.js');
  const hashCode = simpleHash(hqlPath).toString();
  const outputDir = path.join(tempDir, hashCode);
  const jsOutputPath = path.join(outputDir, fileName);
  
  // Check if we already processed this file
  if (importMap.has(hqlPath)) {
    return importMap.get(hqlPath)!;
  }
  
  // Make sure the output directory exists
  try {
    await Deno.mkdir(outputDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
  
  try {
    // Import the processHql function from main.ts
    const { processHql } = await import('./main.ts');
    
    // Parse the HQL content to extract exports
    const sexps = parse(hqlContent);
    const exportStatements: Array<{name: string, symbol: string}> = [];
    
    // Find all export statements
    for (const expr of sexps) {
      if (expr.type === 'list' && 
          expr.elements.length >= 3 &&
          isSymbol(expr.elements[0]) && 
          expr.elements[0].name === 'export' &&
          isLiteral(expr.elements[1]) &&
          isSymbol(expr.elements[2])) {
        
        const exportName = (expr.elements[1] as SLiteral).value as string;
        const symbolName = (expr.elements[2] as SSymbol).name;
        
        exportStatements.push({
          name: exportName,
          symbol: symbolName
        });
      }
    }
    
    // Process HQL to JS
    let jsCode = await processHql(hqlContent, {
      baseDir: path.dirname(hqlPath),
      verbose: logger.enabled
    });
    
    // Ensure all exports are properly handled in the generated JS
    // This adds explicit export statements at the end of the file
    if (exportStatements.length > 0) {
      jsCode += '\n\n// Added explicit exports\n';
      
      exportStatements.forEach(({name, symbol}) => {
        const sanitizedSymbol = symbol.replace(/-/g, '_');
        // Add explicit named export statement for ESM
        jsCode += `export { ${sanitizedSymbol} as "${name}" };\n`;
      });
    }
    
    // Write the JS file
    await Deno.writeTextFile(jsOutputPath, jsCode);
    logger.debug(`Generated JS version of HQL file: ${jsOutputPath}`);
    
    // Map the HQL file to its JS version
    importMap.set(hqlPath, jsOutputPath);
    
    return jsOutputPath;
  } catch (error) {
    logger.error(`Error generating JS for HQL file ${hqlPath}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Process a JavaScript file import with bidirectional dependency support
 */
async function processJsImport(
  moduleName: string,
  modulePath: string,
  baseDir: string,
  env: SEnv,
  logger: Logger,
  processedFiles: Set<string>,
  tempDir: string,
  importMap: Map<string, string>,
  keepTemp: boolean = false
): Promise<void> {
  try {
    // Resolve the absolute path
    const resolvedPath = path.resolve(baseDir, modulePath);
    
    // Check for circular imports
    if (processedFiles.has(resolvedPath)) {
      logger.debug(`Skipping already processed JS import: ${resolvedPath}`);
      
      // If already processed, just register the module
      if (importMap.has(resolvedPath)) {
        const processedPath = importMap.get(resolvedPath)!;
        const moduleUrl = new URL(`file://${processedPath}`);
        const module = await import(moduleUrl.href);
        env.importModule(moduleName, module);
      }
      
      return;
    }
    
    // Mark as processed
    processedFiles.add(resolvedPath);
    
    // Read the JS file to analyze imports
    let jsContent: string;
    try {
      jsContent = await Deno.readTextFile(resolvedPath);
    } catch (error) {
      throw new Error(`Failed to read JS file: ${resolvedPath} - ${error.message}`);
    }
    
    // Process HQL imports in the JS file
    await processHqlImportsInJs(resolvedPath, jsContent, env, logger, processedFiles, tempDir, importMap, keepTemp);
    
    // Process the processed JS file
    let processedJsPath = resolvedPath;
    if (importMap.has(resolvedPath)) {
      processedJsPath = importMap.get(resolvedPath)!;
    }
    
    // Import the module dynamically
    const moduleUrl = new URL(`file://${processedJsPath}`);
    const module = await import(moduleUrl.href);
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported JS module: ${moduleName} with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import JS module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Process HQL imports in a JavaScript file
 */
async function processHqlImportsInJs(
  jsPath: string,
  jsContent: string,
  env: SEnv,
  logger: Logger,
  processedFiles: Set<string>,
  tempDir: string,
  importMap: Map<string, string>,
  keepTemp: boolean = false
): Promise<void> {
  // Find HQL imports using regex
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
  let match;
  const hqlImports: string[] = [];
  
  while ((match = hqlImportRegex.exec(jsContent)) !== null) {
    const importPath = match[1];
    hqlImports.push(importPath);
    
    if (!isUrl(importPath)) {
      // Resolve the import path
      const absImportPath = path.resolve(path.dirname(jsPath), importPath);
      logger.debug(`Found HQL import in JS file: ${importPath} -> ${absImportPath}`);
      
      try {
        // Read the HQL file
        const hqlContent = await Deno.readTextFile(absImportPath);
        
        // Process the HQL file
        await processHqlImport(
          path.basename(importPath, '.hql'), // Use filename as module name
          absImportPath,
          path.dirname(jsPath),
          env,
          processedFiles,
          logger,
          tempDir,
          importMap,
          keepTemp
        );
      } catch (error) {
        logger.error(`Error processing HQL import ${importPath} in JS file: ${error.message}`);
      }
    }
  }
  
  // If we found HQL imports, update the JS file to use .js extension
  if (hqlImports.length > 0) {
    let modifiedContent = jsContent;
    
    for (const importPath of hqlImports) {
      if (!isUrl(importPath)) {
        const jsImportPath = importPath.replace(/\.hql$/, '.js');
        
        // Replace the import statement
        modifiedContent = modifiedContent.replace(
          new RegExp(`(['"])${escapeRegExp(importPath)}(['"])`, 'g'),
          `$1${jsImportPath}$2`
        );
      }
    }
    
    // Create a processed JS file in the temp directory
    const fileName = path.basename(jsPath);
    const hashCode = simpleHash(jsPath).toString();
    const outputDir = path.join(tempDir, hashCode);
    const processedJsPath = path.join(outputDir, fileName);
    
    // Make sure the output directory exists
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    
    // Write the processed JS file
    await Deno.writeTextFile(processedJsPath, modifiedContent);
    logger.debug(`Created processed JS file with updated imports: ${processedJsPath}`);
    
    // Map the original JS file to its processed version
    importMap.set(jsPath, processedJsPath);
  }
  
  // Process nested JS imports as well
  await processJsImportsInJs(jsPath, jsContent, env, logger, processedFiles, tempDir, importMap, keepTemp);
}

/**
 * Process JS imports in a JavaScript file
 */
async function processJsImportsInJs(
  jsPath: string,
  jsContent: string,
  env: SEnv,
  logger: Logger,
  processedFiles: Set<string>,
  tempDir: string,
  importMap: Map<string, string>,
  keepTemp: boolean = false
): Promise<void> {
  // Find JS imports using regex
  const jsImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.m?js)['"]/g;
  let match;
  
  while ((match = jsImportRegex.exec(jsContent)) !== null) {
    const importPath = match[1];
    
    if (!isUrl(importPath)) {
      // Resolve the import path
      const absImportPath = path.resolve(path.dirname(jsPath), importPath);
      logger.debug(`Found JS import in JS file: ${importPath} -> ${absImportPath}`);
      
      if (!processedFiles.has(absImportPath)) {
        try {
          // Read the JS file
          const nestedJsContent = await Deno.readTextFile(absImportPath);
          
          // Process the JS file
          await processHqlImportsInJs(
            absImportPath,
            nestedJsContent,
            env,
            logger,
            processedFiles,
            tempDir,
            importMap,
            keepTemp
          );
          
          // Mark as processed
          processedFiles.add(absImportPath);
        } catch (error) {
          logger.error(`Error processing JS import ${importPath} in JS file: ${error.message}`);
        }
      }
    }
  }
}

/**
 * Process an NPM package import
 */
/**
 * Process an NPM package import with multiple fallback approaches
 */
async function processNpmImport(
  moduleName: string,
  modulePath: string,
  env: SEnv,
  logger: Logger
): Promise<void> {
  try {
    // Extract the package name without the npm: prefix
    const packageName = modulePath.substring(4);
    
    let module;
    
    // First strategy: Try direct import (may work in newer Deno versions)
    try {
      logger.debug(`Trying direct import for NPM module: ${modulePath}`);
      module = await import(modulePath);
      logger.debug(`Direct import successful for ${modulePath}`);
    } catch (directImportError) {
      // Second strategy: Try ESM.sh CDN
      try {
        const esmUrl = `https://esm.sh/${packageName}`;
        logger.debug(`Direct import failed, trying ESM.sh URL: ${esmUrl}`);
        module = await import(esmUrl);
        logger.debug(`ESM.sh import successful for ${packageName}`);
      } catch (esmError) {
        // Third strategy: Try Skypack CDN
        try {
          const skypackUrl = `https://cdn.skypack.dev/${packageName}`;
          logger.debug(`ESM.sh import failed, trying Skypack URL: ${skypackUrl}`);
          module = await import(skypackUrl);
          logger.debug(`Skypack import successful for ${packageName}`);
        } catch (skypackError) {
          // Final strategy: Try JSPM CDN
          logger.debug(`Skypack import failed, trying JSPM URL for ${packageName}`);
          const jspmUrl = `https://jspm.dev/${packageName}`;
          module = await import(jspmUrl);
          logger.debug(`JSPM import successful for ${packageName}`);
        }
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
 * Process a JSR package import
 */
async function processJsrImport(
  moduleName: string,
  modulePath: string,
  env: SEnv,
  logger: Logger
): Promise<void> {
  try {
    // Import the module dynamically
    const module = await import(modulePath);
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported JSR module: ${moduleName} (${modulePath}) with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import JSR module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Process an HTTP/HTTPS import
 */
async function processHttpImport(
  moduleName: string,
  modulePath: string,
  env: SEnv,
  logger: Logger
): Promise<void> {
  try {
    // Import the module dynamically
    const module = await import(modulePath);
    
    // Register the module
    env.importModule(moduleName, module);
    
    logger.debug(`Imported HTTP module: ${moduleName} (${modulePath}) with exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to import HTTP module: ${modulePath} - ${error.message}`);
  }
}

/**
 * Simple string hash function
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Cleanup temporary files
 */
export async function cleanupImportTemp(tempDir: string, logger: Logger): Promise<void> {
  if (tempDir) {
    try {
      await Deno.remove(tempDir, { recursive: true });
      logger.debug(`Cleaned up temporary directory: ${tempDir}`);
    } catch (error) {
      logger.error(`Failed to clean up temporary directory: ${error.message}`);
    }
  }
}