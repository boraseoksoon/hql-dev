import { detectNpmError } from "./error_handlers.ts";// publish_npm.ts - NPM-specific publishing implementation
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

interface PublishNpmOptions {
  entryFile: string;
  version?: string;
  hasMetadata: boolean;
  metadataType?: MetadataFileType;
  verbose?: boolean;
  dryRun?: boolean;
}

/**
 * Creates or updates NPM package.json metadata file
 */
async function configureNpmMetadata(
  distDir: string,
  options: PublishNpmOptions
): Promise<{ packageName: string; packageVersion: string }> {
  // Load existing config or create a new one
  let config: Record<string, unknown> = {};
  let packageName: string;
  let packageVersion: string;
  
  // Determine where to find and save metadata
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
  }
  
  // Target path for new/updated package.json
  const packageJsonPath = join(distDir, "package.json");
  
  if (options.hasMetadata) {
    // If metadata exists, load it and use the name from it
    packageName = String(config.name || "");
    
    if (options.version) {
      // Use explicitly provided version
      packageVersion = options.version;
      console.log(`  → Using specified version: ${packageVersion}`);
    } else {
      try {
        // Try to get latest version from NPM registry
        const latestVersion = await getNpmLatestVersion(packageName);
        
        if (latestVersion) {
          // Increment existing remote version
          packageVersion = incrementPatchVersion(latestVersion);
          console.log(`  → Found latest version on NPM: ${latestVersion}`);
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
    
    // Set up basic NPM configuration
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
    
    console.log(`  → Creating new package.json file`);
  }
  
  // Update the config with final values
  config.name = packageName;
  config.version = packageVersion;
  
  // Ensure standard fields are set
  config.description = config.description || `HQL module: ${packageName}`;
  config.module = config.module || "./esm/index.js";
  config.main = config.main || "./esm/index.js";
  config.types = config.types || "./types/index.d.ts";
  config.files = config.files || ["esm", "types", "README.md"];
  config.type = "module";
  config.author = config.author || getEnv("USER") || getEnv("USERNAME") || "HQL User";
  config.license = config.license || "MIT";
  
  // Write the package.json file
  await writeJSONFile(packageJsonPath, config);
  console.log(`  → Updated package.json file: ${packageJsonPath}`);
  
  return { packageName, packageVersion };
  
  // Update the config with final values
  config.name = packageName;
  config.version = packageVersion;
  
  // Ensure standard fields are set
  config.description = config.description || `HQL module: ${packageName}`;
  config.module = config.module || "./esm/index.js";
  config.main = config.main || "./esm/index.js";
  config.types = config.types || "./types/index.d.ts";
  config.files = config.files || ["esm", "types", "README.md"];
  config.type = "module";
  config.author = config.author || getEnv("USER") || getEnv("USERNAME") || "HQL User";
  config.license = config.license || "MIT";
  
  // Write the package.json file
  await writeJSONFile(packageJsonPath, config);
  console.log(`  → Updated package.json file: ${packageJsonPath}`);
  
  return { packageName, packageVersion };
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
    
    // Configure package metadata (create or update)
    console.log(`\n📝 Configuring NPM package...`);
    const { packageName, packageVersion } = await configureNpmMetadata(distDir, options);
    
    // Ensure a README exists
    await ensureReadmeExists(distDir, packageName);
    
    // Skip actual publishing in dry run mode
    if (options.dryRun) {
      console.log(`\n🔍 Dry run mode - package ${packageName}@${packageVersion} would be published to NPM`);
      return {
        registry: "npm",
        name: packageName,
        version: packageVersion,
        link: `https://www.npmjs.com/package/${packageName}`
      };
    }
    
    // Publish to NPM
    console.log(`\n🚀 Publishing ${packageName}@${packageVersion} to NPM...`);
    const publishResult = await runNpmPublish(distDir, { 
      dryRun: options.dryRun 
    });
    
    if (publishResult.success) {
      console.log(`\n✅ Successfully published ${packageName}@${packageVersion} to NPM`);
      return {
        registry: "npm",
        name: packageName,
        version: packageVersion,
        link: `https://www.npmjs.com/package/${packageName}`
      };
    } else {
      const errorMessage = publishResult.error || "Unknown error";
      console.error(`\n❌ NPM publish failed: ${errorMessage}`);
      return {
        registry: "npm",
        name: packageName,
        version: packageVersion,
        link: `❌ NPM publish failed: ${errorMessage.split("\n")[0]}`
      };
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