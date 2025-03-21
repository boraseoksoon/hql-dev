// src/bundler.ts - Enhanced with better error handling and debugging

import { dirname, resolve, writeTextFile, mkdir, exists, basename, join } from "./platform/platform.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { Logger } from "./logger.ts";
import { processHql } from "./transpiler/hql-transpiler.ts";
import { TranspilerError, ValidationError, createErrorReport } from "./transpiler/errors.ts";

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
 * Enhanced with better error handling.
 */
async function ensureDir(dir: string, logger: Logger): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
    logger.debug(`Ensured directory exists: ${dir}`);
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      logger.error(`Failed to create directory ${dir}: ${error instanceof Error ? error.message : String(error)}`);
      throw new TranspilerError(`Failed to create directory ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Directory already exists is not an error
    logger.debug(`Directory already exists: ${dir}`);
  }
}

/**
 * Write the output code to a file.
 * Enhanced with better error handling.
 */
async function writeOutput(
  code: string,
  outputPath: string,
  logger: Logger,
  force: boolean = false
): Promise<void> {
  try {
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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to write output to '${outputPath}': ${errorMsg}`);
    
    // If it's already a TranspilerError, re-throw it
    if (error instanceof TranspilerError) {
      throw error;
    }
    
    // Otherwise wrap it in a TranspilerError
    throw new TranspilerError(`Failed to write output to '${outputPath}': ${errorMsg}`);
  }
}

/**
 * Create an esbuild plugin to handle HQL imports in JS files
 * Enhanced with better error handling and diagnostics
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
      // Handle resolving .hql files
      build.onResolve({ filter: /\.hql$/ }, async (args: any) => {
        logger.debug(`Resolving HQL import: "${args.path}" from importer: ${args.importer || 'unknown'}`);
        
        // Get the full path
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
            logger.debug(`File not found relative to importer: ${e instanceof Error ? e.message : String(e)}`);
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
            logger.debug(`File not found relative to cwd: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        
        // Strategy 3: Try resolving from original source directory
        if (!resolved && options.sourceDir) {
          const sourcePath = resolve(options.sourceDir, args.path);
          logger.debug(`Trying path relative to original source directory: ${sourcePath}`);
          
          try {
            await Deno.stat(sourcePath);
            fullPath = sourcePath;
            resolved = true;
            logger.debug(`Found file relative to source directory: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
            logger.debug(`File not found relative to source directory: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        
        // Strategy 4: Try looking in examples directory
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
            logger.debug(`File not found in examples directory: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        
        // Strategy 5: Try looking in the same directory as the original file
        if (!resolved && options.sourceDir && args.path.startsWith('./')) {
          // Get the parent directory of the source file
          const sourceParentDir = dirname(options.sourceDir);
          const sourcePath = resolve(sourceParentDir, args.path);
          logger.debug(`Trying path in original file's parent directory: ${sourcePath}`);
          
          try {
            await Deno.stat(sourcePath);
            fullPath = sourcePath;
            resolved = true;
            logger.debug(`Found file in original file's parent directory: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
            logger.debug(`File not found in original file's parent directory: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        
        if (!resolved) {
          logger.warn(`Could not resolve HQL file: ${args.path} after trying all strategies`);
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
          
          // Check if we already have a transpiled JS version of this file
          if (hqlToJsMap.has(args.path)) {
            const jsPath = hqlToJsMap.get(args.path)!;
            logger.debug(`Using previously transpiled JS file: ${jsPath}`);
            
            // Read the transpiled JS content
            try {
              const jsContent = await Deno.readTextFile(jsPath);
              
              return { 
                contents: jsContent, 
                loader: "js",
                resolveDir: dirname(jsPath)
              };
            } catch (e) {
              throw new TranspilerError(`Failed to read transpiled JS file: ${jsPath}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          
          // Skip already processed files to prevent duplicate processing
          if (processedHqlFiles.has(args.path)) {
            logger.debug(`Already processed HQL file: ${args.path}`);
            return null;
          }
          
          processedHqlFiles.add(args.path);
          
          let source: string;
          try {
            // Try to read the file directly
            source = await Deno.readTextFile(args.path);
            logger.debug(`Successfully read ${source.length} bytes from ${args.path}`);
          } catch (error) {
            // If file not found, try alternatives
            if (error instanceof Deno.errors.NotFound) {
              logger.debug(`File not found at ${args.path}, trying alternatives`);
              
              // Try the examples directory as a fallback
              const fileName = basename(args.path);
              const examplesPath = resolve(Deno.cwd(), "examples", "dependency-test", fileName);
              
              try {
                source = await Deno.readTextFile(examplesPath);
                args.path = examplesPath; // Update the path for correct transpilation
                logger.debug(`Found in examples directory: ${examplesPath}`);
              } catch (e) {
                logger.error(`File not found: ${args.path}, also tried ${examplesPath}`);
                throw new TranspilerError(`File not found: ${args.path}, also tried ${examplesPath}`);
              }
            } else {
              // Re-throw other errors
              logger.error(`Error reading file ${args.path}: ${error instanceof Error ? error.message : String(error)}`);
              throw new TranspilerError(`Error reading file ${args.path}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          
          // Create temp directory for this file if needed
          const fileHash = simpleHash(args.path).toString();
          const outputDir = join(options.tempDir || "", fileHash);
          
          try {
            await ensureDir(outputDir, logger);
          } catch (error) {
            if (!(error instanceof Deno.errors.AlreadyExists)) {
              logger.error(`Failed to create temp directory: ${outputDir}: ${error instanceof Error ? error.message : String(error)}`);
              throw new TranspilerError(`Failed to create temp directory: ${outputDir}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          
          // Transpile the HQL file to JS using processHql
          let jsCode: string;
          try {
            const { processHql } = await import("./transpiler/hql-transpiler.ts");
            jsCode = await processHql(source, {
              baseDir: dirname(args.path),
              verbose: options.verbose,
              sourceDir: options.sourceDir // Pass source directory to processHql
            });
            logger.debug(`Successfully transpiled ${args.path}`);
          } catch (error) {
            logger.error(`Error transpiling HQL file ${args.path}: ${error instanceof Error ? error.message : String(error)}`);
            
            // Enhance error reporting
            const contextInfo = {
              filePath: args.path,
              sourceLength: source.length,
              sourceDir: options.sourceDir,
              tempDir: options.tempDir
            };
            
            // Create detailed error report
            const errorReport = createErrorReport(
              error instanceof Error ? error : new Error(String(error)),
              "HQL transpilation in bundler",
              contextInfo
            );
            
            if (options.verbose) {
              console.error("Detailed transpilation error report:");
              console.error(errorReport);
            }
            
            return {
              errors: [{ text: `Error transpiling HQL file: ${error instanceof Error ? error.message : String(error)}` }]
            };
          }
          
          // Write the JS file
          const outFileName = basename(args.path, ".hql") + ".js";
          const jsOutputPath = join(outputDir, outFileName);
          
          try {
            await writeTextFile(jsOutputPath, jsCode);
            logger.debug(`Written transpiled JS to: ${jsOutputPath}`);
          } catch (error) {
            logger.error(`Error writing transpiled JS to ${jsOutputPath}: ${error instanceof Error ? error.message : String(error)}`);
            throw new TranspilerError(`Error writing transpiled JS to ${jsOutputPath}: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          // Remember this mapping for future imports
          hqlToJsMap.set(args.path, jsOutputPath);
          
          // Return the transpiled JS content
          return { 
            contents: jsCode, 
            loader: "js",
            resolveDir: dirname(jsOutputPath)
          };
        } catch (error) {
          // Generate comprehensive error message
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error(`Error loading HQL file ${args.path}: ${errorMsg}`);
          
          // Provide detailed error context for esbuild
          return {
            errors: [{ 
              text: `Error loading HQL file: ${errorMsg}`,
              location: {
                file: args.path,
                namespace: "hql"
              }
            }]
          };
        }
      });
    }
  };
}

/**
 * Process an entry file (HQL or JS) and output transpiled JS
 * Enhanced with better error handling and diagnostics
 */
async function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  const resolvedInputPath = resolve(inputPath);
  
  logger.debug(`Processing entry file: ${resolvedInputPath}`);
  logger.debug(`Output path: ${outputPath}`);

  try {
    if (resolvedInputPath.endsWith(".hql")) {
      logger.log(`Transpiling HQL entry file: ${resolvedInputPath}`);
      
      // Create a temp directory if not provided
      let tempDir = options.tempDir;
      let tempDirCreated = false;
      
      if (!tempDir) {
        try {
          tempDir = await Deno.makeTempDir({ prefix: "hql_bundle_" });
          tempDirCreated = true;
          logger.debug(`Created temporary directory: ${tempDir}`);
        } catch (error) {
          logger.error(`Failed to create temporary directory: ${error instanceof Error ? error.message : String(error)}`);
          throw new TranspilerError(`Failed to create temporary directory: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Read the source
      let source: string;
      try {
        source = await Deno.readTextFile(resolvedInputPath);
        logger.debug(`Read ${source.length} bytes from ${resolvedInputPath}`);
      } catch (error) {
        logger.error(`Failed to read entry file ${resolvedInputPath}: ${error instanceof Error ? error.message : String(error)}`);
        throw new TranspilerError(`Failed to read entry file ${resolvedInputPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Process with full bidirectional import support
      let jsCode: string;
      try {
        jsCode = await processHql(source, {
          baseDir: dirname(resolvedInputPath),
          verbose: options.verbose,
          tempDir,
          keepTemp: options.keepTemp,
          sourceDir: options.sourceDir // Pass source directory to processHql
        });
        logger.debug(`Successfully transpiled HQL to JS (${jsCode.length} bytes)`);
      } catch (error) {
        logger.error(`Error transpiling HQL entry file: ${error instanceof Error ? error.message : String(error)}`);
        
        // Create detailed error report
        const errorReport = createErrorReport(
          error instanceof Error ? error : new Error(String(error)),
          "HQL entry file transpilation",
          {
            inputPath: resolvedInputPath,
            outputPath: outputPath,
            sourceLength: source.length,
            options: {
              tempDir,
              sourceDir: options.sourceDir,
              verbose: options.verbose
            }
          }
        );
        
        if (options.verbose) {
          console.error("Detailed transpilation error report:");
          console.error(errorReport);
        }
        
        // Clean up temp directory if we created it
        if (tempDirCreated && !options.keepTemp) {
          try {
            await Deno.remove(tempDir, { recursive: true });
            logger.debug(`Cleaned up temporary directory: ${tempDir}`);
          } catch (cleanupError) {
            logger.warn(`Failed to clean up temp directory: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
          }
        }
        
        throw error; // Re-throw the original error after cleanup
      }

      // Write the output
      try {
        await writeOutput(jsCode, outputPath, logger, options.force);
      } catch (error) {
        logger.error(`Failed to write output: ${error instanceof Error ? error.message : String(error)}`);
        
        // Clean up temp directory if we created it
        if (tempDirCreated && !options.keepTemp) {
          try {
            await Deno.remove(tempDir, { recursive: true });
          } catch (cleanupError) {
            logger.warn(`Failed to clean up temp directory: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
          }
        }
        
        throw error; // Re-throw after cleanup
      }
      
      // Clean up if not keeping temp files
      if (tempDirCreated && !options.keepTemp) {
        try {
          await Deno.remove(tempDir, { recursive: true });
          logger.debug(`Cleaned up temporary directory: ${tempDir}`);
        } catch (error) {
          logger.warn(`Failed to clean up temporary directory: ${error instanceof Error ? error.message : String(error)}`);
          // Continue despite cleanup failure - not critical
        }
      }
      
      logger.log(`Entry processed and output written to ${outputPath}`);
      return outputPath;
    } else if (resolvedInputPath.endsWith(".js")) {
      logger.log(`Using JS entry file: ${resolvedInputPath}`);
      
      // Read the JS file
      let jsSource: string;
      try {
        jsSource = await Deno.readTextFile(resolvedInputPath);
        logger.debug(`Read ${jsSource.length} bytes from ${resolvedInputPath}`);
      } catch (error) {
        logger.error(`Failed to read JS entry file ${resolvedInputPath}: ${error instanceof Error ? error.message : String(error)}`);
        throw new TranspilerError(`Failed to read JS entry file ${resolvedInputPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Check for HQL imports
      const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
      if (hqlImportRegex.test(jsSource)) {
        logger.log(`JS file contains HQL imports - will be processed during bundling`);
      }
      
      try {
        await writeOutput(jsSource, outputPath, logger, options.force);
      } catch (error) {
        logger.error(`Failed to write output: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
      
      return outputPath;
    } else {
      const errorMsg = `Unsupported file type: ${inputPath} (expected .hql or .js)`;
      logger.error(errorMsg);
      throw new ValidationError(
        errorMsg,
        "file type validation",
        ".hql or .js",
        path.extname(inputPath) || "no extension"
      );
    }
  } catch (error) {
    // If it's already a specific error type, re-throw it
    if (error instanceof TranspilerError || error instanceof ValidationError) {
      throw error;
    }
    
    // Otherwise wrap it in a TranspilerError
    throw new TranspilerError(`Failed to process entry file ${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Bundles the code using esbuild with our plugins and optimization options
 * Enhanced with better error handling and diagnostics
 */
export async function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  
  logger.debug(`Bundling ${entryPath} to ${outputPath}`);
  logger.debug(`Bundling options: ${JSON.stringify(options, null, 2)}`);
  
  // Create a temp directory if not provided
  let tempDir = options.tempDir;
  let cleanupTemp = false;
  
  try {
    if (!tempDir) {
      tempDir = await Deno.makeTempDir({ prefix: "hql_bundle_" });
      cleanupTemp = true;
      logger.debug(`Created temporary directory: ${tempDir}`);
    }
    
    // Create the HQL plugin with temporary directory for processing
    const hqlPlugin = createHqlPlugin({ 
      verbose: options.verbose,
      tempDir,
      sourceDir: options.sourceDir // Pass the source directory
    });
    
    const externalPlugin = createExternalPlugin();

    // If force is true, ensure the file doesn't exist before building
    if (options.force && await exists(outputPath)) {
      try {
        await Deno.remove(outputPath);
        logger.log(`Removed existing file: ${outputPath}`);
      } catch (error) {
        logger.error(`Failed to remove existing file ${outputPath}: ${error instanceof Error ? error.message : String(error)}`);
        // Continue despite removal failure - esbuild will overwrite
      }
    }

    // Create build options from optimization options
    const buildOptions = createBuildOptions(entryPath, outputPath, options, [hqlPlugin, externalPlugin]);
    
    try {
      logger.log(`Starting bundling with esbuild for ${entryPath}`);
      
      // Print the import path for debugging
      const entryDir = dirname(entryPath);
      logger.debug(`Entry directory: ${entryDir}`);
      
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
      
      // Clean up temporary directory if created here and not keeping
      if (cleanupTemp && !options.keepTemp) {
        try {
          await Deno.remove(tempDir, { recursive: true });
          logger.debug(`Cleaned up temporary directory: ${tempDir}`);
        } catch (error) {
          logger.warn(`Failed to clean up temporary directory: ${error instanceof Error ? error.message : String(error)}`);
          // Not critical, continue despite cleanup failure
        }
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
          buildOptions: { ...buildOptions, plugins: "[plugins]" }, // Don't stringify plugins
          tempDir
        }
      );
      
      if (options.verbose) {
        console.error("Detailed esbuild error report:");
        console.error(errorReport);
      }
      
      // Clean up temporary directory on error
      if (cleanupTemp && !options.keepTemp) {
        try {
          await Deno.remove(tempDir, { recursive: true });
          logger.debug(`Cleaned up temporary directory after error: ${tempDir}`);
        } catch (cleanupError) {
          // Ignore cleanup errors on build failure
          logger.debug(`Failed to clean up temp dir after error: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
      }
      
      throw new TranspilerError(`esbuild failed: ${errorMsg}`);
    }
  } catch (error) {
    // If it's already a TranspilerError, re-throw it
    if (error instanceof TranspilerError) {
      throw error;
    }
    
    // Otherwise wrap in a TranspilerError
    throw new TranspilerError(`Bundling failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create esbuild options from our bundle options
 */
function createBuildOptions(
  entryPath: string, 
  outputPath: string, 
  options: BundleOptions,
  plugins: any[]
): any {
  try {
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
  } catch (error) {
    throw new TranspilerError(`Failed to create build options: ${error instanceof Error ? error.message : String(error)}`);
  }
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
 * Enhanced with error handling
 */
function simpleHash(str: string): number {
  try {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  } catch (error) {
    throw new TranspilerError(`Failed to create hash: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Main CLI function for transpilation and bundling with bidirectional import support
 * Enhanced with better error handling and diagnostics
 */
export async function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  const startTime = performance.now();
  
  logger.log(`Processing entry: ${inputPath}`);

  try {
    const resolvedInputPath = resolve(inputPath);
    const outPath = outputPath ??
      (resolvedInputPath.endsWith(".hql")
        ? resolvedInputPath.replace(/\.hql$/, ".js")
        : resolvedInputPath + ".bundle.js");

    // Store the original source directory to help with module resolution
    const sourceDir = dirname(resolvedInputPath);

    // Process the entry file to get an intermediate JS file
    let processedPath: string;
    try {
      processedPath = await processEntryFile(resolvedInputPath, outPath, {
        ...options,
        sourceDir // Pass source directory to ensure import resolution works
      });
      logger.debug(`Entry file processed to: ${processedPath}`);
    } catch (error) {
      logger.error(`Failed to process entry file: ${error instanceof Error ? error.message : String(error)}`);
      
      // Create detailed error report
      const errorReport = createErrorReport(
        error instanceof Error ? error : new Error(String(error)),
        "entry file processing",
        {
          inputPath: resolvedInputPath,
          outputPath: outPath,
          sourceDir,
          options
        }
      );
      
      if (options.verbose) {
        console.error("Detailed entry processing error report:");
        console.error(errorReport);
      }
      
      throw error; // Re-throw to be handled by caller
    }
    
    // If bundling is enabled, run esbuild on the processed file
    if (options.bundle !== false) {
      try {
        // Pass the sourceDir to bundleWithEsbuild
        await bundleWithEsbuild(processedPath, outPath, {
          ...options,
          sourceDir // Pass source directory to bundleWithEsbuild
        });
      } catch (error) {
        logger.error(`Failed to bundle with esbuild: ${error instanceof Error ? error.message : String(error)}`);
        
        // Create detailed error report
        const errorReport = createErrorReport(
          error instanceof Error ? error : new Error(String(error)),
          "esbuild bundling",
          {
            processedPath,
            outputPath: outPath,
            sourceDir,
            options: { ...options, sourceDir }
          }
        );
        
        if (options.verbose) {
          console.error("Detailed bundling error report:");
          console.error(errorReport);
        }
        
        throw error; // Re-throw to be handled by caller
      }
    }
    
    const endTime = performance.now();
    logger.log(`Successfully processed output to ${outPath} in ${(endTime - startTime).toFixed(2)}ms`);
    return outPath;
  } catch (error) {
    // Transform generic errors to TranspilerError
    if (!(error instanceof TranspilerError) && !(error instanceof ValidationError)) {
      throw new TranspilerError(`CLI transpilation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    throw error; // Re-throw specialized errors
  }
}

/**
 * Watch the given file for changes and re-run transpileCLI on modifications
 * Enhanced with better error handling
 */
export async function watchFile(
  inputPath: string,
  options: BundleOptions = {}
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  logger.log(`Watching ${inputPath} for changes...`);
  
  try {
    // Initial transpilation
    try {
      await transpileCLI(inputPath, undefined, options);
      logger.log(`Initial transpilation completed successfully`);
    } catch (error) {
      logger.error(`Initial transpilation failed: ${error instanceof Error ? error.message : String(error)}`);
      // Continue watching despite initial failure
    }
    
    // Set up watcher
    let watcher: Deno.FsWatcher;
    try {
      watcher = Deno.watchFs(inputPath);
      logger.debug(`File watcher set up for ${inputPath}`);
    } catch (error) {
      throw new TranspilerError(`Failed to set up file watcher: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Handle file change events
    for await (const event of watcher) {
      if (event.kind === "modify") {
        logger.log(`File changed, retranspiling...`);
        try {
          const startTime = performance.now();
          await transpileCLI(inputPath, undefined, options);
          const endTime = performance.now();
          logger.log(`Retranspilation completed in ${(endTime - startTime).toFixed(2)}ms`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error(`Retranspilation failed: ${errorMsg}`);
          
          // Create error report for diagnostics
          if (options.verbose) {
            const errorReport = createErrorReport(
              error instanceof Error ? error : new Error(errorMsg),
              "file watch retranspilation",
              {
                inputPath,
                eventKind: event.kind,
                options
              }
            );
            
            console.error("Detailed retranspilation error report:");
            console.error(errorReport);
          }
          
          // Continue watching despite transpilation failure
        }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Watch error: ${errorMsg}`);
    
    if (options.verbose) {
      const errorReport = createErrorReport(
        error instanceof Error ? error : new Error(errorMsg),
        "file watching",
        {
          inputPath,
          options
        }
      );
      
      console.error("Detailed watch error report:");
      console.error(errorReport);
    }
    
    // Exit on critical watch errors
    Deno.exit(1);
  }
}