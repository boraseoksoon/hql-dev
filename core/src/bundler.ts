import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import {
  basename,
  dirname,
  ensureDir,
  exists,
  resolve,
  readTextFile
} from "./platform/platform.ts";
import { processHql } from "./transpiler/hql-transpiler.ts";
import {
  createErrorReport,
  TranspilerError,
  ValidationError,
} from "./transpiler/error/errors.ts";
import { performAsync } from "./transpiler/error/index.ts";
import { isHqlFile, isJsFile, isTypeScriptFile, sanitizeIdentifier } from "./common/utils.ts";
import { 
  createTempDir, 
  getCachedPath,
  needsRegeneration, 
  writeToCachedPath,
  registerExplicitOutput,
  getImportMapping,
  registerImportMapping,
  prepareStdlibInCache
} from "./common/temp-file-tracker.ts";
import { globalLogger as logger, Logger } from "./logger.ts";

// Constants
const MAX_RETRIES = 3;
const ESBUILD_RETRY_DELAY_MS = 100;

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

interface TempDirResult {
  tempDir: string;
  created: boolean;
}

interface ImportInfo {
  full: string;
  path: string;
}

interface ResolutionStrategy {
  description: string;
  path: string;
  tryResolve: () => Promise<boolean>;
}

// Main API functions
export function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: BundleOptions = {},
): Promise<string> {
  return performAsync(async () => {
    const startTime = performance.now();
    
    // Configure logger
    configureLogger(options);
    
    if (!options.skipErrorReporting) {
      logger.log({ text: `Processing entry: ${inputPath}`, namespace: "cli" });
    }
    
    const resolvedInputPath = resolve(inputPath);
    const outPath = determineOutputPath(resolvedInputPath, outputPath);
    const sourceDir = dirname(resolvedInputPath);
    
    if (options.showTiming) {
      logger.startTiming("transpile-cli", "Process Entry");
    }
    
    const processedPath = await processEntryFile(resolvedInputPath, outPath, {
      ...options,
      sourceDir,
    });
    
    if (options.showTiming) {
      logger.endTiming("transpile-cli", "Process Entry");
    }
    
    if (!options.skipErrorReporting) {
      logger.debug(`Entry file processed to: ${processedPath}`);
    }
    
    if (options.showTiming) {
      logger.startTiming("transpile-cli", "esbuild Bundling");
    }
    
    await bundleWithEsbuild(processedPath, outPath, {
      ...options,
      sourceDir,
    });
    
    if (options.showTiming) {
      logger.endTiming("transpile-cli", "esbuild Bundling");
    }
    
    const endTime = performance.now();
    
    logCompletionMessage(options, outPath, startTime, endTime);
    
    return outPath;
  }, options.skipErrorReporting ? undefined : { context: `CLI transpilation failed for ${inputPath}` });
}

// File checking functions
export function checkForHqlImports(source: string): boolean {
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
  return hqlImportRegex.test(source);
}

// HQL processing functions
export async function processHqlImportsInTs(
  tsSource: string,
  tsFilePath: string,
  options: BundleOptions,
  logger: Logger,
): Promise<string> {
  try {
    // Prepare stdlib in cache
    await prepareStdlibInCache();
    
    const baseDir = dirname(tsFilePath);
    let modifiedSource = tsSource;
    const imports = extractHqlImports(tsSource);
    
    logger.debug(`Found ${imports.length} HQL imports in TypeScript file`);
    
    for (const importInfo of imports) {
      const resolvedHqlPath = await resolveImportPath(importInfo.path, baseDir, options, logger);
      
      if (!resolvedHqlPath) {
        throw new Error(`Could not resolve import: ${importInfo.path} from ${tsFilePath}`);
      }
      
      // Process HQL to TypeScript using the cache
      if (await needsRegeneration(resolvedHqlPath, ".ts") || options.force) {
        logger.debug(`Transpiling HQL import: ${resolvedHqlPath}`);
        
        // Read the HQL source
        const hqlSource = await readSourceFile(resolvedHqlPath);
        
        // Process it to TypeScript
        const tsCode = await processHql(hqlSource, {
          baseDir: dirname(resolvedHqlPath),
          verbose: options.verbose,
          tempDir: options.tempDir,
          sourceDir: options.sourceDir || dirname(resolvedHqlPath),
        });
        
        // Determine if this is a stdlib file which needs special handling
        const isStdlibFile = basename(resolvedHqlPath) === "stdlib.hql";
        
        // Write to cache with preserveRelative option for stdlib files
        await writeToCachedPath(resolvedHqlPath, tsCode, ".ts", { 
          preserveRelative: isStdlibFile 
        });
      }
      
      // Get cached TypeScript path
      const cachedTsPath = await getCachedPath(resolvedHqlPath, ".ts");
      
      // Register this mapping for future use
      registerImportMapping(resolvedHqlPath, cachedTsPath);
      
      logger.debug(`Using cached TS file: ${cachedTsPath}`);
      
      // Update the import statement to use the cached file
      const newImport = importInfo.full.replace(importInfo.path, cachedTsPath);
      modifiedSource = modifiedSource.replace(importInfo.full, newImport);
      logger.debug(`Updated import from "${importInfo.full}" to "${newImport}"`);
    }
    
    return modifiedSource;
  } catch (error) {
    throw new TranspilerError(
      `Processing HQL imports in TypeScript file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function processHqlImportsInJs(
  jsSource: string,
  jsFilePath: string,
  options: {
    verbose?: boolean;
    tempDir?: string;
    sourceDir?: string;
    force?: boolean;
  },
  logger: Logger,
): Promise<string> {
  try {
    // Prepare stdlib in cache
    await prepareStdlibInCache();
    
    const baseDir = dirname(jsFilePath);
    let modifiedSource = jsSource;
    const imports = extractHqlImports(jsSource);
    
    logger.debug(`Found ${imports.length} HQL imports in JS file`);
    
    for (const importInfo of imports) {
      const resolvedHqlPath = await resolveImportPath(importInfo.path, baseDir, options, logger);
      
      if (!resolvedHqlPath) {
        throw new Error(`Could not resolve import: ${importInfo.path} from ${jsFilePath}`);
      }
      
      // Determine if this is a stdlib file which needs special handling
      const isStdlibFile = basename(resolvedHqlPath) === "stdlib.hql";
      
      // Process HQL to TypeScript using cache
      if (await needsRegeneration(resolvedHqlPath, ".ts") || options.force) {
        logger.debug(`Transpiling HQL import to TypeScript: ${resolvedHqlPath}`);
        
        // Read the HQL source
        const hqlSource = await readSourceFile(resolvedHqlPath);
        
        // Process it to TypeScript
        const tsCode = await processHql(hqlSource, {
          baseDir: dirname(resolvedHqlPath),
          verbose: options.verbose,
          tempDir: options.tempDir,
          sourceDir: options.sourceDir || dirname(resolvedHqlPath),
        });
        
        // Write to cache with preserveRelative option for stdlib
        await writeToCachedPath(resolvedHqlPath, tsCode, ".ts", {
          preserveRelative: isStdlibFile
        });
      }
      
      // Get cached TypeScript path
      const cachedTsPath = await getCachedPath(resolvedHqlPath, ".ts");
      
      // Register this mapping for future use
      registerImportMapping(resolvedHqlPath, cachedTsPath);
      
      // Process TypeScript to JavaScript
      if (await needsRegeneration(resolvedHqlPath, ".js") || options.force) {
        logger.debug(`Generating JavaScript from TypeScript: ${cachedTsPath}`);
        
        // Get output path for JavaScript
        const cachedJsPath = await getCachedPath(resolvedHqlPath, ".js", { 
          createDir: true,
          preserveRelative: isStdlibFile
        });
        
        // Transpile TypeScript to JavaScript using esbuild
        await bundleWithEsbuild(cachedTsPath, cachedJsPath, {
          verbose: options.verbose,
          sourceDir: options.sourceDir || dirname(resolvedHqlPath),
        });
      }
      
      // Get cached JavaScript path
      const cachedJsPath = await getCachedPath(resolvedHqlPath, ".js");
      
      // Register this mapping for future use
      registerImportMapping(resolvedHqlPath.replace(/\.hql$/, '.js'), cachedJsPath);
      
      logger.debug(`Using cached JS file: ${cachedJsPath}`);
      
      // Update the import statement to use the cached file
      const newImport = importInfo.full.replace(importInfo.path, cachedJsPath);
      modifiedSource = modifiedSource.replace(importInfo.full, newImport);
      logger.debug(`Updated import from "${importInfo.full}" to "${newImport}"`);
    }
    
    return modifiedSource;
  } catch (error) {
    throw new TranspilerError(
      `Processing HQL imports in JS file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// File processing helpers
async function writeOutput(
  code: string,
  outputPath: string,
  logger: Logger,
): Promise<void> {
  try {
    const outputDir = dirname(outputPath);
    await ensureDir(outputDir);
    
    // Cache system approach:
    // 1. Create a synthetic source path (could be the output path as source)
    // 2. Write to cache first
    // 3. Mark as explicit output so it gets copied at the end
    
    // Get file extension to properly cache
    const ext = path.extname(outputPath);
    
    // Write to cache first (using output path as both source and target)
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
      return await processHqlEntryFile(
        resolvedInputPath,
        outputPath,
        options,
        logger,
      );
    } else if (isJsFile(resolvedInputPath) || isTypeScriptFile(resolvedInputPath)) {
      return await processJsOrTsEntryFile(
        resolvedInputPath,
        outputPath,
        options,
        logger,
      );
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
  logger: Logger,
): Promise<string> {
  logger.log({ text: `Transpiling HQL entry file: ${resolvedInputPath}`, namespace: "bundler" });
  
  // Prepare stdlib in cache
  await prepareStdlibInCache();
  
  // Create temp directory
  const tempDir = await createTempDir("entry");
  
  // Read source file
  const source = await readSourceFile(resolvedInputPath);
  logger.log({ text: `Read ${source.length} bytes from ${resolvedInputPath}`, namespace: "bundler" });
  
  try {
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
      tsCode = await processHqlImportsInTs(
        tsCode,
        resolvedInputPath,
        options,
        logger,
      );
    }
    
    // Write TypeScript output to cache
    const tsOutputPath = await writeToCachedPath(resolvedInputPath, tsCode, ".ts");
    
    // Register the explicit output path
    if (outputPath) {
      registerExplicitOutput(outputPath);
    }
    
    logger.log({ text: `Entry processed and TypeScript output written to ${tsOutputPath}`, namespace: "bundler" });
    return tsOutputPath;
  } catch (error) {
    throw error;
  }
}

async function processJsOrTsEntryFile(
  resolvedInputPath: string,
  outputPath: string,
  options: BundleOptions,
  logger: Logger,
): Promise<string> {
  try {
    const isTs = isTypeScriptFile(resolvedInputPath);
    const source = await Deno.readTextFile(resolvedInputPath);
    
    logger.log({ text: `Read ${source.length} bytes from ${resolvedInputPath}`, namespace: "bundler" });
    let processedSource = source;
    
    // Process HQL imports if present
    if (checkForHqlImports(source)) {
      if (isTs) {
        processedSource = await processHqlImportsInTs(
          source,
          resolvedInputPath,
          options,
          logger,
        );
      } else {
        processedSource = await processHqlImportsInJs(
          source,
          resolvedInputPath,
          options,
          logger,
        );
      }
    }
    
    // Write output with appropriate extension
    if (isTs) {
      const tsOutputPath = outputPath.replace(/\.js$/, ".ts");
      await writeOutput(processedSource, tsOutputPath, logger);
      return tsOutputPath;
    } else {
      await writeOutput(processedSource, outputPath, logger);
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

// Bundling with esbuild
function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {},
): Promise<string> {
  return performAsync(async () => {
    logger.log({ text: `Bundling ${entryPath} to ${outputPath}`, namespace: "bundler" });
    logger.log({ text: `Bundling options: ${JSON.stringify(options, null, 2)}`, namespace: "bundler" });
    
    const tempDirResult = await createTempDirIfNeeded(options, logger);
    const tempDir = tempDirResult.tempDir;
    const cleanupTemp = tempDirResult.created;
    
    try {
      const plugins = [
        createHqlPlugin({
          verbose: options.verbose,
          tempDir,
          sourceDir: options.sourceDir || dirname(entryPath),
          externalPatterns: options.drop,
        }),
        createExternalPlugin(),
      ];
      
      const buildOptions = createBuildOptions(
        entryPath,
        outputPath,
        options,
        plugins,
      );
      
      logger.log({ text: `Starting bundling with esbuild for ${entryPath}`, namespace: "bundler" });
      
      const result = await runBuildWithRetry(
        buildOptions,
        MAX_RETRIES,
        logger,
      );
      
      logger.log({ 
        text: `Successfully ${options.minify ? 'bundled and minified' : 'bundled'} output to ${outputPath}`, 
        namespace: "bundler" 
      });
      
      return outputPath;
    } catch (error) {
      handleBundlingError(error, entryPath, outputPath, options.verbose);
      throw error;
    } finally {
      await cleanupAfterBundling(tempDir, cleanupTemp, logger);
    }
  }, { context: `Bundling failed for ${entryPath}` });
}

async function runBuildWithRetry(
  buildOptions: any,
  maxRetries: number,
  logger: Logger,
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

// Plugin creation
function createHqlPlugin(options: {
  verbose?: boolean;
  tempDir?: string;
  sourceDir?: string;
  externalPatterns?: string[];
}): any {
  const processedHqlFiles = new Set<string>();
  const hqlToJsMap = new Map<string, string>();
  
  // Default external patterns if not provided
  const externalPatterns = options.externalPatterns || [
    '.js', '.jsx', '.mjs', '.cjs', 'node:', 'https://', 'http://'
  ];
  
  return {
    name: "hql-plugin",
    setup(build: any) {
      build.onResolve({ filter: /\.(js|ts|hql)$/ }, async (args: any) => {
        return resolveHqlImport(args, {
          ...options, 
          externalPatterns
        }, logger);
      });
      
      build.onLoad({ filter: /.*/, namespace: "hql" }, async (args: any) => {
        return loadHqlFile(args, processedHqlFiles, hqlToJsMap, options, logger);
      });
    },
  };
}

function createExternalPlugin(): any {
  return {
    name: "external-npm-jsr",
    setup(build: any) {
      // Mark remote modules as external
      build.onResolve({ filter: /^(npm:|jsr:|https?:)/ }, (args: any) => {
        return { path: args.path, external: true };
      });
    },
  };
}

// File loading and resolution
async function loadHqlFile(
  args: any,
  processedHqlFiles: Set<string>,
  hqlToJsMap: Map<string, string>,
  options: { verbose?: boolean; tempDir?: string; sourceDir?: string },
  logger: Logger,
): Promise<any> {
  try {
    logger.debug(`Loading HQL file: ${args.path}`);
    
    if (hqlToJsMap.has(args.path)) {
      return loadTranspiledFile(args.path, hqlToJsMap.get(args.path)!, logger);
    }
    
    if (processedHqlFiles.has(args.path)) {
      logger.debug(`Already processed HQL file: ${args.path}`);
      return null;
    }
    
    processedHqlFiles.add(args.path);
    
    const actualPath = await findActualFilePath(args.path, logger);
    
    // Transpile HQL to TypeScript
    const tsCode = await transpileHqlFile(actualPath, options.sourceDir, options.verbose);
    
    // Write to cache instead of temp file
    const cachedTsPath = await writeToCachedPath(
      actualPath, 
      tsCode, 
      ".ts", 
      { preserveRelative: true }
    );
    
    // Register explicit output so it's preserved
    registerExplicitOutput(cachedTsPath);
    
    logger.debug(`Written transpiled TypeScript to cache: ${cachedTsPath}`);
    
    // Map file paths
    hqlToJsMap.set(args.path, cachedTsPath);
    if (args.path !== actualPath) {
      hqlToJsMap.set(actualPath, cachedTsPath);
    }
    
    return {
      contents: tsCode,
      loader: "ts", // Tell esbuild this is TypeScript
      resolveDir: dirname(cachedTsPath),
    };
  } catch (error) {
    throw new TranspilerError(
      `Error loading HQL file ${args.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function loadTranspiledFile(
  originalPath: string,
  filePath: string,
  logger: Logger,
): Promise<any> {
  try {
    logger.debug(`Using previously transpiled file: ${filePath}`);
    
    const content = await Deno.readTextFile(filePath);
    const isTs = filePath.endsWith(".ts");
    
    return {
      contents: content,
      loader: isTs ? "ts" : "js", // Specify loader based on file extension
      resolveDir: dirname(filePath),
    };
  } catch (error) {
    throw new TranspilerError(
      `Reading transpiled file: ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// Utility functions
function configureLogger(options: BundleOptions): void {
  if (options.verbose) {
    logger.setEnabled(true);
  }
  
  if (options.showTiming) {
    logger.setTimingOptions({ showTiming: true });
    logger.startTiming("transpile-cli", "Total");
  }
}

function logCompletionMessage(
  options: BundleOptions,
  outPath: string,
  startTime: number,
  endTime: number
): void {
  if (options.skipErrorReporting) {
    return;
  }
  
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

function extractHqlImports(source: string): ImportInfo[] {
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
  const imports: ImportInfo[] = [];
  let match;
  
  // Reset regex lastIndex
  hqlImportRegex.lastIndex = 0;
  
  while ((match = hqlImportRegex.exec(source)) !== null) {
    const fullImport = match[0];
    const importPath = match[1];
    imports.push({ full: fullImport, path: importPath });
  }
  
  return imports;
}

async function resolveImportPath(
  importPath: string,
  baseDir: string,
  options: { sourceDir?: string },
  logger: Logger
): Promise<string | null> {
  // Try potential lookup locations
  const lookupLocations = [
    // Relative to base directory
    {
      path: path.resolve(baseDir, importPath),
      description: "base directory"
    },
    // Relative to source directory
    ...(options.sourceDir ? [{
      path: path.resolve(options.sourceDir, importPath),
      description: "source directory"
    }] : []),
    // Relative to lib directory (for relative imports)
    ...(importPath.startsWith("./") || importPath.startsWith("../") ? [{
      path: path.resolve(Deno.cwd(), "lib", importPath.replace(/^\.\//, "")),
      description: "lib directory"
    }] : []),
    // Relative to current working directory
    {
      path: path.resolve(Deno.cwd(), importPath),
      description: "current working directory"
    }
  ];
  
  for (const location of lookupLocations) {
    try {
      await Deno.stat(location.path);
      logger.debug(`Resolved import relative to ${location.description}: ${location.path}`);
      return location.path;
    } catch {
      // File not found at this location, continue to next
    }
  }
  
  return null;
}

async function resolveHqlImport(
  args: any,
  options: { 
    verbose?: boolean; 
    tempDir?: string; 
    sourceDir?: string;
    externalPatterns?: string[];
  },
  logger: Logger,
): Promise<any> {
  // Default external patterns
  const externalPatterns = options.externalPatterns || [
    '.js', '.jsx', '.mjs', '.cjs', 'node:', 'https://', 'http://'
  ];

  // Check if this import should be treated as external without warning
  if (externalPatterns.some(pattern => 
      args.path.endsWith(pattern) || 
      args.path.startsWith(pattern))) {
    logger.debug(`Treating as external: "${args.path}"`);
    return { path: args.path, external: true };
  }
  
  logger.debug(
    `Resolving import: "${args.path}" from importer: ${
      args.importer || "unknown"
    }`,
  );
  
  // Check for direct mappings first (fastest path)
  const cachedMapping = getImportMapping(args.path);
  if (cachedMapping) {
    logger.debug(`Found direct mapping for ${args.path} -> ${cachedMapping}`);
    return {
      path: cachedMapping,
      namespace: "file",
    };
  }
  
  // Try to resolve from importer and check mapping
  if (args.importer && args.path.endsWith('.hql')) {
    const importerDir = dirname(args.importer);
    const resolvedPath = args.path.startsWith('.') ? 
      resolve(importerDir, args.path) : args.path;
      
    const mappedPath = getImportMapping(resolvedPath);
    if (mappedPath) {
      logger.debug(`Found resolved mapping for ${args.path} -> ${mappedPath}`);
      return {
        path: mappedPath,
        namespace: "file",
      };
    }
  }
  
  // If no mappings found, use resolution strategies
  const resolutionStrategies: ResolutionStrategy[] = [
    {
      description: "relative to importer",
      path: args.importer
        ? resolve(dirname(args.importer), args.path)
        : args.path,
      tryResolve: async () => {
        if (args.importer) {
          const importerDir = dirname(args.importer);
          const relativePath = resolve(importerDir, args.path);
          try {
            await Deno.stat(relativePath);
            // Register this path for future lookups
            if (relativePath.endsWith('.hql')) {
              // Also try to register the TypeScript and JavaScript versions
              const tsPath = relativePath.replace(/\.hql$/, '.ts');
              if (await exists(tsPath)) {
                registerImportMapping(relativePath, tsPath);
                logger.debug(`Registered mapping: ${relativePath} -> ${tsPath}`);
              }
            }
            logger.debug(`Found import at ${relativePath} (relative to importer)`);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      },
    },
    {
      description: "relative to source directory",
      path: options.sourceDir
        ? resolve(options.sourceDir, args.path)
        : args.path,
      tryResolve: async () => {
        if (options.sourceDir) {
          const sourcePath = resolve(options.sourceDir, args.path);
          try {
            await Deno.stat(sourcePath);
            logger.debug(
              `Found import at ${sourcePath} (relative to source directory)`,
            );
            return true;
          } catch {
            return false;
          }
        }
        return false;
      },
    },
    {
      description: "relative to CWD",
      path: resolve(Deno.cwd(), args.path),
      tryResolve: async () => {
        const cwdPath = resolve(Deno.cwd(), args.path);
        try {
          await Deno.stat(cwdPath);
          logger.debug(`Found import at ${cwdPath} (relative to CWD)`);
          return true;
        } catch {
          return false;
        }
      },
    },
    {
      description: "relative to lib directory",
      path: resolve(Deno.cwd(), "lib", args.path),
      tryResolve: async () => {
        const libPath = resolve(Deno.cwd(), "lib", args.path);
        try {
          await Deno.stat(libPath);
          logger.debug(`Found import at ${libPath} (relative to lib directory)`);
          return true;
        } catch {
          return false;
        }
      },
    },
  ];
  
  const results = await Promise.all(
    resolutionStrategies.map(async (strategy) => ({
      success: await strategy.tryResolve(),
      path: strategy.path,
      description: strategy.description,
    })),
  );
  
  const successResult = results.find((result) => result.success);
  
  if (successResult) {
    logger.debug(
      `Resolved "${args.path}" to "${successResult.path}" (${successResult.description})`,
    );
    // Register this mapping for future use
    if (args.path.endsWith('.hql') && successResult.path.endsWith('.hql')) {
      registerImportMapping(args.path, successResult.path);
    }
    return {
      path: successResult.path,
      namespace: args.path.endsWith(".hql") ? "hql" : "file",
    };
  }
  
  // Only log warning if verbose is enabled
  if (options.verbose) {
    logger.warn(`Could not resolve "${args.path}" from "${args.importer || 'unknown'}"`);
  } else {
    logger.debug(`Could not resolve "${args.path}" from "${args.importer || 'unknown'}" (suppressed warning)`);
  }
  
  return { path: args.path, external: true };
}

async function createTempDirIfNeeded(
  options: BundleOptions,
  logger: Logger,
): Promise<TempDirResult> {
  try {
    if (!options.tempDir) {
      const tempDir = await Deno.makeTempDir({ prefix: "hql_bundle_" });
      logger.log({ text: `Created temporary directory: ${tempDir}`, namespace: "bundler" });
      return { tempDir, created: true };
    }
    return { tempDir: options.tempDir, created: false };
  } catch (error) {
    throw new TranspilerError(
      `Creating temporary directory: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function readSourceFile(filePath: string): Promise<string> {
  try {
    const content = await Deno.readTextFile(filePath);
    return content;
  } catch (error) {
    throw new TranspilerError(
      `Reading entry file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function findActualFilePath(
  filePath: string,
  logger: Logger,
): Promise<string> {
  if (await tryReadFile(filePath, logger) !== null) {
    return filePath;
  }
  
  logger.debug(`File not found at ${filePath}, trying alternative location`);
  const alternativePath = resolve(Deno.cwd(), basename(filePath));
  
  if (await tryReadFile(alternativePath, logger) !== null) {
    logger.debug(`Found file at alternative location: ${alternativePath}`);
    return alternativePath;
  }
  
  logger.error(`File not found: ${filePath}, also tried ${alternativePath}`);
  throw new TranspilerError(
    `File not found: ${filePath}, also tried ${alternativePath}`,
  );
}

async function tryReadFile(
  filePath: string,
  logger: Logger,
): Promise<string | null> {
  try {
    const content = await Deno.readTextFile(filePath);
    logger.debug(`Successfully read ${content.length} bytes from ${filePath}`);
    return content;
  } catch (e) {
    logger.debug(
      `Failed to read file ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

async function transpileHqlFile(
  filePath: string,
  sourceDir: string | undefined,
  verbose: boolean | undefined,
): Promise<string> {
  try {
    const source = await Deno.readTextFile(filePath);
    return processHql(source, {
      baseDir: dirname(filePath),
      verbose,
      sourceDir,
    });
  } catch (error) {
    throw new TranspilerError(
      `Transpiling HQL file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function handleBundlingError(
  error: unknown,
  entryPath: string,
  outputPath: string,
  verbose: boolean | undefined,
): void {
  if (error instanceof TranspilerError) return;
  
  const errorMsg = error instanceof Error ? error.message : String(error);
  
  if (verbose) {
    const errorReport = createErrorReport(
      error instanceof Error ? error : new Error(errorMsg),
      "esbuild bundling",
      {
        entryPath,
        outputPath,
        attempts: MAX_RETRIES,
      },
    );
    console.error("Detailed esbuild error report:");
    console.error(errorReport);
  }
}

async function cleanupAfterBundling(
  tempDir: string,
  cleanupTemp: boolean,
  logger: Logger,
): Promise<void> {
  try {
    await esbuild.stop();
  } catch {}
  
  await cleanupTempDir(cleanupTemp, tempDir, logger);
}

async function cleanupTempDir(
  shouldCleanup: boolean,
  tempDir: string,
  logger: Logger
): Promise<void> {
  if (shouldCleanup) {
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

function createBuildOptions(
  entryPath: string,
  outputPath: string,
  options: BundleOptions,
  plugins: any[],
): any {
  try {
    const buildOptions: any = {
      entryPoints: [entryPath],
      bundle: true,
      outfile: outputPath,
      format: "esm",
      plugins: plugins,
      logLevel: options.verbose ? "info" : "silent",
      allowOverwrite: true,
      minify: options.minify,
      drop: options.drop,
      // TypeScript specific options
      loader: { ".ts": "ts" },
      platform: "neutral", // Build for any JavaScript runtime
      target: ["es2020"], // Target modern JavaScript
    };
    
    // Remove undefined options
    Object.keys(buildOptions).forEach((key) => {
      if (buildOptions[key] === undefined) {
        delete buildOptions[key];
      }
    });
    
    return buildOptions;
  } catch (error) {
    throw new TranspilerError(
      `Failed to create build options: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function determineOutputPath(
  resolvedInputPath: string,
  outputPath?: string,
): string {
  if (outputPath) return outputPath;
  
  // For HQL files, output as .js
  if (resolvedInputPath.endsWith(".hql")) {
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
    
    // Ensure all hyphenated identifiers are properly handled
    // This addresses issues when importing from another file with hyphenated identifiers
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