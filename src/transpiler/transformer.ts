// src/transpiler/transformer.ts
import { HQLNode } from "./hql_ast.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { TSSourceFile, TSNodeType, TSRaw } from "./ts-ast-types.ts";
import {
  isExternalModule,
  resolveImportPath,
  hqlToJsPath,
  getDirectory,
  hasExtension,
  normalizePath,
  resolveWithExtensions,
  convertImportSpecifier,
  pathExists
} from "./path-utils.ts";
import { parse } from "./parser.ts";
import { dirname, resolve, join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { bundleJavaScript } from "../bundler/bundler.ts";

// Cache for processed imports to avoid redundant processing
const processedImportsCache = new Map<string, Set<string>>();

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
  bundle?: boolean; // New: bundle the output to a single file
  verbose?: boolean; // New: enable verbose logging
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
 * Transform HQL AST to JavaScript code.
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

  // Step 1: Transform HQL to IR.
  const irProgram = transformToIR(nodes, currentDir);
  
  // Step 2: Convert IR to TS AST.
  let tsAST = convertIRToTSAST(irProgram);
  
  // Step 3: Process imports efficiently in a single pass
  if (!opts.preserveImports) {
    await processImportsInAST(tsAST, currentDir, visited, opts);
  }
  
  // Step 4: Generate code with optimized options.
  const codeOptions: CodeGenerationOptions = {
    formatting: opts.formatting,
    indentSize: opts.indentSize,
    useSpaces: opts.useSpaces,
    module: opts.module,
  };

  return generateTypeScript(tsAST, codeOptions);
}

/**
 * Extract import information using a type-safe structure
 */
interface ImportInfo {
  importStatement: string;
  moduleName: string | null;
  importPath: string;
  isHQL: boolean;
  isExternal: boolean;
}

/**
 * Process imports in the TS AST efficiently.
 * Uses a cache to avoid redundant processing.
 */
async function processImportsInAST(
  ast: TSSourceFile,
  currentDir: string,
  visited: Set<string>,
  options: Required<TransformOptions>
): Promise<void> {
  // Process all imports in parallel for better performance
  const importPromises: Promise<void>[] = [];
  
  for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i];
    if (stmt.type === TSNodeType.Raw) {
      const raw = stmt as TSRaw;
      if (raw.code.startsWith("import")) {
        const importInfo = extractImportInfo(raw.code);
        if (importInfo) {
          // Queue the import processing
          importPromises.push(
            processImport(ast, i, importInfo, currentDir, visited, options)
          );
        }
      }
    }
  }
  
  // Wait for all imports to be processed
  await Promise.all(importPromises);
}

/**
 * Extract import information with improved regex pattern for resilience.
 */
function extractImportInfo(importStatement: string): ImportInfo | null {
  // More robust regex that handles complex import statements
  const pathMatch = importStatement.match(/from\s+["']([^"']+)["']/);
  if (!pathMatch) return null;
  
  const importPath = pathMatch[1];
  
  // Match different import patterns
  const defaultImportMatch = importStatement.match(/import\s+(\w+)\s+from/);
  const namespaceImportMatch = importStatement.match(/import\s+\*\s+as\s+(\w+)\s+from/);
  
  const moduleName = 
    (namespaceImportMatch ? namespaceImportMatch[1] : null) || 
    (defaultImportMatch ? defaultImportMatch[1] : null);
  
  return {
    importStatement,
    moduleName,
    importPath,
    isHQL: importPath.endsWith(".hql"),
    isExternal: isExternalModule(importPath),
  };
}

/**
 * Process an import based on its type.
 * Uses a cache to avoid redundant processing.
 */
async function processImport(
  ast: TSSourceFile,
  statementIndex: number,
  importInfo: ImportInfo,
  currentDir: string,
  visited: Set<string>,
  options: Required<TransformOptions>
): Promise<void> {
  const { importStatement, importPath, isHQL, isExternal } = importInfo;
  
  // Handle external modules efficiently
  if (isExternal) {
    const convertedPath = convertImportSpecifier(importPath);
    if (convertedPath !== importPath) {
      ast.statements[statementIndex] = {
        type: TSNodeType.Raw,
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
    ast.statements[statementIndex] = {
      type: TSNodeType.Raw,
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
  const normalizedPath = normalizePath(fullPath);
  
  // Prevent circular processing
  visited.add(normalizedPath);
  
  try {
    if (options.verbose) console.log(`Transpiling HQL import: ${fullPath}`);
    
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
    if (options.verbose) console.log(`Generated JS file: ${jsFullPath}`);
  } catch (error) {
    console.error(`Error processing HQL import ${fullPath}:`, error);
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
  const normalizedPath = normalizePath(fullPath);
  
  // Prevent circular processing
  if (visited.has(normalizedPath) || isExternalModule(fullPath)) return;
  visited.add(normalizedPath);
  
  try {
    // Check if file exists
    if (!await pathExists(fullPath)) {
      console.warn(`JS import file not found: ${fullPath}`);
      return;
    }
    
    // Read the JS file
    const jsContent = await Deno.readTextFile(fullPath);
    
    // Extract and process any HQL imports
    const imports = extractJsImports(jsContent);
    const hqlImports = imports.filter(imp => imp.isHQL);
    
    if (hqlImports.length > 0) {
      await processHqlImportsInJsFile(fullPath, jsContent, hqlImports, visited, options);
    }
  } catch (error) {
    console.error(`Error processing JS import ${fullPath}:`, error);
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
  // Try to resolve the actual file
  const basePath = resolveImportPath(importPath, currentDir);
  const resolvedPath = await resolveWithExtensions(basePath);
  
  if (!resolvedPath) {
    console.warn(`Could not resolve import: ${importPath}`);
    return;
  }
  
  if (resolvedPath.endsWith(".hql")) {
    // Handle as HQL import
    const jsImportPath = hqlToJsPath(importPath);
    ast.statements[statementIndex] = {
      type: TSNodeType.Raw,
      code: importStatement.replace(importPath, jsImportPath),
    };
    
    await processHqlImport(resolvedPath, visited, options);
  } else if (resolvedPath.endsWith(".js")) {
    // Handle as JS import
    const relativePath = importPath + (importPath.endsWith("/") ? "index.js" : ".js");
    ast.statements[statementIndex] = {
      type: TSNodeType.Raw,
      code: importStatement.replace(importPath, relativePath),
    };
    
    await processJsImport(resolvedPath, visited, options);
  } else {
    // Handle other file types
    const ext = resolvedPath.substring(resolvedPath.lastIndexOf("."));
    const relativePath = importPath + ext;
    ast.statements[statementIndex] = {
      type: TSNodeType.Raw,
      code: importStatement.replace(importPath, relativePath),
    };
  }
}

/**
 * Extract all JS imports from file content with improved regex patterns.
 */
function extractJsImports(jsContent: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  
  // Enhanced regex patterns for better import detection
  const importRegexPatterns = [
    // Default import: import name from 'path';
    /import\s+(\w+)\s+from\s+["']([^"']+)["'];/g,
    
    // Named imports: import { name, x as y } from 'path';
    /import\s+\{\s*((?:[^{}]|{[^{}]*})*?)\s*\}\s+from\s+["']([^"']+)["'];/g,
    
    // Namespace import: import * as name from 'path';
    /import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];/g,
    
    // Mixed imports: import name, { x, y } from 'path';
    /import\s+(\w+)\s*,\s*\{\s*((?:[^{}]|{[^{}]*})*?)\s*\}\s+from\s+["']([^"']+)["'];/g,
    
    // Side-effect only import: import 'path';
    /import\s+["']([^"']+)["'];/g
  ];
  
  for (const regex of importRegexPatterns) {
    let match;
    while ((match = regex.exec(jsContent)) !== null) {
      // Handle different import types based on regex pattern
      if (regex.source.startsWith('import\\s+\\w+\\s+from')) {
        // Default import
        imports.push({
          importStatement: match[0],
          moduleName: match[1],
          importPath: match[2],
          isHQL: match[2].endsWith('.hql'),
          isExternal: isExternalModule(match[2])
        });
      } else if (regex.source.startsWith('import\\s+\\{')) {
        // Named imports
        imports.push({
          importStatement: match[0],
          moduleName: null,
          importPath: match[2],
          isHQL: match[2].endsWith('.hql'),
          isExternal: isExternalModule(match[2])
        });
      } else if (regex.source.startsWith('import\\s+\\*')) {
        // Namespace import
        imports.push({
          importStatement: match[0],
          moduleName: match[1],
          importPath: match[2],
          isHQL: match[2].endsWith('.hql'),
          isExternal: isExternalModule(match[2])
        });
      } else if (regex.source.startsWith('import\\s+\\w+\\s*,')) {
        // Mixed import
        imports.push({
          importStatement: match[0],
          moduleName: match[1],
          importPath: match[3],
          isHQL: match[3].endsWith('.hql'),
          isExternal: isExternalModule(match[3])
        });
      } else if (regex.source.startsWith('import\\s+["\']')) {
        // Side-effect only import
        imports.push({
          importStatement: match[0],
          moduleName: null,
          importPath: match[1],
          isHQL: match[1].endsWith('.hql'),
          isExternal: isExternalModule(match[1])
        });
      }
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
  const jsFileDir = getDirectory(jsFilePath);
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
    if (options.verbose) console.log(`Updated JS imports in: ${jsFilePath}`);
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
  try {
    const ast = parse(source);
    const currentDir = getDirectory(filePath);
    const visited = new Set<string>([normalizePath(filePath)]);
    return await transformAST(ast, currentDir, visited, options);
  } catch (error: any) {
    throw new Error(`Transpile error: ${error.message}`);
  }
}

/**
 * Transpile an HQL file to JavaScript.
 */
export async function transpileFile(
  inputPath: string,
  outputPath?: string,
  options: TransformOptions = {}
): Promise<string> {
  try {
    const absPath = resolve(inputPath);
    if (options.verbose) console.log(`Transpiling file: ${absPath}`);
    const source = await Deno.readTextFile(absPath);
    
    // Transpile HQL to JS
    const transpiled = await transpile(source, absPath, options);
    
    // If bundling is requested, write the transpiled output to a temporary file and bundle it
    if (options.bundle) {
      const outputDir = dirname(absPath);
      const tempJsPath = join(outputDir, `.${basename(absPath)}.temp.js`);
      
      try {
        if (options.verbose) console.log(`Writing transpiled JS to temporary file: ${tempJsPath}`);
        
        // Write transpiled output to a temporary file
        await Deno.writeTextFile(tempJsPath, transpiled);
        
        // Bundle the transpiled output
        const bundled = await bundleJavaScript(tempJsPath, {
          format: options.module as "esm" | "commonjs",
          verbose: options.verbose
        });
        
        // Clean up temporary file
        try {
          await Deno.remove(tempJsPath);
        } catch (e) {
          // Ignore cleanup errors
          if (options.verbose) console.warn(`Failed to remove temporary file: ${e.message}`);
        }
        
        // Write output if outputPath is provided
        if (outputPath) {
          await writeOutput(bundled, outputPath);
          if (options.verbose) console.log(`Bundled output written to: ${outputPath}`);
        }
        
        return bundled;
      } catch (error) {
        throw new Error(`Bundling error: ${error.message}`);
      }
    }
    
    // Write output if outputPath is provided
    if (outputPath) {
      await writeOutput(transpiled, outputPath);
      if (options.verbose) console.log(`Transpiled output written to: ${outputPath}`);
    }
    
    return transpiled;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`File not found: ${inputPath}`);
    }
    throw error;
  }
}

/**
 * Write the transpiled code to a file.
 */
export async function writeOutput(
  code: string, 
  outputPath: string
): Promise<void> {
  try {
    const outputDir = getDirectory(outputPath);
    
    // Ensure the output directory exists
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    
    await Deno.writeTextFile(outputPath, code);
  } catch (error: any) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

export default transpile;