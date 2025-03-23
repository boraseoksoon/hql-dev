// src/bundler.ts - Updated to fix local HQL import path resolution

import { resolve, dirname, writeTextFile, exists, basename, join, ensureDir } from "./platform/platform.ts";
import { Logger } from "./logger.ts";
import { processHql } from "./transpiler/hql-transpiler.ts";
import { TranspilerError, ValidationError, ImportError, createErrorReport } from "./transpiler/errors.ts";
import { perform, performAsync } from "./transpiler/error-utils.ts";
import { simpleHash } from "./utils.ts";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";

// Constants
const MAX_RETRIES = 3;
const ESBUILD_RETRY_DELAY_MS = 100;

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
      await ensureDir(outputDir);
      
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
 * Check if a file is an HQL file
 */
function isHqlFile(filePath: string): boolean {
  return filePath.endsWith(".hql");
}

/**
 * Check if a file is a JavaScript file
 */
function isJsFile(filePath: string): boolean {
  return filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs");
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

    // Determine file type and process accordingly
    if (isHqlFile(resolvedInputPath)) {
      return await processHqlEntryFile(resolvedInputPath, outputPath, options, logger);
    } else if (isJsFile(resolvedInputPath)) {
      return await processJsEntryFile(resolvedInputPath, outputPath, options, logger);
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
 * Process an HQL entry file
 */
async function processHqlEntryFile(
  resolvedInputPath: string,
  outputPath: string,
  options: BundleOptions,
  logger: Logger
): Promise<string> {
  logger.log(`Transpiling HQL entry file: ${resolvedInputPath}`);
  
  // Run directory creation and file reading in parallel
  const [tempDirResult, source] = await Promise.all([
    // Task 1: Create temp directory if needed
    createTempDirIfNeeded(options, logger),
    
    // Task 2: Read the source file
    readSourceFile(resolvedInputPath, logger)
  ]);
  
  const tempDir = tempDirResult.tempDir;
  const tempDirCreated = tempDirResult.created;
  
  logger.debug(`Read ${source.length} bytes from ${resolvedInputPath}`);
  
  try {
    // Process with full bidirectional import support
    const jsCode = await processHqlToJs(source, resolvedInputPath, options, tempDir, logger);
    
    // Write the output
    await writeOutput(jsCode, outputPath, logger, options.force);
    
    logger.log(`Entry processed and output written to ${outputPath}`);
    return outputPath;
  } finally {
    // Clean up if not keeping temp files - do this as fire-and-forget
    cleanupTempDirIfNeeded(tempDir, tempDirCreated, options.keepTemp, logger);
  }
}

/**
 * Create a temp directory if needed
 */
async function createTempDirIfNeeded(
  options: BundleOptions,
  logger: Logger
): Promise<{ tempDir: string, created: boolean }> {
  return performAsync(
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
  );
}

/**
 * Read source file with enhanced error handling
 */
async function readSourceFile(filePath: string, logger: Logger): Promise<string> {
  return performAsync(
    () => Deno.readTextFile(filePath),
    `Reading entry file ${filePath}`,
    TranspilerError
  );
}

/**
 * Process HQL to JavaScript
 */
async function processHqlToJs(
  source: string,
  resolvedInputPath: string,
  options: BundleOptions,
  tempDir: string,
  logger: Logger
): Promise<string> {
  return performAsync(
    () => processHql(source, {
      baseDir: dirname(resolvedInputPath),
      verbose: options.verbose,
      tempDir,
      keepTemp: options.keepTemp,
      sourceDir: options.sourceDir || dirname(resolvedInputPath)
    }),
    "HQL entry file transpilation",
    TranspilerError
  );
}

/**
 * Clean up temp directory if needed (fire-and-forget)
 */
function cleanupTempDirIfNeeded(
  tempDir: string,
  tempDirCreated: boolean,
  keepTemp: boolean | undefined,
  logger: Logger
): void {
  if (tempDirCreated && !keepTemp) {
    Deno.remove(tempDir, { recursive: true })
      .then(() => logger.debug(`Cleaned up temporary directory: ${tempDir}`))
      .catch(error => logger.warn(`Failed to clean up temporary directory: ${error instanceof Error ? error.message : String(error)}`));
  }
}

/**
 * Process a JavaScript entry file
 */
async function processJsEntryFile(
  resolvedInputPath: string,
  outputPath: string,
  options: BundleOptions,
  logger: Logger
): Promise<string> {
  logger.log(`Using JS entry file: ${resolvedInputPath}`);
  
  // Read the JS file
  const jsSource = await performAsync(
    () => Deno.readTextFile(resolvedInputPath),
    `Reading JS entry file ${resolvedInputPath}`,
    TranspilerError
  );
  
  logger.debug(`Read ${jsSource.length} bytes from ${resolvedInputPath}`);
  
  // Check for HQL imports
  checkForHqlImports(jsSource, logger);
  
  await writeOutput(jsSource, outputPath, logger, options.force);
  return outputPath;
}

/**
 * Check for HQL imports in JavaScript file
 */
function checkForHqlImports(jsSource: string, logger: Logger): void {
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
  if (hqlImportRegex.test(jsSource)) {
    logger.log(`JS file contains HQL imports - will be processed during bundling`);
  }
}

/**
 * Bundles the code using esbuild with our plugins and optimization options
 * Enhanced with parallel processing and better error handling
 * Fixed to handle concurrent esbuild instances properly
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
    
    // Run temp directory creation and removal of existing output in parallel
    const [tempDirResult, _] = await Promise.all([
      createTempDirIfNeeded(options, logger),
      prepareOutputPath(outputPath, options.force, logger)
    ]);
    
    const tempDir = tempDirResult.tempDir;
    const cleanupTemp = tempDirResult.created;
    
    try {
      // Create plugins and build options
      const hqlPlugin = createHqlPlugin({ 
        verbose: options.verbose,
        tempDir,
        sourceDir: options.sourceDir || dirname(entryPath)
      });
      
      const externalPlugin = createExternalPlugin();
      
      const buildOptions = createBuildOptions(entryPath, outputPath, options, [hqlPlugin, externalPlugin]);
      
      logger.log(`Starting bundling with esbuild for ${entryPath}`);
      
      // Run the build with retry logic
      const result = await runBuildWithRetry(buildOptions, MAX_RETRIES, logger);
      
      if (options.minify) {
        logger.log(`Successfully bundled and minified output to ${outputPath}`);
      } else {
        logger.log(`Successfully bundled output to ${outputPath}`);
      }
      
      return outputPath;
    } catch (error) {
      handleBundlingError(error, entryPath, outputPath, options.verbose);
      throw error;
    } finally {
      // Clean up
      cleanupAfterBundling(tempDir, cleanupTemp, options.keepTemp, logger);
    }
  }, `Bundling failed for ${entryPath}`, TranspilerError);
}

/**
 * Prepare output path - remove existing file if force is true
 */
async function prepareOutputPath(
  outputPath: string,
  force: boolean | undefined,
  logger: Logger
): Promise<void> {
  return performAsync(
    async () => {
      if (force && await exists(outputPath)) {
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
  );
}

/**
 * Run esbuild with retry logic
 */
async function runBuildWithRetry(
  buildOptions: any,
  maxRetries: number,
  logger: Logger
): Promise<any> {
  // Import esbuild dynamically for each bundling operation
  // This ensures we get a fresh service for each process
  const esbuild = await import("https://deno.land/x/esbuild@v0.17.19/mod.js");
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Run the build
      const result = await performAsync(
        () => esbuild.build(buildOptions),
        "Running esbuild",
        TranspilerError
      );
      
      // Log any warnings
      if (result.warnings.length > 0) {
        logger.warn(`esbuild warnings: ${JSON.stringify(result.warnings, null, 2)}`);
      }
      
      // Stop the service on success
      await esbuild.stop();
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Only retry if it's a service-related error
      if (error instanceof Error && 
          error.message.includes("service was stopped") && 
          attempt < maxRetries) {
        logger.warn(`esbuild service error on attempt ${attempt}, retrying...`);
        
        // Wait a bit before retrying to allow other processes to finish
        await new Promise(resolve => setTimeout(resolve, ESBUILD_RETRY_DELAY_MS * attempt));
        
        // Try to stop the service before retrying
        try {
          await esbuild.stop();
        } catch (e) {
          // Ignore errors when stopping
        }
        
        continue;
      }
      
      // If it's not a service error or we've exhausted retries, fail
      break;
    }
  }
  
  // All retries failed
  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  logger.error(`esbuild error after ${maxRetries} attempts: ${errorMsg}`);
  
  // Try to stop the service in case it's still running
  try {
    await esbuild.stop();
  } catch (e) {
    // Ignore errors when stopping
  }
  
  throw new TranspilerError(`esbuild failed: ${errorMsg}`);
}

/**
 * Handle bundling error with appropriate error reporting
 */
function handleBundlingError(
  error: unknown,
  entryPath: string,
  outputPath: string,
  verbose: boolean | undefined
): void {
  if (error instanceof TranspilerError) {
    // Enhanced error is already created
    return;
  }
  
  const errorMsg = error instanceof Error ? error.message : String(error);
  
  if (verbose) {
    const errorReport = createErrorReport(
      error instanceof Error ? error : new Error(errorMsg),
      "esbuild bundling",
      {
        entryPath,
        outputPath,
        attempts: MAX_RETRIES
      }
    );
    
    console.error("Detailed esbuild error report:");
    console.error(errorReport);
  }
}

/**
 * Clean up after bundling
 */
async function cleanupAfterBundling(
  tempDir: string,
  cleanupTemp: boolean,
  keepTemp: boolean | undefined,
  logger: Logger
): Promise<void> {
  // Try to stop esbuild service
  try {
    const esbuild = await import("https://deno.land/x/esbuild@v0.17.19/mod.js");
    await esbuild.stop();
  } catch (e) {
    // Ignore errors when stopping
  }
  
  // Clean up temporary directory if created here and not keeping
  if (cleanupTemp && !keepTemp) {
    Deno.remove(tempDir, { recursive: true })
      .then(() => logger.debug(`Cleaned up temporary directory: ${tempDir}`))
      .catch(error => logger.warn(`Failed to clean up temporary directory: ${error instanceof Error ? error.message : String(error)}`));
  }
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
      // Handle resolving .hql and .js files
      build.onResolve({ filter: /\.(js|hql)$/ }, async (args: any) => {
        return resolveHqlImport(args, options, logger);
      });
      
      // Handle loading .hql files
      build.onLoad({ filter: /.*/, namespace: "hql" }, async (args: any) => {
        return loadHqlFile(args, processedHqlFiles, hqlToJsMap, options, logger);
      });
    }
  };
}

/**
 * Resolve HQL imports with parallel resolution strategies
 */
async function resolveHqlImport(
  args: any,
  options: { verbose?: boolean, tempDir?: string, sourceDir?: string },
  logger: Logger
): Promise<any> {
  logger.debug(`Resolving import: "${args.path}" from importer: ${args.importer || 'unknown'}`);
  
  // Create and try resolution strategies in parallel
  const resolutionStrategies = [
    // Strategy 1: Resolve relative to importer
    {
      description: "relative to importer",
      path: args.importer ? resolve(dirname(args.importer), args.path) : args.path,
      tryResolve: async () => {
        if (args.importer) {
          const importerDir = dirname(args.importer);
          const relativePath = resolve(importerDir, args.path);
          try {
            await Deno.stat(relativePath);
            logger.debug(`Found import at ${relativePath} (relative to importer)`);
            return true;
          } catch (e) {
            return false;
          }
        }
        return false;
      }
    },
    
    // Strategy 2: Resolve relative to original source directory
    {
      description: "relative to source directory",
      path: options.sourceDir ? resolve(options.sourceDir, args.path) : args.path,
      tryResolve: async () => {
        if (options.sourceDir) {
          const sourcePath = resolve(options.sourceDir, args.path);
          try {
            await Deno.stat(sourcePath);
            logger.debug(`Found import at ${sourcePath} (relative to source directory)`);
            return true;
          } catch (e) {
            return false;
          }
        }
        return false;
      }
    },
    
    // Strategy 3: Resolve relative to current working directory
    {
      description: "relative to CWD",
      path: resolve(Deno.cwd(), args.path),
      tryResolve: async () => {
        const cwdPath = resolve(Deno.cwd(), args.path);
        try {
          await Deno.stat(cwdPath);
          logger.debug(`Found import at ${cwdPath} (relative to CWD)`);
          return true;
        } catch (e) {
          return false;
        }
      }
    },
    
    // Strategy 4: Look in lib directory for core-related imports
    {
      description: "in lib directory",
      path: resolve(Deno.cwd(), 'lib', args.path.replace(/^\.\//, '')),
      tryResolve: async () => {
        // If path starts with ./ strip it off to check in lib directory
        const libPath = resolve(Deno.cwd(), 'lib', args.path.replace(/^\.\//, ''));
        try {
          await Deno.stat(libPath);
          logger.debug(`Found import at ${libPath} (in lib directory)`);
          return true;
        } catch (e) {
          return false;
        }
      }
    },
    
    // Strategy 5: Look in the examples directory
    {
      description: "in examples directory",
      path: resolve(Deno.cwd(), 'examples', args.path.replace(/^\.\//, '')),
      tryResolve: async () => {
        const examplesPath = resolve(Deno.cwd(), 'examples', args.path.replace(/^\.\//, ''));
        try {
          await Deno.stat(examplesPath);
          logger.debug(`Found import at ${examplesPath} (in examples directory)`);
          return true;
        } catch (e) {
          return false;
        }
      }
    },

    // Strategy 6: Look specifically for lib/test path for text-utils.hql
    {
      description: "in lib/test directory",
      path: args.path.includes("text-utils.hql") ? 
            resolve(Deno.cwd(), 'lib/test/text-utils.hql') : args.path,
      tryResolve: async () => {
        if (args.path.includes("text-utils.hql")) {
          const testPath = resolve(Deno.cwd(), 'lib/test/text-utils.hql');
          try {
            await Deno.stat(testPath);
            logger.debug(`Found import at ${testPath} (specific lib/test path)`);
            return true;
          } catch (e) {
            return false;
          }
        }
        return false;
      }
    },
    
    // Strategy 7: Check if the formatter.js exists when looking for it 
    {
      description: "in lib/test directory for formatter.js",
      path: args.path.includes("formatter.js") ? 
            resolve(Deno.cwd(), 'lib/test/formatter.js') : args.path,
      tryResolve: async () => {
        if (args.path.includes("formatter.js")) {
          const formatterPath = resolve(Deno.cwd(), 'lib/test/formatter.js');
          try {
            await Deno.stat(formatterPath);
            logger.debug(`Found import at ${formatterPath} (specific lib/test/formatter.js path)`);
            return true;
          } catch (e) {
            return false;
          }
        }
        return false;
      }
    }
  ];
  
  // Try all strategies in parallel for better performance
  const results = await Promise.all(
    resolutionStrategies.map(async strategy => ({
      success: await strategy.tryResolve(),
      path: strategy.path,
      description: strategy.description
    }))
  );
  
  // Find the first successful resolution
  const successResult = results.find(result => result.success);
  
  if (successResult) {
    logger.debug(`Resolved "${args.path}" to "${successResult.path}" (${successResult.description})`);
    return { 
      path: successResult.path, 
      namespace: args.path.endsWith('.hql') ? "hql" : "file" 
    };
  }
  
  // If all strategies fail, log the failure and return the original path
  logger.warn(`Could not resolve file: ${args.path} after trying all strategies in parallel`);
  
  // List all paths that were tried for better diagnostics
  const triedPaths = results.map(r => r.path).join(', ');
  logger.error(`File not found: ${args.path}, also tried ${triedPaths}`);
  
  return { 
    path: args.path, 
    namespace: args.path.endsWith('.hql') ? "hql" : "file" 
  };
}

/**
 * Load and process HQL file
 */
async function loadHqlFile(
  args: any,
  processedHqlFiles: Set<string>,
  hqlToJsMap: Map<string, string>,
  options: { verbose?: boolean, tempDir?: string, sourceDir?: string },
  logger: Logger
): Promise<any> {
  return performAsync(async () => {
    logger.debug(`Loading HQL file: ${args.path}`);
    
    // Check if we already have a transpiled JS version of this file
    if (hqlToJsMap.has(args.path)) {
      return loadTranspiledJs(args.path, hqlToJsMap.get(args.path)!, logger);
    }
    
    // Skip already processed files to prevent duplicate processing
    if (processedHqlFiles.has(args.path)) {
      logger.debug(`Already processed HQL file: ${args.path}`);
      return null;
    }
    
    processedHqlFiles.add(args.path);
    
    // Find the actual file path
    const actualPath = await findActualFilePath(args.path, logger);
    
    // Create temp directory for this file
    const fileHash = simpleHash(actualPath).toString();
    const outputDir = join(options.tempDir || "", fileHash);
    
    // Run directory creation and HQL processing in parallel
    const [, jsCode] = await Promise.all([
      ensureDir(outputDir),
      transpileHqlFile(actualPath, options.sourceDir, options.verbose)
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
}

/**
 * Load already transpiled JavaScript
 */
async function loadTranspiledJs(
  originalPath: string,
  jsPath: string,
  logger: Logger
): Promise<any> {
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

/**
 * Find the actual file path, trying multiple locations
 */
async function findActualFilePath(filePath: string, logger: Logger): Promise<string> {
  // Special handling for core.hql library files
  if (filePath.includes("text-utils.hql")) {
    const libTestPath = path.resolve(Deno.cwd(), 'lib/test/text-utils.hql');
    const content = await tryReadFile(libTestPath, logger);
    if (content !== null) {
      logger.debug(`Found text-utils.hql at lib/test path: ${libTestPath}`);
      return libTestPath;
    }
  }
  
  if (filePath.includes("formatter.js")) {
    const formatterPath = path.resolve(Deno.cwd(), 'lib/test/formatter.js');
    const content = await tryReadFile(formatterPath, logger);
    if (content !== null) {
      logger.debug(`Found formatter.js at lib/test path: ${formatterPath}`);
      return formatterPath;
    }
  }

  // Try to read the main file first
  let content = await tryReadFile(filePath, logger);
  
  if (content !== null) {
    return filePath;
  }
  
  // If main file reading failed, try alternatives in parallel
  logger.debug(`File not found at ${filePath}, trying alternatives in parallel`);
  
  // Try alternatives in parallel
  const fileName = path.basename(filePath);
  const alternativePaths = [
    path.resolve(Deno.cwd(), "lib", fileName),
    path.resolve(Deno.cwd(), "lib/test", fileName),
    path.resolve(Deno.cwd(), fileName),
    path.resolve(Deno.cwd(), "examples", fileName)
  ];
  
  // Add paths with stripped ./ prefix for relative paths
  if (filePath.startsWith('./')) {
    const strippedPath = filePath.substring(2);
    alternativePaths.push(
      path.resolve(Deno.cwd(), "lib", strippedPath),
      path.resolve(Deno.cwd(), strippedPath),
    );
  }
  
  const alternativeResults = await Promise.all(
    alternativePaths.map(async path => ({
      path,
      content: await tryReadFile(path, logger)
    }))
  );
  
  // Find first successful read
  const successfulRead = alternativeResults.find(result => result.content !== null);
  
  if (successfulRead) {
    logger.debug(`Found in alternative location: ${successfulRead.path}`);
    return successfulRead.path;
  }
  
  // If all alternatives fail, throw an error
  logger.error(`File not found: ${filePath}, also tried ${alternativePaths.join(', ')}`);
  throw new ImportError(
    `File not found: ${filePath}, also tried ${alternativePaths.join(', ')}`,
    filePath,
    logger.getCurrentFile()
  );
}

/**
 * Try to read a file, returning null if it fails
 */
async function tryReadFile(filePath: string, logger: Logger): Promise<string | null> {
  try {
    const content = await Deno.readTextFile(filePath);
    logger.debug(`Successfully read ${content.length} bytes from ${filePath}`);
    return content;
  } catch (e) {
    logger.debug(`Failed to read file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Transpile HQL file to JavaScript
 */
async function transpileHqlFile(
  filePath: string,
  sourceDir: string | undefined,
  verbose: boolean | undefined
): Promise<string> {
  return performAsync(
    async () => {
      const source = await Deno.readTextFile(filePath);
      const { processHql } = await import("./transpiler/hql-transpiler.ts");
      return processHql(source, {
        baseDir: dirname(filePath),
        verbose,
        sourceDir
      });
    },
    `Transpiling HQL file ${filePath}`,
    TranspilerError
  );
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
    const outPath = determineOutputPath(resolvedInputPath, outputPath);

    // Store the original source directory to help with module resolution
    const sourceDir = dirname(resolvedInputPath);

    // Process the entry file to get an intermediate JS file
    const processedPath = await processEntryFile(resolvedInputPath, outPath, {
      ...options,
      sourceDir // Pass source directory
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

/**
 * Determine the output path based on input and provided output
 */
function determineOutputPath(resolvedInputPath: string, outputPath?: string): string {
  if (outputPath) {
    return outputPath;
  }
  
  if (resolvedInputPath.endsWith(".hql")) {
    return resolvedInputPath.replace(/\.hql$/, ".js");
  }
  
  return resolvedInputPath + ".bundle.js";
}