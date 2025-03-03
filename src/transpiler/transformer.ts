// src/transpiler/transformer.ts - Fully refactored with improved error handling and logging
import { HQLNode } from "./hql_ast.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { TSSourceFile } from "./ts-ast-types.ts";
import {
  join,
  dirname,
  basename,
  resolve,
} from "../platform/platform.ts";
import { parse } from "./parser.ts";
import { bundleJavaScript } from "../bundler/bundler.ts";
import {
  isExternalModule,
  normalizePath,
  resolveImportPath,
  hqlToJsPath,
  convertImportSpecifier,
  hasExtension,
  pathExists,
  resolveWithExtensions,
  ensureAbsolutePath
} from "./path-utils.ts";
import { expandMacros } from "../macro.ts";
import * as logger from "../logger.ts";

// Cache for processed imports to avoid redundant processing
const processedImportsCache = new Map<string, Set<string>>();

// Interface for import information 
interface ImportInfo {
  importStatement: string;
  moduleName: string | null;
  importPath: string;
  isHQL: boolean;
  isExternal: boolean;
}

/**
 * Transformation options.
 */
export interface TransformOptions {
  target?: "javascript" | "typescript";
  missingTypeStrategy?: "omit" | "any";
  propertyAccessStyle?: "dot" | "bracket";
  formatting?: "minimal" | "standard" | "pretty";
  module?: "esm" | "commonjs";
  indentSize?: number;
  useSpaces?: boolean;
  preserveImports?: boolean; // Whether to keep import statements
  inlineSourceMaps?: boolean; // Add inline source maps
  bundle?: boolean; // Bundle the output to a single file
  verbose?: boolean; // Enable verbose logging
}

/**
 * Get default transform options with overrides
 */
function getDefaultOptions(overrides: Partial<TransformOptions> = {}): Required<TransformOptions> {
  return {
    target: overrides.target ?? "javascript",
    missingTypeStrategy: overrides.missingTypeStrategy ?? "omit",
    propertyAccessStyle: overrides.propertyAccessStyle ?? "dot",
    formatting: overrides.formatting ?? "standard",
    module: overrides.module ?? "esm",
    indentSize: overrides.indentSize ?? 2,
    useSpaces: overrides.useSpaces ?? true,
    preserveImports: overrides.preserveImports ?? false,
    inlineSourceMaps: overrides.inlineSourceMaps ?? false,
    bundle: overrides.bundle ?? false,
    verbose: overrides.verbose ?? false
  };
}

/**
 * Transform HQL AST to JavaScript code with better error handling.
 * Main entry point for the transformation pipeline.
 */
export async function transformAST(
  nodes: HQLNode[],
  currentDir: string,
  visited = new Set<string>(),
  options: TransformOptions = {},
  inModule: boolean = false
): Promise<string> {
  const opts = getDefaultOptions(options);
  if (inModule) opts.module = "commonjs";
  
  // Configure logging
  const log = logger.createLogger("transformer");
  const logLevel = logger.verboseToLogLevel(opts.verbose);
  logger.setLogLevel(logLevel);
  
  log.info(`Starting transformation in "${currentDir}"`);
  log.verbose(`Module type: ${opts.module}`);
  log.verbose(`Bundle: ${opts.bundle ? 'enabled' : 'disabled'}`);
  log.verbose(`AST nodes: ${nodes.length}`);

  try {
    // Step 0: Apply any macro expansions (if defined)
    const expandedNodes = expandMacros(nodes);
    log.verbose(`Expanded AST nodes: ${expandedNodes.length}`);
    
    // Step 1: Transform HQL AST to IR.
    log.debug(`Transforming AST to IR...`);
    const irProgram = transformToIR(expandedNodes, currentDir);
    log.debug(`Transformed AST to IR with ${irProgram.body.length} nodes`);
    
    // Step 2: Convert IR to TS AST.
    log.debug(`Converting IR to TS AST...`);
    let tsAST = convertIRToTSAST(irProgram);
    log.debug(`Converted IR to TS AST with ${tsAST.statements.length} statements`);
    
    // Step 3: Process imports efficiently in a single pass
    if (!opts.preserveImports) {
      log.debug(`Processing imports in TS AST...`);
      await processImportsInAST(tsAST, currentDir, visited, opts);
      log.debug(`Imports processed successfully`);
    }
    
    // Step 4: Generate code with optimized options.
    log.debug(`Generating JavaScript code...`);
    const codeOptions: CodeGenerationOptions = {
      formatting: opts.formatting,
      indentSize: opts.indentSize,
      useSpaces: opts.useSpaces,
      module: opts.module,
    };

    const code = generateTypeScript(tsAST, codeOptions);
    log.debug(`Generated JavaScript code (${code.length} bytes)`);
    
    return code;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`AST transformation failed`, error);
    
    // Re-throw with a more descriptive message
    throw new Error(`Failed to transform HQL AST: ${errorMessage}`);
  }
}

/**
 * Process imports in the TS AST efficiently.
 */
async function processImportsInAST(
  ast: TSSourceFile,
  currentDir: string,
  visited: Set<string>,
  options: Required<TransformOptions>
): Promise<void> {
  const log = logger.createLogger("imports");
  
  // Collect all imports for parallel processing
  const importStatements: { index: number; statement: any; info: ImportInfo }[] = [];
  
  // First pass: identify all import statements
  for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i];
    if (stmt.type === "Raw") {
      const raw = stmt as any;
      if (raw.code.startsWith("import")) {
        const importInfo = extractImportInfo(raw.code);
        if (importInfo) {
          importStatements.push({ index: i, statement: raw, info: importInfo });
        }
      }
    }
  }
  
  log.verbose(`Found ${importStatements.length} imports to process`);
  
  // Process all imports in parallel for better performance
  await Promise.all(
    importStatements.map(({ index, statement, info }) => 
      processImport(ast, index, info, currentDir, visited, options)
    )
  );
  
  log.debug(`All imports processed successfully`);
}

/**
 * Extract import information from an import statement.
 */
function extractImportInfo(importStatement: string): ImportInfo | null {
  // Match the import path (the part after 'from')
  const fromMatch = importStatement.match(/from\s+["']([^"']+)["']/);
  if (!fromMatch) return null;
  
  const importPath = fromMatch[1];
  
  // Determine the import type by analyzing the structure
  let moduleName: string | null = null;
  
  // Default import: import name from 'path';
  const defaultMatch = importStatement.match(/import\s+(\w+)\s+from/);
  if (defaultMatch) {
    moduleName = defaultMatch[1];
  } else {
    // Namespace import: import * as name from 'path';
    const namespaceMatch = importStatement.match(/import\s+\*\s+as\s+(\w+)\s+from/);
    if (namespaceMatch) {
      moduleName = namespaceMatch[1];
    }
  }
  
  return {
    importStatement,
    moduleName,
    importPath,
    isHQL: importPath.endsWith('.hql'),
    isExternal: isExternalModule(importPath)
  };
}

/**
 * Process an import based on its type.
 */
async function processImport(
  ast: TSSourceFile,
  statementIndex: number,
  importInfo: ImportInfo,
  currentDir: string,
  visited: Set<string>,
  options: Required<TransformOptions>
): Promise<void> {
  const log = logger.createLogger("import-processor");
  const { importStatement, importPath, isHQL, isExternal } = importInfo;
  
  log.verbose(`Processing import: "${importPath}"`);
  
  // Handle external modules efficiently
  if (isExternal) {
    const convertedPath = convertImportSpecifier(importPath);
    if (convertedPath !== importPath) {
      log.verbose(`Converted external import: "${importPath}" -> "${convertedPath}"`);
      ast.statements[statementIndex] = {
        type: "Raw",
        code: importStatement.replace(importPath, convertedPath),
      };
    }
    return;
  }
  
  // Build a cache key for this import
  const cacheKey = `${normalizePath(currentDir)}:${importPath}`;
  
  // Check if we've already processed this import in this context
  if (!processedImportsCache.has(cacheKey)) {
    processedImportsCache.set(cacheKey, new Set());
  }
  const processedForDir = processedImportsCache.get(cacheKey)!;
  
  // Skip if already processed (except for updating the statement)
  const needsProcessing = !processedForDir.has(importPath);
  
  // Resolve the full path
  const fullPath = resolveImportPath(importPath, currentDir);
  
  if (isHQL) {
    // Update import statement to use JS path
    const jsImportPath = hqlToJsPath(importPath);
    log.verbose(`Updated HQL import path: "${importPath}" -> "${jsImportPath}"`);
    ast.statements[statementIndex] = {
      type: "Raw",
      code: importStatement.replace(importPath, jsImportPath),
    };
    
    // Process HQL file if needed
    if (needsProcessing && !visited.has(normalizePath(fullPath))) {
      await processHqlImport(fullPath, visited, options);
      processedForDir.add(importPath);
    }
  } else if (hasExtension(importPath, ".js")) {
    // Process JS file if needed
    if (needsProcessing && !visited.has(normalizePath(fullPath))) {
      await processJsImport(fullPath, visited, options);
      processedForDir.add(importPath);
    }
  } else {
    // Try to resolve unknown import
    await processUnknownImport(
      ast,
      statementIndex,
      importStatement,
      importPath,
      currentDir,
      visited,
      options
    );
  }
}

/**
 * Process an HQL import.
 */
async function processHqlImport(
  fullPath: string,
  visited: Set<string>,
  options: Required<TransformOptions>
): Promise<void> {
  const log = logger.createLogger("hql-import");
  const normalizedPath = normalizePath(fullPath);
  
  // Prevent circular processing
  visited.add(normalizedPath);
  
  try {
    log.info(`Transpiling HQL import: "${fullPath}"`);
    
    // Read and transform the HQL file
    const source = await Deno.readTextFile(fullPath);
    const hqlAst = parse(source);
    const newCurrentDir = dirname(fullPath);
    
    // Transform with the same options
    const transformed = await transformAST(
      hqlAst,
      newCurrentDir,
      new Set([...visited]),
      options
    );
    
    // Write the JS file
    const jsFullPath = hqlToJsPath(fullPath);
    await Deno.writeTextFile(jsFullPath, transformed);
    log.success(`Generated JS file: "${jsFullPath}"`);
  } catch (error) {
    log.error(`Error processing HQL import ${fullPath}`, error);
  }
}

/**
 * Process a JS file that might contain HQL imports.
 */
async function processJsImport(
  fullPath: string,
  visited: Set<string>,
  options: Required<TransformOptions>
): Promise<void> {
  const log = logger.createLogger("js-import");
  const normalizedPath = normalizePath(fullPath);
  
  // Prevent circular processing
  if (visited.has(normalizedPath) || isExternalModule(fullPath)) return;
  visited.add(normalizedPath);
  
  try {
    // Check if file exists
    if (!await pathExists(fullPath)) {
      log.warning(`JS import file not found: "${fullPath}"`);
      return;
    }
    
    // Read the JS file
    const jsContent = await Deno.readTextFile(fullPath);
    
    // Extract and process any HQL imports
    const imports = extractJsImports(jsContent);
    const hqlImports = imports.filter(imp => imp.isHQL);
    
    if (hqlImports.length > 0) {
      log.verbose(`Found ${hqlImports.length} HQL imports in JS file: "${fullPath}"`);
      await processHqlImportsInJsFile(fullPath, jsContent, hqlImports, visited, options);
    }
  } catch (error) {
    log.error(`Error processing JS import "${fullPath}"`, error);
  }
}

/**
 * Process an unknown import.
 */
async function processUnknownImport(
  ast: TSSourceFile,
  statementIndex: number,
  importStatement: string,
  importPath: string,
  currentDir: string,
  visited: Set<string>,
  options: Required<TransformOptions>
): Promise<void> {
  const log = logger.createLogger("unknown-import");
  
  // Try to resolve the actual file
  const basePath = resolveImportPath(importPath, currentDir);
  const resolvedPath = await resolveWithExtensions(basePath);
  
  if (!resolvedPath) {
    log.warning(`Could not resolve import: "${importPath}"`);
    return;
  }
  
  log.verbose(`Resolved import "${importPath}" to "${resolvedPath}"`);
  
  if (resolvedPath.endsWith(".hql")) {
    // Handle as HQL import
    const jsImportPath = hqlToJsPath(importPath);
    ast.statements[statementIndex] = {
      type: "Raw",
      code: importStatement.replace(importPath, jsImportPath),
    };
    
    await processHqlImport(resolvedPath, visited, options);
  } else if (resolvedPath.endsWith(".js")) {
    // Handle as JS import
    const relativePath = importPath + (importPath.endsWith("/") ? "index.js" : ".js");
    ast.statements[statementIndex] = {
      type: "Raw",
      code: importStatement.replace(importPath, relativePath),
    };
    
    await processJsImport(resolvedPath, visited, options);
  } else {
    // Handle other file types
    const ext = resolvedPath.substring(resolvedPath.lastIndexOf("."));
    const relativePath = importPath + ext;
    ast.statements[statementIndex] = {
      type: "Raw",
      code: importStatement.replace(importPath, relativePath),
    };
  }
}

/**
 * Extract JavaScript imports with a more structured approach.
 */
function extractJsImports(jsContent: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = jsContent.split('\n');
  
  // Process each line to find import statements
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip lines that don't contain imports
    if (!line.startsWith('import ')) continue;
    
    // Handle multi-line imports by joining lines until we find the semicolon
    let fullImport = line;
    let lineIndex = i;
    
    while (!fullImport.includes(';') && lineIndex < lines.length - 1) {
      lineIndex++;
      fullImport += ' ' + lines[lineIndex].trim();
    }
    
    // Extract import information
    const importInfo = extractImportInfo(fullImport);
    if (importInfo) {
      imports.push(importInfo);
    }
  }
  
  return imports;
}

/**
 * Process HQL imports found in a JS file.
 */
async function processHqlImportsInJsFile(
  jsFilePath: string,
  jsContent: string,
  hqlImports: ImportInfo[],
  visited: Set<string>,
  options: Required<TransformOptions>
): Promise<void> {
  const log = logger.createLogger("js-hql-imports");
  const jsFileDir = dirname(jsFilePath);
  let updatedContent = jsContent;
  let contentModified = false;
  
  // Process imports in parallel
  const importPromises = hqlImports.map(async (importInfo) => {
    const { importStatement, importPath } = importInfo;
    const fullHqlPath = resolveImportPath(importPath, jsFileDir);
    const normalizedHqlPath = normalizePath(fullHqlPath);
    
    if (!visited.has(normalizedHqlPath)) {
      // Process the HQL file
      await processHqlImport(fullHqlPath, visited, options);
    }
    
    // Generate the updated import statement
    const jsImportPath = hqlToJsPath(importPath);
    return {
      originalStatement: importStatement,
      newStatement: importStatement.replace(importPath, jsImportPath),
      modified: importPath !== jsImportPath
    };
  });
  
  // Wait for all imports to be processed
  const results = await Promise.all(importPromises);
  
  // Apply all changes at once
  for (const result of results) {
    if (result.modified) {
      updatedContent = updatedContent.replace(
        result.originalStatement, 
        result.newStatement
      );
      contentModified = true;
    }
  }
  
  // Write the updated file if needed
  if (contentModified) {
    await Deno.writeTextFile(jsFilePath, updatedContent);
    log.success(`Updated JS imports in: "${jsFilePath}"`);
  }
}

/**
 * Transpile HQL source code into JavaScript.
 */
export async function transpile(
  source: string,
  filePath: string = ".",
  options: TransformOptions = {}
): Promise<string> {
  const log = logger.createLogger("transpiler");
  
  try {
    log.start(`Transpiling source code`);
    const ast = parse(source);
    const currentDir = dirname(filePath);
    const visited = new Set<string>([normalizePath(filePath)]);
    const result = await transformAST(ast, currentDir, visited, options);
    log.success(`Successfully transpiled source code`);
    return result;
  } catch (error: any) {
    log.error(`Transpilation failed`, error);
    throw new Error(`Transpile error: ${error.message}`);
  }
}

/**
 * Transpile an HQL file to JavaScript with improved error handling.
 */
export async function transpileFile(
  inputPath: string,
  outputPath?: string,
  options: TransformOptions = {}
): Promise<string> {
  const opts = getDefaultOptions(options);
  const absPath = resolve(inputPath);
  const log = logger.createLogger("file-transpiler");
  
  try {
    log.start(`Transpiling file: "${absPath}"`);
    
    // Check if the file exists
    try {
      await Deno.stat(absPath);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`File not found: "${absPath}"`);
      }
      throw error;
    }
    
    // Read the source
    const source = await Deno.readTextFile(absPath);
    log.verbose(`Read source file (${source.length} bytes)`);
    
    // Transpile HQL to JS
    log.info(`Transpiling HQL source to JavaScript`);
    const transpiled = await transpile(source, absPath, opts);
    
    // If bundling is requested, write the transpiled output to a temporary file and bundle it
    if (opts.bundle) {
      const outputDir = dirname(absPath);
      const tempJsPath = join(outputDir, `.${basename(absPath)}.temp.js`);
      
      try {
        log.verbose(`Writing transpiled JS to temporary file: "${tempJsPath}"`);
        
        // Write transpiled output to a temporary file
        await Deno.writeTextFile(tempJsPath, transpiled);
        
        log.info(`Bundling the transpiled JavaScript`);
        // Bundle the transpiled output
        const bundled = await bundleJavaScript(tempJsPath, { 
          outputPath: outputPath,
          format: opts.module as "esm" | "commonjs", 
          verbose: opts.verbose 
        });
        
        // Clean up temporary file
        try {
          await Deno.remove(tempJsPath);
          log.verbose(`Removed temporary file: "${tempJsPath}"`);
        } catch (e) {
          // Ignore cleanup errors
          log.warning(`Failed to remove temporary file: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        // Write output if outputPath is provided but hasn't been written by bundleJavaScript
        if (outputPath && !await pathExists(outputPath)) {
          await writeOutput(bundled, outputPath);
          log.success(`Bundled output written to: "${outputPath}"`);
        }
        
        return bundled;
      } catch (error) {
        log.error(`Bundling error`, error);
        throw new Error(`Bundling failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Write output if outputPath is provided
    if (outputPath) {
      await writeOutput(transpiled, outputPath);
      log.success(`Transpiled output written to: "${outputPath}"`);
    }
    
    log.success(`Successfully transpiled: "${absPath}"`);
    return transpiled;
  } catch (error) {
    log.error(`Transpilation failed`, error);
    
    // Re-throw with a clearer message
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`File not found: "${inputPath}"`);
    }
    throw new Error(`Failed to transpile "${inputPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Write the transpiled code to a file with better error handling.
 */
export async function writeOutput(
  code: string, 
  outputPath: string
): Promise<void> {
  const log = logger.createLogger("file-writer");
  
  try {
    const outputDir = dirname(outputPath);
    
    // Ensure the output directory exists
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    
    await Deno.writeTextFile(outputPath, code);
    log.success(`Output written to: "${outputPath}"`);
  } catch (error) {
    log.error(`Failed to write output to "${outputPath}"`, error);
    throw new Error(`Failed to write output to "${outputPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default transpile;