import * as esbuild from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import {
  basename,
  dirname,
  ensureDir,
  exists,
  isAbsolute,
  join,
  resolve,
  writeTextFile,
} from "./platform/platform.ts";
import { Logger } from "./logger.ts";
import { processHql } from "./transpiler/hql-transpiler.ts";
import {
  createErrorReport,
  TranspilerError,
  ValidationError,
} from "./transpiler/errors.ts";
import { performAsync } from "./transpiler/error-utils.ts";
import { isHqlFile, isJsFile, simpleHash } from "./utils.ts";
import { registerTempFile } from "./temp-file-tracker.ts";

const MAX_RETRIES = 3;
const ESBUILD_RETRY_DELAY_MS = 100;

export interface BundleOptions {
  verbose?: boolean;
  minify?: boolean;
  drop?: string[];
  tempDir?: string;
  sourceDir?: string;
}

export function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: BundleOptions = {},
): Promise<string> {
  return performAsync(async () => {
    const logger = new Logger(options.verbose);
    const startTime = performance.now();
    logger.log(`Processing entry: ${inputPath}`);
    const resolvedInputPath = resolve(inputPath);
    const outPath = determineOutputPath(resolvedInputPath, outputPath);
    const sourceDir = dirname(resolvedInputPath);
    const processedPath = await processEntryFile(resolvedInputPath, outPath, {
      ...options,
      sourceDir,
    });
    logger.debug(`Entry file processed to: ${processedPath}`);
    await bundleWithEsbuild(processedPath, outPath, {
      ...options,
      sourceDir,
    });
    const endTime = performance.now();
    logger.log(
      `Successfully processed output to ${outPath} in ${
        (endTime - startTime).toFixed(2)
      }ms`,
    );
    return outPath;
  }, `CLI transpilation failed for ${inputPath}`);
}

export function checkForHqlImports(jsSource: string, logger: Logger): boolean {
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
  const hasHqlImports = hqlImportRegex.test(jsSource);
  if (hasHqlImports) logger.log(`JS file contains HQL imports - processing these imports`);
  return hasHqlImports;
}

export async function processHqlImportsInJs(
  jsSource: string,
  jsFilePath: string,
  options: BundleOptions,
  logger: Logger,
): Promise<string> {
  try {
    const baseDir = dirname(jsFilePath);
    let modifiedSource = jsSource;
    const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
    const imports: { full: string; path: string }[] = [];
    let match;
    hqlImportRegex.lastIndex = 0;
    while ((match = hqlImportRegex.exec(jsSource)) !== null) {
      const fullImport = match[0];
      const importPath = match[1];
      imports.push({ full: fullImport, path: importPath });
    }
    logger.debug(`Found ${imports.length} HQL imports in JS file`);
    for (const importInfo of imports) {
      const hqlPath = importInfo.path;
      let resolvedHqlPath: string | null = null;
      try {
        const pathFromJs = path.resolve(baseDir, hqlPath);
        await Deno.stat(pathFromJs);
        resolvedHqlPath = pathFromJs;
        logger.debug(`Resolved import relative to JS file: ${pathFromJs}`);
      } catch {}
      if (!resolvedHqlPath && options.sourceDir) {
        try {
          const pathFromSource = path.resolve(options.sourceDir, hqlPath);
          await Deno.stat(pathFromSource);
          resolvedHqlPath = pathFromSource;
          logger.debug(`Resolved import relative to source dir: ${pathFromSource}`);
        } catch {}
      }
      if (
        !resolvedHqlPath &&
        (hqlPath.startsWith("./") || hqlPath.startsWith("../"))
      ) {
        try {
          const pathFromLib = path.resolve(
            Deno.cwd(),
            "lib",
            hqlPath.replace(/^\.\//, ""),
          );
          await Deno.stat(pathFromLib);
          resolvedHqlPath = pathFromLib;
          logger.debug(`Resolved import relative to lib dir: ${pathFromLib}`);
        } catch {}
      }
      if (!resolvedHqlPath) {
        try {
          const pathFromCwd = path.resolve(Deno.cwd(), hqlPath);
          await Deno.stat(pathFromCwd);
          resolvedHqlPath = pathFromCwd;
          logger.debug(`Resolved import relative to CWD: ${pathFromCwd}`);
        } catch {}
      }
      if (!resolvedHqlPath) {
        throw new Error(`Could not resolve import: ${hqlPath} from ${jsFilePath}`);
      }
      const hqlOutputPath = resolvedHqlPath.replace(/\.hql$/, ".js");
      if (!await exists(hqlOutputPath)) {
        logger.debug(`Transpiling HQL import: ${resolvedHqlPath} -> ${hqlOutputPath}`);
        await transpileCLI(resolvedHqlPath, hqlOutputPath, options);
      } else {
        logger.debug(`Using existing transpiled file: ${hqlOutputPath}`);
      }
      const relativePath = hqlPath.replace(/\.hql$/, ".js");
      const newImport = importInfo.full.replace(hqlPath, relativePath);
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
    logger.debug(`Successfully wrote ${code.length} bytes to: ${outputPath}`);
    logger.log(`Output written to: ${outputPath}`);
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
    const logger = new Logger(options.verbose);
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
    } else if (isJsFile(resolvedInputPath)) {
      return await processJsEntryFile(
        resolvedInputPath,
        outputPath,
        options,
        logger,
      );
    } else {
      throw new ValidationError(
        `Unsupported file type: ${inputPath} (expected .hql or .js)`,
        "file type validation",
        ".hql or .js",
        path.extname(inputPath) || "no extension",
      );
    }
  }, `Failed to process entry file ${inputPath}`);
}

async function processHqlEntryFile(
  resolvedInputPath: string,
  outputPath: string,
  options: BundleOptions,
  logger: Logger,
): Promise<string> {
  logger.log(`Transpiling HQL entry file: ${resolvedInputPath}`);
  const [tempDirResult, source] = await Promise.all([
    createTempDirIfNeeded(options, logger),
    readSourceFile(resolvedInputPath),
  ]);
  const tempDir = tempDirResult.tempDir;
  const tempDirCreated = tempDirResult.created;
  logger.debug(`Read ${source.length} bytes from ${resolvedInputPath}`);
  try {
    let jsCode = await processHql(source, {
      baseDir: dirname(resolvedInputPath),
      verbose: options.verbose,
      tempDir,
      sourceDir: options.sourceDir || dirname(resolvedInputPath),
    });
    if (checkForHqlImports(jsCode, logger)) {
      logger.debug("Detected nested HQL imports in transpiled output. Processing them.");
      jsCode = await processHqlImportsInJs(
        jsCode,
        resolvedInputPath,
        options,
        logger,
      );
    }
    await writeOutput(jsCode, outputPath, logger);
    logger.log(`Entry processed and output written to ${outputPath}`);
    return outputPath;
  } finally {
    if (tempDirCreated) {
      Deno.remove(tempDir, { recursive: true })
        .then(() => logger.debug(`Cleaned up temporary directory: ${tempDir}`))
        .catch((error) =>
          logger.warn(
            `Failed to clean up temporary directory: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        );
    }
  }
}

async function createTempDirIfNeeded(
  options: BundleOptions,
  logger: Logger,
): Promise<{ tempDir: string; created: boolean }> {
  try {
    if (!options.tempDir) {
      const tempDir = await Deno.makeTempDir({ prefix: "hql_bundle_" });
      logger.debug(`Created temporary directory: ${tempDir}`);
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

async function processJsEntryFile(
  resolvedInputPath: string,
  outputPath: string,
  options: BundleOptions,
  logger: Logger,
): Promise<string> {
  try {
    logger.log(`Using JS entry file: ${resolvedInputPath}`);
    const jsSource = await Deno.readTextFile(resolvedInputPath);
    logger.debug(`Read ${jsSource.length} bytes from ${resolvedInputPath}`);
    let processedSource = jsSource;
    if (checkForHqlImports(jsSource, logger)) {
      processedSource = await processHqlImportsInJs(
        jsSource,
        resolvedInputPath,
        options,
        logger,
      );
    }
    await writeOutput(processedSource, outputPath, logger);
    return outputPath;
  } catch (error) {
    throw new TranspilerError(
      `Processing JS entry file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {},
): Promise<string> {
  return performAsync(async () => {
    const logger = new Logger(options.verbose);
    logger.debug(`Bundling ${entryPath} to ${outputPath}`);
    logger.debug(`Bundling options: ${JSON.stringify(options, null, 2)}`);
    const tempDirResult = await createTempDirIfNeeded(options, logger);
    const tempDir = tempDirResult.tempDir;
    const cleanupTemp = tempDirResult.created;
    try {
      const hqlPlugin = createHqlPlugin({
        verbose: options.verbose,
        tempDir,
        sourceDir: options.sourceDir || dirname(entryPath),
      });
      const externalPlugin = createExternalPlugin();
      const buildOptions = createBuildOptions(
        entryPath,
        outputPath,
        options,
        [hqlPlugin, externalPlugin],
      );
      logger.log(`Starting bundling with esbuild for ${entryPath}`);
      const result = await runBuildWithRetry(
        buildOptions,
        MAX_RETRIES,
        logger,
      );
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
      cleanupAfterBundling(tempDir, cleanupTemp, logger);
    }
  }, `Bundling failed for ${entryPath}`);
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
        logger.warn(
          `esbuild warnings: ${JSON.stringify(result.warnings, null, 2)}`,
        );
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
        logger.warn(`esbuild service error on attempt ${attempt}, retrying...`);
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
  if (cleanupTemp) {
    Deno.remove(tempDir, { recursive: true })
      .then(() => logger.debug(`Cleaned up temporary directory: ${tempDir}`))
      .catch((error) =>
        logger.warn(
          `Failed to clean up temporary directory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      );
  }
}

function createHqlPlugin(options: {
  verbose?: boolean;
  tempDir?: string;
  sourceDir?: string;
}): any {
  const logger = new Logger(options.verbose);
  const processedHqlFiles = new Set<string>();
  const hqlToJsMap = new Map<string, string>();
  return {
    name: "hql-plugin",
    setup(build: any) {
      build.onResolve({ filter: /\.(js|hql)$/ }, async (args: any) => {
        return resolveHqlImport(args, options, logger);
      });
      build.onLoad({ filter: /.*/, namespace: "hql" }, async (args: any) => {
        return loadHqlFile(args, processedHqlFiles, hqlToJsMap, options, logger);
      });
    },
  };
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
  const resolutionStrategies = [
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
      return loadTranspiledJs(args.path, hqlToJsMap.get(args.path)!, logger);
    }
    if (processedHqlFiles.has(args.path)) {
      logger.debug(`Already processed HQL file: ${args.path}`);
      return null;
    }
    processedHqlFiles.add(args.path);
    const actualPath = await findActualFilePath(args.path, logger);
    const fileHash = simpleHash(actualPath).toString();
    const outputDir = join(options.tempDir || "", fileHash);
    const [, jsCode] = await Promise.all([
      ensureDir(outputDir),
      transpileHqlFile(actualPath, options.sourceDir, options.verbose),
    ]);
    const outFileName = basename(actualPath, ".hql") + ".js";
    const jsOutputPath = join(outputDir, outFileName);
    await writeTextFile(jsOutputPath, jsCode);
    logger.debug(`Written transpiled JS to: ${jsOutputPath}`);
    hqlToJsMap.set(args.path, jsOutputPath);
    if (args.path !== actualPath) {
      hqlToJsMap.set(actualPath, jsOutputPath);
    }
    return {
      contents: jsCode,
      loader: "js",
      resolveDir: dirname(jsOutputPath),
    };
  } catch (error) {
    throw new TranspilerError(
      `Error loading HQL file ${args.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function loadTranspiledJs(
  originalPath: string,
  jsPath: string,
  logger: Logger,
): Promise<any> {
  try {
    logger.debug(`Using previously transpiled JS file: ${jsPath}`);
    const jsContent = await Deno.readTextFile(jsPath);
    return {
      contents: jsContent,
      loader: "js",
      resolveDir: dirname(jsPath),
    };
  } catch (error) {
    throw new TranspilerError(
      `Reading transpiled JS file: ${jsPath}: ${
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
    const { processHql } = await import("./transpiler/hql-transpiler.ts");
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
    };
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

function createExternalPlugin(): any {
  return {
    name: "external-npm-jsr",
    setup(build: any) {
      build.onResolve({ filter: /^(npm:|jsr:|https?:)/ }, (args: any) => {
        return { path: args.path, external: true };
      });
    },
  };
}

function determineOutputPath(
  resolvedInputPath: string,
  outputPath?: string,
): string {
  if (outputPath) return outputPath;
  if (resolvedInputPath.endsWith(".hql")) {
    return resolvedInputPath.replace(/\.hql$/, ".js");
  }
  return resolvedInputPath + ".bundle.js";
}
