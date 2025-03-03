// src/transpiler/transformer.ts - Updated to include macro expansion
import { HQLNode } from "./hql_ast.ts";
import { expandMacros } from "../macro.ts";
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
import { logVerbose } from "../logger.ts";
import {
  isExternalModule,
  normalizePath,
  resolveImportPath,
  hqlToJsPath,
  convertImportSpecifier,
  hasExtension,
  pathExists,
  resolveWithExtensions,
} from "./path-utils.ts";

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
 * Expand macros in the AST nodes
 */
function expandMacrosInAST(nodes: HQLNode[]): HQLNode[] {
  return nodes.map(node => expandMacros(node));
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
  
  if (opts.verbose) {
    console.log(`\n🔄 Transforming HQL AST in directory "${currentDir}"`);
    console.log(`  → Module type: ${opts.module}`);
    console.log(`  → Bundle: ${opts.bundle ? 'enabled' : 'disabled'}`);
  }

  try {
    // Step 1: Perform macro expansion on the AST
    const expandedNodes = nodes.map(node => expandMacros(node));
    if (opts.verbose) {
      logVerbose(`Expanded macros in HQL AST with ${expandedNodes.length} nodes`);
    }
    
    // Step 2: Transform expanded HQL to IR.
    const irProgram = transformToIR(expandedNodes, currentDir);
    if (opts.verbose) {
      logVerbose(`Transformed expanded HQL AST to IR with ${irProgram.body.length} nodes`);
    }
    
    // Step 3: Convert IR to TS AST.
    let tsAST = convertIRToTSAST(irProgram);
    if (opts.verbose) {
      logVerbose(`Converted IR to TS AST with ${tsAST.statements.length} statements`);
    }
    
    // Step 4: Process imports efficiently in a single pass
    if (!opts.preserveImports) {
      await processImportsInAST(tsAST, currentDir, visited, opts);
      if (opts.verbose) {
        logVerbose(`Processed imports in TS AST`);
      }
    }
    
    // Step 5: Generate code with optimized options.
    const codeOptions: CodeGenerationOptions = {
      formatting: opts.formatting,
      indentSize: opts.indentSize,
      useSpaces: opts.useSpaces,
      module: opts.module,
    };

    const code = generateTypeScript(tsAST, codeOptions);
    if (opts.verbose) {
      logVerbose(`Generated TypeScript code (${code.length} bytes)`);
    }
    
    return code;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ AST transformation failed: ${errorMessage}`);
    
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
  // Implementation remains the same - left unchanged for brevity
}

/**
 * Extract import information from an import statement.
 */
function extractImportInfo(importStatement: string): ImportInfo | null {
  // Implementation remains the same - left unchanged for brevity
  return null;
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
  // Implementation remains the same - left unchanged for brevity
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
    if (options.verbose) console.log(`Transpiling HQL import: "${fullPath}"`);
    
    // Read and transform the HQL file
    const source = await Deno.readTextFile(fullPath);
    const hqlAst = parse(source);
    const newCurrentDir = dirname(fullPath);
    
    // Apply macro expansion and transform with the same options
    const expandedAst = expandMacrosInAST(hqlAst);
    const transformed = await transformAST(
      expandedAst,
      newCurrentDir,
      new Set([...visited]),
      options
    );
    
    // Write the JS file
    const jsFullPath = hqlToJsPath(fullPath);
    await Deno.writeTextFile(jsFullPath, transformed);
    if (options.verbose) console.log(`Generated JS file: "${jsFullPath}"`);
  } catch (error) {
    console.error(`\n❌ Error processing HQL import ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
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
  // Implementation remains the same - left unchanged for brevity
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
  // Implementation remains the same - left unchanged for brevity
}

/**
 * Extract JavaScript imports with a more structured approach.
 */
function extractJsImports(jsContent: string): ImportInfo[] {
  // Implementation remains the same - left unchanged for brevity
  return [];
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
  // Implementation remains the same - left unchanged for brevity
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
    // Parse the source code to AST
    const ast = parse(source);
    
    // Get directory context for relative paths
    const currentDir = dirname(filePath);
    
    // Track visited files to prevent circular imports
    const visited = new Set<string>([normalizePath(filePath)]);
    
    // Apply the full transformation pipeline with macro expansion
    return await transformAST(ast, currentDir, visited, options);
  } catch (error: any) {
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
  
  try {
    if (opts.verbose) console.log(`\n🔨 Transpiling file: "${absPath}"`);
    
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
    if (opts.verbose) console.log(`  → Read source file (${source.length} bytes)`);
    
    // Transpile HQL to JS
    if (opts.verbose) console.log(`  → Transpiling HQL source to JavaScript`);
    const transpiled = await transpile(source, absPath, opts);
    
    // If bundling is requested, write the transpiled output to a temporary file and bundle it
    if (opts.bundle) {
      const outputDir = dirname(absPath);
      const tempJsPath = join(outputDir, `.${basename(absPath)}.temp.js`);
      
      try {
        if (opts.verbose) console.log(`  → Writing transpiled JS to temporary file: "${tempJsPath}"`);
        
        // Write transpiled output to a temporary file
        await Deno.writeTextFile(tempJsPath, transpiled);
        
        if (opts.verbose) console.log(`  → Bundling the transpiled JavaScript`);
        // Bundle the transpiled output
        const bundled = await bundleJavaScript(tempJsPath, { 
          outputPath: outputPath,
          format: opts.module as "esm" | "commonjs", 
          verbose: opts.verbose 
        });
        
        // Clean up temporary file
        try {
          await Deno.remove(tempJsPath);
          if (opts.verbose) console.log(`  → Removed temporary file: "${tempJsPath}"`);
        } catch (e) {
          // Ignore cleanup errors
          if (opts.verbose) console.warn(`  ⚠️ Failed to remove temporary file: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        // Write output if outputPath is provided but hasn't been written by bundleJavaScript
        if (outputPath && !await pathExists(outputPath)) {
          await writeOutput(bundled, outputPath);
          if (opts.verbose) console.log(`  → Bundled output written to: "${outputPath}"`);
        }
        
        return bundled;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Bundling error: ${errorMessage}`);
        throw new Error(`Bundling failed: ${errorMessage}`);
      }
    }
    
    // Write output if outputPath is provided
    if (outputPath) {
      await writeOutput(transpiled, outputPath);
      if (opts.verbose) console.log(`  → Transpiled output written to: "${outputPath}"`);
    }
    
    if (opts.verbose) console.log(`\n✅ Successfully transpiled: "${absPath}"`);
    return transpiled;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Transpilation failed: ${errorMessage}`);
    
    // Re-throw with a clearer message
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`File not found: "${inputPath}"`);
    }
    throw new Error(`Failed to transpile "${inputPath}": ${errorMessage}`);
  }
}

/**
 * Write the transpiled code to a file with better error handling.
 */
export async function writeOutput(
  code: string, 
  outputPath: string
): Promise<void> {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write output to "${outputPath}": ${errorMessage}`);
  }
}

export default transpile;