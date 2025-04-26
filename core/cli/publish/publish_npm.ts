// cli/publish/publish_npm.ts - Streamlined NPM publishing implementation
import {
  basename,
  dirname,
  getEnv,
  join,
  readTextFile,
  resolve,
  runCmd,
  writeTextFile,
} from "../../src/platform/platform.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";
import { incrementPatch, prompt } from "./utils.ts";
import { globalLogger as logger } from "../../src/logger.ts";
import type { PublishSummary } from "./publish_summary.ts";
import { detectNpmError, handlePublishError } from "./error_handlers.ts";

interface PublishNpmOptions {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

async function buildModule(inputPath: string, options: { verbose?: boolean; dryRun?: boolean }): Promise<string> {
  console.log(`\n🔨 Building JavaScript module from "${inputPath}"...`);
  const distDir = await buildJsModule(inputPath, options);
  console.log(`\n✅ Module built successfully to: "${distDir}"`);
  return distDir;
}

async function readPackageJson(pkgJsonPath: string, verbose?: boolean): Promise<Record<string, unknown>> {
  if (await exists(pkgJsonPath)) {
    try {
      if (verbose) logger.debug(`Reading existing package.json`);
      return JSON.parse(await readTextFile(pkgJsonPath));
    } catch (error) {
      if (verbose) {
        logger.debug(`Error parsing package.json: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return {};
}

async function configurePackageName(
  pkg: Record<string, unknown>,
  options: PublishNpmOptions,
  baseDir: string
): Promise<void> {
  if (options.name) {
    pkg.name = options.name;
    console.log(`  → Using provided package name: "${pkg.name}"`);
  } else if (!pkg.name) {
    const defaultName = basename(baseDir)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    console.log(`  Enter npm package name (default: "${defaultName}"):`);
    const userName = await prompt(`Enter name:`, defaultName);
    pkg.name = userName || defaultName;
    console.log(`  → Using package name: "${pkg.name}"`);
  } else {
    console.log(`  → Using existing package name: "${pkg.name}"`);
  }
}

async function configurePackageVersion(
  pkg: Record<string, unknown>,
  options: PublishNpmOptions
): Promise<void> {
  if (options.version) {
    pkg.version = options.version;
    console.log(`  → Using provided version: ${pkg.version}`);
  } else if (pkg.version) {
    pkg.version = incrementPatch(String(pkg.version));
    console.log(`  → Incremented version to: ${pkg.version}`);
  } else {
    const defaultVersion = "0.0.1";
    console.log(`  Enter version (default: "${defaultVersion}"):`);
    const ver = await prompt(`Enter version:`, defaultVersion);
    pkg.version = ver || defaultVersion;
    console.log(`  → Using version: ${pkg.version}`);
  }
}

function setStandardPackageFields(pkg: Record<string, unknown>): void {
  pkg.description = pkg.description || `HQL module: ${pkg.name}`;
  pkg.module = pkg.module || "./esm/index.js";
  pkg.main = pkg.main || "./esm/index.js";
  pkg.types = pkg.types || "./types/index.d.ts";
  pkg.files = pkg.files || ["esm", "types", "README.md"];
  pkg.type = "module";
  
  if (!pkg.author) {
    pkg.author = getEnv("USER") || getEnv("USERNAME") || "HQL User";
  }
  
  if (!pkg.license) {
    pkg.license = "MIT";
  }
}

async function savePackageJson(
  pkgJsonPath: string,
  pkg: Record<string, unknown>
): Promise<void> {
  await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));
  console.log(`  → Updated package.json with name=${pkg.name} version=${pkg.version}`);
}

async function executeNpmPublish(distDir: string): Promise<{ success: boolean; errorCode?: number; stderr?: string }> {
  const publishCmd = ["npm", "publish", "--access", "public"];
  console.log(`  → Running: ${publishCmd.join(" ")}`);

  const process = runCmd({
    cmd: publishCmd,
    cwd: distDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await process.status;
  
  let stderr = "";
  if (!status.success) {
    try {
      const stderrProcess = runCmd({
        cmd: publishCmd,
        cwd: distDir,
        stdout: "piped",
        stderr: "piped",
      });
      
      const stderrChunks: Uint8Array[] = [];
      if (stderrProcess.stderr) {
        for await (const chunk of stderrProcess.stderr) {
          stderrChunks.push(chunk);
        }
      }
      
      await stderrProcess.status;
      stderr = stderrChunks.length > 0 
        ? new TextDecoder().decode(concatUint8Arrays(stderrChunks)) 
        : "";
    } catch (_err) {
      stderr = `npm command failed with exit code ${status.code}`;
    }
  }

  return { 
    success: status.success, 
    errorCode: status.code,
    stderr: stderr
  };
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, array) => acc + array.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function generatePackageLink(
  pkg: Record<string, unknown>,
  publishResult?: { success: boolean; errorCode?: number; stderr?: string }
): string {
  if (!publishResult || publishResult.success) {
    return `https://www.npmjs.com/package/${pkg.name}`;
  } else {
    if (publishResult.stderr) {
      const errorInfo = detectNpmError(publishResult.stderr);
      return errorInfo.message;
    }
    return `❌ npm publish failed with exit code ${publishResult.errorCode}`;
  }
}

export async function publishNpm(options: PublishNpmOptions): Promise<PublishSummary> {
  try {
    console.log("\n📦 Starting NPM package publishing process");

    const inputPath = resolve(options.what);
    const baseDir = dirname(inputPath);
    
    if (options.verbose) {
      logger.debug(`Using input path: "${inputPath}"`);
      logger.debug(`Using base directory: "${baseDir}"`);
    }

    const distDir = await buildModule(inputPath, {
      verbose: options.verbose,
      dryRun: options.dryRun,
    });

    console.log(`\n📝 Preparing package configuration...`);
    const pkgJsonPath = join(distDir, "package.json");
    const pkg = await readPackageJson(pkgJsonPath, options.verbose);

    await configurePackageName(pkg, options, baseDir);
    await configurePackageVersion(pkg, options);
    
    setStandardPackageFields(pkg);
    
    await savePackageJson(pkgJsonPath, pkg);
    
    if (options.dryRun) {
      console.log(`\n🔍 Dry run mode enabled - package would be published to npm`);
      console.log(`  → Package would be viewable at: https://www.npmjs.com/package/${pkg.name}`);
      return {
        registry: "npm",
        name: String(pkg.name),
        version: String(pkg.version),
        link: `https://www.npmjs.com/package/${pkg.name}`
      };
    }

    console.log(`\n🚀 Publishing package ${pkg.name}@${pkg.version} to npm...`);
    const publishResult = await executeNpmPublish(distDir);
    
    if (!publishResult.success) {
      const errorInfo = publishResult.stderr 
        ? detectNpmError(publishResult.stderr)
        : detectNpmError(`npm publish failed with exit code ${publishResult.errorCode}`);
      console.error(`\n${errorInfo.message}`);
    }

    return {
      registry: "npm",
      name: String(pkg.name),
      version: String(pkg.version),
      link: generatePackageLink(pkg, publishResult)
    };
    
  } catch (err) {
    return handlePublishError(err, {
      registry: "npm",
      name: options.name,
      version: options.version
    });
  }
}