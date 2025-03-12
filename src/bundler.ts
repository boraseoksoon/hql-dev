// src/bundler.ts - Refactored for modularity and reduced redundancy
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { parse } from "./transpiler/parser.ts";
import { transformAST, transpile } from "./transpiler/transformer.ts";
import { readTextFile, writeTextFile, mkdir } from "./platform/platform.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { Logger } from "./logger.ts";

/**
 * Rebase relative import specifiers using the original file directory.
 */
export function rebaseImports(code: string, originalDir: string): string {
  return code.replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (_, prefix, relPath, suffix) => {
      const absPath = resolve(originalDir, relPath);
      return `${prefix}${absPath}${suffix}`;
    }
  );
}

/**
 * Ensure that the output directory exists.
 */
export async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
  }
}

/**
 * Write code to a file and log the output path.
 */
export async function writeOutput(
  code: string,
  outputPath: string,
  logger: Logger
): Promise<void> {
  const outputDir = dirname(outputPath);
  await ensureDir(outputDir);
  await writeTextFile(outputPath, code);
  logger.log(`Output written to: ${outputPath}`);
}

/**
 * Create the esbuild plugin to handle HQL imports.
 */
export function createHqlPlugin(options: { verbose?: boolean }): any {
  return {
    name: "hql-plugin",
    setup(build: any) {
      build.onResolve({ filter: /\.hql$/ }, (args: any) => {
        let fullPath = args.path;
        if (args.importer) {
          const importerDir = dirname(args.importer);
          fullPath = resolve(importerDir, args.path);
          if (options.verbose) {
            console.log(
              `Resolving HQL import: "${args.path}" from "${importerDir}" -> "${fullPath}"`
            );
          }
        }
        return { path: fullPath, namespace: "hql" };
      });
      build.onLoad({ filter: /.*/, namespace: "hql" }, async (args: any) => {
        const source = await readTextFile(args.path);
        const transpiledHql = await transpile(source, args.path, {
          bundle: true,
          verbose: options.verbose,
        });
        return { contents: transpiledHql, loader: "js" };
      });
    },
  };
}

/**
 * Create the esbuild plugin to mark npm: imports as external.
 */
export function createExternalNpmPlugin(): any {
  return {
    name: "external-npm",
    setup(build: any) {
      build.onResolve({ filter: /^npm:/ }, (args: any) => {
        return { path: args.path, external: true };
      });
    },
  };
}

/**
 * Bundle the code using esbuild with our plugins.
 */
export async function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: { verbose?: boolean } = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  const hqlPlugin = createHqlPlugin({ verbose: options.verbose });
  const externalNpmPlugin = createExternalNpmPlugin();

  await build({
    entryPoints: [entryPath],
    bundle: true,
    outfile: outputPath,
    format: "esm",
    plugins: [hqlPlugin, externalNpmPlugin],
    logLevel: options.verbose ? "info" : "silent",
    allowOverwrite: true,
  });
  stop();
  logger.log(`Successfully bundled output to ${outputPath}`);
  return outputPath;
}

/**
 * Process the entry file to determine if it's HQL or JS, and
 * transpile it accordingly.
 */
async function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: { verbose?: boolean } = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  const resolvedInputPath = resolve(inputPath);
  
  let code: string;
  if (resolvedInputPath.endsWith(".hql")) {
    logger.log(`Transpiling HQL entry file: ${resolvedInputPath}`);
    const userSource = await readTextFile(resolvedInputPath);
    const ast = parse(userSource);
    const originalDir = dirname(resolvedInputPath);
    const transformed = await transformAST(ast, originalDir, {
      bundle: true,
      verbose: options.verbose,
    });
    code = rebaseImports(transformed, originalDir);
  } else {
    logger.log(`Using JavaScript entry file: ${resolvedInputPath}`);
    code = await readTextFile(resolvedInputPath);
  }

  await writeOutput(code, outputPath, logger);
  logger.log(`Entry processed and output written to ${outputPath}`);
  
  return outputPath;
}

/**
 * Transpile the given entry (HQL or JS) into a bundled JavaScript file.
 * For HQL files the source is parsed and transformed; for JS, it is read as-is.
 * Then esbuild (with our plugins) is run over the output file.
 */
export async function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: { verbose?: boolean; bundle?: boolean } = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.log(`Processing entry: ${inputPath}`);

  const resolvedInputPath = resolve(inputPath);
  const outPath =
    outputPath ??
    (resolvedInputPath.endsWith(".hql")
      ? resolvedInputPath.replace(/\.hql$/, ".js")
      : resolvedInputPath);

  // Process the entry file to get an intermediate JS file
  const processedPath = await processEntryFile(resolvedInputPath, outPath, options);
  
  // If bundling is enabled, run esbuild on the processed file
  if (options.bundle !== false) {
    await bundleWithEsbuild(processedPath, outPath, options);
  }
  
  logger.log(`Successfully processed output to ${outPath}`);
  return outPath;
}

/**
 * Watch the given file for changes and re-run transpileCLI on modifications.
 */
export async function watchFile(
  inputPath: string,
  options: { verbose?: boolean } = {}
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  logger.log(`Watching ${inputPath} for changes...`);
  
  try {
    await transpileCLI(inputPath, undefined, options);
    const watcher = Deno.watchFs(inputPath);
    
    for await (const event of watcher) {
      if (event.kind === "modify") {
        try {
          logger.log(`File changed, retranspiling...`);
          await transpileCLI(inputPath, undefined, options);
        } catch (error: any) {
          console.error(`Transpilation failed: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    console.error(`Watch error: ${error.message}`);
    Deno.exit(1);
  }
}

/**
 * Process URL paths to convert relative paths to absolute ones.
 */
function resolveUrlPath(relativePath: string, basePath: string): string {
  try {
    const targetDir = new URL('.', basePath).href;
    return new URL(relativePath, targetDir).href;
  } catch (error) {
    return relativePath;
  }
}

/**
 * Process imports in the source code to rebase relative paths.
 */
function processImports(code: string, sourceDir: string): string {
  const targetDir = new URL('.', `file://${sourceDir.replace(/\\/g, "/")}/`).href;
  
  return code.replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (_, prefix, rel, suffix) => {
      try {
        const abs = new URL(rel, targetDir).href;
        return prefix + abs + suffix;
      } catch (error) {
        return prefix + rel + suffix;
      }
    }
  );
}

/**
 * Bundle the entry file into a self-contained JavaScript code string.
 * Relative JS imports are rewritten to absolute URLs based on the entry's directory.
 * Any HQL imports are recursively inlined.
 */
export async function bundleCode(
  inputPath: string,
  options: { verbose?: boolean } = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.log(`Bundling entry: ${inputPath}`);

  const resolvedInputPath = resolve(inputPath);
  const isHql = resolvedInputPath.endsWith(".hql");
  let code: string;
  
  if (isHql) {
    logger.log(`Transpiling HQL entry file: ${resolvedInputPath}`);
    const userSource = await readTextFile(resolvedInputPath);
    const ast = parse(userSource);
    const originalDir = dirname(resolvedInputPath);
    const transformed = await transformAST(ast, originalDir, { 
      bundle: true, 
      verbose: options.verbose 
    });
    code = rebaseImports(transformed, originalDir);
  } else {
    logger.log(`Using JavaScript entry file: ${resolvedInputPath}`);
    code = await readTextFile(resolvedInputPath);
  }

  // Process imports
  const sourceDir = dirname(resolvedInputPath);
  const finalCode = processImports(code, sourceDir);
  
  logger.log(`Bundling complete.`);
  return finalCode;
}