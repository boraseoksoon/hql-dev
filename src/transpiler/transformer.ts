// src/transpiler/transformer.ts
import { HQLNode } from "./hql_ast.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { join, resolve } from "jsr:@std/path@1.0.8";
import { bundleFile, bundleJSModule } from "../bundler/bundler.ts";
import { TSSourceFile, TSNode, TSNodeType, TSRaw } from "./ts-ast-types.ts";

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
  await processJSImportsAST(tsAST, currentDir, visited);

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
 * Process JS imports by traversing the TS AST and inlining relative .js modules
 */
/**
 * Process JS imports by traversing the TS AST and handling relative .js modules appropriately
 */
/**
 * Process JS imports by traversing the TS AST and handling relative .js modules appropriately
 */
async function processJSImportsAST(
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
      
      // Find import statements (both JS and HQL)
      if (raw.code.startsWith("import")) {
        // Extract the module path from the import statement
        const match = raw.code.match(/["']([^"']+)["']/);
        if (match) {
          const importPath = match[1];
          
          // Only process relative imports
          if (importPath.startsWith("./") || importPath.startsWith("../")) {
            try {
              const fullPath = join(currentDir, importPath);
              
              // Handle HQL imports specially
              if (importPath.endsWith('.hql')) {
                // Check if the corresponding JS file exists or should be created
                const jsPath = fullPath.replace(/\.hql$/, '.js');
                
                // Update the import statement to use .js instead of .hql
                const newImportPath = importPath.replace(/\.hql$/, '.js');
                ast.statements[i] = { 
                  type: TSNodeType.Raw, 
                  code: raw.code.replace(importPath, newImportPath) 
                };
                
                // If we haven't already visited this HQL file, process it
                if (!visited.has(fullPath)) {
                  visited.add(fullPath);
                  try {
                    console.log(`Transpiling HQL import: ${fullPath}`);
                    const bundled = await bundleFile(fullPath, new Set([...visited]), true);
                    await Deno.writeTextFile(jsPath, bundled);
                    console.log(`Generated JS from HQL import: ${jsPath}`);
                  } catch (error) {
                    console.error(`Error bundling HQL import ${importPath}:`, error);
                  }
                }
              }
              // Handle JS imports
              else if (importPath.endsWith('.js')) {
                // Avoid circular dependencies
                if (!visited.has(fullPath)) {
                  visited.add(fullPath);
                  
                  // Check if the JS file exists
                  const jsContent = await Deno.readTextFile(fullPath);
                  
                  // Look for HQL imports in the JS file
                  const hqlImportRegex = /import\s+(?:\*\s+as\s+\w+|\w+|\{[^}]*\})\s+from\s+["']([^"']+\.hql)["'];/g;
                  let hqlMatch;
                  let hasHqlImports = false;
                  
                  while ((hqlMatch = hqlImportRegex.exec(jsContent)) !== null) {
                    hasHqlImports = true;
                    const hqlImportPath = hqlMatch[1];
                    
                    // Process HQL imports in the JS file
                    const hqlFullPath = resolve(join(dirname(fullPath), hqlImportPath));
                    const hqlJsPath = hqlFullPath.replace(/\.hql$/, '.js');
                    
                    if (!visited.has(hqlFullPath)) {
                      visited.add(hqlFullPath);
                      try {
                        console.log(`Transpiling nested HQL import: ${hqlFullPath}`);
                        const hqlBundled = await bundleFile(hqlFullPath, new Set([...visited]), true);
                        await Deno.writeTextFile(hqlJsPath, hqlBundled);
                        console.log(`Generated JS from nested HQL import: ${hqlJsPath}`);
                      } catch (error) {
                        console.error(`Error bundling nested HQL import ${hqlImportPath}:`, error);
                      }
                    }
                  }
                  
                  // If this JS file imports HQL files, we need to rewrite those imports
                  if (hasHqlImports) {
                    // Rewrite the JS file with updated imports
                    let updatedContent = jsContent;
                    const updateRegex = /import\s+(?:\*\s+as\s+\w+|\w+|\{[^}]*\})\s+from\s+["']([^"']+)\.hql["'];/g;
                    updatedContent = updatedContent.replace(updateRegex, (match, path) => {
                      return match.replace(`${path}.hql`, `${path}.js`);
                    });
                    
                    // Write the updated JS file
                    await Deno.writeTextFile(fullPath, updatedContent);
                    console.log(`Updated JS imports in: ${fullPath}`);
                  }
                }
              }
            } catch (error) {
              console.error(`Error processing import ${importPath}:`, error);
            }
          }
        }
      }
    }
  }
}

/**
 * Detect if a JavaScript file contains ESM syntax
 */
function detectESMSyntax(code: string): boolean {
  // Look for import/export statements at the top level
  const esmSyntaxRegex = /^(?:\s*(?:\/\/.*|\/\*[\s\S]*?\*\/))*\s*(?:import\s+|export\s+|import\s*\()/m;
  return esmSyntaxRegex.test(code);
}

import { parse } from "./parser.ts";
import { dirname } from "https://deno.land/std@0.170.0/path/mod.ts";

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
    const currentDir = dirname(resolve(filePath));
    
    // Track visited files to avoid circular dependencies
    const visited = new Set<string>([resolve(filePath)]);
    
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
    const absPath = resolve(inputPath);
    console.log(`Transpiling file: ${absPath}`);
    
    // Read the source file
    const source = await Deno.readTextFile(absPath);
    
    // Transpile with full path for import resolution
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
    const outputDir = dirname(outputPath);
    
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