import * as ts from "npm:typescript";
import * as path from "node:path";

/**
 * Generate a source map by leveraging TypeScript's transpileModule API.
 * Ensures that the original HQL file is recorded as the source.
 */
export function makeSourceMap(
  code: string,
  originalHqlPath: string
): string {
  const tsFileName = path.basename(originalHqlPath).replace(/\.hql$/i, ".ts");
  const { sourceMapText } = ts.transpileModule(code, {
    compilerOptions: {
      sourceMap: true,
      inlineSources: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
    fileName: originalHqlPath, // Keep this for mapping
  });

  const sourceMap = JSON.parse(sourceMapText!);

  // Find project root by looking for deno.json or .git
  function findProjectRoot(startPath: string): string {
    let dir = path.dirname(startPath);
    while (dir !== path.dirname(dir)) {
      for (const marker of ["deno.json", ".git"]) {
        try {
          const markerPath = path.join(dir, marker);
          Deno.statSync(markerPath); // Throws if not exists
          return dir;
        } catch { /* not found, keep searching */ }
      }
      dir = path.dirname(dir);
    }
    // Fallback: use cwd as the root
    console.warn("[makeSourceMap] WARNING: Project root not found, using cwd()");
    return Deno.cwd();
  }

  // Use only the filename for sources
  const fileNameOnly = path.basename(originalHqlPath);
  sourceMap.file = tsFileName;
  sourceMap.sources = [fileNameOnly];
  sourceMap.sourcesContent = [code];

  // Logging for debug
  console.log("[makeSourceMap] sources:", JSON.stringify(sourceMap.sources));
  return JSON.stringify(sourceMap);
}