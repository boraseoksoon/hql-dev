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
import type { PublishSummary } from "./publish_summary.ts";

export async function publishJSR(options: PublishJSROptions): Promise<PublishSummary> {
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
  // Read the version before any possible increment for accurate summary
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
  const publishedVersion = typeof jsrJsonBefore.version === "string" ? jsrJsonBefore.version : String(config.version);

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

  // Variables needed throughout the process
  let published = false;
  let errorMessage = "";
  let tempDir = distDir;
  let jsrAvailable = false;
  let denoAvailable = false;

  try {
    // Handle dry run
    if (options.dryRun) {
      // Prepare publish flags
      const publishFlags = ["--allow-dirty"];
      if (options.dryRun) publishFlags.push("--dry-run");
      if (options.verbose) publishFlags.push("--verbose");

      // Check if jsr CLI is installed
      try {
        const whichJsr = runCmd({ cmd: ["which", "jsr"], cwd: distDir, stdout: "piped", stderr: "piped" });
        const jsrStatus = await whichJsr.status;
        jsrAvailable = jsrStatus.success;
      } catch {}
      
      if (jsrAvailable) {
        // Use jsr CLI immediately if found
        console.log(`  → Running publish command: jsr publish ${publishFlags.join(" ")}`);
        const jsrProcess = runCmd({
          cmd: ["jsr", "publish", ...publishFlags],
          cwd: distDir,
          stdout: "inherit",
          stderr: "inherit",
        });
        const jsrStatus = await jsrProcess.status;
        if (jsrStatus.success) {
          published = true;
          console.log("  → Published using jsr CLI");
          await writeJSON(configPath, config);
          console.log(`  → Updated JSR config at "${configPath}"`);
          return {
            registry: "jsr",
            name: String(config.name),
            version: publishedVersion,
            link: `https://jsr.io/@${jsrUser}/${String(config.name).replace(/^@[^/]+\//, "")}@${publishedVersion}`
          };
        } else {
          errorMessage = `jsr publish failed with exit code ${jsrStatus.code}`;
          console.warn(`  → jsr publish failed. Reason: ${errorMessage}`);
          return {
            registry: "jsr",
            name: String(config.name),
            version: publishedVersion,
            link: `❌ ${errorMessage}`
          };
        }
      }

      // If jsr CLI is not installed, check if deno is installed
      try {
        const whichDeno = runCmd({ cmd: ["which", "deno"], cwd: distDir, stdout: "piped", stderr: "piped" });
        const denoStatus = await whichDeno.status;
        denoAvailable = denoStatus.success;
      } catch {}
      
      if (denoAvailable) {
        // Use deno publish immediately if found
        console.log(`  → Running publish command: deno publish ${publishFlags.join(" ")}`);
        const process = runCmd({
          cmd: ["deno", "publish", ...publishFlags],
          cwd: distDir,
          stdout: "inherit",
          stderr: "inherit",
        });
        const status = await process.status;
        if (status.success) {
          published = true;
          console.log("  → Published using deno publish");
          await writeJSON(configPath, config);
          console.log(`  → Updated JSR config at "${configPath}"`);
          return {
            registry: "jsr",
            name: String(config.name),
            version: publishedVersion,
            link: `https://jsr.io/@${jsrUser}/${String(config.name).replace(/^@[^/]+\//, "")}@${publishedVersion}`
          };
        } else {
          errorMessage = `deno publish failed with exit code ${status.code}`;
          console.error(`\n❌ JSR publish failed: ${errorMessage}`);
          return {
            registry: "jsr",
            name: String(config.name),
            version: publishedVersion,
            link: `❌ ${errorMessage}`
          };
        }
      }

      // If neither jsr nor deno is installed, attempt to install jsr
      console.log("  → jsr CLI not found. Attempting to install jsr CLI...");
      const installJsr = runCmd({
        cmd: ["deno", "install", "--global", "-A", "-f", "-n", "jsr", "https://deno.land/x/jsr@latest/cli.ts"],
        cwd: distDir,
        stdout: "inherit",
        stderr: "inherit",
      });
      const installStatus = await installJsr.status;
      if (installStatus.success) {
        console.log("  → jsr CLI installed successfully.");
        // Try jsr CLI again after install
        const jsrProcess = runCmd({
          cmd: ["jsr", "publish", ...publishFlags],
          cwd: distDir,
          stdout: "inherit",
          stderr: "inherit",
        });
        const jsrStatus = await jsrProcess.status;
        if (jsrStatus.success) {
          published = true;
          console.log("  → Published using jsr CLI");
          await writeJSON(configPath, config);
          console.log(`  → Updated JSR config at "${configPath}"`);
          return {
            registry: "jsr",
            name: String(config.name),
            version: publishedVersion,
            link: `https://jsr.io/@${jsrUser}/${String(config.name).replace(/^@[^/]+\//, "")}@${publishedVersion}`
          };
        } else {
          errorMessage = `jsr publish failed with exit code ${jsrStatus.code}`;
          console.warn(`  → jsr publish failed. Reason: ${errorMessage}`);
          return {
            registry: "jsr",
            name: String(config.name),
            version: publishedVersion,
            link: `❌ ${errorMessage}`
          };
        }
      } else {
        errorMessage = "Failed to install jsr CLI. Please install jsr (https://jsr.io/docs/cli) manually.";
        console.warn("  → " + errorMessage);
        return {
          registry: "jsr",
          name: String(config.name),
          version: publishedVersion,
          link: `❌ ${errorMessage}`
        };
      }
    }
    
    // If jsr still not available or failed, try deno publish ONLY if jsr install failed AND deno is installed
    if (!published && !jsrAvailable) {
      try {
        const whichDeno = runCmd({ cmd: ["which", "deno"], cwd: tempDir, stdout: "piped", stderr: "piped" });
        const denoStatus = await whichDeno.status;
        denoAvailable = denoStatus.success;
      } catch {}
      
      if (!denoAvailable) {
        errorMessage = "Neither jsr CLI nor deno is installed. Please install jsr (https://jsr.io/docs/cli) or deno (https://deno.com/) to publish to JSR.";
        console.error("\n❌ " + errorMessage);
        return {
          registry: "jsr",
          name: String(config.name),
          version: publishedVersion,
          link: `❌ ${errorMessage}`
        };
      }
      
      // If deno is available, fallback to deno publish
      if (denoAvailable) {
        // Prepare publish flags if not done earlier
        const publishFlags = ["--allow-dirty"];
        if (options.dryRun) publishFlags.push("--dry-run");
        if (options.verbose) publishFlags.push("--verbose");
        
        try {
          console.log(`  → Running publish command: deno publish ${publishFlags.join(" ")}`);
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
            return {
              registry: "jsr",
              name: String(config.name),
              version: publishedVersion,
              link: `❌ ${errorMessage}`
            };
          } else {
            published = true;
            console.log("  → Published using deno publish (fallback)");
          }
        } catch (error) {
          errorMessage = `deno publish error: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`\n❌ JSR publish failed: ${errorMessage}`);
          return {
            registry: "jsr",
            name: String(config.name),
            version: publishedVersion,
            link: `❌ ${errorMessage}`
          };
        }
      }
    }

    if (!published) {
      errorMessage = "JSR publish failed: Neither jsr nor deno is installed or available. Please install jsr (https://jsr.io/cli) or deno (https://deno.com/) to publish to JSR.";
      console.error("\n❌ " + errorMessage);
      return {
        registry: "jsr",
        name: String(config.name),
        version: publishedVersion,
        link: `❌ ${errorMessage}`
      };
    }

    // Only after successful publish, update jsr.json with the new version
    await writeJSON(configPath, config);
    console.log(`  → Updated JSR config at "${configPath}"`);

    // Always use the version BEFORE increment for summary (the published version)
    return {
      registry: "jsr",
      name: String(config.name),
      version: publishedVersion,
      link: `https://jsr.io/@${jsrUser}/${String(config.name).replace(/^@[^/]+\//, "")}@${publishedVersion}`
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("\n❌ JSR publish failed: " + errorMessage);
    return {
      registry: "jsr",
      name: options.name ?? '(auto)',
      version: options.version ?? '(auto)',
      link: `❌ ${errorMessage}`
    };
  }
}