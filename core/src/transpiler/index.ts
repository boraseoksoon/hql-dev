// Core transpiler API entry point
import { transpileToJavascript } from "./hql-transpiler.ts";

export interface TranspileOptions {
  /** Enable verbose logging */
  verbose?: boolean;
  /** Show performance timing information */
  showTiming?: boolean;
  /** Base directory for resolving imports */
  baseDir?: string;
  /** Source directory */
  sourceDir?: string;
  /** Temporary directory */
  tempDir?: string;
}

export interface TranspileResult {
  code: string;
  sourceMap?: string;
}

/**
 * Transpile HQL source code to JavaScript
 */
export async function transpile(
  source: string,
  options: TranspileOptions = {}
): Promise<TranspileResult> {
  const { code, sourceMap } = await transpileToJavascript(source, {
    verbose: options.verbose,
    showTiming: options.showTiming,
    baseDir: options.baseDir,
    sourceDir: options.sourceDir,
    tempDir: options.tempDir
  });
  
  return { code, sourceMap };
}

export { transpileToJavascript } from "./hql-transpiler.ts";