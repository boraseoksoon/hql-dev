// src/bundler.ts
import { parse } from "./parser.ts";
import { expandMacros } from "./macro.ts";
import { transformAST } from "./transformer.ts";
import { generateCode } from "./codegen.ts";
import { dirname, join } from "https://deno.land/std@0.170.0/path/mod.ts";

export async function bundleFile(filePath: string, visited = new Set<string>()): Promise<string> {
  const realPath = await Deno.realPath(filePath);
  if (visited.has(realPath)) return ""; // Prevent circular inlining.
  visited.add(realPath);
  const source = await Deno.readTextFile(realPath);
  const ast = parse(source);
  const expanded = expandMacros(ast);
  const currentDir = dirname(realPath);
  let transformed = await transformAST(expanded, currentDir, visited);
  // Filter out export lines from local modules.
  transformed = transformed
    .split("\n")
    .filter(line => !line.trim().startsWith("export "))
    .join("\n");
  return transformed;
}
