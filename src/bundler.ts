// src/bundler.ts
import { parse } from "./parser.ts";
import { expandMacros } from "./macro.ts";
import { transformAST } from "./transformer.ts";
import { dirname, join } from "https://deno.land/std@0.170.0/path/mod.ts";

export async function bundleFile(
  filePath: string,
  visited = new Set<string>(),
  inModule = false
): Promise<string> {
  const realPath = await Deno.realPath(filePath);
  if (visited.has(realPath)) return "";
  visited.add(realPath);
  const source = await Deno.readTextFile(realPath);
  const ast = parse(source);
  const expanded = expandMacros(ast);
  const currentDir = dirname(realPath);
  const transformed = await transformAST(expanded, currentDir, visited, inModule);
  return transformed;
}

// Updated bundleJSModule:
export async function bundleJSModule(filePath: string, visited = new Set<string>()): Promise<string> {
  const source = await Deno.readTextFile(filePath);
  const regex = /import\s+([\s\S]+?)\s+from\s+["'](.+?\.hql)["'];?/g;
  let modifiedSource = source;
  let match;
  while ((match = regex.exec(source)) !== null) {
      const importSpecifier = match[2];
      const fullPath = join(dirname(filePath), importSpecifier);
      // Compile the HQL module as an ES module (inModule = false)
      const compiledCode = await bundleFile(fullPath, visited, false);
      const base64 = btoa(compiledCode);
      const dataUrl = `data:text/javascript;base64,${base64}`;
      modifiedSource = modifiedSource.replace(importSpecifier, dataUrl);
  }
  return modifiedSource;
}
