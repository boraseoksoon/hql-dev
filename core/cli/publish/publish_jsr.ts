// cli/publish/publish_jsr.ts - Streamlined JSR publishing implementation
import {
  basename,
  dirname,
  getEnv,
  join,
  resolve,
  runCmd,
  writeTextFile,
  readTextFile,
  cwd,
} from "../../src/platform/platform.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";
import { incrementPatch, prompt } from "./utils.ts";
import { readJSON, writeJSON } from "@core/common/json.ts";
import { globalLogger as logger } from "../../src/logger.ts";
import type { PublishSummary } from "./publish_summary.ts";
import { getJsrLatestVersion, checkJsrPublishPermission } from "./remote_registry.ts";

interface PublishJSROptions {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

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
    const match = config.name.match(/^@([^/]+)\//);
    if (match) {
      jsrUser = match[1];
    }
  }

  await configurePackageVersion(config, cliVersion, dryRun);
  setDefaultConfigFields(config);

  return { configPath, config, jsrUser };
}

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
    // Always prompt for project name if cliName is not provided (from scratch)
    let enteredName = cliName;
    if (!cliName) {
      while (true) {
        enteredName = await prompt(
          `Enter a project name for your new JSR package (required, e.g. "my-lib"):`,
          fallbackBase
        );
        // Only allow non-empty, non-whitespace project names
        if (enteredName && enteredName.trim().length > 0) {
          enteredName = enteredName.trim();
          break;
        } else {
          console.log("  → Project name is required. Please enter a valid name.");
        }
      }
    }
    // Always scope with jsrUser
    config.name = (enteredName as string).startsWith("@")
      ? (enteredName as string)
      : `@${jsrUser}/${enteredName}`;
  }

  if (typeof config.name === "string" && config.name.startsWith("@")) {
    const match = config.name.match(/^@([^/]+)\//);
    if (match) {
      return match[1];
    }
  }
  return jsrUser || "js-user";
}

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

  // Check remote JSR registry for latest version and permissions
  if (typeof config.name === "string" && typeof config.version === "string") {
    const match = config.name.match(/^@([^/]+)\/(.+)$/);
    if (match) {
      const scope = match[1];
      const name = match[2];
      const remoteVersion = await getJsrLatestVersion(scope, name);
      if (remoteVersion === config.version) {
        throw new Error(`❌ Version ${config.version} for package ${config.name} is already published on JSR.`);
      }
      const canPublish = await checkJsrPublishPermission(scope, name);
      if (!canPublish) {
        throw new Error(`❌ You do not have permission to publish to the JSR package ${config.name}.`);
      }
    }
  }
}


function setDefaultConfigFields(config: Record<string, unknown>): void {
  config.exports = config.exports || "./esm/index.js";
  config.publish = config.publish ||
    { include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] };

  if (!config.description) {
    config.description = `HQL module: ${config.name}`;
  }

  if (!config.license) {
    config.license = "MIT";
  }
}

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

async function checkCommandAvailable(cmd: string, cwd: string): Promise<boolean> {
  try {
    const process = runCmd({ 
      cmd: ["which", cmd], 
      cwd, 
      stdout: "piped", 
      stderr: "piped" 
    });
    const status = await process.status;
    return status.success;
  } catch {
    return false;
  }
}

async function publishWithCommand(
  cmd: string,
  subcommand: string,
  cwd: string, 
  publishFlags: string[]
): Promise<{ success: boolean; errorMessage?: string; authDenied?: boolean }> {
  console.log(`  → Running publish command: ${cmd} ${subcommand} ${publishFlags.join(" ")}`);
  
  // Capture both output and error for analysis without re-running the command
  const process = runCmd({
    cmd: [cmd, subcommand, ...publishFlags],
    cwd,
    stderr: "piped",
    stdout: "inherit", // Keep stdout visible to user
  });
  
  // Collect stderr in chunks
  const errorChunks: Uint8Array[] = [];
  if (process.stderr) {
    for await (const chunk of process.stderr) {
      errorChunks.push(chunk);
      
      // Also write chunk to stderr to maintain visibility to user
      await Deno.stderr.write(chunk);
    }
  }
  
  const status = await process.status;
  const errorOutput = errorChunks.length > 0 
    ? new TextDecoder().decode(concatUint8Arrays(errorChunks)) 
    : "";
  
  if (status.success) {
    console.log(`  → Published using ${cmd} ${subcommand}`);
    return { success: true };
  } else {
    console.error(`\n❌ ${cmd} ${subcommand} failed with exit code ${status.code}`);
    
    // Check for authorization denied error
    const isAuthDenied = errorOutput.includes("authorization has been denied") || 
                        errorOutput.includes("authorizationDenied") ||
                        errorOutput.includes("Failed to exchange authorization");
    
    if (isAuthDenied) {
      const errorMessage = "JSR publish failed: Authorization was denied by the user in the web prompt.";
      return { 
        success: false, 
        errorMessage,
        authDenied: true
      };
    }
    
    return { success: false };
  }
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

function generateSuccessLink(packageName: string, jsrUser: string, version: string): string {
  const packageNameWithoutPrefix = String(packageName).replace(/^@[^/]+\//, "");
  return `https://jsr.io/@${jsrUser}/${packageNameWithoutPrefix}@${version}`;
}

export async function publishJSR(options: PublishJSROptions): Promise<PublishSummary> {
  try {
    console.log("\n📦 Starting JSR package publishing process");
    Deno.env.set("SKIP_LOGIN_CHECK", "1");

    const inputPath = resolve(options.what);
    const baseDir = dirname(inputPath);
    
    if (options.verbose) {
      logger.debug(`Using input path: "${inputPath}"`);
      logger.debug(`Using base directory: "${baseDir}"`);
    }

    console.log(`\n🔨 Building module from "${inputPath}"...`);
    const distDir = await buildJsModule(inputPath, {
      verbose: options.verbose,
      dryRun: options.dryRun
    });

    // --- PATCH: Copy deno.json/jsr.json to distDir if present in baseDir ---
    const configFiles = ["deno.json", "deno.jsonc", "jsr.json", "jsr.jsonc"];
    let _configFound = false;
    for (const file of configFiles) {
      const srcPath = join(baseDir, file);
      const destPath = join(distDir, file);
      if (await exists(srcPath)) {
        await writeTextFile(destPath, await readTextFile(srcPath));
        _configFound = true;
        if (options.verbose) {
          logger.debug(`Copied ${file} to dist directory for JSR publish`);
        }
      }
    }
    // --- END PATCH ---
    // --- JIT config generation if missing ---
    const jsrJsonPath = join(distDir, "jsr.json");
    const denoJsonPath = join(distDir, "deno.json");
    if (!(await exists(jsrJsonPath)) && !(await exists(denoJsonPath))) {
      // Smart defaults
      const fallbackBase = basename(baseDir).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "js-module";
      const jsrUser = getEnv("JSR_USER") || getEnv("USER") || getEnv("USERNAME") || "js-user";
      const smartName = options.name ? (options.name.startsWith("@") ? options.name : `@${jsrUser}/${options.name}`) : `@${jsrUser}/${fallbackBase}`;
      const smartVersion = options.version || "0.0.1";
      const jsrConfig = {
        name: smartName,
        version: smartVersion,
        exports: "./esm/index.js",
        license: "MIT",
        publish: { include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] },
        description: `HQL module: ${smartName}`
      };
      await writeTextFile(jsrJsonPath, JSON.stringify(jsrConfig, null, 2));
      await writeTextFile(denoJsonPath, JSON.stringify(jsrConfig, null, 2));
      console.log(`  → Auto-generated jsr.json and deno.json in dist directory`);
    }
    // --- END JIT config generation ---
    console.log(`\nℹ️ Module built to "${distDir}"`);

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
    
    const publishedVersion = typeof jsrJsonBefore.version === "string" 
      ? jsrJsonBefore.version 
      : String(config.version);

    if (options.name) {
      config.name = options.name.startsWith("@")
        ? options.name
        : `@${jsrUser}/${options.name}`;
      console.log(`  → Using package name: "${config.name}"`);
    }

    await ensureReadmeExists(distDir, String(config.name));

    const publishFlags = ["--allow-dirty"];
    if (options.dryRun) publishFlags.push("--dry-run");
    // Only add --verbose for jsr CLI, not deno
    const jsrPublishFlags = [...publishFlags];
    if (options.verbose) jsrPublishFlags.push("--verbose");

    // Try publishing strategies in order
    
    // 1. Try using jsr CLI if available
    const jsrAvailable = await checkCommandAvailable("jsr", distDir);
    if (jsrAvailable) {
      const jsrResult = await publishWithCommand("jsr", "publish", distDir, jsrPublishFlags);
      
      // On success, return immediately
      if (jsrResult.success) {
        await writeJSON(configPath, config);
        console.log(`  → Updated JSR config at "${configPath}"`);
        return {
          registry: "jsr",
          name: String(config.name),
          version: publishedVersion,
          link: generateSuccessLink(String(config.name), jsrUser, publishedVersion)
        };
      }
      
      // If authorization was denied, don't try other methods - user explicitly said no
      if (jsrResult.authDenied) {
        return {
          registry: "jsr",
          name: String(config.name),
          version: publishedVersion,
          link: `❌ ${jsrResult.errorMessage}`
        };
      }
    }

    // 2. Try using deno publish if jsr isn't available or failed (but not due to auth denial)
    const denoAvailable = await checkCommandAvailable("deno", distDir);
    if (denoAvailable) {
      const denoResult = await publishWithCommand("deno", "publish", distDir, publishFlags);
      
      // On success, return immediately
      if (denoResult.success) {
        await writeJSON(configPath, config);
        console.log(`  → Updated JSR config at "${configPath}"`);
        return {
          registry: "jsr",
          name: String(config.name),
          version: publishedVersion,
          link: generateSuccessLink(String(config.name), jsrUser, publishedVersion)
        };
      }
      
      // If authorization was denied, return the error and don't try other methods
      if (denoResult.authDenied) {
        return {
          registry: "jsr",
          name: String(config.name),
          version: publishedVersion,
          link: `❌ ${denoResult.errorMessage}`
        };
      }
      
      // For other errors, continue to next strategy
      if (denoResult.errorMessage) {
        console.warn(`  → ${denoResult.errorMessage}`);
      }
    }

    // 3. Try installing jsr CLI if neither option worked so far
    if (!options.dryRun && !await checkCommandAvailable("jsr", cwd)) {
      const installed = await installJsrCli(cwd);
      if (!installed) {
        throw new Error("❌ Failed to install jsr CLI. Please install it manually and try again.");
      }
      // After install, user should rerun the publish command
      console.error("jsr CLI was installed. Please rerun your publish command.");
      return {
        registry: "jsr",
        name: String(config.name),
        version: publishedVersion,
        link: "jsr CLI was installed. Please rerun your publish command."
      };
    }

    // If all publishing attempts failed (not due to auth denial)
    const errorInfo = detectJsrError("Neither jsr nor deno is installed or available");
    console.error(`\n${errorInfo.message}`);
    return {
      registry: "jsr",
      name: String(config.name),
      version: publishedVersion,
      link: errorInfo.message
    };
    
  } catch (err) {
    // Fallback error handler if handlePublishError is missing
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      registry: "jsr",
      name: options.name ?? '(auto)',
      version: options.version ?? '(auto)',
      link: `❌ ${errorMsg.split('\n')[0]}`,
    };
  }
}