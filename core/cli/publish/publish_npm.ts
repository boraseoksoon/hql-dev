// publish_npm.ts
import type { PublishSummary } from "./publish_summary.ts";
import { getNpmLatestVersion } from "./remote_registry.ts";
import { detectNpmError, ErrorType } from "./error_handlers.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { globalLogger as logger } from "../../src/logger.ts";
import {
  basename,
  dirname,
  getEnv,
  join,
} from "../../src/platform/platform.ts";
import { 
  MetadataFileType, 
  promptUser, 
  readJSONFile, 
  writeJSONFile,
  incrementPatchVersion,
  executeCommand
} from "./utils.ts";
import {
  PublishOptions,
  RegistryPublisher,
  publishPackage,
  createDefaultConfig
} from "./publish_common.ts";

export interface PublishNpmOptions extends PublishOptions {}

// Implementation of NPM-specific publishing functions
const npmPublisher: RegistryPublisher = {
  registryName: "npm",
  
  // Determine package info for NPM
  async determinePackageInfo(distDir: string, options: PublishNpmOptions) {
    let config: Record<string, unknown> = {};
    let packageName: string;
    let packageVersion: string;
    
    const sourceDir = dirname(options.entryFile);
    let metadataSourcePath: string;
    
    if (options.hasMetadata) {
      if (await exists(join(sourceDir, "package.json"))) {
        metadataSourcePath = join(sourceDir, "package.json");
      } else if (await exists(join(sourceDir, "dist", "package.json"))) {
        metadataSourcePath = join(sourceDir, "dist", "package.json");
      } else {
        metadataSourcePath = join(distDir, "package.json");
      }
      
      config = await readJSONFile(metadataSourcePath);
      logger.debug && logger.debug(`Loaded metadata from: ${metadataSourcePath}`);
      
      packageName = String(config.name || "");
      
      if (options.version) {
        packageVersion = options.version;
        console.log(`  → Using specified version: ${packageVersion}`);
      } else {
        let latestVersion: string | null = null;
        let attempts = 0;
        const maxAttempts = 10;

        try {
          latestVersion = await getNpmLatestVersion(packageName);
        } catch (error) {
          latestVersion = null;
        }
        
        let candidateVersion = latestVersion ? 
          incrementPatchVersion(latestVersion) : 
          (config.version ? incrementPatchVersion(String(config.version)) : "0.0.1");
        
        let foundAvailable = false;

        while (attempts < maxAttempts) {
          let existsRemotely = false;
          const remoteLatest = await getNpmLatestVersion(packageName);
          if (remoteLatest && remoteLatest === candidateVersion) {
            existsRemotely = true;
          }
          if (!existsRemotely) {
            foundAvailable = true;
            break;
          }
          candidateVersion = incrementPatchVersion(candidateVersion);
          attempts++;
        }

        if (foundAvailable) {
          packageVersion = candidateVersion;
          if (latestVersion) {
            console.log(`  → Found latest version on NPM: ${latestVersion}`);
          }
          console.log(`  → Using next available version: ${packageVersion}`);
        } else {
          const localVersion = config.version ? String(config.version) : "0.0.1";
          packageVersion = incrementPatchVersion(localVersion);
          console.log(`  → Could not find available version after ${maxAttempts} attempts. Using local package.json version increment: ${packageVersion}`);
        }
      }
    } else {
      const moduleDir = dirname(options.entryFile);
      const defaultName = basename(moduleDir)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      
      if (options.dryRun) {
        packageName = defaultName;
        console.log(`  → Using auto-generated package name: ${packageName} (dry-run)`);
      } else {
        packageName = await promptUser(
          `Enter a name for your NPM package`,
          defaultName
        );
      }
      
      const defaultVersion = options.version || "0.0.1";
      if (options.dryRun) {
        packageVersion = defaultVersion;
        console.log(`  → Using default version: ${packageVersion} (dry-run)`);
      } else {
        packageVersion = await promptUser(`Enter version`, defaultVersion);
      }
      
      config = createDefaultConfig(packageName, packageVersion, false);
      console.log(`  → Will create new package.json file after successful publish`);
    }
    
    // Ensure required properties
    config.name = packageName;
    config.description = config.description || `HQL module: ${packageName}`;
    config.module = config.module || "./esm/index.js";
    config.main = config.main || "./esm/index.js";
    config.types = config.types || "./types/index.d.ts";
    config.files = config.files || ["esm", "types", "README.md"];
    config.type = "module";
    config.author = config.author || getEnv("USER") || getEnv("USERNAME") || "HQL User";
    config.license = config.license || "MIT";
    
    // Always update config.version to the resolved version
    config.version = packageVersion;
    
    return { packageName, packageVersion, config };
  },
  
  // Update NPM metadata files
  async updateMetadata(distDir, packageVersion, config) {
    config.version = packageVersion;
    
    const packageJsonPath = join(distDir, "package.json");
    await writeJSONFile(packageJsonPath, config);
    console.log(`  → Updated package.json file with version ${packageVersion}`);
  },
  
  // Run NPM publish command
  async runPublish(distDir, options) {
    if (options.dryRun) {
      console.log(`  → Skipping actual npm publish in dry-run mode`);
      return { success: true };
    }
    
    const publishCmd = ["npm", "publish", "--access", "public"];
    console.log(`  → Running: ${publishCmd.join(" ")}`);
    
    return await executeCommand({
      cmd: ["npm", "publish"],
      cwd: distDir,
      extraFlags: ["--access", "public"]
    });
  },
  
  // Analyze NPM-specific errors
  analyzeError(errorOutput) {
    return detectNpmError(errorOutput);
  },
  
  // Generate NPM package link
  generateLink(name, version) {
    return `https://www.npmjs.com/package/${name}`;
  }
};

// Main export function for NPM publishing
export async function publishNpm(options: PublishNpmOptions): Promise<PublishSummary> {
  return publishPackage(options, npmPublisher);
}