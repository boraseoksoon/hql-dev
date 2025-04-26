// cli/publish/publish_npm.ts - Streamlined NPM publishing implementation
import {
  basename,
  dirname,
  exit,
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

interface PublishNpmOptions {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Build the JavaScript module
 */
async function buildModule(
  inputPath: string,
  options: { verbose?: boolean; dryRun?: boolean }
): Promise<string> {
  console.log(`\n🔨 Building JavaScript module from "${inputPath}"...`);
  const distDir = await buildJsModule(inputPath, options);
  console.log(`\n✅ Module built successfully to: "${distDir}"`);
  return distDir;
}

/**
 * Read existing package.json or create empty object
 */
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

/**
 * Configure package name from CLI args, existing config, or prompt user
 */
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

/**
 * Configure package version from CLI args, auto-increment, or prompt user
 */
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

/**
 * Set standard package.json fields with defaults where needed
 */
function setStandardPackageFields(pkg: Record<string, unknown>): void {
  pkg.description = pkg.description || `HQL module: ${pkg.name}`;
  pkg.module = pkg.module || "./esm/index.js";
  pkg.main = pkg.main || "./esm/index.js"; // Also set main for CommonJS compatibility
  pkg.types = pkg.types || "./types/index.d.ts";
  pkg.files = pkg.files || ["esm", "types", "README.md"];
  pkg.type = "module"; // Ensure ESM format
  
  // Add other useful fields if missing
  if (!pkg.author) {
    pkg.author = getEnv("USER") || getEnv("USERNAME") || "HQL User";
  }
  
  if (!pkg.license) {
    pkg.license = "MIT";
  }
}

/**
 * Save package.json to disk
 */
async function savePackageJson(
  pkgJsonPath: string,
  pkg: Record<string, unknown>
): Promise<void> {
  await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));
  console.log(`  → Updated package.json with name=${pkg.name} version=${pkg.version}`);
}

/**
 * Execute npm publish command
 */
async function executeNpmPublish(distDir: string): Promise<{ success: boolean; errorCode?: number }> {
  const publishCmd = ["npm", "publish", "--access", "public"];
  console.log(`  → Running: ${publishCmd.join(" ")}`);

  const process = runCmd({
    cmd: publishCmd,
    cwd: distDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await process.status;
  return { success: status.success, errorCode: status.code };
}

/**
 * Generate success or error link for npm package
 */
function generatePackageLink(
  pkg: Record<string, unknown>,
  publishResult?: { success: boolean; errorCode?: number }
): string {
  if (!publishResult || publishResult.success) {
    return `https://www.npmjs.com/package/${pkg.name}`;
  } else {
    return `❌ npm publish failed with exit code ${publishResult.errorCode}`;
  }
}

/**
 * Main NPM publishing function
 */
export async function publishNpm(options: PublishNpmOptions): Promise<PublishSummary> {
  try {
    console.log("\n📦 Starting NPM package publishing process");

    // Resolve the input path and build the module
    const inputPath = resolve(options.what);
    const baseDir = dirname(inputPath);
    
    if (options.verbose) {
      logger.debug(`Using input path: "${inputPath}"`);
      logger.debug(`Using base directory: "${baseDir}"`);
    }

    // Build the module
    const distDir = await buildModule(inputPath, {
      verbose: options.verbose,
      dryRun: options.dryRun,
    });

    // Prepare package configuration
    console.log(`\n📝 Preparing package configuration...`);
    const pkgJsonPath = join(distDir, "package.json");
    const pkg = await readPackageJson(pkgJsonPath, options.verbose);

    // Configure package name and version
    await configurePackageName(pkg, options, baseDir);
    await configurePackageVersion(pkg, options);
    
    // Set standard fields
    setStandardPackageFields(pkg);
    
    // Save package.json
    await savePackageJson(pkgJsonPath, pkg);
    
    // Handle dry run
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

    // Actually publish to npm
    console.log(`\n🚀 Publishing package ${pkg.name}@${pkg.version} to npm...`);
    const publishResult = await executeNpmPublish(distDir);
    
    if (!publishResult.success) {
      console.error(`\n❌ npm publish failed with exit code ${publishResult.errorCode}`);
    }

    // Return publication summary
    return {
      registry: "npm",
      name: String(pkg.name),
      version: String(pkg.version),
      link: generatePackageLink(pkg, publishResult)
    };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ NPM publish failed: ${errorMessage}`);
    return {
      registry: "npm",
      name: options.name ?? '(auto)',
      version: options.version ?? '(auto)',
      link: `❌ ${errorMessage}`
    };
  }
}