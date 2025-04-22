// Core transpiler API entry point
import { processHql } from "./hql-transpiler.ts";

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
  /** The generated JavaScript code */
  code: string;
  /** Map of imported files and their content */
  imports?: Record<string, string>;
  /** Performance timings if enabled */
  timings?: Record<string, number>;
}

/**
 * Transpile HQL source code to JavaScript
 */
export async function transpile(
  source: string,
  options: TranspileOptions = {}
): Promise<TranspileResult> {
  const code = await processHql(source, {
    verbose: options.verbose,
    showTiming: options.showTiming,
    baseDir: options.baseDir,
    sourceDir: options.sourceDir,
    tempDir: options.tempDir
  });
  
  return { code };
}

export { processHql } from "./hql-transpiler.ts";