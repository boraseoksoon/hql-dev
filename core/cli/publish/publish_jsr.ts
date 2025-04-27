// publish_jsr.ts
import type { PublishSummary } from "./publish_summary.ts";
import { getJsrLatestVersion } from "./remote_registry.ts";
import { detectJsrError, ErrorType } from "./error_handlers.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { globalLogger as logger } from "../../src/logger.ts";
import {
  basename,
  dirname,
  getEnv,
  join,
  runCmd
} from "../../src/platform/platform.ts";
import { 
  promptUser,   
  readJSONFile, 
  writeJSONFile,
  incrementPatchVersion,
  executeCommand,
  updateSourceMetadataFiles,
  resolveNextPublishVersion
} from "./utils.ts";
import {
  PublishOptions,
  RegistryPublisher,
  publishPackage,
  createDefaultConfig
} from "./publish_common.ts";

export interface PublishJSROptions extends PublishOptions {}

// Implementation of JSR-specific publishing functions
const jsrPublisher: RegistryPublisher = {
  registryName: "jsr",
  
  // Determine package info for JSR
  async determinePackageInfo(distDir: string, options: PublishJSROptions) {
    let config: Record<string, unknown> = {};
    let packageName: string;
    let packageVersion: string;
    
    const metadataType = options.metadataType || "jsr.json";
    const sourceDir = dirname(options.entryFile);
    let metadataSourcePath: string;
    
    if (options.hasMetadata) {
      if (await exists(join(sourceDir, metadataType))) {
        metadataSourcePath = join(sourceDir, metadataType);
      } else if (await exists(join(sourceDir, "dist", metadataType))) {
        metadataSourcePath = join(sourceDir, "dist", metadataType);
      } else {
        metadataSourcePath = metadataType === "deno.json" ? 
          join(distDir, "deno.json") : join(distDir, "jsr.json");
      }
      
      config = await readJSONFile(metadataSourcePath);
      logger.debug && logger.debug(`Loaded metadata from: ${metadataSourcePath}`);
      
      packageName = String(config.name || "");
      
      if (options.version) {
        packageVersion = options.version;
        console.log(`  → Using specified version: ${packageVersion}`);
      } else {
        try {
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
          
          const candidateVersion = await resolveNextPublishVersion(
            latestVersion,
            config.version ? String(config.version) : null,
            promptUser,
            incrementPatchVersion,
            "JSR"
          );
          packageVersion = candidateVersion;
          console.log(`  → Using next available version: ${packageVersion}`);
        } catch (error) {
          packageVersion = config.version ? String(config.version) : "0.0.1";
          console.log(`  → Error fetching remote version, using: ${packageVersion}`);
        }
      }
    } else {
      const moduleDir = dirname(options.entryFile);
      const defaultName = basename(moduleDir)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
        
      const jsrUser = getEnv("JSR_USER") || getEnv("USER") || getEnv("USERNAME") || "user";
      
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
      
      const defaultVersion = options.version || "0.0.1";
      if (options.version) {
        packageVersion = options.version;
        console.log(`  → Using specified version: ${packageVersion}`);
      } else if (options.dryRun) {
        packageVersion = defaultVersion;
        console.log(`  → Using default version: ${packageVersion} (dry-run)`);
      } else {
        packageVersion = await promptUser(`Enter version`, defaultVersion);
      }
      
      config = createDefaultConfig(packageName, packageVersion, true);
      await writeJSONFile(join(distDir, "jsr.json"), config);
      await writeJSONFile(join(distDir, "deno.json"), config);
      console.log(`  → Created new JSR metadata files (jsr.json, deno.json)`);
    }
    
    // Ensure required properties
    config.name = packageName;
    config.exports = config.exports || "./esm/index.js";
    config.license = config.license || "MIT";
    config.description = config.description || `HQL module: ${packageName}`;
    config.publish = config.publish || { 
      include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] 
    };
    
    // Always update config.version to the resolved version
    config.version = packageVersion;
    // Always write updated metadata files before returning
    await writeJSONFile(join(distDir, "jsr.json"), config);
    await writeJSONFile(join(distDir, "deno.json"), config);
    logger.debug && logger.debug(`Updated jsr.json and deno.json with version: ${packageVersion}`);
    return { packageName, packageVersion, config };
  },
  
  // Update JSR metadata files
  async updateMetadata(distDir, packageVersion, config) {
    config.version = packageVersion;

    await writeJSONFile(join(distDir, "jsr.json"), config);
    await writeJSONFile(join(distDir, "deno.json"), config);
    console.log(`  → Updated dist/jsr.json and dist/deno.json with version ${packageVersion}`);

    updateSourceMetadataFiles(distDir, ["jsr.json", "deno.json"], packageVersion)
  },
  
  // Run JSR publish command
  async runPublish(distDir, options) {
    const publishFlags: string[] = [];

    if (options.dryRun) {
      publishFlags.push("--dry-run");
    }

    if (options.verbose) {
      publishFlags.push("--verbose");
    }

    // Try jsr CLI first
    const jsrAvailable = await checkCommandAvailable("jsr", distDir);
    if (jsrAvailable) {
      return executeCommand({
        cmd: ["jsr", "publish"],
        cwd: distDir,
        extraFlags: publishFlags
      });
    }

    // Fallback: Try deno publish if jsr is not available
    const denoAvailable = await checkCommandAvailable("deno", distDir);
    if (denoAvailable) {
      return executeCommand({
        cmd: ["deno", "publish"],
        cwd: distDir,
        extraFlags: publishFlags
      });
    }

    // Neither jsr nor deno is available: prompt user to install jsr
    const userInput = await promptUser(
      "Neither jsr nor deno CLI found. Would you like to install jsr now? (y/n)",
      "y"
    );
    if (userInput.trim().toLowerCase().startsWith("y")) {
      // Install jsr CLI using deno
      const installResult = await executeCommand({
        cmd: ["deno", "install", "-A", "-n", "jsr", "jsr@0.4.4"],
        cwd: distDir
      });
      if (!installResult.success) {
        return {
          success: false,
          error: `Failed to install jsr CLI: ${installResult.error}`
        };
      }
      // Retry jsr publish after install
      return executeCommand({
        cmd: ["jsr", "publish"],
        cwd: distDir,
        extraFlags: publishFlags
      });
    } else {
      return {
        success: false,
        error: "JSR CLI not available. Please install it with: deno install -A jsr@0.4.4"
      };
    }
  },
  
  // Analyze JSR-specific errors
  analyzeError(errorOutput) {
    // Detect uncommitted changes error
    if (errorOutput.includes("Aborting due to uncommitted changes") || errorOutput.includes("run with --allow-dirty")) {
      return {
        type: ErrorType.UNKNOWN,
        message: "Publish aborted: You have uncommitted changes. Please commit your changes or run with --allow-dirty."
      };
    }
    // Default: fallback to existing error detection
    return detectJsrError(errorOutput);
  },
  
  // Generate JSR package link
  generateLink(name, version) {
    if (!name.startsWith("@")) {
      return `https://jsr.io/p/${name}@${version}`;
    }
    
    const [_, scope, pkgName] = name.match(/^@([^/]+)\/(.+)$/) || [];
    if (!scope || !pkgName) {
      return `https://jsr.io`;
    }
    
    return `https://jsr.io/@${scope}/${pkgName}@${version}`;
  }
};

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

// Main export function for JSR publishing
export function publishJSR(options: PublishJSROptions): Promise<PublishSummary> {
  return publishPackage(options, jsrPublisher);
}