// cli/publish/publish_jsr.ts - Streamlined JSR publishing implementation
import {
  basename,
  dirname,
  exit,
  getEnv,
  join,
  makeTempDir,
  resolve,
  runCmd,
  writeTextFile,
} from "../../src/platform/platform.ts";
import { copy, exists } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";
import { incrementPatch, prompt, readJSON, writeJSON } from "./utils.ts";
import { globalLogger as logger } from "../../src/logger.ts";

interface PublishJSROptions {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Load (or create) a jsr.json configuration from distDir.
 * If found, its name and version are used as defaults; otherwise, prompts the user.
 */
async function getJsrConfig(
  distDir: string,
  cliName?: string,
  cliVersion?: string,
  dryRun?: boolean
): Promise<{ configPath: string; config: Record<string, unknown>; jsrUser: string }> {
  const configPath = join(distDir, "jsr.json");
  const config = await readJSON(configPath);
  let jsrUser = getEnv("JSR_USER") || getEnv("USER") || getEnv("USERNAME") || "js-user";

  // If config.name exists, use it; otherwise, auto-generate or prompt
  if (!config.name) {
    const fallbackBase = basename(distDir)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "js-module";
    const defaultName = cliName ? cliName : `@${jsrUser}/${fallbackBase}`;
    
    // In dry-run mode or if DRY_RUN_PUBLISH is set, use default name without prompting
    if (dryRun || Deno.env.get("DRY_RUN_PUBLISH") === "1") {
      console.log(`  → Using auto-generated package name: "${defaultName}" (dry-run mode)`); 
      config.name = defaultName;
    } else {
      const enteredName = await prompt(
        `Enter JSR package name (default: "${defaultName}"):`,
        defaultName
      );
      config.name = enteredName.startsWith("@")
        ? enteredName
        : `@${jsrUser}/${enteredName}`;
    }
  }

  // Parse jsrUser from the config.name if possible.
  if (typeof config.name === "string" && config.name.startsWith("@")) {
    const match = config.name.match(/^@([^/]+)\//);
    if (match) {
      jsrUser = match[1];
    }
  }

  // For version: if CLI provided a version, use that; else auto-increment if exists; otherwise prompt/default
  if (cliVersion) {
    config.version = cliVersion;
  } else if (config.version) {
    config.version = incrementPatch(String(config.version));
  } else {
    const defaultVersion = "0.0.1";
    
    // In dry-run mode or if DRY_RUN_PUBLISH is set, use default version without prompting
    if (dryRun || Deno.env.get("DRY_RUN_PUBLISH") === "1") {
      console.log(`  → Using default version: "${defaultVersion}" (dry-run mode)`);
      config.version = defaultVersion;
    } else {
      config.version = await prompt(
        `Enter version (default: "${defaultVersion}"):`,
        defaultVersion
      );
    }
  }

  // Set defaults if missing.
  config.exports = config.exports || "./esm/index.js";
  config.publish = config.publish ||
    { include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] };

  // Add helpful metadata if missing
  if (!config.description) {
    config.description = `HQL module: ${config.name}`;
  }

  if (!config.license) {
    config.license = "MIT";
  }

  return { configPath, config, jsrUser };
}

/**
 * Publishes a module to JSR using the configuration in jsr.json.
 */
export async function publishJSR(options: PublishJSROptions): Promise<void> {
  console.log("\n📦 Starting JSR package publishing process");

  // Skip login check for development.
  Deno.env.set("SKIP_LOGIN_CHECK", "1");

  // Resolve the input path (should already be resolved to a file by resolveEntryPoint)
  const inputPath = resolve(options.what);
  const baseDir = dirname(inputPath);

  if (options.verbose) {
    logger.debug(`Using input path: "${inputPath}"`);
    logger.debug(`Using base directory: "${baseDir}"`);
  }

  // Build the module
  console.log(`\n🔨 Building module from "${inputPath}"...`);
  const distDir = await buildJsModule(inputPath, {
    verbose: options.verbose,
    dryRun: options.dryRun
  });
  console.log(`\nℹ️ Module built to "${distDir}"`);

  // Prepare JSR configuration
  console.log(`\n📝 Preparing JSR configuration...`);
  const { configPath, config, jsrUser } = await getJsrConfig(
    distDir,
    options.name,
    options.version,
    options.dryRun
  );

  // If CLI overrides name, use it.
  if (options.name) {
    config.name = options.name.startsWith("@")
      ? options.name
      : `@${jsrUser}/${options.name}`;
    console.log(`  → Using package name: "${config.name}"`);
  }

  // Ensure README exists BEFORE publish
  const readmePath = join(distDir, "README.md");
  if (!(await exists(readmePath))) {
    console.log(`  → Creating default README.md`);
    await writeTextFile(
      readmePath,
      `# ${config.name}\n\nAuto-generated README for JSR package.\n`,
    );
  }

  // Handle dry run
  if (options.dryRun) {
    console.log(`\n🔍 Dry run mode enabled - would publish ${config.name}@${config.version} to JSR`);
    console.log(`  → Package would be viewable at: https://jsr.io/packages/${encodeURIComponent(String(config.name))}`);
    return;
  }

  // Start publishing process
  console.log(`\n🚀 Publishing ${config.name}@${config.version} to JSR...`);
  const tempDir = await makeTempDir();
  if (options.verbose) {
    logger.debug(`Created temporary directory: "${tempDir}"`);
  }

  await copy(distDir, tempDir, { overwrite: true });
  if (options.verbose) {
    logger.debug(`Copied module files to temporary directory`);
  }

  const publishFlags = ["--allow-dirty"];
  if (options.verbose) publishFlags.push("--verbose");

  console.log(`  → Running publish command: deno publish ${publishFlags.join(" ")}`);

  // Only attempt Deno publish; no fallback methods.
  let errorMessage = "";
  try {
    const process = runCmd({
      cmd: ["deno", "publish", ...publishFlags],
      cwd: tempDir,
      stdout: "inherit",
      stderr: "inherit",
    });
    const status = await process.status;
    if (!status.success) {
      errorMessage = `deno publish failed with exit code ${status.code}`;
      console.error(`\n❌ JSR publish failed: ${errorMessage}`);
      exit(status.code);
    }
  } catch (error) {
    errorMessage = `deno publish error: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`\n❌ JSR publish failed: ${errorMessage}`);
    exit(1);
  }

  // Only after successful publish, update jsr.json with the new version
  await writeJSON(configPath, config);
  console.log(`  → Updated JSR config at "${configPath}"`);

  console.log(`\n✅ JSR publish succeeded!`);
  console.log(`📦 View your package at: https://jsr.io/packages/${encodeURIComponent(String(config.name))}`);
}
