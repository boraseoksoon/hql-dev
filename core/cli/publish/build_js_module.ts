// cli/publish/build_js_module.ts - Integrated with the main HQL transpiler pipeline

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
import { isHqlFile, isJsFile, isTypeScriptFile } from "../../src/common/utils.ts";
import { PublishError } from "./publish_errors.ts";

// Check if a file contains HQL imports
function checkForHqlImports(source: string): boolean {
  return /import\s+.*\s+from\s+['"]([\.\w\/]+\.hql)['"]/.test(source);
}

/**
 * Build a JavaScript module from an HQL file.
 * This uses the main HQL transpiler to create a self-contained ESM bundle.
 *
 * @param inputPath The HQL file path
 * @param options Additional options
 * @returns Promise<string> Path to the distribution directory
 */
export async function buildJsModule(
  inputPath: string,
  options: {
    verbose?: boolean;
    dryRun?: boolean;
  } = {},
): Promise<string> {
  const absoluteInputPath = resolve(inputPath);
  
  // Check if the input is a file or directory
  let isFile: boolean;
  try {
    const stat = await Deno.stat(absoluteInputPath);
    isFile = stat.isFile;
    if (options.verbose) {
      logger.debug(`Input is a ${isFile ? "file" : "directory"}: ${absoluteInputPath}`);
    }
  } catch (error) {
    console.error(
      `\n❌ Error accessing path: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }

  // Determine base directory and output filename
  const baseDir = isFile ? dirname(absoluteInputPath) : absoluteInputPath;
  const fileName = isFile 
    ? basename(absoluteInputPath).replace(/\.(hql|js|ts)$/, "")
    : "index";
  
  // Create build and distribution directory structure
  const buildDir = join(baseDir, ".build");
  const distDir = join(baseDir, "dist");
  
  try {
    await ensureDir(buildDir);
    await ensureDir(distDir);
    
    if (options.verbose) {
      logger.debug(`Using build directory: ${buildDir}`);
      logger.debug(`Using distribution directory: ${distDir}`);
    }
  } catch (error) {
    console.error(`\n❌ Failed to create directories: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  // Output path for transpiled JS
  const jsOutputPath = join(buildDir, `${fileName}.js`);
  const dtsOutputPath = join(buildDir, `${fileName}.d.ts`);
  
  // Use the HQL transpiler to bundle the file
  console.log(`\n🔨 Transpiling and bundling ${absoluteInputPath}...`);
  
  try {
    // Different handling for HQL vs JS/TS files
    if (isHqlFile(absoluteInputPath)) {
      // For HQL files, use the full transpileCLI pipeline
      await transpileCLI(absoluteInputPath, jsOutputPath, {
        verbose: options.verbose,
      });

    } else if (isJsFile(absoluteInputPath) || isTypeScriptFile(absoluteInputPath)) {
      // For JS/TS files, read, process any HQL imports, and write directly
      const source = await readTextFile(absoluteInputPath);
      let processedSource = source;
      
      // Process with the appropriate function based on file type
      if (isTypeScriptFile(absoluteInputPath)) {
        // For TypeScript files, do basic processing (since TS imports are handled differently)
        // Just copy the file for now, as esbuild will handle TypeScript compilation
        if (checkForHqlImports(source)) {
          console.log("⚠️ HQL imports in TypeScript files may require custom bundling");
        }
        // Ensure build directory exists
        await ensureDir(dirname(jsOutputPath));
        // Write processed TypeScript to the build directory
        await writeTextFile(jsOutputPath, processedSource);
      } else {
        // For JavaScript files, process any HQL imports
        if (checkForHqlImports(source)) {
          processedSource = await processHqlImportsInJs(source, absoluteInputPath, { verbose: options.verbose });
        }
        // Ensure build directory exists
        await ensureDir(dirname(jsOutputPath));
        // Write processed JavaScript to the build directory
        await writeTextFile(jsOutputPath, processedSource);
      }
    } else {
      throw new Error(`Unsupported file type: ${absoluteInputPath}`);
    }
    
    console.log(`✅ Successfully bundled to ${jsOutputPath}`);
  } catch (error) {
    throw new PublishError(
      error instanceof Error ? error.message : String(error),
      { source: absoluteInputPath, phase: "bundling" }
    );
  }
  
  // Create final package structure
  const esmDir = join(distDir, "esm");
  const typesDir = join(distDir, "types");
  
  await ensureDir(esmDir);
  await ensureDir(typesDir);
  
  // Copy bundled files to distribution directories
  try {
    // Copy JS bundle to ESM directory
    if (await exists(jsOutputPath)) {
      const jsContent = await readTextFile(jsOutputPath);
      await writeTextFile(join(esmDir, "index.js"), jsContent);
      if (options.verbose) {
        logger.debug(`Copied JS bundle to ${join(esmDir, "index.js")}`);
      }
    } else {
      console.warn(`\n⚠️ Transpiled output file not found. Package may be incomplete.`);
    }
    
    // Copy or create type definitions
    if (await exists(dtsOutputPath)) {
      const dtsContent = await readTextFile(dtsOutputPath);
      await writeTextFile(join(typesDir, "index.d.ts"), dtsContent);
      if (options.verbose) {
        logger.debug(`Copied TypeScript definitions to ${join(typesDir, "index.d.ts")}`);
      }
    } else {
      // Create minimal type definition
      await writeTextFile(
        join(typesDir, "index.d.ts"),
        `declare const _default: any;\nexport default _default;\n`
      );
      if (options.verbose) {
        logger.debug(`Created minimal TypeScript definition file`);
      }
    }
    
    // Create README if it doesn't exist
    const readmePath = join(distDir, "README.md");
    if (!await exists(readmePath)) {
      const packageName = fileName !== "index" ? fileName : basename(baseDir);
      await writeTextFile(
        readmePath,
        `# ${packageName}\n\nGenerated HQL module.\n`
      );
      if (options.verbose) {
        logger.debug(`Created README.md file`);
      }
    }
  } catch (error) {
    console.error(`\n❌ Error preparing distribution files: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  
  console.log(`\n✅ Module build completed successfully in ${distDir}`);
  return distDir;
}
