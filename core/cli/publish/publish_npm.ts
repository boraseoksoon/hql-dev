// publish_npm.ts - NPM-specific publishing implementation
import {
  basename,
  dirname,
  getEnv,
  join,
  resolve,
  runCmd,
  writeTextFile,
  readTextFile,
} from "../../src/platform/platform.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { globalLogger as logger } from "../../src/logger.ts";
import { 
  MetadataFileType, 
  promptUser, 
  readJSONFile, 
  writeJSONFile,
  incrementPatchVersion,
  getCachedBuild
} from "./metadata_utils.ts";
import type { PublishSummary } from "./publish_summary.ts";
import { getNpmLatestVersion } from "./remote_registry.ts";
import { detectNpmError, ErrorType } from "./error_handlers.ts";

interface PublishNpmOptions {
  entryFile: string;
  version?: string;
  hasMetadata: boolean;
  metadataType?: MetadataFileType;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Determines the package name and version for NPM publishing
 * NOTE: Does NOT write to metadata files - that happens only after successful publish
 */
async function determineNpmPackageInfo(
  distDir: string,
  options: PublishNpmOptions
): Promise<{ packageName: string; packageVersion: string; config: Record<string, unknown> }> {
  // Load existing config or create a new one
  let config: Record<string, unknown> = {};
  let packageName: string;
  let packageVersion: string;
  
  // Determine where to find metadata
  const sourceDir = dirname(options.entryFile);
  let metadataSourcePath: string;
  
  // Check if metadata exists in source directory or dist directory
  if (options.hasMetadata) {
    if (await exists(join(sourceDir, "package.json"))) {
      metadataSourcePath = join(sourceDir, "package.json");
    } else if (await exists(join(sourceDir, "dist", "package.json"))) {
      metadataSourcePath = join(sourceDir, "dist", "package.json");
    } else {
      // Fallback
      metadataSourcePath = join(distDir, "package.json");
    }
    
    // Load existing metadata
    config = await readJSONFile(metadataSourcePath);
    logger.debug && logger.debug(`Loaded metadata from: ${metadataSourcePath}`);
    
    // If metadata exists, load it and use the name from it
    packageName = String(config.name || "");
    
    if (options.version) {
      // Use explicitly provided version
      packageVersion = options.version;
      console.log(`  → Using specified version: ${packageVersion}`);
    } else {
      // Robust version increment: find next available version
      let latestVersion: string | null = null;
      let attempts = 0;
      const maxAttempts = 10;
      try {
        latestVersion = await getNpmLatestVersion(packageName);
      } catch (error) {
        latestVersion = null;
      }
      let candidateVersion = latestVersion ? incrementPatchVersion(latestVersion) : (config.version ? incrementPatchVersion(String(config.version)) : "0.0.1");
      let foundAvailable = false;
      while (attempts < maxAttempts) {
        // Check if candidateVersion exists in registry
        let existsRemotely = false;
        try {
          const remoteLatest = await getNpmLatestVersion(packageName);
          if (remoteLatest && remoteLatest === candidateVersion) {
            existsRemotely = true;
          }
        } catch {}
        if (!existsRemotely) {
          foundAvailable = true;
          break;
        }
        candidateVersion = incrementPatchVersion(candidateVersion);
        attempts++;
      }
      // Always auto-select the version, do not prompt here
      if (foundAvailable) {
        packageVersion = candidateVersion;
        if (latestVersion) {
          console.log(`  → Found latest version on NPM: ${latestVersion}`);
        }
        console.log(`  → Using next available version: ${packageVersion}`);
      } else {
        // Fallback: use local package.json version
        const localVersion = config.version ? String(config.version) : "0.0.1";
        packageVersion = incrementPatchVersion(localVersion);
        console.log(`  → Could not find available version after ${maxAttempts} attempts. Using local package.json version increment: ${packageVersion}`);
      }
    }
  } else {
    // No metadata exists - we need to create it
    // Get module name from directory or prompt
    const moduleDir = dirname(options.entryFile);
    const defaultName = basename(moduleDir)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    
    // Always prompt for package name when no metadata exists
    if (options.dryRun) {
      packageName = defaultName;
      console.log(`  → Using auto-generated package name: ${packageName} (dry-run)`);
    } else {
      packageName = await promptUser(
        `Enter a name for your NPM package`,
        defaultName
      );
    }
    
    // Handle version based on CLI or prompt
    const defaultVersion = options.version || "0.0.1";
    if (options.dryRun) {
      packageVersion = defaultVersion;
      console.log(`  → Using default version: ${packageVersion} (dry-run)`);
    } else {
      // Prompt with defaultVersion (either CLI-provided or 0.0.1)
      packageVersion = await promptUser(`Enter version`, defaultVersion);
    }
    
    // Set up basic NPM configuration (but don't write it yet)
    config = {
      name: packageName,
      version: packageVersion,
      description: `HQL module: ${packageName}`,
      module: "./esm/index.js",
      main: "./esm/index.js",
      types: "./types/index.d.ts",
      files: ["esm", "types", "README.md"],
      type: "module",
      author: getEnv("USER") || getEnv("USERNAME") || "HQL User",
      license: "MIT"
    };
    
    console.log(`  → Will create new package.json file after successful publish`);
  }
  
  // Prepare the config with final values but don't write it yet
  config.name = packageName;
  // Don't update version yet - that happens after successful publish
  
  // Ensure standard fields are set
  config.description = config.description || `HQL module: ${packageName}`;
  config.module = config.module || "./esm/index.js";
  config.main = config.main || "./esm/index.js";
  config.types = config.types || "./types/index.d.ts";
  config.files = config.files || ["esm", "types", "README.md"];
  config.type = "module";
  config.author = config.author || getEnv("USER") || getEnv("USERNAME") || "HQL User";
  config.license = config.license || "MIT";
  
  return { packageName, packageVersion, config };
}

/**
 * Updates NPM metadata files after successful publish
 */
async function updateNpmMetadata(
  distDir: string, 
  packageName: string, 
  packageVersion: string, 
  config: Record<string, unknown>
): Promise<void> {
  // Update the config with the successful version
  config.version = packageVersion;
  
  // Write the package.json file
  const packageJsonPath = join(distDir, "package.json");
  await writeJSONFile(packageJsonPath, config);
  console.log(`  → Updated package.json file with version ${packageVersion}`);
}

/**
 * Ensures a README exists for the package
 */
async function ensureReadmeExists(distDir: string, packageName: string): Promise<void> {
  const readmePath = join(distDir, "README.md");
  if (!(await exists(readmePath))) {
    console.log(`  → Creating default README.md`);
    await writeTextFile(
      readmePath,
      `# ${packageName}\n\nGenerated HQL module.\n`,
    );
  }
}

/**
 * Runs NPM publish command
 */
async function runNpmPublish(
  distDir: string,
  options: { dryRun?: boolean }
): Promise<{ success: boolean; error?: string }> {
  if (options.dryRun) {
    console.log(`  → Skipping actual npm publish in dry-run mode`);
    return { success: true };
  }
  
  const publishCmd = ["npm", "publish", "--access", "public"];
  console.log(`  → Running: ${publishCmd.join(" ")}`);
  
  try {
    const process = runCmd({
      cmd: publishCmd,
      cwd: distDir,
      stdout: "inherit",
      stderr: "piped"
    });
    
    // Collect stderr for error analysis
    const errorChunks: Uint8Array[] = [];
    if (process.stderr) {
      for await (const chunk of process.stderr) {
        errorChunks.push(chunk);
        // Echo to stderr for visibility
        await Deno.stderr.write(chunk);
      }
    }
    
    const status = await process.status;
    
    if (status.success) {
      return { success: true };
    } else {
      const errorOutput = new TextDecoder().decode(
        new Uint8Array(errorChunks.flatMap(arr => [...arr]))
      );
      return { success: false, error: errorOutput };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Analyzes error output from NPM publish
 */
function analyzeNpmError(errorOutput: string): { type: ErrorType; message: string } {
  const errorInfo = detectNpmError(errorOutput);
  return {
    type: errorInfo.type,
    message: errorInfo.message
  };
}

/**
 * Main NPM publishing function
 */
export async function publishNpm(options: PublishNpmOptions): Promise<PublishSummary> {
  try {
    // Build the module from entry file (uses cache if already built by another publisher)
    console.log(`\n🔨 Building module from "${options.entryFile}"...`);
    const distDir = await getCachedBuild(options.entryFile, {
      verbose: options.verbose,
      dryRun: options.dryRun
    });
    console.log(`  → Module built successfully to: ${distDir}`);
    
    // Determine package info but don't write to metadata files yet
    console.log(`\n📝 Configuring NPM package...`);
    const { packageName, packageVersion, config } = await determineNpmPackageInfo(distDir, options);
    
    // Ensure a README exists
    await ensureReadmeExists(distDir, packageName);
    
    // Skip actual publishing in dry run mode
    if (options.dryRun) {
      console.log(`\n🔍 Dry run mode - package ${packageName}@${packageVersion} would be published to NPM`);
      
      // In dry run, we can update metadata as this won't actually publish
      await updateNpmMetadata(distDir, packageName, packageVersion, config);
      
      return {
        registry: "npm",
        name: packageName,
        version: packageVersion,
        link: `https://www.npmjs.com/package/${packageName}`
      };
    }
    
    // Write updated package.json before publishing
    await updateNpmMetadata(distDir, packageName, packageVersion, config);

    let attempt = 0;
    let maxRetries = 3;
    let lastError = null;
    let currentVersion = packageVersion;
    while (attempt <= maxRetries) {
      // Write updated package.json before publishing (in case version changed)
      await updateNpmMetadata(distDir, packageName, currentVersion, config);
      console.log(`\n🚀 Publishing ${packageName}@${currentVersion} to NPM...`);
      const publishResult = await runNpmPublish(distDir, { 
        dryRun: options.dryRun 
      });
      if (publishResult.success) {
        console.log(`\n✅ Successfully published ${packageName}@${currentVersion} to NPM`);
        await updateNpmMetadata(distDir, packageName, currentVersion, config);
        return {
          registry: "npm",
          name: packageName,
          version: currentVersion,
          link: `https://www.npmjs.com/package/${packageName}`
        };
      } else {
        const errorOutput = publishResult.error || "Unknown error";
        const errorAnalysis = analyzeNpmError(errorOutput);
        lastError = errorAnalysis.message;
        if (errorAnalysis.type === "version_conflict" && attempt < maxRetries) {
          // Fetch local package.json version and increment it for suggestion
          let localVersion = currentVersion;
          try {
            const pkgPath = join(distDir, "package.json");
            const pkgJson = await readJSONFile(pkgPath);
            if (pkgJson && typeof pkgJson.version === "string") {
              localVersion = pkgJson.version;
            }
          } catch {}
          const suggested = incrementPatchVersion(localVersion);
          const userInput = await promptUser(`NPM publish failed: Version ${currentVersion} already exists. Enter a new version to try`, suggested);
          currentVersion = userInput;
          attempt++;
          continue;
        } else {
          console.error(`\n❌ NPM publish failed: ${errorAnalysis.message}`);
          return {
            registry: "npm",
            name: packageName,
            version: currentVersion,
            link: `❌ ${errorAnalysis.message}`
          };
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ NPM publish failed: ${errorMessage}`);
    return {
      registry: "npm",
      name: options.hasMetadata ? "(from metadata)" : "(unknown)",
      version: options.version || "(auto)",
      link: `❌ ${errorMessage}`
    };
  }
}