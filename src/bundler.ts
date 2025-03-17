// src/bundler.ts - New bundler using the new transformer

import { dirname, resolve, writeTextFile, mkdir, exists, basename } from "./platform/platform.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { Logger } from "./logger.ts";
import { transpileHql } from "./transformer.ts";

/**
 * Options for bundling.
 */
export interface BundleOptions {
  verbose?: boolean;
  force?: boolean;
  bundle?: boolean;
  minify?: boolean;
  target?: string;
  sourcemap?: boolean | string;
  drop?: string[];
  charset?: "ascii" | "utf8";
  legalComments?: "none" | "inline" | "eof" | "external";
  treeShaking?: boolean;
  pure?: string[];
  keepNames?: boolean;
  define?: Record<string, string>;
}

/**
 * Ensure a directory exists.
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
  }
}

/**
 * Rebase relative import specifiers in the generated code.
 */
function rebaseImports(code: string, originalDir: string): string {
  return code.replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (_, prefix, relPath, suffix) => {
      const absPath = resolve(originalDir, relPath);
      return `${prefix}${absPath}${suffix}`;
    }
  );
}

/**
 * Write the output code to a file.
 */
async function writeOutput(
  code: string,
  outputPath: string,
  logger: Logger,
  force: boolean = false
): Promise<void> {
  const outputDir = dirname(outputPath);
  await ensureDir(outputDir);
  if (!force && await exists(outputPath)) {
    logger.log(`File '${outputPath}' already exists. Overwriting.`);
  }
  await writeTextFile(outputPath, code);
  logger.log(`Output written to: ${outputPath}`);
}

/**
 * Process an entry file.
 * For HQL files, use the new transformer.
 * For JS files, simply copy them.
 */
async function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  const resolvedInputPath = resolve(inputPath);

  if (resolvedInputPath.endsWith(".hql")) {
    logger.log(`Transpiling HQL entry file: ${resolvedInputPath}`);
    const source = await Deno.readTextFile(resolvedInputPath);
    const baseDir = dirname(resolvedInputPath);
    const jsCode = await transpileHql(source, baseDir, options.verbose || false);
    const finalCode = rebaseImports(jsCode, baseDir);
    await writeOutput(finalCode, outputPath, logger, options.force || false);
    logger.log(`Entry processed and output written to ${outputPath}`);
    return outputPath;
  } else if (resolvedInputPath.endsWith(".js")) {
    logger.log(`Using JS entry file as-is: ${resolvedInputPath}`);
    const code = await Deno.readTextFile(resolvedInputPath);
    await writeOutput(code, outputPath, logger, options.force || false);
    return outputPath;
  } else {
    throw new Error(`Unsupported entry file type: ${inputPath}`);
  }
}

/**
 * Create esbuild build options.
 */
function createBuildOptions(
  entryPath: string,
  outputPath: string,
  options: BundleOptions,
  plugins: any[]
): any {
  const buildOptions: any = {
    entryPoints: [entryPath],
    bundle: options.bundle !== false,
    outfile: outputPath,
    format: "esm",
    plugins: plugins,
    logLevel: options.verbose ? "info" : "silent",
    allowOverwrite: true,
    minify: options.minify,
    target: options.target,
    sourcemap: options.sourcemap,
    drop: options.drop,
    charset: options.charset,
    legalComments: options.legalComments,
    treeShaking: options.treeShaking,
    pure: options.pure,
    keepNames: options.keepNames,
    define: options.define,
  };
  Object.keys(buildOptions).forEach(key => {
    if (buildOptions[key] === undefined) {
      delete buildOptions[key];
    }
  });
  return buildOptions;
}

/**
 * Bundles the processed file using esbuild.
 */
export async function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  const plugins = []; // Add any needed plugins for external module handling here.
  
  if (options.force && await exists(outputPath)) {
    try {
      await Deno.remove(outputPath);
      logger.log(`Removed existing file: ${outputPath}`);
    } catch (err) {
      logger.error(`Failed to remove existing file: ${outputPath}`);
    }
  }
  const buildOptions = createBuildOptions(entryPath, outputPath, options, plugins);
  try {
    logger.log(`Starting bundling with esbuild for ${entryPath}`);
    const result = await build(buildOptions);
    if (result.warnings.length > 0) {
      logger.warn(`esbuild warnings: ${JSON.stringify(result.warnings, null, 2)}`);
    }
    stop();
    logger.log(`Successfully bundled output to ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error(`esbuild error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Main CLI function for transpilation and bundling.
 */
export async function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  logger.log(`Processing entry: ${inputPath}`);
  const resolvedInputPath = resolve(inputPath);
  const outPath = outputPath ??
    (resolvedInputPath.endsWith(".hql")
      ? resolvedInputPath.replace(/\.hql$/, ".js")
      : resolvedInputPath);
  const processedPath = await processEntryFile(resolvedInputPath, outPath, options);
  if (options.bundle !== false) {
    await bundleWithEsbuild(processedPath, outPath, options);
  }
  logger.log(`Successfully processed output to ${outPath}`);
  return outPath;
}

export default transpileCLI;
