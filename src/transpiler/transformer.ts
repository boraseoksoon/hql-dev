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
  hasExtension 
} from "./path-utils.ts";
import { parse } from "./parser.ts";

export interface TransformOptions {
  target?: 'javascript' | 'typescript';
  missingTypeStrategy?: 'omit' | 'any';
  propertyAccessStyle?: 'dot' | 'bracket';
  formatting?: 'minimal' | 'standard' | 'pretty';
  module?: 'esm' | 'commonjs';
  indentSize?: number;
  useSpaces?: boolean;
}

/**
 * Interface for representing an import in JavaScript/TypeScript code
 */
interface ImportInfo {
  importStatement: string;
  moduleName: string | null;
  importPath: string;
  isHQL: boolean;
}

/**
 * Transform HQL AST to JavaScript code
 */
export async function transformAST(
  nodes: HQLNode[],
  currentDir: string,
  visited: Set<string>,
  options: TransformOptions = {},
  inModule: boolean = false
): Promise<string> {
  // Default options for transformation
  const opts: TransformOptions = {
    target: options.target ?? 'javascript',
    missingTypeStrategy: options.missingTypeStrategy ?? 'omit',
    propertyAccessStyle: options.propertyAccessStyle ?? 'dot',
    formatting: options.formatting ?? 'standard',
    module: options.module ?? 'esm',
    indentSize: options.indentSize ?? 2,
    useSpaces: options.useSpaces ?? true,
  };
  
  // Force commonjs for modules included in other files
  if (inModule) opts.module = 'commonjs';

  // Step 1: Transform HQL to IR (Intermediate Representation)
  const irProgram = transformToIR(nodes, currentDir);
  
  // Step 2: Convert IR to TypeScript AST
  let tsAST = convertIRToTSAST(irProgram);

  // Step 3: Process JS imports by inlining them within the TS AST
  await processImportsInAST(tsAST, currentDir, visited);

  // Step 4: Generate code from the TS AST
  const codeOptions: CodeGenerationOptions = {
    formatting: opts.formatting,
    indentSize: opts.indentSize,
    useSpaces: opts.useSpaces,
    module: opts.module
  };

  return generateTypeScript(tsAST, codeOptions);
}

/**
 * Process imports in the TypeScript AST
 */
async function processImportsInAST(
  ast: TSSourceFile, 
  currentDir: string, 
  visited: Set<string>
): Promise<void> {
  // Loop through all statements in the AST
  for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i];
    
    // Look for raw import statements
    if (stmt.type === TSNodeType.Raw) {
      const raw = stmt as TSRaw;
      
      // Find import statements
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
 * Extract import information from an import statement
 */
function extractImportInfo(importStatement: string): ImportInfo | null {
  // Extract the module path
  const pathMatch = importStatement.match(/from\s+["']([^"']+)["']/);
  if (!pathMatch) return null;
  
  const importPath = pathMatch[1];
  
  // Extract the module name for "*" imports
  const moduleNameMatch = importStatement.match(/import\s+\*\s+as\s+(\w+)/);
  const moduleName = moduleNameMatch ? moduleNameMatch[1] : null;
  
  return {
    importStatement,
    moduleName,
    importPath,
    isHQL: importPath.endsWith('.hql')
  };
}

/**
 * Process an import based on its type
 */
async function processImport(
  ast: TSSourceFile,
  statementIndex: number,
  importInfo: ImportInfo,
  currentDir: string,
  visited: Set<string>
): Promise<void> {
  const { importStatement, importPath, isHQL } = importInfo;
  
  // Only process relative imports
  if (!importPath.startsWith('./') && !importPath.startsWith('../') && !isExternalModule(importPath)) {
    return;
  }
  
  const fullPath = resolveImportPath(importPath, currentDir);
  
  // Handle HQL imports
  if (isHQL) {
    await processHqlImport(ast, statementIndex, importStatement, importPath, fullPath, visited);
  } 
  // Handle JS imports that might contain HQL imports
  else if (hasExtension(importPath, '.js')) {
    await processJsImport(fullPath, visited);
  }
}

/**
 * Process an HQL import 
 */
async function processHqlImport(
  ast: TSSourceFile,
  statementIndex: number,
  importStatement: string,
  importPath: string,
  fullPath: string,
  visited: Set<string>
): Promise<void> {
  // Update the import statement to use .js instead of .hql
  const jsImportPath = hqlToJsPath(importPath);
  const jsFullPath = hqlToJsPath(fullPath);
  
  // Update the import in the AST
  ast.statements[statementIndex] = { 
    type: TSNodeType.Raw, 
    code: importStatement.replace(importPath, jsImportPath) 
  };
  
  // If we haven't already visited this HQL file, process it
  if (!visited.has(fullPath)) {
    visited.add(fullPath);
    try {
      console.log(`Transpiling HQL import: ${fullPath}`);
      const bundled = await bundleFile(fullPath, new Set([...visited]), true);
      await Deno.writeTextFile(jsFullPath, bundled);
      console.log(`Generated JS from HQL import: ${jsFullPath}`);
    } catch (error) {
      console.error(`Error bundling HQL import ${importPath}:`, error);
    }
  }
}

/**
 * Process a JS import that might contain HQL imports
 */
/**
 * Process a JS import that might contain HQL imports
 */
async function processJsImport(
  fullPath: string,
  visited: Set<string>
): Promise<void> {
  // Skip if already visited or if it's an external module
  if (visited.has(fullPath) || isExternalModule(fullPath)) {
    return;
  }
  
  visited.add(fullPath);
  
  try {
    // Read the JS file (only for local files)
    const jsContent = await Deno.readTextFile(fullPath);
    
    // Extract all imports from the JS file
    const imports = extractAllImports(jsContent);
    const hqlImports = imports.filter(imp => imp.isHQL);
    
    // Process any HQL imports found in the JS file
    if (hqlImports.length > 0) {
      await processHqlImportsInJsFile(fullPath, jsContent, hqlImports, visited);
    }
  } catch (error) {
    console.error(`Error processing JS import ${fullPath}:`, error);
  }
}

/**
 * Extract all imports from a JavaScript file
 */
function extractAllImports(jsContent: string): ImportInfo[] {
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
      isHQL: importPath.endsWith('.hql')
    });
  }
  
  return imports;
}

/**
 * Process HQL imports found in a JS file
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
  
  // Process each HQL import
  for (const importInfo of hqlImports) {
    const { importStatement, importPath } = importInfo;
    const fullHqlPath = resolveImportPath(importPath, jsFileDir);
    const jsImportPath = hqlToJsPath(importPath);
    
    // Process the HQL file if not already processed
    if (!visited.has(fullHqlPath)) {
      visited.add(fullHqlPath);
      try {
        console.log(`Transpiling nested HQL import: ${fullHqlPath}`);
        const hqlJsPath = hqlToJsPath(fullHqlPath);
        const bundled = await bundleFile(fullHqlPath, new Set([...visited]), true);
        await Deno.writeTextFile(hqlJsPath, bundled);
        console.log(`Generated JS from nested HQL import: ${hqlJsPath}`);
      } catch (error) {
        console.error(`Error bundling nested HQL import ${importPath}:`, error);
      }
    }
    
    // Update the import statement in the JS content
    const newImportStatement = importStatement.replace(importPath, jsImportPath);
    if (newImportStatement !== importStatement) {
      updatedContent = updatedContent.replace(importStatement, newImportStatement);
      contentModified = true;
    }
  }
  
  // Write the updated JS file if imports were modified
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
    // Parse the source code to AST
    const ast = parse(source);
    
    // Get the directory for resolving relative imports
    const currentDir = getDirectory(filePath);
    
    // Track visited files to avoid circular dependencies
    const visited = new Set<string>([filePath]);
    
    // Transform AST to JavaScript
    return await transformAST(ast, currentDir, visited, {
      module: 'esm'  // Default to ESM for top-level files
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
    console.log(`Transpiling file: ${inputPath}`);
    
    // Read the source file
    const source = await Deno.readTextFile(inputPath);
    
    // Transpile with full path for import resolution
    return await transpile(source, inputPath);
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
    
    // Ensure the output directory exists
    await Deno.mkdir(outputDir, { recursive: true });
    
    // Write the output file
    await Deno.writeTextFile(outputPath, code);
    console.log(`Output written to: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

export default transpile;