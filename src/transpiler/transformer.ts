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
  module?: 'commonjs' | 'esm';
  indentSize?: number;
  useSpaces?: boolean;
}

export async function transformAST(
  nodes: HQLNode[],
  currentDir: string,
  visited: Set<string>,
  options: TransformOptions = {},
  inModule: boolean = false
): Promise<string> {
  const opts: TransformOptions = {
    target: options.target ?? 'javascript',
    missingTypeStrategy: options.missingTypeStrategy ?? 'omit',
    propertyAccessStyle: options.propertyAccessStyle ?? 'dot',
    formatting: options.formatting ?? 'standard',
    module: options.module ?? 'esm',
    indentSize: options.indentSize ?? 2,
    useSpaces: options.useSpaces ?? true,
  };
  if (inModule) opts.module = 'commonjs';

  // Transform HQL to IR and then to TS AST
  const irProgram = transformToIR(nodes, currentDir);
  let tsAST = convertIRToTSAST(irProgram);

  // Process JS imports by inlining them within the TS AST
  await processJSImportsAST(tsAST, currentDir, visited);

  // (Additional structural transforms can be added here if needed.)

  // Generate code from the TS AST
  const codeOptions: CodeGenerationOptions = {
    formatting: opts.formatting,
    indentSize: opts.indentSize,
    useSpaces: opts.useSpaces,
    module: opts.module
  };

  const jsCode = generateTypeScript(tsAST, codeOptions);
  return jsCode;
}

/** Process JS imports by traversing the TS AST and inlining relative .js modules */
async function processJSImportsAST(ast: TSSourceFile, currentDir: string, visited: Set<string>): Promise<void> {
  for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i];
    if (stmt.type === TSNodeType.Raw) {
      const raw = stmt as TSRaw;
      if (raw.code.startsWith("import") && raw.code.includes('.js')) {
        // Extract the module path from the import statement
        const match = raw.code.match(/["']([^"']+\.js)["']/);
        if (match) {
          const importPath = match[1];
          if (importPath.startsWith("./") || importPath.startsWith("../")) {
            try {
              const fullPath = join(currentDir, importPath);
              const bundled = await bundleJSModule(fullPath, new Set<string>([...visited]));
              ast.statements[i] = { type: TSNodeType.Raw, code: `// Inlined from ${importPath}\n${bundled}` };
            } catch (error) {
              console.error(`Error bundling JS module ${importPath}:`, error);
            }
          }
        }
      }
    }
  }
}

import { parse } from "./parser.ts";
import { dirname } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Transpile HQL source code into JavaScript.
 */
export async function transpile(source: string, filePath: string = "."): Promise<string> {
  try {
    const ast = parse(source);
    const currentDir = dirname(resolve(filePath));
    const visited = new Set<string>([resolve(filePath)]);
    return await transformAST(ast, currentDir, visited, {
      module: 'esm'
    });
  } catch (error: any) {
    throw new Error(`Transpile error: ${error.message}`);
  }
}

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

export async function writeOutput(code: string, outputPath: string): Promise<void> {
  try {
    const outputDir = dirname(outputPath);
    await Deno.mkdir(outputDir, { recursive: true });
    await Deno.writeTextFile(outputPath, code);
    console.log(`Output written to: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

export default transpile;
