// src/transpiler/transformer.ts

import { parse } from "./parser.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { dirname, resolve } from "../platform/platform.ts";

export interface TransformOptions {
  verbose?: boolean;
  module?: "esm" | "commonjs";
}

export async function transformAST(source: string, filePath: string, options: TransformOptions = {}): Promise<string> {
  const astNodes = parse(source);
  const currentDir = dirname(filePath);
  const ir = transformToIR(astNodes, currentDir);
  const tsAST = convertIRToTSAST(ir);
  const codeOptions: CodeGenerationOptions = {
    indentSize: 2,
    useSpaces: true,
    formatting: "standard",
    module: options.module || "esm"
  };
  const tsCode = generateTypeScript(tsAST, codeOptions);
  return tsCode;
}

export async function transpile(source: string, filePath: string, options: TransformOptions = {}): Promise<string> {
  try {
    const code = await transformAST(source, filePath, options);
    return code;
  } catch (error) {
    throw new Error(`Transpile error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function transpileFile(inputPath: string, outputPath?: string, options: TransformOptions = {}): Promise<string> {
  const absPath = resolve(inputPath);
  try {
    const source = await Deno.readTextFile(absPath);
    const tsCode = await transpile(source, absPath, options);
    if (outputPath) {
      await Deno.writeTextFile(outputPath, tsCode);
    }
    return tsCode;
  } catch (error) {
    throw new Error(`Failed to transpile "${inputPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default transpile;
