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
import type { PublishSummary } from "./publish_summary.ts";

interface PublishJSROptions {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Load (or create) a jsr.json configuration from distDir.
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

  if (!config.name) {
    jsrUser = await configurePackageName(config, distDir, cliName, jsrUser, dryRun);
  } else if (typeof config.name === "string" && config.name.startsWith("@")) {
    // Parse jsrUser from the config.name if possible
    const match = config.name.match(/^@([^/]+)\//);
    if (match) {
      jsrUser = match[1];
    }
  }

  await configurePackageVersion(config, cliVersion, dryRun);
  setDefaultConfigFields(config);

  return { configPath, config, jsrUser };
}

/**
 * Configure package name, either from CLI args, prompting user, or auto-generating
 */
async function configurePackageName(
  config: Record<string, unknown>,
  distDir: string,
  cliName?: string,
  jsrUser?: string,
  dryRun?: boolean
): Promise<string> {
  const fallbackBase = basename(distDir)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "js-module";
  const defaultName = cliName ? cliName : `@${jsrUser}/${fallbackBase}`;
  
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

  // Return possibly updated jsrUser from package name
  if (typeof config.name === "string" && config.name.startsWith("@")) {
    const match = config.name.match(/^@([^/]+)\//);
    if (match) {
      return match[1];
    }
  }
  
  return jsrUser || "js-user";
}

/**
 * Configure package version from CLI args, auto-increment, or default value
 */
async function configurePackageVersion(
  config: Record<string, unknown>,
  cliVersion?: string,
  dryRun?: boolean
): Promise<void> {
  if (cliVersion) {
    config.version = cliVersion;
  } else if (config.version) {
    config.version = incrementPatch(String(config.version));
  } else {
    const defaultVersion = "0.0.1";
    
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
}

/**
 * Set default fields for the package configuration if missing
 */
function setDefaultConfigFields(config: Record<string, unknown>): void {
  // Set defaults if missing
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
}

/**
 * Ensure README exists or create a default one
 */
async function ensureReadmeExists(distDir: string, packageName: string): Promise<void> {
  const readmePath = join(distDir, "README.md");
  if (!(await exists(readmePath))) {
    console.log(`  → Creating default README.md`);
    await writeTextFile(
      readmePath,
      `# ${packageName}\n\nAuto-generated README for JSR package.\n`,
    );
  }
}

/**
 * Check if jsr CLI is available in the system
 */
async function checkJsrCliAvailable(cwd: string): Promise<boolean> {
  try {
    const whichJsr = runCmd({ 
      cmd: ["which", "jsr"], 
      cwd, 
      stdout: "piped", 
      stderr: "piped" 
    });
    const jsrStatus = await whichJsr.status;
    return jsrStatus.success;
  } catch {
    return false;
  }
}

/**
 * Check if deno is available in the system
 */
async function checkDenoAvailable(cwd: string): Promise<boolean> {
  try {
    const whichDeno = runCmd({ 
      cmd: ["which", "deno"], 
      cwd, 
      stdout: "piped", 
      stderr: "piped" 
    });
    const denoStatus = await whichDeno.status;
    return denoStatus.success;
  } catch {
    return false;
  }
}

/**
 * Publish using the jsr CLI
 */
async function publishWithJsrCli(
  cwd: string, 
  publishFlags: string[]
): Promise<boolean> {
  console.log(`  → Running publish command: jsr publish ${publishFlags.join(" ")}`);
  const jsrProcess = runCmd({
    cmd: ["jsr", "publish", ...publishFlags],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const jsrStatus = await jsrProcess.status;
  
  if (jsrStatus.success) {
    console.log("  → Published using jsr CLI");
    return true;
  } else {
    console.warn(`  → jsr publish failed with exit code ${jsrStatus.code}`);
    return false;
  }
}

/**
 * Publish using deno publish command
 */
async function publishWithDeno(
  cwd: string, 
  publishFlags: string[]
): Promise<boolean> {
  console.log(`  → Running publish command: deno publish ${publishFlags.join(" ")}`);
  const process = runCmd({
    cmd: ["deno", "publish", ...publishFlags],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await process.status;
  
  if (status.success) {
    console.log("  → Published using deno publish");
    return true;
  } else {
    console.error(`\n❌ deno publish failed with exit code ${status.code}`);
    return false;
  }
}

/**
 * Install jsr CLI using deno
 */
async function installJsrCli(cwd: string): Promise<boolean> {
  console.log("  → jsr CLI not found. Attempting to install jsr CLI...");
  const installJsr = runCmd({
    cmd: ["deno", "install", "--global", "-A", "-f", "-n", "jsr", "https://deno.land/x/jsr@latest/cli.ts"],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const installStatus = await installJsr.status;
  
  if (installStatus.success) {
    console.log("  → jsr CLI installed successfully.");
    return true;
  } else {
    console.warn("  → Failed to install jsr CLI.");
    return false;
  }
}

/**
 * Generate the success link for JSR publishing
 */
function generateSuccessLink(packageName: string, jsrUser: string, version: string): string {
  const packageNameWithoutPrefix = String(packageName).replace(/^@[^/]+\//, "");
  return `https://jsr.io/@${jsrUser}/${packageNameWithoutPrefix}@${version}`;
}

/**
 * Main JSR publishing function
 */
export async function publishJSR(options: PublishJSROptions): Promise<PublishSummary> {
  try {
    console.log("\n📦 Starting JSR package publishing process");
    Deno.env.set("SKIP_LOGIN_CHECK", "1");

    // Setup - resolve paths and build module
    const inputPath = resolve(options.what);
    const baseDir = dirname(inputPath);
    
    if (options.verbose) {
      logger.debug(`Using input path: "${inputPath}"`);
      logger.debug(`Using base directory: "${baseDir}"`);
    }

    // Build module
    console.log(`\n🔨 Building module from "${inputPath}"...`);
    const distDir = await buildJsModule(inputPath, {
      verbose: options.verbose,
      dryRun: options.dryRun
    });
    console.log(`\nℹ️ Module built to "${distDir}"`);

    // Configure JSR package
    console.log(`\n📝 Preparing JSR configuration...`);
    let jsrJsonBefore: Record<string, unknown> = {};
    try {
      jsrJsonBefore = await readJSON(join(distDir, "jsr.json"));
    } catch {/* ignore file not found or parse error */}
    
    const { configPath, config, jsrUser } = await getJsrConfig(
      distDir,
      options.name,
      options.version,
      options.dryRun
    );
    
    // Determine published version
    const publishedVersion = typeof jsrJsonBefore.version === "string" 
      ? jsrJsonBefore.version 
      : String(config.version);

    // Apply CLI name override if provided
    if (options.name) {
      config.name = options.name.startsWith("@")
        ? options.name
        : `@${jsrUser}/${options.name}`;
      console.log(`  → Using package name: "${config.name}"`);
    }

    // Ensure README exists
    await ensureReadmeExists(distDir, String(config.name));

    // Setup publishing flags
    const publishFlags = ["--allow-dirty"];
    if (options.dryRun) publishFlags.push("--dry-run");
    if (options.verbose) publishFlags.push("--verbose");

    // Attempt publishing
    let published = false;
    
    // Try jsr CLI first
    const jsrAvailable = await checkJsrCliAvailable(distDir);
    if (jsrAvailable) {
      published = await publishWithJsrCli(distDir, publishFlags);
      if (published) {
        await writeJSON(configPath, config);
        console.log(`  → Updated JSR config at "${configPath}"`);
        return {
          registry: "jsr",
          name: String(config.name),
          version: publishedVersion,
          link: generateSuccessLink(String(config.name), jsrUser, publishedVersion)
        };
      }
    }

    // Try deno if jsr failed or not available
    const denoAvailable = await checkDenoAvailable(distDir);
    if (denoAvailable) {
      published = await publishWithDeno(distDir, publishFlags);
      if (published) {
        await writeJSON(configPath, config);
        console.log(`  → Updated JSR config at "${configPath}"`);
        return {
          registry: "jsr",
          name: String(config.name),
          version: publishedVersion,
          link: generateSuccessLink(String(config.name), jsrUser, publishedVersion)
        };
      }
    }

    // If both jsr and deno aren't available, try to install jsr
    if (!jsrAvailable && !published && denoAvailable) {
      const jsrInstalled = await installJsrCli(distDir);
      if (jsrInstalled) {
        published = await publishWithJsrCli(distDir, publishFlags);
        if (published) {
          await writeJSON(configPath, config);
          console.log(`  → Updated JSR config at "${configPath}"`);
          return {
            registry: "jsr",
            name: String(config.name),
            version: publishedVersion,
            link: generateSuccessLink(String(config.name), jsrUser, publishedVersion)
          };
        }
      }
    }

    // If all publishing attempts failed
    const errorMessage = "JSR publish failed: Neither jsr nor deno is installed or available. Please install jsr (https://jsr.io/cli) or deno (https://deno.com/) to publish to JSR.";
    console.error(`\n❌ ${errorMessage}`);
    return {
      registry: "jsr",
      name: String(config.name),
      version: publishedVersion,
      link: `❌ ${errorMessage}`
    };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ JSR publish failed: ${errorMessage}`);
    return {
      registry: "jsr",
      name: options.name ?? '(auto)',
      version: options.version ?? '(auto)',
      link: `❌ ${errorMessage}`
    };
  }
}