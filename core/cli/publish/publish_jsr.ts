// publish_jsr.ts - JSR-specific publishing implementation
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
import { getJsrLatestVersion } from "./remote_registry.ts";
import { detectJsrError, ErrorType } from "./error_handlers.ts";

interface PublishJSROptions {
  entryFile: string;
  version?: string;
  hasMetadata: boolean;
  metadataType?: MetadataFileType;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Determines the package name and version for JSR publishing
 * NOTE: Does NOT write to metadata files - that happens only after successful publish
 */
async function determineJsrPackageInfo(
  distDir: string,
  options: PublishJSROptions
): Promise<{ packageName: string; packageVersion: string; config: Record<string, unknown> }> {
  // Load existing config or create a new one
  let config: Record<string, unknown> = {};
  let packageName: string;
  let packageVersion: string;
  
  // Determine where to find metadata
  const metadataType = options.metadataType || "jsr.json";
  const sourceDir = dirname(options.entryFile);
  let metadataSourcePath: string;
  
  // Check if metadata exists in source directory or dist directory
  if (options.hasMetadata) {
    if (await exists(join(sourceDir, metadataType))) {
      metadataSourcePath = join(sourceDir, metadataType);
    } else if (await exists(join(sourceDir, "dist", metadataType))) {
      metadataSourcePath = join(sourceDir, "dist", metadataType);
    } else {
      // Fallback
      metadataSourcePath = metadataType === "deno.json" ? 
        join(distDir, "deno.json") : join(distDir, "jsr.json");
    }
    
    // Load existing metadata
    config = await readJSONFile(metadataSourcePath);
    logger.debug && logger.debug(`Loaded metadata from: ${metadataSourcePath}`);
    
    // If metadata exists, use the name from it
    packageName = String(config.name || "");
    
    // Get user scope from name (format: @scope/name)
    const jsrUser = packageName.startsWith("@") ? 
      packageName.substring(1, packageName.indexOf("/")) : 
      getEnv("USER") || getEnv("USERNAME") || "user";

    if (options.version) {
      // Use explicitly provided version
      packageVersion = options.version;
      console.log(`  → Using specified version: ${packageVersion}`);
    } else {
      try {
        // Try to get latest version from JSR registry
        let latestVersion: string | null = null;
        
        if (packageName.startsWith("@")) {
          const [_, scope, name] = packageName.match(/^@([^/]+)\/(.+)$/) || [];
          if (scope && name) {
            latestVersion = await getJsrLatestVersion(scope, name);
            if (latestVersion) {
              console.log(`  → Found latest version on JSR: ${latestVersion}`);
            }
          }
        }
        
        if (latestVersion) {
          // Increment existing remote version
          packageVersion = incrementPatchVersion(latestVersion);
          console.log(`  → Incremented version to: ${packageVersion}`);
        } else if (config.version) {
          // Remote version not found (likely registry lag): increment local version for robustness
          packageVersion = incrementPatchVersion(String(config.version));
          console.log(`  → Remote version not found, incrementing local metadata version to: ${packageVersion}`);
        } else {
          // Default for new packages
          packageVersion = "0.0.1";
          console.log(`  → Using default initial version: ${packageVersion}`);
        }
      } catch (error) {
        // If anything fails, use metadata version (not incremented)
        packageVersion = config.version ? String(config.version) : "0.0.1";
        console.log(`  → Error fetching remote version, using: ${packageVersion}`);
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
      
    // Get JSR scope
    const jsrUser = getEnv("JSR_USER") || getEnv("USER") || getEnv("USERNAME") || "user";
    
    // Always prompt for package name when no metadata exists
    if (options.dryRun) {
      packageName = `@${jsrUser}/${defaultName}`;
      console.log(`  → Using auto-generated package name: ${packageName} (dry-run)`);
    } else {
      const moduleName = await promptUser(
        `Enter a project name for your JSR package`,
        defaultName
      );
      packageName = `@${jsrUser}/${moduleName}`;
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
    
    // Set up basic JSR configuration and WRITE IT IMMEDIATELY (before publish)
    config = {
      name: packageName,
      version: packageVersion,
      exports: "./esm/index.js",
      license: "MIT",
      publish: { include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] },
      description: `HQL module: ${packageName}`
    };
    // Write jsr.json and deno.json now
    await writeJSONFile(join(distDir, "jsr.json"), config);
    await writeJSONFile(join(distDir, "deno.json"), config);
    console.log(`  → Created new JSR metadata files (jsr.json, deno.json)`);
  }
  
  // Prepare the config with final values but don't write it yet
  config.name = packageName;
  // Don't update version yet - that happens after successful publish
  
  // Ensure standard fields are set
  config.exports = config.exports || "./esm/index.js";
  config.license = config.license || "MIT";
  config.description = config.description || `HQL module: ${packageName}`;
  config.publish = config.publish || { 
    include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] 
  };
  
  return { packageName, packageVersion, config };
}

/**
 * Updates JSR metadata files after successful publish
 */
async function updateJsrMetadata(
  distDir: string, 
  packageName: string, 
  packageVersion: string, 
  config: Record<string, unknown>
): Promise<void> {
  // Update the config with the successful version
  config.version = packageVersion;
  
  // Write both metadata files for JSR compatibility
  await writeJSONFile(join(distDir, "jsr.json"), config);
  await writeJSONFile(join(distDir, "deno.json"), config);
  
  console.log(`  → Updated JSR metadata files with version ${packageVersion}`);
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
 * Checks if command is available in PATH
 */
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

/**
 * Runs JSR publish command
 */
async function runJsrPublish(
  distDir: string,
  options: { dryRun?: boolean; verbose?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const publishFlags = ["--allow-dirty"];
  if (options.dryRun) publishFlags.push("--dry-run");
  if (options.verbose) publishFlags.push("--verbose");
  
  // Try to find the best command for publishing
  // 1. Try jsr command first
  const jsrAvailable = await checkCommandAvailable("jsr", distDir);
  if (jsrAvailable) {
    console.log(`  → Using jsr CLI for publishing`);
    try {
      const process = runCmd({
        cmd: ["jsr", "publish", ...publishFlags],
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
  
  // 2. Fall back to deno publish
  console.log(`  → jsr CLI not found, trying deno publish...`);
  try {
    const process = runCmd({
      cmd: ["deno", "publish", ...publishFlags],
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
 * Analyzes error output from JSR publish
 */
function analyzeJsrError(errorOutput: string): { type: ErrorType; message: string } {
  const errorInfo = detectJsrError(errorOutput);
  return {
    type: errorInfo.type,
    message: errorInfo.message
  };
}

/**
 * Generates a link to the published package
 */
function generatePackageLink(name: string, version: string): string {
  if (!name.startsWith("@")) {
    return `https://jsr.io/p/${name}@${version}`;
  }
  
  const [_, scope, pkgName] = name.match(/^@([^/]+)\/(.+)$/) || [];
  if (!scope || !pkgName) {
    return `https://jsr.io`;
  }
  
  return `https://jsr.io/@${scope}/${pkgName}@${version}`;
}

/**
 * Main JSR publishing function
 */
export async function publishJSR(options: PublishJSROptions): Promise<PublishSummary> {
  try {
    // Build the module from entry file (uses cache if already built by another publisher)
    console.log(`\n🔨 Building module from "${options.entryFile}"...`);
    const distDir = await getCachedBuild(options.entryFile, {
      verbose: options.verbose,
      dryRun: options.dryRun
    });
    console.log(`  → Module built successfully to: ${distDir}`);
    
    // Determine package info but don't write to metadata files yet
    console.log(`\n📝 Configuring JSR package...`);
    const { packageName, packageVersion, config } = await determineJsrPackageInfo(distDir, options);
    
    // Ensure a README exists
    await ensureReadmeExists(distDir, packageName);
    
    // Skip actual publishing in dry run mode
    if (options.dryRun) {
      console.log(`\n🔍 Dry run mode - package ${packageName}@${packageVersion} would be published to JSR`);
      
      // In dry run, we can update metadata as this won't actually publish
      await updateJsrMetadata(distDir, packageName, packageVersion, config);
      
      return {
        registry: "jsr",
        name: packageName,
        version: packageVersion,
        link: generatePackageLink(packageName, packageVersion)
      };
    }
    
    let attempt = 0;
    const maxRetries = 3;
    let currentVersion = packageVersion;
    while (attempt <= maxRetries) {
      // DO NOT update metadata before publishing!
      console.log(`\n🚀 Publishing ${packageName}@${currentVersion} to JSR...`);
      const publishResult = await runJsrPublish(distDir, { 
        dryRun: options.dryRun,
        verbose: options.verbose
      });
      if (publishResult.success) {
        console.log(`\n✅ Successfully published ${packageName}@${currentVersion} to JSR`);
        // Only update metadata after successful publish
        await updateJsrMetadata(distDir, packageName, currentVersion, config);
        return {
          registry: "jsr",
          name: packageName,
          version: currentVersion,
          link: generatePackageLink(packageName, currentVersion)
        };
      } else {
        const errorOutput = publishResult.error || "Unknown error";
        const errorAnalysis = analyzeJsrError(errorOutput);
        if (errorAnalysis.type === "version_conflict" && attempt < maxRetries) {
          // Fetch local metadata version and increment for suggestion
          let localVersion = currentVersion;
          try {
            const metaPath = join(distDir, options.metadataType || "deno.json");
            const metaJson = await readJSONFile(metaPath);
            if (metaJson && typeof metaJson.version === "string") {
              localVersion = metaJson.version;
            }
          } catch {}
          const suggested = incrementPatchVersion(localVersion);
          const userInput = await promptUser(`JSR publish failed: Version ${currentVersion} already exists. Enter a new version to try`, suggested);
          currentVersion = userInput;
          attempt++;
          continue;
        } else {
          // For all other errors, do NOT increment version, just fail or retry as-is.
          console.error(`\n❌ JSR publish failed: ${errorAnalysis.message}`);
          return {
            registry: "jsr",
            name: packageName,
            version: currentVersion,
            link: `❌ ${errorAnalysis.message}`
          };
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ JSR publish failed: ${errorMessage}`);
    return {
      registry: "jsr",
      name: options.hasMetadata ? "(from metadata)" : "(unknown)",
      version: options.version || "(auto)",
      link: `❌ ${errorMessage}`
    };
  }
}