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
import { PublishError } from "./publish_errors.ts";

export async function buildJsModule(
  inputPath: string,
  options: {
    verbose?: boolean;
    dryRun?: boolean;
  } = {},
): Promise<string> {
  const absoluteInputPath = resolve(inputPath);

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

  const baseDir = isFile ? dirname(absoluteInputPath) : absoluteInputPath;
  const fileName = isFile
    ? basename(absoluteInputPath).replace(/\.(hql|js|ts)$/, "")
    : "index";

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

  const jsOutputPath = join(buildDir, `${fileName}.js`);
  const dtsOutputPath = join(buildDir, `${fileName}.d.ts`);

  console.log(`\n🔨 Transpiling and bundling ${absoluteInputPath}...`);

  try {
    if (isHqlFile(absoluteInputPath)) {
      await transpileCLI(absoluteInputPath, jsOutputPath, {
        verbose: options.verbose,
      });
    } else if (isJsFile(absoluteInputPath) || isTypeScriptFile(absoluteInputPath)) {
      const source = await readTextFile(absoluteInputPath);
      let processedSource = source;

      if (isTypeScriptFile(absoluteInputPath)) {
        if (checkForHqlImports(source)) {
          console.log("⚠️ HQL imports in TypeScript files may require custom bundling");
        }
        await ensureDir(dirname(jsOutputPath));
        await writeTextFile(jsOutputPath, processedSource);
      } else {
        if (checkForHqlImports(source)) {
          processedSource = await processHqlImportsInJs(source, absoluteInputPath, { verbose: options.verbose });
        }
        await ensureDir(dirname(jsOutputPath));
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

  const esmDir = join(distDir, "esm");
  const typesDir = join(distDir, "types");

  await ensureDir(esmDir);
  await ensureDir(typesDir);

  try {
    if (await exists(jsOutputPath)) {
      const jsContent = await readTextFile(jsOutputPath);
      await writeTextFile(join(esmDir, "index.js"), jsContent);
      if (options.verbose) {
        logger.debug(`Copied JS bundle to ${join(esmDir, "index.js")}`);
      }
    } else {
      console.warn(`\n⚠️ Transpiled output file not found. Package may be incomplete.`);
    }

    if (await exists(dtsOutputPath)) {
      const dtsContent = await readTextFile(dtsOutputPath);
      await writeTextFile(join(typesDir, "index.d.ts"), dtsContent);
      if (options.verbose) {
        logger.debug(`Copied TypeScript definitions to ${join(typesDir, "index.d.ts")}`);
      }
    } else {
      await writeTextFile(
        join(typesDir, "index.d.ts"),
        `declare const _default: any;\nexport default _default;\n`
      );
      if (options.verbose) {
        logger.debug(`Created minimal TypeScript definition file`);
      }
    }

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
