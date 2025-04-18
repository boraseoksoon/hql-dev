import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { processHql } from "./transpiler/hql-transpiler.ts";
import { performAsync } from "./transpiler/error/index.ts";
import { formatErrorMessage } from "./common/common-utils.ts";
import { globalLogger as logger } from "./logger.ts";
import { initializeRuntime } from "./common/runtime-initializer.ts";
import {
  dirname,
  ensureDir,
  exists,
  resolve,
  readTextFile
} from "./platform/platform.ts";
import {
  createErrorReport,
  TranspilerError,
  ValidationError,
} from "./transpiler/error/errors.ts";
import { 
  isHqlFile, 
  isJsFile, 
  isTypeScriptFile, 
  sanitizeIdentifier,
  readFile,
  findActualFilePath
} from "./common/utils.ts";
import { 
  createTempDir, 
  getCachedPath,
  needsRegeneration, 
  writeToCachedPath,
  registerExplicitOutput,
  getImportMapping,
  registerImportMapping,
  createTempDirIfNeeded,
} from "./common/temp-file-tracker.ts";

// Constants
const MAX_RETRIES = 3;
const ESBUILD_RETRY_DELAY_MS = 100;
const DEFAULT_EXTERNAL_PATTERNS = ['npm:', 'jsr:', 'node:', 'https://', 'http://'];

// Interfaces
export interface BundleOptions {
  verbose?: boolean;
  showTiming?: boolean;
  minify?: boolean;
  drop?: string[];
  tempDir?: string;
  sourceDir?: string;
  skipErrorReporting?: boolean;
  skipErrorHandling?: boolean;
  force?: boolean;
}

interface ImportInfo {
  full: string;
  path: string;
}

// Main API function
export function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: BundleOptions = {},
): Promise<string> {
  return performAsync(async () => {
    const startTime = performance.now();
    configureLogger(options);
    await initializeRuntime();
    
    if (!options.skipErrorReporting) {
      logger.log({ text: `Processing entry: ${inputPath}`, namespace: "cli" });
    }
    
    const resolvedInputPath = resolve(inputPath);
    const outPath = determineOutputPath(resolvedInputPath, outputPath);
    const sourceDir = dirname(resolvedInputPath);
    const bundleOptions = { ...options, sourceDir };
    
    try {
      // Process entry file
      if (options.showTiming) logger.startTiming("transpile-cli", "Process Entry");
      const processedPath = await processEntryFile(resolvedInputPath, outPath, bundleOptions);
      if (options.showTiming) logger.endTiming("transpile-cli", "Process Entry");
      
      // Bundle the processed file
      if (options.showTiming) logger.startTiming("transpile-cli", "esbuild Bundling");
      await bundleWithEsbuild(processedPath, outPath, bundleOptions);
      if (options.showTiming) logger.endTiming("transpile-cli", "esbuild Bundling");
      
      // Log completion
      const endTime = performance.now();
      logCompletionMessage(options, outPath, startTime, endTime);
      
      return outPath;
    } catch (error) {
      return handleError(error, `CLI transpilation failed for ${inputPath}`, 
        { inputPath, outputPath: outPath }, 
        { verbose: options.verbose, skipErrorReporting: options.skipErrorReporting }
      );
    }
  }, options.skipErrorReporting ? undefined : { context: `CLI transpilation failed for ${inputPath}` });
}

// File processing functions
export function checkForHqlImports(source: string): boolean {
  return /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g.test(source);
}

async function processHqlImports(
  source: string,
  filePath: string,
  options: BundleOptions,
  isJs: boolean,
): Promise<string> {
  const baseDir = dirname(filePath);
  let modifiedSource = source;
  const imports = extractHqlImports(source);

  logger.debug(`Processing ${imports.length} HQL imports in ${isJs ? 'JS' : 'TS'} file`);

  for (const importInfo of imports) {
    // Resolve the import path
    const resolvedHqlPath = await resolveImportPath(importInfo.path, baseDir, options);
    if (!resolvedHqlPath) {
      throw new Error(`Could not resolve import: ${importInfo.path} from ${filePath}`);
    }

    // Transpile HQL to TypeScript if needed
    if (await needsRegeneration(resolvedHqlPath, ".ts") || options.force) {
      logger.debug(`Transpiling HQL import: ${resolvedHqlPath}`);
      const hqlSource = await readFile(resolvedHqlPath);
      const tsCode = await processHql(hqlSource, {
        baseDir: dirname(resolvedHqlPath),
        verbose: options.verbose,
        tempDir: options.tempDir,
        sourceDir: options.sourceDir || dirname(resolvedHqlPath),
      });
      
      // Cache the transpiled file
      await cacheTranspiledFile(resolvedHqlPath, tsCode, ".ts", { preserveRelative: true });
    }
    
    // Get path to cached TypeScript file
    const cachedTsPath = await getCachedPath(resolvedHqlPath, ".ts");
    
    if (isJs) {
      // For JS files, we need JavaScript output
      if (await needsRegeneration(resolvedHqlPath, ".js") || options.force) {
        logger.debug(`Generating JavaScript from TypeScript: ${cachedTsPath}`);
        
        // Get path for cached JS file
        const cachedJsPath = await getCachedPath(resolvedHqlPath, ".js", {
          createDir: true,
          preserveRelative: true,
        });
        
        // Bundle TypeScript to JavaScript
        await bundleWithEsbuild(cachedTsPath, cachedJsPath, {
          verbose: options.verbose,
          sourceDir: options.sourceDir || dirname(resolvedHqlPath),
        });
      }
      
      // Get path to cached JavaScript file
      const cachedJsPath = await getCachedPath(resolvedHqlPath, ".js");
      
      // Update import in source
      modifiedSource = modifiedSource.replace(
        importInfo.full,
        importInfo.full.replace(importInfo.path, cachedJsPath)
      );
      logger.debug(`Updated import: ${importInfo.path} → ${cachedJsPath}`);
    } else {
      // For TS files, use the TypeScript output directly
      modifiedSource = modifiedSource.replace(
        importInfo.full,
        importInfo.full.replace(importInfo.path, cachedTsPath)
      );
      logger.debug(`Updated import: ${importInfo.path} → ${cachedTsPath}`);
    }
  }

  return modifiedSource;
}

// Simplified process functions with shared logic
export async function processHqlImportsInTs(
  tsSource: string,
  tsFilePath: string,
  options: BundleOptions,
): Promise<string> {
  try {
    return await processHqlImports(tsSource, tsFilePath, options, false);
  } catch (error) {
    throw new TranspilerError(
      `Processing HQL imports in TypeScript file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function processHqlImportsInJs(
  jsSource: string,
  jsFilePath: string,
  options: BundleOptions,
): Promise<string> {
  try {
    return await processHqlImports(jsSource, jsFilePath, options, true);
  } catch (error) {
    throw new TranspilerError(
      `Processing HQL imports in JS file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Helper functions
async function writeOutput(
  code: string,
  outputPath: string,
): Promise<void> {
  try {
    const outputDir = dirname(outputPath);
    await ensureDir(outputDir);
    
    // Get file extension for caching
    const ext = path.extname(outputPath);
    
    // Write to cache
    const cachedPath = await writeToCachedPath(
      outputPath, 
      code, 
      ext,
      { preserveRelative: true }
    );
    
    logger.debug(`Written output to cache: ${cachedPath}`);
    
    // Register for final output
    registerExplicitOutput(outputPath);
    
    if (await exists(outputPath)) {
      logger.warn(`File '${outputPath}' already exists. Will be overwritten when cache is cleaned up.`);
    }
  } catch (error) {
    throw new TranspilerError(
      `Failed to write output to '${outputPath}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// Main processing function
function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: BundleOptions = {},
): Promise<string> {
  return performAsync(async () => {
    const resolvedInputPath = resolve(inputPath);
    logger.debug(`Processing entry file: ${resolvedInputPath}`);
    logger.debug(`Output path: ${outputPath}`);
    
    if (isHqlFile(resolvedInputPath)) {
      return await processHqlEntryFile(resolvedInputPath, outputPath, options);
    } else if (isJsFile(resolvedInputPath) || isTypeScriptFile(resolvedInputPath)) {
      return await processJsOrTsEntryFile(resolvedInputPath, outputPath, options);
    } else {
      throw new ValidationError(
        `Unsupported file type: ${inputPath} (expected .hql, .js, or .ts)`,
        "file type validation",
        ".hql, .js, or .ts",
        path.extname(inputPath) || "no extension",
      );
    }
  }, { context: `Failed to process entry file ${inputPath}` });
}

async function processHqlEntryFile(
  resolvedInputPath: string,
  outputPath: string,
  options: BundleOptions,
): Promise<string> {
  logger.log({ text: `Transpiling HQL entry file: ${resolvedInputPath}`, namespace: "bundler" });
  
  // Create temp directory
  const tempDir = await createTempDir("entry");
  
  // Read source file
  const source = await readFile(resolvedInputPath);
  logger.log({ text: `Read ${source.length} bytes from ${resolvedInputPath}`, namespace: "bundler" });
  
  // Generate TypeScript code from HQL
  let tsCode = await processHql(source, {
    baseDir: dirname(resolvedInputPath),
    verbose: options.verbose,
    tempDir,
    sourceDir: options.sourceDir || dirname(resolvedInputPath),
  });
  
  // Process nested HQL imports if present
  if (checkForHqlImports(tsCode)) {
    logger.log({ text: "Detected nested HQL imports in transpiled output. Processing them.", namespace: "bundler" });
    tsCode = await processHqlImportsInTs(tsCode, resolvedInputPath, options);
  }
  
  // Write TypeScript output to cache
  const tsOutputPath = await writeToCachedPath(resolvedInputPath, tsCode, ".ts");
  
  // Register the explicit output path
  if (outputPath) {
    registerExplicitOutput(outputPath);
  }
  
  logger.log({ text: `Entry processed and TypeScript output written to ${tsOutputPath}`, namespace: "bundler" });
  return tsOutputPath;
}

async function processJsOrTsEntryFile(
  resolvedInputPath: string,
  outputPath: string,
  options: BundleOptions,
): Promise<string> {
  try {
    const isTs = isTypeScriptFile(resolvedInputPath);
    const source = await readFile(resolvedInputPath);
    
    logger.log({ text: `Read ${source.length} bytes from ${resolvedInputPath}`, namespace: "bundler" });
    let processedSource = source;
    
    // Process HQL imports if present
    if (checkForHqlImports(source)) {
      if (isTs) {
        processedSource = await processHqlImportsInTs(source, resolvedInputPath, options);
      } else {
        processedSource = await processHqlImportsInJs(source, resolvedInputPath, options);
      }
    }
    
    // Write output with appropriate extension
    if (isTs) {
      const tsOutputPath = outputPath.replace(/\.js$/, ".ts");
      await writeOutput(processedSource, tsOutputPath);
      return tsOutputPath;
    } else {
      await writeOutput(processedSource, outputPath);
      return outputPath;
    }
  } catch (error) {
    throw new TranspilerError(
      `Processing ${isTypeScriptFile(resolvedInputPath) ? 'TypeScript' : 'JavaScript'} entry file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Create unified bundle plugin for esbuild
 */
function createUnifiedBundlePlugin(options: {
  verbose?: boolean;
  tempDir?: string;
  sourceDir?: string;
  externalPatterns?: string[];
}): any {
  const processedHqlFiles = new Set<string>();
  const filePathMap = new Map<string, string>();
  const externalPatterns = options.externalPatterns || DEFAULT_EXTERNAL_PATTERNS;
  
  return {
    name: "unified-hql-bundle-plugin",
    setup(build: any) {
      // Handle file:// URLs
      build.onResolve({ filter: /^file:\/\// }, async (args: any) => {
        const filePath = args.path.replace('file://', '');
        logger.debug(`Converting file:// URL: ${args.path} → ${filePath}`);
        
        try {
          await Deno.stat(filePath);
          return { path: filePath };
        } catch {
          logger.warn(`File not found: ${filePath}`);
          return { path: args.path, external: true };
        }
      });
      
      // Mark remote modules as external
      build.onResolve({ filter: /^(npm:|jsr:|https?:|node:)/ }, (args: any) => {
        logger.debug(`External module: ${args.path}`);
        return { path: args.path, external: true };
      });
      
      // Handle .hql/.js/.ts files with custom resolver
      build.onResolve({ filter: /\.(hql|js|ts)$/ }, async (args: any) => {
        return resolveHqlImport(args, options);
      });
      
      // Load HQL files with custom loader
      build.onLoad({ filter: /.*/, namespace: "hql" }, async (args: any) => {
        try {
          logger.debug(`Loading HQL file: ${args.path}`);
          
          // Check if already processed
          if (filePathMap.has(args.path)) {
            return loadTranspiledFile(filePathMap.get(args.path)!);
          }
          
          if (processedHqlFiles.has(args.path)) {
            logger.debug(`Already processed: ${args.path}`);
            return null;
          }
          
          processedHqlFiles.add(args.path);
          
          // Get actual file path
          const actualPath = await findActualFilePath(args.path, logger);
          
          // Transpile HQL to TypeScript
          const tsCode = await transpileHqlFile(actualPath, options.sourceDir, options.verbose);
          
          // Cache the transpiled file and register mappings
          const cachedPath = await cacheTranspiledFile(actualPath, tsCode, ".ts", { 
            preserveRelative: true 
          });
          
          // Register for explicit output
          registerExplicitOutput(cachedPath);
          
          // Save in local map for this bundling session
          filePathMap.set(args.path, cachedPath);
          if (args.path !== actualPath) {
            filePathMap.set(actualPath, cachedPath);
          }
          
          return {
            contents: tsCode,
            loader: "ts",
            resolveDir: dirname(cachedPath),
          };
        } catch (error) {
          throw new TranspilerError(
            `Error loading HQL file ${args.path}: ${formatErrorMessage(error)}`
          );
        }
      });
    },
  };
}

/**
 * Bundle the entry file and dependencies into a single JavaScript file
 */
function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {},
): Promise<string> {
  return performAsync(async () => {
    logger.log({ text: `Bundling ${entryPath} to ${outputPath}`, namespace: "bundler" });
    
    // Create temp directory if needed
    const tempDirResult = await createTempDirIfNeeded(options, "hql_bundle_", logger);
    const tempDir = tempDirResult.tempDir;
    const cleanupTemp = tempDirResult.created;
    
    try {
      // Create unified plugin for all bundling operations
      const bundlePlugin = createUnifiedBundlePlugin({
        verbose: options.verbose,
        tempDir,
        sourceDir: options.sourceDir || dirname(entryPath),
        externalPatterns: DEFAULT_EXTERNAL_PATTERNS,
      });
      
      // Define build options
      const buildOptions = {
        entryPoints: [entryPath],
        bundle: true,
        outfile: outputPath,
        format: 'esm',
        logLevel: options.verbose ? 'info' : 'silent',
        minify: options.minify,
        treeShaking: true,
        platform: 'neutral',
        target: ['es2020'],
        plugins: [bundlePlugin],
        allowOverwrite: true,
        sourcemap: false,
        metafile: true,
        write: true,
        absWorkingDir: Deno.cwd(),
        nodePaths: [Deno.cwd(), dirname(entryPath)],
      };
      
      // Run the build
      logger.log({ text: `Starting bundling: ${entryPath}`, namespace: "bundler" });
      const result = await runBuildWithRetry(buildOptions, MAX_RETRIES);
      
      // Post-process the output if needed
      if (result.metafile) {
        await postProcessBundleOutput(outputPath);
      }
      
      logger.log({ 
        text: `Successfully bundled to ${outputPath}`, 
        namespace: "bundler" 
      });
      
      return outputPath;
    } catch (error) {
      handleError(error, "Bundling failed", 
        { entryPath, outputPath, attempts: MAX_RETRIES },
        { verbose: options.verbose }
      );
      throw error;
    } finally {
      await cleanupAfterBundling(tempDir, cleanupTemp);
    }
  }, { context: `Bundling failed for ${entryPath}` });
}

/**
 * Post-process bundle output to ensure it's fully self-contained
 */
async function postProcessBundleOutput(outputPath: string): Promise<void> {
  try {
    const content = await readFile(outputPath);
    
    // Check for file:// URLs or absolute paths
    if (content.includes('file://') || /["'](\/[^'"]+)["']/.test(content)) {
      logger.warn('Found file:// URLs or absolute paths in bundle - fixing');
      
      // Replace both file:// URLs and absolute paths
      let fixedContent = content.replace(/["']file:\/\/\/[^"']+["']/g, () => '"[BUNDLED]"');
      fixedContent = fixedContent.replace(/["'](\/[^'"]+\.(?:js|ts|hql))["']/g, () => '"[BUNDLED]"');
      
      // Write fixed content
      await Deno.writeTextFile(outputPath, fixedContent);
      logger.debug('Fixed bundle output');
    }
  } catch (error) {
    logger.error(`Error post-processing bundle: ${formatErrorMessage(error)}`);
  }
}

async function runBuildWithRetry(
  buildOptions: any,
  maxRetries: number,
): Promise<any> {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await esbuild.build(buildOptions);
      
      if (result.warnings.length > 0) {
        logger.log({ text: `esbuild warnings: ${JSON.stringify(result.warnings, null, 2)}`, namespace: "bundler" });
      }
      
      await esbuild.stop();
      return result;
    } catch (error) {
      lastError = error;
      
      if (
        error instanceof Error &&
        error.message.includes("service was stopped") &&
        attempt < maxRetries
      ) {
        logger.log({ text: `esbuild service error on attempt ${attempt}, retrying...`, namespace: "bundler" });
        
        await new Promise((resolve) =>
          setTimeout(resolve, ESBUILD_RETRY_DELAY_MS * attempt)
        );
        
        try {
          await esbuild.stop();
        } catch {}
        
        continue;
      }
      
      break;
    }
  }
  
  const errorMsg = lastError instanceof Error
    ? lastError.message
    : String(lastError);
    
  logger.error(`esbuild error after ${maxRetries} attempts: ${errorMsg}`);
  
  try {
    await esbuild.stop();
  } catch {}
  
  throw new TranspilerError(`esbuild failed: ${errorMsg}`);
}

// Utility functions
/**
 * Configure logger based on options
 */
function configureLogger(options: BundleOptions): void {
  if (options.verbose) {
    logger.setEnabled(true);
  }
  
  if (options.showTiming) {
    logger.setTimingOptions({ showTiming: true });
    logger.startTiming("transpile-cli", "Total");
  }
}

/**
 * Log completion message with timing information
 */
function logCompletionMessage(
  options: BundleOptions,
  outPath: string,
  startTime: number,
  endTime: number
): void {
  if (options.skipErrorReporting) return;
  
  logger.log({
    text: `Successfully processed output to ${outPath} in ${
      (endTime - startTime).toFixed(2)
    }ms`,
    namespace: "cli"
  });
  
  if (options.showTiming) {
    logger.endTiming("transpile-cli", "Total");
    logger.logPerformance("transpile-cli", outPath.split("/").pop());
  }
}

/**
 * Extract HQL imports from source code
 */
function extractHqlImports(source: string): ImportInfo[] {
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
  const imports: ImportInfo[] = [];
  
  let match;
  while ((match = hqlImportRegex.exec(source)) !== null) {
    imports.push({ full: match[0], path: match[1] });
  }
  
  return imports;
}

/**
 * Resolve an import path across multiple search locations
 */
async function resolveImportPath(
  importPath: string,
  baseDir: string,
  options: { sourceDir?: string },
): Promise<string | null> {
  // Create prioritized array of lookup locations
  const lookupLocations = [
    path.resolve(baseDir, importPath),
    ...(options.sourceDir ? [path.resolve(options.sourceDir, importPath)] : []),
    path.resolve(Deno.cwd(), importPath),
    path.resolve(Deno.cwd(), "lib", importPath.replace(/^\.\//, ""))
  ];
  
  // Try each location in order until we find the file
  for (const location of lookupLocations) {
    try {
      await Deno.stat(location);
      logger.debug(`Resolved import: ${importPath} → ${location}`);
      return location;
    } catch {
      // Continue to next location
    }
  }
  
  logger.debug(`Failed to resolve import: ${importPath}`);
  return null;
}

/**
 * Resolve an HQL import for esbuild
 * Unified import resolution strategy for all file types
 */
async function resolveHqlImport(
  args: any,
  options: { 
    verbose?: boolean; 
    tempDir?: string; 
    sourceDir?: string;
    externalPatterns?: string[];
  },
): Promise<any> {
  const externalPatterns = options.externalPatterns || DEFAULT_EXTERNAL_PATTERNS;

  // Check if this is a remote URL that should be external
  if (externalPatterns.some(pattern => args.path.startsWith(pattern))) {
    logger.debug(`External import: ${args.path}`);
    return { path: args.path, external: true };
  }
  
  // Check import mapping cache
  const cachedMapping = getImportMapping(args.path);
  if (cachedMapping) {
    logger.debug(`Cached mapping: ${args.path} → ${cachedMapping}`);
    return {
      path: cachedMapping,
      namespace: cachedMapping.endsWith('.ts') || cachedMapping.endsWith('.js') ? "file" : "hql"
    };
  }
  
  // Check resolved path mapping
  if (args.importer) {
    const importerDir = dirname(args.importer);
    const resolvedPath = args.path.startsWith('.') ? 
      resolve(importerDir, args.path) : args.path;
      
    const mappedPath = getImportMapping(resolvedPath);
    if (mappedPath) {
      logger.debug(`Resolved mapping: ${args.path} → ${mappedPath}`);
      return {
        path: mappedPath,
        namespace: "file",
      };
    }
  }
  
  // Resolve relative to importer (most common case)
  if (args.importer) {
    const importerDir = dirname(args.importer);
    const relativePath = resolve(importerDir, args.path);
    
    try {
      await Deno.stat(relativePath);
      
      // Register for future lookups if HQL file
      if (relativePath.endsWith('.hql')) {
        const tsPath = relativePath.replace(/\.hql$/, '.ts');
        if (await exists(tsPath)) {
          registerImportMapping(relativePath, tsPath);
        }
      }
      
      logger.debug(`Resolved relative to importer: ${args.path} → ${relativePath}`);
      return {
        path: relativePath,
        namespace: args.path.endsWith(".hql") ? "hql" : "file",
      };
    } catch {
      // Fall through to other resolution strategies
    }
  }
  
  // Try other resolution strategies
  const resolvedPath = await resolveImportPath(
    args.path, 
    args.importer ? dirname(args.importer) : Deno.cwd(),
    { sourceDir: options.sourceDir },
  );
  
  if (resolvedPath) {
    // Register mapping for future use
    if (args.path.endsWith('.hql') && resolvedPath.endsWith('.hql')) {
      registerImportMapping(args.path, resolvedPath);
    }
    
    return {
      path: resolvedPath,
      namespace: args.path.endsWith(".hql") ? "hql" : "file",
    };
  }
  
  // If we get here, we couldn't resolve the import
  if (options.verbose) {
    logger.warn(`Unresolved import: ${args.path} from ${args.importer || 'unknown'}`);
  }
  
  // Last resort - mark as external
  return { path: args.path, external: true };
}

/**
 * Transpile an HQL file to TypeScript
 */
async function transpileHqlFile(
  filePath: string,
  sourceDir: string | undefined,
  verbose: boolean | undefined,
): Promise<string> {
  try {
    const source = await readFile(filePath);
    return processHql(source, {
      baseDir: dirname(filePath),
      verbose,
      sourceDir,
    });
  } catch (error) {
    throw new TranspilerError(
      `Transpiling HQL file ${filePath}: ${formatErrorMessage(error)}`,
    );
  }
}

/**
 * Unified error handler for transpilation and bundling errors
 */
function handleError(
  error: unknown, 
  context: string,
  details: Record<string, any> = {}, 
  options: { verbose?: boolean, skipErrorReporting?: boolean } = {}
): never {
  if (options.skipErrorReporting) {
    throw error;
  }
  
  const isTranspilerError = error instanceof TranspilerError;
  const errorMsg = error instanceof Error ? error.message : String(error);
  
  if (!isTranspilerError && options.verbose) {
    const errorReport = createErrorReport(
      error instanceof Error ? error : new Error(errorMsg),
      context,
      details
    );
    
    console.error(`Detailed error report for ${context}:`);
    console.error(errorReport);
  } else {
    logger.error(`${context}: ${errorMsg}`);
  }
  
  throw error;
}

/**
 * Clean up resources after bundling
 */
async function cleanupAfterBundling(
  tempDir: string,
  cleanupTemp: boolean,
): Promise<void> {
  try {
    await esbuild.stop();
  } catch {
    logger.warn("Failed to stop esbuild");
  }
  
  if (cleanupTemp) {
    try {
      await Deno.remove(tempDir, { recursive: true });
      logger.log({ text: `Cleaned up temporary directory: ${tempDir}`, namespace: "bundler" });
    } catch (error) {
      logger.warn(
        `Failed to clean up temporary directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * Determine the appropriate output path based on input file type
 */
function determineOutputPath(
  resolvedInputPath: string,
  outputPath?: string,
): string {
  if (outputPath) return outputPath;
  
  // For HQL files, output as .js
  if (isHqlFile(resolvedInputPath)) {
    return resolvedInputPath.replace(/\.hql$/, ".js");
  }
  
  // For TypeScript files, output as .js
  if (isTypeScriptFile(resolvedInputPath)) {
    return resolvedInputPath.replace(/\.(ts|tsx)$/, ".js");
  }
  
  // For JS files, append .bundle.js
  return resolvedInputPath + ".bundle.js";
}

/**
 * Loads a transpiled file from the cache
 */
async function loadTranspiledFile(
  filePath: string,
): Promise<any> {
  try {
    logger.debug(`Loading transpiled file: ${filePath}`);
    
    const content = await readFile(filePath);
    const isTs = filePath.endsWith(".ts");
    
    return {
      contents: content,
      loader: isTs ? "ts" : "js",
      resolveDir: dirname(filePath),
    };
  } catch (error) {
    throw new TranspilerError(
      `Failed to load transpiled file: ${filePath}: ${formatErrorMessage(error)}`
    );
  }
}

/**
 * Centralized caching for transpiled files
 */
async function cacheTranspiledFile(
  originalPath: string,
  content: string,
  extension: string,
  options: { 
    preserveRelative?: boolean,
    createDir?: boolean
  } = {}
): Promise<string> {
  // Write to cache
  const cachedPath = await writeToCachedPath(
    originalPath, 
    content, 
    extension, 
    options
  );
  
  // Register mapping for future lookups
  registerImportMapping(originalPath, cachedPath);
  
  // If extension differs, register the extension-variant too
  if (!originalPath.endsWith(extension)) {
    const pathWithExt = originalPath.replace(/\.[^.]+$/, extension);
    registerImportMapping(pathWithExt, cachedPath);
  }
  
  logger.debug(`Cached ${originalPath} → ${cachedPath}`);
  return cachedPath;
}

/**
 * Transpile HQL content to TypeScript from a path
 * Used by the processHqlImportsInJs function
 */
export async function transpileHqlInJs(hqlPath: string, basePath: string): Promise<string> {
  try {
    // Read the HQL content
    const hqlContent = await readTextFile(hqlPath);
    
    // Transpile to TypeScript using the existing processHql function
    const tsContent = await processHql(hqlContent, {
      baseDir: dirname(hqlPath),
      sourceDir: basePath,
    });
    
    // Process identifiers with hyphens
    let processedContent = tsContent;
    
    // Process imported identifiers with hyphens
    const importIdentifierRegex = /import\s+{\s*([^}]+)\s*}\s+from/g;
    let importMatch;
    
    while ((importMatch = importIdentifierRegex.exec(tsContent)) !== null) {
      const identifiers = importMatch[1].split(',').map(id => id.trim());
      let foundHyphen = false;
      const processedIds = identifiers.map(id => {
        const parts = id.split(' as ');
        const baseName = parts[0].trim();
        
        if (baseName.includes('-')) {
          foundHyphen = true;
          const sanitized = sanitizeIdentifier(baseName);
          if (parts.length > 1) {
            return `${sanitized} as ${parts[1].trim()}`;
          }
          return sanitized;
        }
        return id;
      });
      
      if (foundHyphen) {
        const oldImport = `{ ${importMatch[1]} }`;
        const newImport = `{ ${processedIds.join(', ')} }`;
        processedContent = processedContent.replace(oldImport, newImport);
      }
    }
    
    // Process exported identifiers with hyphens
    const exportRegex = /export\s+(const|let|var|function)\s+([a-zA-Z0-9_-]+)/g;
    let exportMatch;
    
    while ((exportMatch = exportRegex.exec(tsContent)) !== null) {
      const exportType = exportMatch[1];
      const exportName = exportMatch[2];
      
      if (exportName.includes('-')) {
        const sanitized = sanitizeIdentifier(exportName);
        const oldExport = `export ${exportType} ${exportName}`;
        const newExport = `export ${exportType} ${sanitized}`;
        processedContent = processedContent.replace(oldExport, newExport);
        
        // Also replace other occurrences of the identifier
        const idRegex = new RegExp(`\\b${exportName}\\b`, 'g');
        processedContent = processedContent.replace(idRegex, sanitized);
      }
    }
    
    // Handle namespace import identifiers
    const namespaceImportRegex = /import\s+\*\s+as\s+([a-zA-Z0-9_-]+)\s+from/g;
    let namespaceMatch;
    
    while ((namespaceMatch = namespaceImportRegex.exec(tsContent)) !== null) {
      const importName = namespaceMatch[1];
      
      if (importName.includes('-')) {
        const sanitized = sanitizeIdentifier(importName);
        const oldImport = `* as ${importName} from`;
        const newImport = `* as ${sanitized} from`;
        processedContent = processedContent.replace(oldImport, newImport);
        
        // Also replace all references to this namespace
        const namespaceRegex = new RegExp(`\\b${importName}\\.`, 'g');
        processedContent = processedContent.replace(namespaceRegex, `${sanitized}.`);
      }
    }
    
    return processedContent;
  } catch (error) {
    throw new Error(`Error transpiling HQL for JS import ${hqlPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}