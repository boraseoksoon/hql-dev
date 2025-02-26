// src/transpileHQL.ts
import { parse } from "./parser.ts";
import { transformAST } from "./transformer.ts";
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Transpile HQL source code into JavaScript.
 *
 * @param source - The HQL source code.
 * @param filePath - The file path used for resolving relative imports.
 * @returns A promise that resolves with the transpiled JavaScript code.
 */
export async function transpileHQL(source: string, filePath: string = "."): Promise<string> {
  try {
    const ast = parse(source);
    const currentDir = dirname(resolve(filePath));
    const visited = new Set<string>();
    return await transformAST(ast, currentDir, visited);
  } catch (error: any) {
    throw new Error(`transpileHQL error: ${error.message}`);
  }
}
