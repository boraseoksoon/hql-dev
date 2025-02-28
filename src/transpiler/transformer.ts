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
async function processJSImportsAST(
  ast: TSSourceFile, 
  currentDir: string, 
  visited: Set<string>
): Promise<void> {
  // Loop through all statements in the AST
  for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i];
    
    // Look for raw import statements (for JS files)
    if (stmt.type === TSNodeType.Raw) {
      const raw = stmt as TSRaw;
      
      // Find JS import statements
      if (raw.code.startsWith("import") && raw.code.includes('.js')) {
        // Extract the module path from the import statement
        const match = raw.code.match(/["']([^"']+\.js)["']/);
        if (match) {
          const importPath = match[1];
          
          // Only process relative imports
          if (importPath.startsWith("./") || importPath.startsWith("../")) {
            try {
              const fullPath = join(currentDir, importPath);
              
              // Avoid circular dependencies
              if (!visited.has(fullPath)) {
                visited.add(fullPath);
                
                // Check if the JS file has ESM syntax
                const jsContent = await Deno.readTextFile(fullPath);
                if (detectESMSyntax(jsContent)) {
                  // For ESM modules, don't inline - keep the import statement as is
                  // Just modify the path if needed
                  continue;
                } else {
                  // Only inline non-ESM JS modules
                  const bundled = await bundleJSModule(fullPath, new Set<string>([...visited]));
                  
                  // Create a comment about the inlined module
                  ast.statements[i] = { 
                    type: TSNodeType.Raw, 
                    code: `// Inlined from ${importPath}\n${bundled}` 
                  };
                }
              } else {
                console.warn(`Circular dependency detected: ${fullPath}`);
              }
            } catch (error) {
              console.error(`Error processing JS module ${importPath}:`, error);
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