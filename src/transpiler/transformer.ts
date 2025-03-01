// src/transpiler/transformer.ts
import { HQLNode } from "./hql_ast.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { bundleFile } from "../bundler/bundler.ts";
import { TSSourceFile, TSNode, TSNodeType, TSRaw } from "./ts-ast-types.ts";
import {
  isExternalModule,
  resolveImportPath,
  hqlToJsPath,
  getDirectory,
  hasExtension,
  normalizePath,
  resolveWithExtensions,
  convertImportSpecifier
} from "./path-utils.ts";
import { parse } from "./parser.ts";
// ★ NEW: Import dirname (and resolve) from the Deno std path module.
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";

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
  preserveImports?: boolean; // New: whether to keep import statements
}

/**
 * Transform HQL AST to JavaScript code.
 */
export async function transformAST(
  nodes: HQLNode[],
  currentDir: string,
  visited = new Set<string>(),
  options: TransformOptions = {},
  inModule: boolean = false
): Promise<string> {
  const opts: TransformOptions = {
    target: options.target ?? "javascript",
    missingTypeStrategy: options.missingTypeStrategy ?? "omit",
    propertyAccessStyle: options.propertyAccessStyle ?? "dot",
    formatting: options.formatting ?? "standard",
    module: options.module ?? "esm",
    indentSize: options.indentSize ?? 2,
    useSpaces: options.useSpaces ?? true,
    preserveImports: options.preserveImports ?? false,
  };

  if (inModule) opts.module = "commonjs";

  // Step 1: Transform HQL to IR.
  const irProgram = transformToIR(nodes, currentDir);
  // Step 2: Convert IR to TS AST.
  let tsAST = convertIRToTSAST(irProgram);
  // Step 3: Process imports.
  await processImportsInAST(tsAST, currentDir, visited, opts);
  // Step 4: Generate code.
  const codeOptions: CodeGenerationOptions = {
    formatting: opts.formatting,
    indentSize: opts.indentSize,
    useSpaces: opts.useSpaces,
    module: opts.module,
  };

  return generateTypeScript(tsAST, codeOptions);
}

/**
 * Process imports in the TS AST.
 */
async function processImportsInAST(
  ast: TSSourceFile,
  currentDir: string,
  visited: Set<string>,
  options: TransformOptions
): Promise<void> {
  if (options.preserveImports) return;
  for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i];
    if (stmt.type === TSNodeType.Raw) {
      const raw = stmt as TSRaw;
      if (raw.code.startsWith("import")) {
        const importInfo = extractImportInfo(raw.code);
        if (importInfo) {
          await processImport(ast, i, importInfo, currentDir, visited);
        }
      }
    }
  }
}

/**
 * Extract import information from an import statement.
 */
function extractImportInfo(importStatement: string): ImportInfo | null {
  const pathMatch = importStatement.match(/from\s+["']([^"']+)["']/);
  if (!pathMatch) return null;
  const importPath = pathMatch[1];
  const moduleNameMatch = importStatement.match(/import\s+\*\s+as\s+(\w+)/);
  const moduleName = moduleNameMatch ? moduleNameMatch[1] : null;
  return {
    importStatement,
    moduleName,
    importPath,
    isHQL: importPath.endsWith(".hql"),
    isExternal: isExternalModule(importPath),
  };
}

interface ImportInfo {
  importStatement: string;
  moduleName: string | null;
  importPath: string;
  isHQL: boolean;
  isExternal: boolean;
}

/**
 * Process an import based on its type.
 */
async function processImport(
  ast: TSSourceFile,
  statementIndex: number,
  importInfo: ImportInfo,
  currentDir: string,
  visited: Set<string>
): Promise<void> {
  const { importStatement, importPath, isHQL, isExternal } = importInfo;
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
  let fullPath = resolveImportPath(importPath, currentDir);
  if (isHQL) {
    await processHqlImport(
      ast,
      statementIndex,
      importStatement,
      importPath,
      fullPath,
      visited
    );
  } else if (hasExtension(importPath, ".js")) {
    await processJsImport(fullPath, visited);
  } else {
    await processUnknownImport(
      ast,
      statementIndex,
      importStatement,
      importPath,
      currentDir,
      visited
    );
  }
}

/**
 * Process an HQL import.
 */
async function processHqlImport(
  ast: TSSourceFile,
  statementIndex: number,
  importStatement: string,
  importPath: string,
  fullPath: string,
  visited: Set<string>
): Promise<void> {
  const jsImportPath = hqlToJsPath(importPath);
  const jsFullPath = hqlToJsPath(fullPath);
  ast.statements[statementIndex] = {
    type: TSNodeType.Raw,
    code: importStatement.replace(importPath, jsImportPath),
  };
  if (!visited.has(normalizePath(fullPath))) {
    visited.add(normalizePath(fullPath));
    try {
      console.log(`Transpiling HQL import: ${fullPath}`);
      const source = await Deno.readTextFile(fullPath);
      const hqlAst = parse(source);
      // ★ Use dirname to set the new current directory for the imported file.
      const newCurrentDir = dirname(fullPath);
      const transformed = await transformAST(
        hqlAst,
        newCurrentDir,
        new Set([...visited]),
        { module: "esm" }
      );
      await Deno.writeTextFile(jsFullPath, transformed);
      console.log(`Generated JS file: ${jsFullPath}`);
    } catch (error) {
      console.error(`Error processing HQL import ${importPath}:`, error);
    }
  }
}

/**
 * Process a JS import that might contain HQL imports.
 */
async function processJsImport(fullPath: string, visited: Set<string>): Promise<void> {
  if (visited.has(normalizePath(fullPath)) || isExternalModule(fullPath)) return;
  visited.add(normalizePath(fullPath));
  try {
    const jsContent = await Deno.readTextFile(fullPath);
    const imports = extractAllJsImports(jsContent);
    const hqlImports = imports.filter((imp) => imp.isHQL);
    if (hqlImports.length > 0) {
      await processHqlImportsInJsFile(fullPath, jsContent, hqlImports, visited);
    }
  } catch (error) {
    console.error(`Error processing JS import ${fullPath}:`, error);
  }
}

/**
 * Process an import with unknown extension.
 */
async function processUnknownImport(
  ast: TSSourceFile,
  statementIndex: number,
  importStatement: string,
  importPath: string,
  currentDir: string,
  visited: Set<string>
): Promise<void> {
  const basePath = resolveImportPath(importPath, currentDir);
  const resolvedPath = await resolveWithExtensions(basePath);
  if (resolvedPath) {
    if (resolvedPath.endsWith(".hql")) {
      await processHqlImport(
        ast,
        statementIndex,
        importStatement,
        importPath,
        resolvedPath,
        visited
      );
    } else if (resolvedPath.endsWith(".js")) {
      const relativePath = importPath + (importPath.endsWith("/") ? "index.js" : ".js");
      ast.statements[statementIndex] = {
        type: TSNodeType.Raw,
        code: importStatement.replace(importPath, relativePath),
      };
      await processJsImport(resolvedPath, visited);
    } else {
      const ext = resolvedPath.substring(resolvedPath.lastIndexOf("."));
      const relativePath = importPath + ext;
      ast.statements[statementIndex] = {
        type: TSNodeType.Raw,
        code: importStatement.replace(importPath, relativePath),
      };
    }
  }
}

/**
 * Extract all JS imports from file content.
 */
function extractAllJsImports(jsContent: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const importRegex = /import\s+(?:\*\s+as\s+(\w+)|\w+|\{[^}]*\})\s+from\s+["']([^"']+)["'];/g;
  let match;
  while ((match = importRegex.exec(jsContent)) !== null) {
    const moduleName = match[1] || null;
    const importPath = match[2];
    imports.push({
      importStatement: match[0],
      moduleName,
      importPath,
      isHQL: importPath.endsWith(".hql"),
      isExternal: isExternalModule(importPath),
    });
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
  visited: Set<string>
): Promise<void> {
  const jsFileDir = getDirectory(jsFilePath);
  let updatedContent = jsContent;
  let contentModified = false;
  for (const importInfo of hqlImports) {
    const { importStatement, importPath } = importInfo;
    const fullHqlPath = resolveImportPath(importPath, jsFileDir);
    const jsImportPath = hqlToJsPath(importPath);
    if (!visited.has(normalizePath(fullHqlPath))) {
      visited.add(normalizePath(fullHqlPath));
      try {
        console.log(`Transpiling nested HQL import: ${fullHqlPath}`);
        const source = await Deno.readTextFile(fullHqlPath);
        const hqlAst = parse(source);
        const newCurrentDir = dirname(fullHqlPath);
        const transformed = await transformAST(
          hqlAst,
          newCurrentDir,
          new Set([...visited]),
          { module: "esm" }
        );
        const hqlJsPath = hqlToJsPath(fullHqlPath);
        await Deno.writeTextFile(hqlJsPath, transformed);
        console.log(`Generated JS from nested HQL import: ${hqlJsPath}`);
      } catch (error) {
        console.error(`Error processing nested HQL import ${importPath}:`, error);
      }
    }
    const newImportStatement = importStatement.replace(importPath, jsImportPath);
    if (newImportStatement !== importStatement) {
      updatedContent = updatedContent.replace(importStatement, newImportStatement);
      contentModified = true;
    }
  }
  if (contentModified) {
    await Deno.writeTextFile(jsFilePath, updatedContent);
    console.log(`Updated JS imports in: ${jsFilePath}`);
  }
}

/**
 * Transpile HQL source code into JavaScript.
 */
export async function transpile(
  source: string,
  filePath: string = "."
): Promise<string> {
  try {
    const ast = parse(source);
    const currentDir = getDirectory(filePath);
    const visited = new Set<string>([normalizePath(filePath)]);
    return await transformAST(ast, currentDir, visited, {
      module: "esm",
    });
  } catch (error: any) {
    throw new Error(`Transpile error: ${error.message}`);
  }
}

/**
 * Transpile an HQL file to JavaScript.
 */
export async function transpileFile(inputPath: string): Promise<string> {
  try {
    const absPath = resolve(inputPath);
    console.log(`Transpiling file: ${absPath}`);
    const source = await Deno.readTextFile(absPath);
    return await transpile(source, absPath);
  } catch (error: any) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`File not found: ${inputPath}`);
    }
    throw error;
  }
}

/**
 * Write the transpiled code to a file.
 */
export async function writeOutput(code: string, outputPath: string): Promise<void> {
  try {
    const outputDir = getDirectory(outputPath);
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    await Deno.writeTextFile(outputPath, code);
    console.log(`Output written to: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

export default transpile;
