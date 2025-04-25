// sourcemap-debug.ts
import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { processHql } from "./transpiler/hql-transpiler.ts";
import { formatErrorMessage } from "./common/error-pipeline.ts";
import {
  isHqlFile,
  isJsFile,
  isTypeScriptFile,
  sanitizeIdentifier,
  readFile,
  findActualFilePath
} from "./common/utils.ts";
import { initializeRuntime } from "./common/runtime-initializer.ts";
import { globalLogger as logger } from "./logger.ts";
import {
  dirname,
  ensureDir,
  exists,
  resolve,
  readTextFile
} from "./platform/platform.ts";
import {
  TranspilerError,
  ValidationError,
} from "./common/error-pipeline.ts";
import { 
  createTempDir, 
  getCachedPath,
  needsRegeneration, 
  writeToCachedPath,
  getImportMapping,
  registerImportMapping,
  createTempDirIfNeeded,
} from "./common/hql-cache-tracker.ts";
import { transpile, TranspileOptions } from './transpiler/index.ts';
import { setCurrentBundlePath } from "./common/bundle-registry.ts";

const DEFAULT_EXTERNAL_PATTERNS = ['npm:', 'jsr:', 'node:', 'https://', 'http://'];

// Interfaces
export interface BundleOptions {
  verbose?: boolean;
  standalone?: boolean;
  minify?: boolean;
  outDir?: string;
  tempDir?: string;
  keepTemp?: boolean;
  noBundle?: boolean;
  sourceDir?: string;
  cleanup?: boolean;
  debug?: boolean;
  force?: boolean
}

interface ImportInfo {
  full: string;
  path: string;
}

// Main API function
export async function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: {
    verbose?: boolean;
    showTiming?: boolean;
    force?: boolean
  } = {}
): Promise<string> {
  configureLogger(options);
  await initializeRuntime();
  
  const resolvedInputPath = resolve(inputPath);
  const outPath = determineOutputPath(resolvedInputPath, outputPath);
  const sourceDir = dirname(resolvedInputPath);
  const bundleOptions = { ...options, sourceDir };
  
  // Process entry file
  if (options.showTiming) logger.startTiming("transpile-cli", "Process Entry");
  const { tsOutputPath, sourceMap } = await processEntryFile(resolvedInputPath, outPath, bundleOptions);
  if (options.showTiming) logger.endTiming("transpile-cli", "Process Entry");

  // Bundle the processed file
  if (options.showTiming) logger.startTiming("transpile-cli", "esbuild Bundling");

  logger.log({ text: `[Bundler] Forcing esbuild to use inline source maps for the bundle.` , namespace: "bundler" });
  
  await bundleWithEsbuild(tsOutputPath, outPath, { ...bundleOptions });

  logger.log({ text: `[Bundler] Bundled to ${outPath}` , namespace: "bundler" });

  // Register the bundle path globally for error reporting
  setCurrentBundlePath(outPath);

  if (options.showTiming) logger.endTiming("transpile-cli", "esbuild Bundling");

  return outPath;
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

// File processing functions
function checkForHqlImports(source: string): boolean {
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
      const { code: tsCode, sourceMap } = await processHql(hqlSource, {
        baseDir: dirname(resolvedHqlPath),
        verbose: options.verbose,
        tempDir: options.tempDir,
        sourceDir: options.sourceDir || dirname(resolvedHqlPath),
        currentFile: resolvedHqlPath,
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
async function processHqlImportsInTs(
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

// Main processing function
async function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: BundleOptions = {},
): Promise<{ tsOutputPath: string; sourceMap?: string }> {
  try {
    const resolvedInputPath = resolve(inputPath);
    logger.debug(`Processing entry file: ${resolvedInputPath}`);
    logger.debug(`Output path: ${outputPath}`);
    
    if (isHqlFile(resolvedInputPath)) {
      return await processHqlEntryFile(resolvedInputPath, options);
    } else if (isJsFile(resolvedInputPath) || isTypeScriptFile(resolvedInputPath)) {
      const tsOutputPath = await processJsOrTsEntryFile(resolvedInputPath, outputPath, options);
      return { tsOutputPath };
    } else {
      throw new ValidationError(
        `Unsupported file type: ${inputPath} (expected .hql, .js, or .ts)`,
        "file type validation",
      );
    }
  } catch (error) {
    throw error;
  }
}

async function processHqlEntryFile(
  resolvedInputPath: string,
  options: BundleOptions,
): Promise<{ tsOutputPath: string; sourceMap?: string }> {
  logger.log({ text: `Transpiling HQL entry file: ${resolvedInputPath}`, namespace: "bundler" });

  const tempDir = await createTempDir("entry");

  const source = await readFile(resolvedInputPath);
  logger.log({ text: `Read ${source.length} bytes from ${resolvedInputPath}`, namespace: "bundler" });
  
  let { code: tsCode, sourceMap } = await processHql(source, {
    baseDir: dirname(resolvedInputPath),
    verbose: options.verbose,
    tempDir,
    sourceDir: options.sourceDir || dirname(resolvedInputPath),
    currentFile: resolvedInputPath
  });

  if (checkForHqlImports(tsCode)) {
    logger.log({ text: "Detected nested HQL imports in transpiled output. Processing them.", namespace: "bundler" });
    tsCode = await processHqlImportsInTs(tsCode, resolvedInputPath, options);
  }
  
  const tsOutputPath = await writeToCachedPath(resolvedInputPath, tsCode, ".ts");

  return { tsOutputPath, sourceMap };
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
  const processedTsFiles = new Set<string>();
  const filePathMap = new Map<string, string>();
  const circularDependencies = new Map<string, Set<string>>();
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
        // Track circular dependencies
        if (args.importer) {
          if (!circularDependencies.has(args.importer)) {
            circularDependencies.set(args.importer, new Set());
          }
          circularDependencies.get(args.importer)!.add(args.path);
          
          // Check if this would create a circular dependency
          const isCircular = checkForCircularDependency(args.importer, args.path, circularDependencies);
          if (isCircular && options.verbose) {
            logger.warn(`Circular dependency detected: ${args.importer} -> ${args.path}`);
          }
        }
        
        return resolveHqlImport(args, options);
      });
      
      // Special handling for TypeScript files
      build.onLoad({ filter: /\.ts$/, namespace: "file" }, async (args: any) => {
        try {
          // Skip if already processed
          if (processedTsFiles.has(args.path)) {
            return null;
          }
          
          logger.debug(`Processing TypeScript file: ${args.path}`);
          const contents = await readFile(args.path);
          
          // Process HQL imports in TypeScript
          let processedContent = contents;
          if (checkForHqlImports(contents)) {
            processedContent = await processHqlImportsInTs(contents, args.path, {
              verbose: options.verbose,
              tempDir: options.tempDir,
              sourceDir: options.sourceDir,
            });
          }
          
          processedTsFiles.add(args.path);
          
          // Return as TypeScript
          return {
            contents: processedContent,
            loader: "ts",
            resolveDir: dirname(args.path),
          };
        } catch (error) {
          logger.error(`Error processing TypeScript file ${args.path}: ${formatErrorMessage(error)}`);
          return null;
        }
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
async function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {},
): Promise<string> {
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
      minify: false, // options.minify !== false,
      treeShaking: true,
      platform: 'neutral',
      target: ['es2020'],
      plugins: [bundlePlugin],
      allowOverwrite: true,
      metafile: true,
      write: true,
      absWorkingDir: Deno.cwd(),
      nodePaths: [Deno.cwd(), dirname(entryPath)],
      loader: {
        '.ts': 'ts',
        '.js': 'js',
        '.hql': 'ts'
      },
      // Always force inline source maps for the final bundle
      sourcemap: "inline",
      // Enable TypeScript processing
      tsconfig: JSON.stringify({
        compilerOptions: {
          target: "es2020",
          module: "esnext",
          moduleResolution: "node",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
          isolatedModules: true,
          strict: false,
          skipLibCheck: true,
          allowJs: true,
          forceConsistentCasingInFileNames: true,
          importsNotUsedAsValues: "preserve",
        }
      })
    };
    
    // Run the build
    logger.log({ text: `Starting bundling: ${entryPath}`, namespace: "bundler" });
    logger.log({ text: `[Bundler] esbuild buildOptions.sourcemap: ${buildOptions.sourcemap}`, namespace: "bundler"});
    
    const result = await esbuild.build(buildOptions);

    await esbuild.stop();

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
    throw error;
  } finally {
    await cleanupAfterBundling(tempDir, cleanupTemp);
  }
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
export async function transpileHqlFile(
  hqlFilePath: string,
  sourceDir: string = "",
  verbose: boolean = false,
): Promise<string> {
  try {
    // Read the HQL file
    const hqlContent = await Deno.readTextFile(hqlFilePath);

    if (verbose) {
      logger.debug(`Transpiling HQL file: ${hqlFilePath}`);
    }

    // Set up options
    const options: TranspileOptions = {
      verbose,
      baseDir: dirname(hqlFilePath),
      filePath: hqlFilePath,  // Use filePath instead of sourceFile
    };
    
    if (sourceDir) {
      options.sourceDir = sourceDir;
    }

    // Pass source file explicitly to ensure accurate location
    const result = await transpile(hqlContent, options);

    return result.code;
  } catch (error) {
    throw new Error(`Error transpiling HQL for JS import ${hqlFilePath}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
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
    const { code: tsContent, sourceMap } = await processHql(hqlContent, {
      baseDir: dirname(hqlPath),
      sourceDir: basePath,
      currentFile: hqlPath,
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

/**
 * Check if adding this dependency would create a circular reference
 */
function checkForCircularDependency(
  source: string, 
  target: string, 
  deps: Map<string, Set<string>>,
  visited: Set<string> = new Set()
): boolean {
  // If we've already checked this path, avoid infinite recursion
  if (visited.has(source)) {
    return false;
  }
  
  // Check if target depends on source (circular)
  if (deps.has(target)) {
    const targetDeps = deps.get(target)!;
    if (targetDeps.has(source)) {
      return true;
    }
    
    // Check transitively
    visited.add(source);
    for (const dep of targetDeps) {
      if (checkForCircularDependency(source, dep, deps, visited)) {
        return true;
      }
    }
  }
  
  return false;
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
  } catch (error) {
    throw new TranspilerError(
      `Failed to write output to '${outputPath}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}