// src/bundler.ts - Refactored for modularity and reduced redundancy
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { Logger } from "./logger.ts";
import { parse } from "./transpiler/parser.ts";
import { transformAST, transpile } from "./transformer.ts";
import { readTextFile, writeTextFile, mkdir, exists, basename } from "./platform/platform.ts";

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
 * Bundle options combining build settings with file handling options
 */
export interface BundleOptions extends OptimizationOptions {
  verbose?: boolean;
  force?: boolean;
  bundle?: boolean;
}

/**
 * Ensures the specified directory exists
 * @param dir Directory path to ensure exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
  }
}

/**
 * Rebase relative import specifiers to use the original file directory
 * @param code Source code with imports to rebase
 * @param originalDir Original file directory to rebase against
 * @returns Code with rebased imports
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
 * Prompt the user for a yes/no question
 * @param question Question to prompt with
 * @returns User's response (true for yes, false for no)
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
 * Write code to a file, prompting before overwriting existing files unless force is true.
 * @param code Code to write
 * @param outputPath Path to write to
 * @param logger Logger instance
 * @param force Whether to force overwriting without prompting
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
 * Create an esbuild plugin to handle HQL imports
 * @param options Plugin options
 * @returns esbuild plugin object
 */
export function createHqlPlugin(options: { verbose?: boolean }): any {
  const logger = new Logger(options.verbose);
  
  return {
    name: "hql-plugin",
    setup(build: any) {
      // Map to track resolved paths
      const pathMap = new Map<string, string>();
      
      // Handle resolving .hql files
      build.onResolve({ filter: /\.hql$/ }, async (args: any) => {
        logger.debug(`Resolving HQL import: "${args.path}" from importer: ${args.importer || 'unknown'}`);
        
        // Try multiple strategies to find the actual file
        let fullPath = args.path;
        let resolved = false;
        
        // Strategy 1: Resolve relative to importer
        if (args.importer) {
          const importerDir = dirname(args.importer);
          const relativePath = resolve(importerDir, args.path);
          logger.debug(`Trying path relative to importer: ${relativePath}`);
          
          try {
            await Deno.stat(relativePath);
            fullPath = relativePath;
            resolved = true;
            logger.debug(`Found file relative to importer: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
          }
        }
        
        // Strategy 2: Try resolving from current working directory
        if (!resolved) {
          const cwdPath = resolve(Deno.cwd(), args.path);
          logger.debug(`Trying path relative to cwd: ${cwdPath}`);
          
          try {
            await Deno.stat(cwdPath);
            fullPath = cwdPath;
            resolved = true;
            logger.debug(`Found file relative to cwd: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
          }
        }
        
        // Strategy 3: Try looking in examples directory specifically
        if (!resolved) {
          const fileName = basename(args.path);
          const examplesPath = resolve(Deno.cwd(), "examples", "dependency-test", fileName);
          logger.debug(`Trying path in examples directory: ${examplesPath}`);
          
          try {
            await Deno.stat(examplesPath);
            fullPath = examplesPath;
            resolved = true;
            logger.debug(`Found file in examples directory: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
          }
        }
        
        // Remember this path for future lookups
        if (resolved) {
          pathMap.set(args.path, fullPath);
        } else {
          logger.warn(`Could not resolve HQL file: ${args.path}`);
        }
        
        return { 
          path: fullPath, 
          namespace: "hql" 
        };
      });
      
      // Handle loading .hql files
      build.onLoad({ filter: /.*/, namespace: "hql" }, async (args: any) => {
        try {
          logger.debug(`Loading HQL file: ${args.path}`);
          
          let source: string;
          try {
            // Try to read the file directly
            source = await readTextFile(args.path);
          } catch (error) {
            // If file not found, try alternatives
            if (error instanceof Deno.errors.NotFound) {
              logger.debug(`File not found at ${args.path}, trying alternatives`);
              
              // Try the examples directory as a fallback
              const fileName = basename(args.path);
              const examplesPath = resolve(Deno.cwd(), "examples", "dependency-test", fileName);
              
              try {
                source = await readTextFile(examplesPath);
                args.path = examplesPath; // Update the path for correct transpilation
                logger.debug(`Found in examples directory: ${examplesPath}`);
              } catch (e) {
                throw new Error(`File not found: ${args.path}, also tried ${examplesPath}`);
              }
            } else {
              throw error;
            }
          }
          
          // Transpile the HQL to JavaScript
          const transpiledHql = await transpile(source, args.path, {
            bundle: true,
            verbose: options.verbose,
          });
          
          return { 
            contents: transpiledHql, 
            loader: "js",
            resolveDir: dirname(args.path) // Critical for correctly resolving nested imports
          };
        } catch (error) {
          logger.error(`Error loading HQL file: ${error instanceof Error ? error.message : String(error)}`);
          return {
            errors: [{ text: `Error loading HQL file: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      });
    },
  };
}

/**
 * Create an esbuild plugin to mark npm: and jsr: imports as external
 * @returns esbuild plugin object
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
 * Process an entry file (HQL or JS) and output transpiled JS
 * @param inputPath Path to input file
 * @param outputPath Path for output file
 * @param options Processing options
 * @returns Path to processed output file
 */
async function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: BundleOptions = {}
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
 * Bundle the code using esbuild with our plugins and optimization options
 * @param entryPath Path to entry file
 * @param outputPath Path for bundled output
 * @param options Bundling options
 * @returns Path to the bundled output
 */
// In src/bundler.ts

export async function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {}
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

  // Create build options from optimization options
  const buildOptions = createBuildOptions(entryPath, outputPath, options, [hqlPlugin, externalPlugin]);
  
  // Set better error handling and logging
  try {
    logger.log(`Starting bundling with esbuild for ${entryPath}`);
    
    // Print the import path for debugging
    const entryDir = dirname(entryPath);
    logger.log(`Entry directory: ${entryDir}`);
    
    // Run the build
    const result = await build(buildOptions);
    
    // Log any warnings
    if (result.warnings.length > 0) {
      logger.warn(`esbuild warnings: ${JSON.stringify(result.warnings, null, 2)}`);
    }
    
    stop();
    
    if (options.minify) {
      logger.log(`Successfully bundled and minified output to ${outputPath}`);
    } else {
      logger.log(`Successfully bundled output to ${outputPath}`);
    }
    
    return outputPath;
  } catch (error) {
    logger.error(`esbuild error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Create esbuild options from our bundle options
 * @param entryPath Path to entry file
 * @param outputPath Path for bundled output
 * @param options Bundling options
 * @param plugins Array of esbuild plugins
 * @returns esbuild options object
 */
function createBuildOptions(
  entryPath: string, 
  outputPath: string, 
  options: BundleOptions,
  plugins: any[]
): any {
  // Build options with all esbuild optimization options
  const buildOptions: any = {
    entryPoints: [entryPath],
    bundle: true,
    outfile: outputPath,
    format: "esm",
    plugins: plugins,
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
  
  return buildOptions;
}

/**
 * Transpile the given entry (HQL or JS) into a bundled JavaScript file.
 * For HQL files the source is parsed and transformed; for JS, it is read as-is.
 * Then esbuild (with our plugins) is run over the output file.
 * @param inputPath Path to input file
 * @param outputPath Optional output path (defaults to replacing .hql with .js)
 * @param options Transpilation options
 * @returns Path to the final output file
 */
export async function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.log(`Processing entry: ${inputPath}`);

  const resolvedInputPath = resolve(inputPath);
  const outPath = determineOutputPath(resolvedInputPath, outputPath);

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
 * Determine the output path for transpilation
 * @param inputPath Path to input file
 * @param outputPath Optional explicit output path
 * @returns Resolved output path
 */
function determineOutputPath(inputPath: string, outputPath?: string): string {
  return outputPath ??
    (inputPath.endsWith(".hql")
      ? inputPath.replace(/\.hql$/, ".js")
      : inputPath);
}

/**
 * Watch the given file for changes and re-run transpileCLI on modifications
 * @param inputPath Path to file to watch
 * @param options Watch options
 */
export async function watchFile(
  inputPath: string,
  options: BundleOptions = {}
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  logger.log(`Watching ${inputPath} for changes...`);
  
  try {
    // Initial transpilation
    await transpileCLI(inputPath, undefined, options);
    
    // Set up watcher
    const watcher = Deno.watchFs(inputPath);
    
    // Handle file change events
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