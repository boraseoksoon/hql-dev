// Core transpiler API entry point
import { processHql } from "./hql-transpiler.ts";
import { TranspilerError } from "../common/error-pipeline.ts";
import { ErrorPipeline } from "../common/error-pipeline.ts";

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
  /** Path to the source file */
  filePath?: string;
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
  try {
    // Register the source for error reporting
    if (options.filePath) {
      ErrorPipeline.registerSourceFile(options.filePath, source);
    }
    
    // Process the HQL using the HQL transpiler
    const code = await processHql(source, {
      verbose: options.verbose,
      showTiming: options.showTiming,
      baseDir: options.baseDir,
      sourceDir: options.sourceDir,
      tempDir: options.tempDir
    });
    
    return { code };
  } catch (error) {
    if (options.verbose && !(error instanceof TranspilerError)) {
      console.error("Transpiler error:", error);
    }
    
    // Use the new error pipeline for better error handling
    throw ErrorPipeline.enhanceError(error, {
      source,
      filePath: options.filePath
    });
  }
}

export { processHql } from "./hql-transpiler.ts";
export { registerSourceFile } from "../common/error-pipeline.ts"; 