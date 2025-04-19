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

interface PublishNpmOptions {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

export async function publishNpm(options: PublishNpmOptions): Promise<void> {
  console.log("\n📦 Starting NPM package publishing process");

  // Resolve the input path (this should already be resolved to a file by resolveEntryPoint)
  const inputPath = resolve(options.what);
  const baseDir = dirname(inputPath);
  
  if (options.verbose) {
    logger.debug(`Using input path: "${inputPath}"`);
    logger.debug(`Using base directory: "${baseDir}"`);
  }

  // Build the JavaScript module
  console.log(`\n🔨 Building JavaScript module from "${inputPath}"...`);
  const distDir = await buildJsModule(inputPath, {
    verbose: options.verbose,
    dryRun: options.dryRun,
  });
  console.log(`\n✅ Module built successfully to: "${distDir}"`);

  // Prepare package configuration
  console.log(`\n📝 Preparing package configuration...`);
  const pkgJsonPath = join(distDir, "package.json");
  let pkg: Record<string, unknown> = {};

  if (await exists(pkgJsonPath)) {
    try {
      if (options.verbose) logger.debug(`Reading existing package.json`);
      pkg = JSON.parse(await readTextFile(pkgJsonPath));
    } catch (error) {
      if (options.verbose) {
        logger.debug(`Error parsing package.json: ${error instanceof Error ? error.message : String(error)}`);
      }
      pkg = {};
    }
  }

  // Determine package name
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

  // Determine package version
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

  // Set standard package.json fields
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
  
  // Write package.json
  await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));
  console.log(`  → Updated package.json with name=${pkg.name} version=${pkg.version}`);

  // Handle dry run
  if (options.dryRun) {
    console.log(`\n🔍 Dry run mode enabled - package would be published to npm`);
    console.log(`  → Package would be viewable at: https://www.npmjs.com/package/${pkg.name}`);
    return;
  }

  // Actually publish to npm
  console.log(`\n🚀 Publishing package ${pkg.name}@${pkg.version} to npm...`);
  const publishCmd = ["npm", "publish", "--access", "public"];

  console.log(`  → Running: ${publishCmd.join(" ")}`);

  const process = runCmd({
    cmd: publishCmd,
    cwd: distDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await process.status;

  if (!status.success) {
    console.error(`\n❌ npm publish failed with exit code ${status.code}.`);
    exit(status.code);
  }

  console.log(`\n✅ Package published successfully to npm!`);
  console.log(`📦 View it at: https://www.npmjs.com/package/${pkg.name}`);
}
