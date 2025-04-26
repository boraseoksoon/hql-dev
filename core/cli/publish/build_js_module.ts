import { transpileCLI, processHqlImportsInJs } from "../../src/bundler.ts";
import {
  basename,
  dirname,
  join,
  resolve,
  writeTextFile,
  readTextFile,
} from "../../src/platform/platform.ts";
import { ensureDir } from "../../src/platform/platform.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { globalLogger as logger } from "../../src/logger.ts";
import { isHqlFile, isJsFile, isTypeScriptFile, checkForHqlImports } from "../../src/common/utils.ts";

/**
 * Check if input path is a file
 */
async function checkIsFile(absolutePath: string, verbose?: boolean): Promise<boolean> {
  try {
    const stat = await Deno.stat(absolutePath);
    const isFile = stat.isFile;
    if (verbose) {
      logger.debug(`Input is a ${isFile ? "file" : "directory"}: ${absolutePath}`);
    }
    return isFile;
  } catch (error) {
    console.error(
      `\n❌ Error accessing path: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Create build and distribution directories
 */
async function createBuildDirectories(buildDir: string, distDir: string, verbose?: boolean): Promise<void> {
  try {
    await ensureDir(buildDir);
    await ensureDir(distDir);

    if (verbose) {
      logger.debug(`Using build directory: ${buildDir}`);
      logger.debug(`Using distribution directory: ${distDir}`);
    }
  } catch (error) {
    console.error(`\n❌ Failed to create directories: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Process and bundle HQL file
 */
async function processHqlFile(
  inputPath: string, 
  jsOutputPath: string, 
  verbose?: boolean
): Promise<void> {
  await transpileCLI(inputPath, jsOutputPath, { verbose });
}

/**
 * Process and bundle JavaScript file
 */
async function processJsFile(
  inputPath: string, 
  jsOutputPath: string, 
  verbose?: boolean
): Promise<void> {
  const source = await readTextFile(inputPath);
  let processedSource = source;

  if (checkForHqlImports(source)) {
    processedSource = await processHqlImportsInJs(source, inputPath, { verbose });
  }
  
  await ensureDir(dirname(jsOutputPath));
  await writeTextFile(jsOutputPath, processedSource);
}

/**
 * Process and bundle TypeScript file
 */
async function processTypeScriptFile(
  inputPath: string, 
  jsOutputPath: string
): Promise<void> {
  const source = await readTextFile(inputPath);
  
  if (checkForHqlImports(source)) {
    console.log("⚠️ HQL imports in TypeScript files may require custom bundling");
  }
  
  await ensureDir(dirname(jsOutputPath));
  await writeTextFile(jsOutputPath, source);
}

/**
 * Bundle the source file based on its type
 */
async function bundleSourceFile(
  absoluteInputPath: string, 
  jsOutputPath: string, 
  verbose?: boolean
): Promise<void> {
  console.log(`\n🔨 Transpiling and bundling ${absoluteInputPath}...`);

  try {
    if (isHqlFile(absoluteInputPath)) {
      await processHqlFile(absoluteInputPath, jsOutputPath, verbose);
    } else if (isJsFile(absoluteInputPath)) {
      await processJsFile(absoluteInputPath, jsOutputPath, verbose);
    } else if (isTypeScriptFile(absoluteInputPath)) {
      await processTypeScriptFile(absoluteInputPath, jsOutputPath);
    } else {
      throw new Error(`Unsupported file type: ${absoluteInputPath}`);
    }

    console.log(`✅ Successfully bundled to ${jsOutputPath}`);
  } catch (error) {
    console.error(`\n❌ Bundling failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Copy JavaScript output to distribution directory
 */
async function copyJsOutput(
  jsOutputPath: string, 
  esmDir: string, 
  verbose?: boolean
): Promise<void> {
  if (await exists(jsOutputPath)) {
    const jsContent = await readTextFile(jsOutputPath);
    await writeTextFile(join(esmDir, "index.js"), jsContent);
    if (verbose) {
      logger.debug(`Copied JS bundle to ${join(esmDir, "index.js")}`);
    }
  } else {
    console.warn(`\n⚠️ Transpiled output file not found. Package may be incomplete.`);
  }
}

/**
 * Copy or create TypeScript definitions
 */
async function prepareTypeDefinitions(
  dtsOutputPath: string, 
  typesDir: string, 
  verbose?: boolean
): Promise<void> {
  if (await exists(dtsOutputPath)) {
    const dtsContent = await readTextFile(dtsOutputPath);
    await writeTextFile(join(typesDir, "index.d.ts"), dtsContent);
    if (verbose) {
      logger.debug(`Copied TypeScript definitions to ${join(typesDir, "index.d.ts")}`);
    }
  } else {
    await writeTextFile(
      join(typesDir, "index.d.ts"),
      `declare const _default: any;\nexport default _default;\n`
    );
    if (verbose) {
      logger.debug(`Created minimal TypeScript definition file`);
    }
  }
}

/**
 * Create README.md if it doesn't exist
 */
async function ensureReadmeExists(
  readmePath: string, 
  packageName: string, 
  verbose?: boolean
): Promise<void> {
  if (!await exists(readmePath)) {
    await writeTextFile(
      readmePath,
      `# ${packageName}\n\nGenerated HQL module.\n`
    );
    if (verbose) {
      logger.debug(`Created README.md file`);
    }
  }
}

/**
 * Prepare distribution files
 */
async function prepareDistributionFiles(
  jsOutputPath: string,
  dtsOutputPath: string,
  distDir: string,
  packageName: string,
  verbose?: boolean
): Promise<void> {
  const esmDir = join(distDir, "esm");
  const typesDir = join(distDir, "types");

  try {
    await ensureDir(esmDir);
    await ensureDir(typesDir);

    await copyJsOutput(jsOutputPath, esmDir, verbose);
    await prepareTypeDefinitions(dtsOutputPath, typesDir, verbose);
    
    const readmePath = join(distDir, "README.md");
    await ensureReadmeExists(readmePath, packageName, verbose);
  } catch (error) {
    console.error(`\n❌ Error preparing distribution files: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Main function to build a JavaScript module from HQL, JS, or TS source
 */
export async function buildJsModule(
  inputPath: string,
  options: {
    verbose?: boolean;
    dryRun?: boolean;
  } = {},
): Promise<string> {
  try {
    const absoluteInputPath = resolve(inputPath);
    const isFile = await checkIsFile(absoluteInputPath, options.verbose);

    const baseDir = isFile ? dirname(absoluteInputPath) : absoluteInputPath;
    const fileName = isFile
      ? basename(absoluteInputPath).replace(/\.(hql|js|ts)$/, "")
      : "index";

    const buildDir = join(baseDir, ".build");
    const distDir = join(baseDir, "dist");

    await createBuildDirectories(buildDir, distDir, options.verbose);

    const jsOutputPath = join(buildDir, `${fileName}.js`);
    const dtsOutputPath = join(buildDir, `${fileName}.d.ts`);

    await bundleSourceFile(absoluteInputPath, jsOutputPath, options.verbose);

    const packageName = fileName !== "index" ? fileName : basename(baseDir);
    await prepareDistributionFiles(
      jsOutputPath,
      dtsOutputPath,
      distDir,
      packageName,
      options.verbose
    );

    console.log(`\n✅ Module build completed successfully in ${distDir}`);
    return distDir;
  } catch (error) {
    console.error(`\n❌ Module build failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error; // Propagate the error to the caller
  }
}