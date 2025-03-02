// cli/publish/publish_jsr.ts - Improved version
import {
  join,
  resolve,
  readTextFile,
  writeTextFile,
  mkdir,
  runCmd,
  exit,
  makeTempDir,
  basename,
  dirname,
  getEnv,
} from "../../src/platform/platform.ts";
import { exists, copy } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";
import { prompt, incrementPatch, readJSON, writeJSON } from "./utils.ts";

/**
 * Load (or create) a jsr.json configuration from distDir.
 * If found, its name and version are used as defaults; otherwise, prompts the user.
 */
async function getJsrConfig(
  distDir: string,
  cliName?: string,
  cliVersion?: string,
): Promise<{ configPath: string; config: any; jsrUser: string }> {
  const configPath = join(distDir, "jsr.json");
  let config = await readJSON(configPath);
  let jsrUser = getEnv("JSR_USER") || "js-user";

  // If config.name exists, use it; otherwise, prompt.
  if (!config.name) {
    const fallbackBase = basename(distDir)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "js-module";
    const defaultName = cliName ? cliName : `@${jsrUser}/${fallbackBase}`;
    const enteredName = await prompt(`Enter JSR package name (default: "${defaultName}"):`, defaultName);
    config.name = enteredName.startsWith("@") ? enteredName : `@${jsrUser}/${enteredName}`;
  }
  // Parse jsrUser from the config.name if possible.
  if (config.name.startsWith("@")) {
    const match = config.name.match(/^@([^/]+)\//);
    if (match) {
      jsrUser = match[1];
    }
  }
  // For version: if CLI provided a version, use that; else auto-increment if exists; otherwise prompt.
  if (cliVersion) {
    config.version = cliVersion;
  } else if (config.version) {
    config.version = incrementPatch(config.version);
  } else {
    const defaultVersion = "0.0.1";
    config.version = await prompt(`Enter version (default: "${defaultVersion}"):`, defaultVersion);
  }
  // Set defaults if missing.
  config.exports = config.exports || "./esm/index.js";
  config.publish = config.publish || { include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] };
  return { configPath, config, jsrUser };
}

/**
 * Publishes a module to JSR using the configuration in jsr.json.
 */
export async function publishJSR(options: {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
}): Promise<void> {
  // Skip login check for development.
  Deno.env.set("SKIP_LOGIN_CHECK", "1");

  const inputPath = resolve(options.what);
  let baseDir = inputPath;
  try {
    const stat = await Deno.stat(inputPath);
    if (stat.isFile) {
      baseDir = dirname(inputPath);
    }
  } catch (error) {
    console.error(`\n❌ Error checking input path: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }

  console.log(`\n🔨 Building module from "${inputPath}"...`);
  const distDir = await buildJsModule(inputPath);
  console.log(`\nℹ️ Module built to "${distDir}"`);

  console.log(`\n📝 Reading/updating JSR configuration...`);
  const { configPath, config, jsrUser } = await getJsrConfig(distDir, options.name, options.version);

  // If CLI overrides name, use it.
  if (options.name) {
    config.name = options.name.startsWith("@") ? options.name : `@${jsrUser}/${options.name}`;
    console.log(`  → Using package name: "${config.name}"`);
  }
  await writeJSON(configPath, config);
  console.log(`  → Updated JSR config at "${configPath}"`);

  // Ensure README exists.
  const readmePath = join(distDir, "README.md");
  if (!(await exists(readmePath))) {
    console.log(`  → Creating default README.md`);
    await writeTextFile(readmePath, `# ${config.name}\n\nAuto-generated README for JSR package.\n`);
  }

  console.log(`\n🚀 Publishing ${config.name}@${config.version} to JSR...`);
  const tempDir = await makeTempDir();
  console.log(`  → Created temporary directory: "${tempDir}"`);
  await copy(distDir, tempDir, { overwrite: true });
  console.log(`  → Copied module files to temporary directory`);

  const publishFlags = ["--allow-dirty"];
  if (options.verbose) publishFlags.push("--verbose");
  
  console.log(`  → Running publish command: deno publish ${publishFlags.join(' ')}`);
  const publishProc = runCmd({
    cmd: ["deno", "publish", ...publishFlags],
    cwd: tempDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await publishProc.status();
  publishProc.close();

  if (!status.success) {
    console.error(`\n❌ JSR publish failed with code ${status.code}.`);
    exit(status.code);
  }

  console.log(`\n✅ JSR publish succeeded!\n📦 View your package at: https://jsr.io/packages/${encodeURIComponent(config.name)}`);
}