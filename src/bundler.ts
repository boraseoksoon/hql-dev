// src/bundler.ts - Refactored for modularity and reduced redundancy
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { Logger } from "./logger.ts";
import { parse } from "./transpiler/parser.ts";
import { transformAST, transpile } from "./transformer.ts";
import { readTextFile, writeTextFile, mkdir, exists } from "./platform/platform.ts";

/**
 * Represents esbuild optimization options
 */
export interface OptimizationOptions {
  minify?: boolean;
  target?: string;
  sourcemap?: boolean | string;
  drop?: string[];
  charset?: 'ascii' | 'utf8';
  legalComments?: 'none' | 'inline' | 'eof' | 'external';
  treeShaking?: boolean;
  pure?: string[];
  keepNames?: boolean;
  define?: Record<string, string>;
}

/**
 * Rebase relative import specifiers using the original file directory.
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
 * Ensure that the output directory exists.
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
  }
}

/**
 * Prompt the user for a yes/no question
 */
async function promptYesNo(question: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  await Deno.stdout.write(encoder.encode(question));
  const buf = new Uint8Array(1);
  await Deno.stdin.read(buf);
  const answer = decoder.decode(buf).toLowerCase();
  
  // Also echo a newline for better formatting
  await Deno.stdout.write(encoder.encode("\n"));
  
  return answer === 'y';
}

/**
 * Write code to a file and log the output path.
 * Asks for confirmation before overwriting existing files unless force is true.
 */
async function writeOutput(
  code: string,
  outputPath: string,
  logger: Logger,
  force: boolean = false
): Promise<void> {
  const outputDir = dirname(outputPath);
  await ensureDir(outputDir);
  
  // Check if file exists before writing
  if (!force && await exists(outputPath)) {
    // Prompt the user for confirmation
    const answer = await promptYesNo(`File '${outputPath}' already exists. Overwrite? (y/n): `);
    
    if (!answer) {
      logger.log("Operation cancelled. File not overwritten.");
      return;
    }
  }
  
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
export function createExternalPlugin(): any {
  return {
    name: "external-npm-jsr",
    setup(build: any) {
      build.onResolve({ filter: /^(npm:|jsr:)/ }, (args: any) => {
        return { path: args.path, external: true };
      });
    },
  };
}

/**
 * Bundle the code using esbuild with our plugins and optimization options.
 */
export async function bundleWithEsbuild(
    entryPath: string,
    outputPath: string,
    options: { verbose?: boolean; force?: boolean } & OptimizationOptions = {}
  ): Promise<string> {
    const logger = new Logger(options.verbose || false);
    const hqlPlugin = createHqlPlugin({ verbose: options.verbose });
    const externalPlugin = createExternalPlugin();
  
    // If force is true, ensure the file doesn't exist before building
    if (options.force && await exists(outputPath)) {
      try {
        await Deno.remove(outputPath);
        logger.log(`Removed existing file: ${outputPath}`);
      } catch (err) {
        logger.error(`Failed to remove existing file: ${outputPath}`);
      }
    }
  
    // Build options with all esbuild optimization options
    const buildOptions: any = {
      entryPoints: [entryPath],
      bundle: true,
      outfile: outputPath,
      format: "esm",
      plugins: [hqlPlugin, externalPlugin],
      logLevel: options.verbose ? "info" : "silent",
      allowOverwrite: true, // Always allow overwrite in esbuild itself
      
      // Optimization options
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
  
    // Remove undefined options
    Object.keys(buildOptions).forEach(key => {
      if (buildOptions[key] === undefined) {
        delete buildOptions[key];
      }
    });
  
    await build(buildOptions);
    stop();
    
    if (options.minify) {
      logger.log(`Successfully bundled and minified output to ${outputPath}`);
    } else {
      logger.log(`Successfully bundled output to ${outputPath}`);
    }
    
    return outputPath;
  }

/**
 * Process the entry file to determine if it's HQL or JS, and
 * transpile it accordingly.
 */
async function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: { verbose?: boolean; force?: boolean } & OptimizationOptions = {}
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

  await writeOutput(code, outputPath, logger, options.force);
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
  options: { 
    verbose?: boolean; 
    bundle?: boolean; 
    force?: boolean
  } & OptimizationOptions = {}
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
  options: { verbose?: boolean; force?: boolean } & OptimizationOptions = {}
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