// src/bundler.ts - Enhanced with parallel processing and better error handling

import { dirname, resolve, writeTextFile, mkdir, exists, basename, join } from "./platform/platform.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { Logger } from "./logger.ts";
import { processHql } from "./transpiler/hql-transpiler.ts";
import { TranspilerError, ValidationError, createErrorReport } from "./transpiler/errors.ts";
import { perform, performAsync } from "./transpiler/error-utils.ts";

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
  charset?: 'ascii' | 'utf8';
  legalComments?: 'none' | 'inline' | 'eof' | 'external';
  treeShaking?: boolean;
  pure?: string[];
  keepNames?: boolean;
  define?: Record<string, string>;
  tempDir?: string;
  keepTemp?: boolean;
  sourceDir?: string; // Added to track the original source directory
}

/**
 * Ensure a directory exists.
 * Enhanced with better error handling using utility functions.
 */
async function ensureDir(dir: string, logger: Logger): Promise<void> {
  return performAsync(
    async () => {
      try {
        await mkdir(dir, { recursive: true });
        logger.debug(`Ensured directory exists: ${dir}`);
      } catch (error) {
        if (error instanceof Deno.errors.AlreadyExists) {
          // Directory already exists is not an error
          logger.debug(`Directory already exists: ${dir}`);
          return;
        }
        throw error; // Re-throw to be caught by performAsync
      }
    },
    `Failed to create directory ${dir}`,
    TranspilerError
  );
}

/**
 * Write the output code to a file.
 * Enhanced with better error handling using utility functions.
 */
async function writeOutput(
  code: string,
  outputPath: string,
  logger: Logger,
  force: boolean = false
): Promise<void> {
  return performAsync(
    async () => {
      const outputDir = dirname(outputPath);
      
      // Ensure output directory exists
      await ensureDir(outputDir, logger);
      
      // Check if file exists and warn if overwriting
      if (!force && await exists(outputPath)) {
        logger.warn(`File '${outputPath}' already exists. Overwriting.`);
      }
      
      // Write the output file
      await writeTextFile(outputPath, code);
      logger.debug(`Successfully wrote ${code.length} bytes to: ${outputPath}`);
      logger.log(`Output written to: ${outputPath}`);
    },
    `Failed to write output to '${outputPath}'`,
    TranspilerError
  );
}

/**
 * Process an entry file (HQL or JS) and output transpiled JS
 * Enhanced with parallel processing and better error handling
 */
async function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: BundleOptions = {}
): Promise<string> {
  return performAsync(async () => {
    const logger = new Logger(options.verbose);
    const resolvedInputPath = resolve(inputPath);
    
    logger.debug(`Processing entry file: ${resolvedInputPath}`);
    logger.debug(`Output path: ${outputPath}`);

    if (resolvedInputPath.endsWith(".hql")) {
      logger.log(`Transpiling HQL entry file: ${resolvedInputPath}`);
      
      // Run directory creation and file reading in parallel
      const [tempDirResult, source] = await Promise.all([
        // Task 1: Create temp directory if needed
        performAsync(
          async () => {
            if (!options.tempDir) {
              const tempDir = await Deno.makeTempDir({ prefix: "hql_bundle_" });
              logger.debug(`Created temporary directory: ${tempDir}`);
              return { tempDir, created: true };
            }
            return { tempDir: options.tempDir, created: false };
          },
          "Creating temporary directory",
          TranspilerError
        ),
        
        // Task 2: Read the source file
        performAsync(
          () => Deno.readTextFile(resolvedInputPath),
          `Reading entry file ${resolvedInputPath}`,
          TranspilerError
        )
      ]);
      
      const tempDir = tempDirResult.tempDir;
      const tempDirCreated = tempDirResult.created;
      
      logger.debug(`Read ${source.length} bytes from ${resolvedInputPath}`);
      
      try {
        // Process with full bidirectional import support
        const jsCode = await performAsync(
          () => processHql(source, {
            baseDir: dirname(resolvedInputPath),
            verbose: options.verbose,
            tempDir,
            keepTemp: options.keepTemp,
            sourceDir: options.sourceDir
          }),
          "HQL entry file transpilation",
          TranspilerError
        );
        
        logger.debug(`Successfully transpiled HQL to JS (${jsCode.length} bytes)`);
        
        // Write the output
        await writeOutput(jsCode, outputPath, logger, options.force);
        
        logger.log(`Entry processed and output written to ${outputPath}`);
        return outputPath;
      } finally {
        // Clean up if not keeping temp files - do this as fire-and-forget
        if (tempDirCreated && !options.keepTemp) {
          Deno.remove(tempDir, { recursive: true })
            .then(() => logger.debug(`Cleaned up temporary directory: ${tempDir}`))
            .catch(error => logger.warn(`Failed to clean up temporary directory: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } else if (resolvedInputPath.endsWith(".js")) {
      logger.log(`Using JS entry file: ${resolvedInputPath}`);
      
      // Read the JS file
      const jsSource = await performAsync(
        () => Deno.readTextFile(resolvedInputPath),
        `Reading JS entry file ${resolvedInputPath}`,
        TranspilerError
      );
      
      logger.debug(`Read ${jsSource.length} bytes from ${resolvedInputPath}`);
      
      // Check for HQL imports
      const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
      if (hqlImportRegex.test(jsSource)) {
        logger.log(`JS file contains HQL imports - will be processed during bundling`);
      }
      
      await writeOutput(jsSource, outputPath, logger, options.force);
      return outputPath;
    } else {
      throw new ValidationError(
        `Unsupported file type: ${inputPath} (expected .hql or .js)`,
        "file type validation",
        ".hql or .js",
        path.extname(inputPath) || "no extension"
      );
    }
  }, `Failed to process entry file ${inputPath}`, TranspilerError);
}

/**
 * Bundles the code using esbuild with our plugins and optimization options
 * Enhanced with parallel processing and better error handling
 */
export async function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {}
): Promise<string> {
  return performAsync(async () => {
    const logger = new Logger(options.verbose);
    
    logger.debug(`Bundling ${entryPath} to ${outputPath}`);
    logger.debug(`Bundling options: ${JSON.stringify(options, null, 2)}`);
    
    // Run temp directory creation and removal of existing output in parallel if needed
    const [tempDirResult, _] = await Promise.all([
      // Task 1: Create temp directory if needed
      performAsync(
        async () => {
          if (!options.tempDir) {
            const tempDir = await Deno.makeTempDir({ prefix: "hql_bundle_" });
            logger.debug(`Created temporary directory: ${tempDir}`);
            return { tempDir, created: true };
          }
          return { tempDir: options.tempDir, created: false };
        },
        "Creating temporary directory",
        TranspilerError
      ),
      
      // Task 2: Remove existing output file if force is true
      performAsync(
        async () => {
          if (options.force && await exists(outputPath)) {
            try {
              await Deno.remove(outputPath);
              logger.log(`Removed existing file: ${outputPath}`);
            } catch (error) {
              logger.error(`Failed to remove existing file ${outputPath}: ${error instanceof Error ? error.message : String(error)}`);
              // Continue despite removal failure - esbuild will overwrite
            }
          }
        },
        "Checking and removing existing output file",
        TranspilerError
      )
    ]);
    
    const tempDir = tempDirResult.tempDir;
    const cleanupTemp = tempDirResult.created;
    
    try {
      // Create the HQL plugin with temporary directory for processing
      const hqlPlugin = createHqlPlugin({ 
        verbose: options.verbose,
        tempDir,
        sourceDir: options.sourceDir
      });
      
      const externalPlugin = createExternalPlugin();
      
      // Create build options from optimization options
      const buildOptions = createBuildOptions(entryPath, outputPath, options, [hqlPlugin, externalPlugin]);
      
      logger.log(`Starting bundling with esbuild for ${entryPath}`);
      
      // Print the import path for debugging
      const entryDir = dirname(entryPath);
      logger.debug(`Entry directory: ${entryDir}`);
      
      // Run the build
      const result = await performAsync(
        () => build(buildOptions),
        "Running esbuild",
        TranspilerError
      );
      
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
      // Create detailed error report for esbuild failures
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`esbuild error: ${errorMsg}`);
      
      // Create detailed error report
      const errorReport = createErrorReport(
        error instanceof Error ? error : new Error(errorMsg),
        "esbuild bundling",
        {
          entryPath,
          outputPath,
          buildOptions: { /* Don't stringify plugins */ },
          tempDir
        }
      );
      
      if (options.verbose) {
        console.error("Detailed esbuild error report:");
        console.error(errorReport);
      }
      
      throw new TranspilerError(`esbuild failed: ${errorMsg}`);
    } finally {
      // Clean up temporary directory if created here and not keeping
      // Do this as fire-and-forget to not block the main flow
      if (cleanupTemp && !options.keepTemp) {
        Deno.remove(tempDir, { recursive: true })
          .then(() => logger.debug(`Cleaned up temporary directory: ${tempDir}`))
          .catch(error => logger.warn(`Failed to clean up temporary directory: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }, `Bundling failed for ${entryPath}`, TranspilerError);
}

/**
 * Create an esbuild plugin to handle HQL imports in JS files
 * Enhanced with parallel file resolution and better error handling
 */
function createHqlPlugin(options: { 
  verbose?: boolean, 
  tempDir?: string,
  sourceDir?: string // Original source directory
}): any {
  const logger = new Logger(options.verbose);
  const processedHqlFiles = new Set<string>();
  const hqlToJsMap = new Map<string, string>(); // Map to track HQL to JS file mappings
  
  return {
    name: "hql-plugin",
    setup(build: any) {
      // Handle resolving .hql files - now with parallel resolution
      build.onResolve({ filter: /\.hql$/ }, async (args: any) => {
        logger.debug(`Resolving HQL import: "${args.path}" from importer: ${args.importer || 'unknown'}`);
        
        // Create an array of resolution strategies to try in parallel
        const resolutionStrategies = [];
        
        // Strategy 1: Resolve relative to importer
        if (args.importer) {
          const importerDir = dirname(args.importer);
          const relativePath = resolve(importerDir, args.path);
          
          resolutionStrategies.push({
            description: `relative to importer: ${relativePath}`,
            path: relativePath,
            tryResolve: async () => {
              try {
                await Deno.stat(relativePath);
                logger.debug(`Found file relative to importer: ${relativePath}`);
                return { success: true, path: relativePath };
              } catch (e) {
                logger.debug(`File not found relative to importer: ${e instanceof Error ? e.message : String(e)}`);
                return { success: false, path: relativePath };
              }
            }
          });
        }
        
        // Strategy 2: Try resolving from current working directory
        const cwdPath = resolve(Deno.cwd(), args.path);
        resolutionStrategies.push({
          description: `relative to cwd: ${cwdPath}`,
          path: cwdPath,
          tryResolve: async () => {
            try {
              await Deno.stat(cwdPath);
              logger.debug(`Found file relative to cwd: ${cwdPath}`);
              return { success: true, path: cwdPath };
            } catch (e) {
              logger.debug(`File not found relative to cwd: ${e instanceof Error ? e.message : String(e)}`);
              return { success: false, path: cwdPath };
            }
          }
        });
        
        // Strategy 3: Try resolving from original source directory
        if (options.sourceDir) {
          const sourcePath = resolve(options.sourceDir, args.path);
          resolutionStrategies.push({
            description: `relative to original source directory: ${sourcePath}`,
            path: sourcePath,
            tryResolve: async () => {
              try {
                await Deno.stat(sourcePath);
                logger.debug(`Found file relative to source directory: ${sourcePath}`);
                return { success: true, path: sourcePath };
              } catch (e) {
                logger.debug(`File not found relative to source directory: ${e instanceof Error ? e.message : String(e)}`);
                return { success: false, path: sourcePath };
              }
            }
          });
        }
        
        // Strategy 4: Try looking in examples directory
        const fileName = basename(args.path);
        const examplesPath = resolve(Deno.cwd(), "examples", "dependency-test", fileName);
        resolutionStrategies.push({
          description: `in examples directory: ${examplesPath}`,
          path: examplesPath,
          tryResolve: async () => {
            try {
              await Deno.stat(examplesPath);
              logger.debug(`Found file in examples directory: ${examplesPath}`);
              return { success: true, path: examplesPath };
            } catch (e) {
              logger.debug(`File not found in examples directory: ${e instanceof Error ? e.message : String(e)}`);
              return { success: false, path: examplesPath };
            }
          }
        });
        
        // Strategy 5: Try looking in the same directory as the original file
        if (options.sourceDir && args.path.startsWith('./')) {
          const sourceParentDir = dirname(options.sourceDir);
          const sourcePath = resolve(sourceParentDir, args.path);
          resolutionStrategies.push({
            description: `in original file's parent directory: ${sourcePath}`,
            path: sourcePath,
            tryResolve: async () => {
              try {
                await Deno.stat(sourcePath);
                logger.debug(`Found file in original file's parent directory: ${sourcePath}`);
                return { success: true, path: sourcePath };
              } catch (e) {
                logger.debug(`File not found in original file's parent directory: ${e instanceof Error ? e.message : String(e)}`);
                return { success: false, path: sourcePath };
              }
            }
          });
        }
        
        // Try all strategies in parallel and use the first successful one
        const results = await Promise.all(resolutionStrategies.map(strategy => strategy.tryResolve()));
        const successResult = results.find(result => result.success);
        
        if (successResult) {
          return { 
            path: successResult.path, 
            namespace: "hql" 
          };
        } else {
          logger.warn(`Could not resolve HQL file: ${args.path} after trying all strategies in parallel`);
          return { 
            path: args.path, // Return original path if not resolved
            namespace: "hql" 
          };
        }
      });
      
      // Handle loading .hql files
      build.onLoad({ filter: /.*/, namespace: "hql" }, async (args: any) => {
        return performAsync(async () => {
          logger.debug(`Loading HQL file: ${args.path}`);
          
          // Check if we already have a transpiled JS version of this file
          if (hqlToJsMap.has(args.path)) {
            const jsPath = hqlToJsMap.get(args.path)!;
            logger.debug(`Using previously transpiled JS file: ${jsPath}`);
            
            // Read the transpiled JS content
            const jsContent = await performAsync(
              () => Deno.readTextFile(jsPath),
              `Reading transpiled JS file: ${jsPath}`,
              TranspilerError
            );
            
            return { 
              contents: jsContent, 
              loader: "js",
              resolveDir: dirname(jsPath)
            };
          }
          
          // Skip already processed files to prevent duplicate processing
          if (processedHqlFiles.has(args.path)) {
            logger.debug(`Already processed HQL file: ${args.path}`);
            return null;
          }
          
          processedHqlFiles.add(args.path);
          
          // Function to read a file with error handling
          const tryReadFile = async (filePath: string): Promise<string | null> => {
            try {
              const content = await Deno.readTextFile(filePath);
              logger.debug(`Successfully read ${content.length} bytes from ${filePath}`);
              return content;
            } catch (e) {
              logger.debug(`Failed to read file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
              return null;
            }
          };
          
          // Try to read the main file first
          let source: string | null = await tryReadFile(args.path);
          let actualPath = args.path;
          
          // If main file reading failed, try alternatives in parallel
          if (source === null) {
            logger.debug(`File not found at ${args.path}, trying alternatives in parallel`);
            
            // Try alternatives in parallel
            const fileName = basename(args.path);
            const alternativePaths = [
              resolve(Deno.cwd(), "examples", "dependency-test", fileName)
              // Add other alternative paths if needed
            ];
            
            const alternativeResults = await Promise.all(
              alternativePaths.map(async path => ({
                path,
                content: await tryReadFile(path)
              }))
            );
            
            // Find first successful read
            const successfulRead = alternativeResults.find(result => result.content !== null);
            
            if (successfulRead) {
              source = successfulRead.content;
              actualPath = successfulRead.path;
              logger.debug(`Found in alternative location: ${actualPath}`);
            } else {
              // If all alternatives fail, throw an error
              logger.error(`File not found: ${args.path}, also tried ${alternativePaths.join(', ')}`);
              throw new TranspilerError(`File not found: ${args.path}, also tried ${alternativePaths.join(', ')}`);
            }
          }
          
          // Create temp directory for this file
          const fileHash = simpleHash(actualPath).toString();
          const outputDir = join(options.tempDir || "", fileHash);
          
          // Run directory creation and HQL processing in parallel
          const [, jsCode] = await Promise.all([
            // Task 1: Ensure the output directory exists
            ensureDir(outputDir, logger),
            
            // Task 2: Transpile the HQL file to JS
            performAsync(
              async () => {
                const { processHql } = await import("./transpiler/hql-transpiler.ts");
                return processHql(source!, {
                  baseDir: dirname(actualPath),
                  verbose: options.verbose,
                  sourceDir: options.sourceDir
                });
              },
              `Transpiling HQL file ${actualPath}`,
              TranspilerError
            )
          ]);
          
          // Write the JS file
          const outFileName = basename(actualPath, ".hql") + ".js";
          const jsOutputPath = join(outputDir, outFileName);
          
          await performAsync(
            () => writeTextFile(jsOutputPath, jsCode),
            `Writing transpiled JS to ${jsOutputPath}`,
            TranspilerError
          );
          
          logger.debug(`Written transpiled JS to: ${jsOutputPath}`);
          
          // Remember this mapping for future imports
          hqlToJsMap.set(args.path, jsOutputPath);
          if (args.path !== actualPath) {
            hqlToJsMap.set(actualPath, jsOutputPath);
          }
          
          // Return the transpiled JS content
          return { 
            contents: jsCode, 
            loader: "js",
            resolveDir: dirname(jsOutputPath)
          };
        }, `Error loading HQL file ${args.path}`, TranspilerError);
      });
    }
  };
}

/**
 * Create esbuild options from our bundle options
 * Now using the perform utility
 */
function createBuildOptions(
  entryPath: string, 
  outputPath: string, 
  options: BundleOptions,
  plugins: any[]
): any {
  return perform(() => {
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
  }, "Failed to create build options", TranspilerError);
}

/**
 * Create an esbuild plugin to mark npm: and jsr: imports as external
 */
function createExternalPlugin(): any {
  return {
    name: "external-npm-jsr",
    setup(build: any) {
      build.onResolve({ filter: /^(npm:|jsr:|https?:)/ }, (args: any) => {
        return { path: args.path, external: true };
      });
    }
  };
}

/**
 * Simple string hash function
 * Enhanced with error handling using the perform utility
 */
function simpleHash(str: string): number {
  return perform(() => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }, "Failed to create hash", TranspilerError);
}

/**
 * Main CLI function for transpilation and bundling with bidirectional import support
 * Enhanced with parallel processing and better error handling
 */
export async function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: BundleOptions = {}
): Promise<string> {
  return performAsync(async () => {
    const logger = new Logger(options.verbose);
    const startTime = performance.now();
    
    logger.log(`Processing entry: ${inputPath}`);

    const resolvedInputPath = resolve(inputPath);
    const outPath = outputPath ??
      (resolvedInputPath.endsWith(".hql")
        ? resolvedInputPath.replace(/\.hql$/, ".js")
        : resolvedInputPath + ".bundle.js");

    // Store the original source directory to help with module resolution
    const sourceDir = dirname(resolvedInputPath);

    // Process the entry file to get an intermediate JS file
    const processedPath = await processEntryFile(resolvedInputPath, outPath, {
      ...options,
      sourceDir // Pass source directory to ensure import resolution works
    });
    
    logger.debug(`Entry file processed to: ${processedPath}`);
    
    // If bundling is enabled, run esbuild on the processed file
    if (options.bundle !== false) {
      await bundleWithEsbuild(processedPath, outPath, {
        ...options,
        sourceDir // Pass source directory to bundleWithEsbuild
      });
    }
    
    const endTime = performance.now();
    logger.log(`Successfully processed output to ${outPath} in ${(endTime - startTime).toFixed(2)}ms`);
    return outPath;
  }, `CLI transpilation failed for ${inputPath}`, TranspilerError);
}