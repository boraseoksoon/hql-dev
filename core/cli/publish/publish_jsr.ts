// publish_jsr.ts - JSR-specific publishing implementation
import {
  basename,
  dirname,
  getEnv,
  join,
  runCmd,
  writeTextFile,
} from "../../src/platform/platform.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { globalLogger as logger } from "../../src/logger.ts";
import { 
  MetadataFileType, 
  promptUser, 
  readJSONFile, 
  writeJSONFile,
  incrementPatchVersion,
  getCachedBuild,
  ensureReadmeExists
} from "./metadata_utils.ts";
import type { PublishSummary } from "./publish_summary.ts";
import { getJsrLatestVersion } from "./remote_registry.ts";

interface PublishJSROptions {
  entryFile: string;
  version?: string;
  hasMetadata: boolean;
  metadataType?: MetadataFileType;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Creates or updates JSR metadata file
 */
async function configureJsrMetadata(
  distDir: string,
  options: PublishJSROptions
): Promise<{ packageName: string; packageVersion: string }> {
  // Load existing config or create a new one
  let config: Record<string, unknown> = {};
  let packageName: string;
  let packageVersion: string;
  
  // Determine where to find and save metadata
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
  }
  
  // Determine target paths for new/updated metadata files
  const metadataPath = metadataType === "deno.json" ? 
    join(distDir, "deno.json") : join(distDir, "jsr.json");
  
  if (options.hasMetadata) {
    // If metadata exists, load it and use the name from it
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
          // Fall back to metadata version + 0.0.1
          packageVersion = incrementPatchVersion(String(config.version));
          console.log(`  → Remote version not found, using metadata version + 0.0.1: ${packageVersion}`);
        } else {
          // Default for new packages
          packageVersion = "0.0.1";
          console.log(`  → Using default initial version: ${packageVersion}`);
        }
      } catch (error) {
        // If anything fails, use metadata version + 0.0.1
        packageVersion = config.version ? 
          incrementPatchVersion(String(config.version)) : 
          "0.0.1";
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
    
    // Set up basic JSR configuration
    config = {
      name: packageName,
      version: packageVersion,
      exports: "./esm/index.js",
      license: "MIT",
      publish: { include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] },
      description: `HQL module: ${packageName}`
    };
    
    console.log(`  → Creating new JSR metadata file: ${metadataPath}`);
  }
  
  // Update the config with final values
  config.name = packageName;
  config.version = packageVersion;
  
  // Ensure standard fields are set
  config.exports = config.exports || "./esm/index.js";
  config.license = config.license || "MIT";
  config.description = config.description || `HQL module: ${packageName}`;
  config.publish = config.publish || { 
    include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] 
  };
  
  // Write both metadata files for JSR compatibility
  await writeJSONFile(join(distDir, "jsr.json"), config);
  await writeJSONFile(join(distDir, "deno.json"), config);
  
  console.log(`  → Updated JSR metadata files in dist directory`);
  
  return { packageName, packageVersion };
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
    
    // Configure package metadata (create or update)
    console.log(`\n📝 Configuring JSR package...`);
    const { packageName, packageVersion } = await configureJsrMetadata(distDir, options);
    
    // Ensure a README exists
    await ensureReadmeExists(distDir, packageName);
    
    // Skip actual publishing in dry run mode
    if (options.dryRun) {
      console.log(`\n🔍 Dry run mode - package ${packageName}@${packageVersion} would be published to JSR`);
      return {
        registry: "jsr",
        name: packageName,
        version: packageVersion,
        link: generatePackageLink(packageName, packageVersion)
      };
    }
    
    // Publish to JSR
    console.log(`\n🚀 Publishing ${packageName}@${packageVersion} to JSR...`);
    const publishResult = await runJsrPublish(distDir, { 
      dryRun: options.dryRun,
      verbose: options.verbose
    });
    
    if (publishResult.success) {
      console.log(`\n✅ Successfully published ${packageName}@${packageVersion} to JSR`);
      return {
        registry: "jsr",
        name: packageName,
        version: packageVersion,
        link: generatePackageLink(packageName, packageVersion)
      };
    } else {
      const errorMessage = publishResult.error || "Unknown error";
      console.error(`\n❌ JSR publish failed: ${errorMessage}`);
      return {
        registry: "jsr",
        name: packageName,
        version: packageVersion,
        link: `❌ JSR publish failed: ${errorMessage.split("\n")[0]}`
      };
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