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

  // Use only the filename for sources
  const fileNameOnly = path.basename(originalHqlPath);
  sourceMap.file = tsFileName;
  sourceMap.sources = [fileNameOnly];
  sourceMap.sourcesContent = [code];

  return JSON.stringify(sourceMap);
}