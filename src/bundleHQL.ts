// src/bundleHQL.ts
import { transpileHQL } from "./transpileHQL.ts";
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";

// Regex to match HQL import statements, e.g. (import "./other.hql")
const importRegex = /\(import\s+"([^"]+\.hql)"\)/g;

/**
 * Recursively process an HQL file and its dependencies.
 * @param filePath - The path to the HQL file.
 * @param visited - A set of already processed files (to avoid circular dependencies).
 * @returns A Map of absolute file paths to transpiled JS code.
 */
export async function processFile(
  filePath: string,
  visited: Set<string> = new Set()
): Promise<Map<string, string>> {
  const modules = new Map<string, string>();
  const realPath = await Deno.realPath(filePath);
  
  // Skip already processed files (avoid circular dependencies)
  if (visited.has(realPath)) {
    return modules;
  }
  visited.add(realPath);

  // Read and transpile the HQL file
  const source = await Deno.readTextFile(realPath);
  const jsCode = await transpileHQL(source, realPath);
  modules.set(realPath, jsCode);

  // Process all HQL imports in this file
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const importedPath = match[1]; // e.g., "./other.hql"
    const depPath = resolve(dirname(realPath), importedPath);
    const depModules = await processFile(depPath, visited);
    
    // Add all dependencies to our modules map
    for (const [depRealPath, depCode] of depModules.entries()) {
      modules.set(depRealPath, depCode);
    }
  }

  return modules;
}

/**
 * Concatenates all transpiled modules into a single JavaScript bundle.
 * @param modules - A Map of module file paths to transpiled JS code.
 * @returns The final bundle as a string.
 */
export function createBundle(modules: Map<string, string>): string {
  let bundle = "// Bundled output generated from HQL sources\n\n";
  
  for (const [file, code] of modules.entries()) {
    bundle += `// --- Module: ${file}\n`;
    bundle += `${code}\n\n`;
  }
  
  return bundle;
}