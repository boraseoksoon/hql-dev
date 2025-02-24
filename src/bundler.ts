// src/bundler.ts
import { parse } from "./parser.ts";
import { expandMacros } from "./macro.ts";
import { transformAST } from "./transformer.ts";
import { generateCode } from "./codegen.ts";
import { join, dirname } from "https://deno.land/std@0.170.0/path/mod.ts";

export async function bundleFile(filePath: string, visited = new Set<string>()): Promise<string> {
  const realPath = await Deno.realPath(filePath);
  if (visited.has(realPath)) {
    return ""; // Prevent circular inlining.
  }
  visited.add(realPath);
  const source = await Deno.readTextFile(filePath);
  const ast = parse(source);
  const expanded = expandMacros(ast);
  const currentDir = dirname(realPath);
  const transformed = await transformAST(expanded, currentDir, visited);
  const code = generateCode(transformed);
  // Wrap the code in an IIFE that returns an exports object.
  const wrapped = `(function(){
    const __exports = {};
    ${code}
    return __exports;
  })()`;
  return wrapped;
}
