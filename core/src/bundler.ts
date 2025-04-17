import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import {
  basename,
  dirname,
  ensureDir,
  exists,
  resolve,
  writeTextFile,
  join,
} from "./platform/platform.ts";
import { processHql } from "./transpiler/hql-transpiler.ts";
import {
  createErrorReport,
  TranspilerError,
  ValidationError,
} from "./transpiler/error/errors.ts";
import { performAsync } from "./transpiler/error/index.ts";
import { isHqlFile, isJsFile, isTypeScriptFile, simpleHash } from "./common/utils.ts";
import { registerTempFile } from "./common/temp-file-tracker.ts";
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
    const baseDir = dirname(tsFilePath);
    let modifiedSource = tsSource;
    const imports = extractHqlImports(tsSource);
    
    logger.debug(`Found ${imports.length} HQL imports in TypeScript file`);
    
    for (const importInfo of imports) {
      const resolvedHqlPath = await resolveImportPath(importInfo.path, baseDir, options, logger);
      
      if (!resolvedHqlPath) {
        throw new Error(`Could not resolve import: ${importInfo.path} from ${tsFilePath}`);
      }
      
      // Generate a TypeScript file for the imported HQL file
      const hqlOutputPath = resolvedHqlPath.replace(/\.hql$/, ".ts");
      
      if (!await exists(hqlOutputPath)) {
        logger.debug(`Transpiling HQL import: ${resolvedHqlPath} -> ${hqlOutputPath}`);
        await transpileCLI(resolvedHqlPath, hqlOutputPath, options);
      } else {
        logger.debug(`Using existing transpiled file: ${hqlOutputPath}`);
      }
      
      // Update the import statement
      const relativePath = importInfo.path.replace(/\.hql$/, ".ts");
      const newImport = importInfo.full.replace(importInfo.path, relativePath);
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
  },
  logger: Logger,
): Promise<string> {
  try {
    const baseDir = dirname(jsFilePath);
    let modifiedSource = jsSource;
    const imports = extractHqlImports(jsSource);
    
    logger.debug(`Found ${imports.length} HQL imports in JS file`);
    
    for (const importInfo of imports) {
      const resolvedHqlPath = await resolveImportPath(importInfo.path, baseDir, options, logger);
      
      if (!resolvedHqlPath) {
        throw new Error(`Could not resolve import: ${importInfo.path} from ${jsFilePath}`);
      }
      
      // Generate TypeScript and JavaScript files
      const hqlTsOutputPath = resolvedHqlPath.replace(/\.hql$/, ".ts");
      const hqlJsOutputPath = resolvedHqlPath.replace(/\.hql$/, ".js");
      
      await processHqlToTypeScript(resolvedHqlPath, hqlTsOutputPath, options, logger);
      await processTypeScriptToJavaScript(hqlTsOutputPath, hqlJsOutputPath, options, logger);
      
      // Update the import statement for JavaScript files
      const relativePath = importInfo.path.replace(/\.hql$/, ".js");
      const newImport = importInfo.full.replace(importInfo.path, relativePath);
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
    
    if (await exists(outputPath)) {
      logger.warn(`File '${outputPath}' already exists. Overwriting.`);
    }
    
    await writeTextFile(outputPath, code);
    registerTempFile(outputPath);
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
  
  const [tempDirResult, source] = await Promise.all([
    createTempDirIfNeeded(options, logger),
    readSourceFile(resolvedInputPath),
  ]);
  
  const tempDir = tempDirResult.tempDir;
  const tempDirCreated = tempDirResult.created;
  
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
    
    // Write the TypeScript output
    const tsOutputPath = outputPath.replace(/\.js$/, ".ts");
    await writeOutput(tsCode, tsOutputPath, logger);
    
    logger.log({ text: `Entry processed and TypeScript output written to ${tsOutputPath}`, namespace: "bundler" });
    return tsOutputPath;
  } finally {
    await cleanupTempDir(tempDirCreated, tempDir, logger);
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
}): any {
  const processedHqlFiles = new Set<string>();
  const hqlToJsMap = new Map<string, string>();
  
  return {
    name: "hql-plugin",
    setup(build: any) {
      build.onResolve({ filter: /\.(js|ts|hql)$/ }, async (args: any) => {
        return resolveHqlImport(args, options, logger);
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
    const fileHash = simpleHash(actualPath).toString();
    const outputDir = join(options.tempDir || "", fileHash);
    
    const [, tsCode] = await Promise.all([
      ensureDir(outputDir),
      transpileHqlFile(actualPath, options.sourceDir, options.verbose),
    ]);
    
    const outTsFileName = basename(actualPath, ".hql") + ".ts";
    const tsTempPath = join(outputDir, outTsFileName);
    
    await writeTextFile(tsTempPath, tsCode);
    logger.debug(`Written transpiled TypeScript to: ${tsTempPath}`);
    
    // Register for cleanup
    registerTempFile(tsTempPath);
    
    hqlToJsMap.set(args.path, tsTempPath);
    if (args.path !== actualPath) {
      hqlToJsMap.set(actualPath, tsTempPath);
    }
    
    return {
      contents: tsCode,
      loader: "ts", // Tell esbuild this is TypeScript
      resolveDir: dirname(tsTempPath),
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
  options: { verbose?: boolean; tempDir?: string; sourceDir?: string },
  logger: Logger,
): Promise<any> {
  logger.debug(
    `Resolving import: "${args.path}" from importer: ${
      args.importer || "unknown"
    }`,
  );
  
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
    return {
      path: successResult.path,
      namespace: args.path.endsWith(".hql") ? "hql" : "file",
    };
  }
}

async function processHqlToTypeScript(
  hqlPath: string,
  tsOutputPath: string,
  options: {
    verbose?: boolean;
    tempDir?: string;
    sourceDir?: string;
  },
  logger: Logger
): Promise<void> {
  if (!await exists(tsOutputPath)) {
    logger.debug(`Transpiling HQL import to TypeScript: ${hqlPath} -> ${tsOutputPath}`);
    
    // Read the HQL source
    const hqlSource = await Deno.readTextFile(hqlPath);
    
    // Process it to TypeScript
    const tsCode = await processHql(hqlSource, {
      baseDir: dirname(hqlPath),
      verbose: options.verbose,
      tempDir: options.tempDir,
      sourceDir: options.sourceDir || dirname(hqlPath),
    });
    
    // Write TypeScript output
    await writeOutput(tsCode, tsOutputPath, logger);
    
    // Register TypeScript file for cleanup
    registerTempFile(tsOutputPath);
  } else {
    logger.debug(`Using existing TypeScript file: ${tsOutputPath}`);
    // Still register for cleanup
    registerTempFile(tsOutputPath);
  }
}

async function processTypeScriptToJavaScript(
  tsPath: string,
  jsOutputPath: string,
  options: {
    verbose?: boolean;
    sourceDir?: string;
  },
  logger: Logger
): Promise<void> {
  if (!await exists(jsOutputPath)) {
    logger.debug(`Generating JavaScript from TypeScript: ${tsPath} -> ${jsOutputPath}`);
    
    await bundleWithEsbuild(tsPath, jsOutputPath, {
      verbose: options.verbose,
      sourceDir: options.sourceDir || dirname(tsPath),
    });
    
    // Register JavaScript file for cleanup
    registerTempFile(jsOutputPath);
  } else {
    logger.debug(`Using existing JavaScript file: ${jsOutputPath}`);
    // Still register for cleanup
    registerTempFile(jsOutputPath);
  }
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