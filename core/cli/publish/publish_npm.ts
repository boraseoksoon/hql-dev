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
  getCachedBuild,
  ensureReadmeExists,
  executeCommand
} from "./utils.ts";

interface PublishNpmOptions {
  entryFile: string;
  version?: string;
  hasMetadata: boolean;
  metadataType?: MetadataFileType;
  verbose?: boolean;
  dryRun?: boolean;
}

async function determineNpmPackageInfo(
  distDir: string,
  options: PublishNpmOptions
): Promise<{ packageName: string; packageVersion: string; config: Record<string, unknown> }> {
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
      
      let candidateVersion = latestVersion ? incrementPatchVersion(latestVersion) : (config.version ? incrementPatchVersion(String(config.version)) : "0.0.1");
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
  
  config.name = packageName;
  
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

async function updateNpmMetadata(
  distDir: string, 
  packageVersion: string, 
  config: Record<string, unknown>
): Promise<void> {
  config.version = packageVersion;
  
  const packageJsonPath = join(distDir, "package.json");
  await writeJSONFile(packageJsonPath, config);
  console.log(`  → Updated package.json file with version ${packageVersion}`);
}

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
  
  return await executeCommand({
    cmd: ["npm", "publish"],
    cwd: distDir,
    extraFlags: ["--access", "public"]
  });
}

export async function publishNpm(options: PublishNpmOptions): Promise<PublishSummary> {
  try {
    console.log(`\n🔨 Building module from "${options.entryFile}"...`);
    const distDir = await getCachedBuild(options.entryFile, {
      verbose: options.verbose,
      dryRun: options.dryRun
    });
    console.log(`  → Module built successfully to: ${distDir}`);
    
    console.log(`\n📝 Configuring NPM package...`);
    const { packageName, packageVersion, config } = await determineNpmPackageInfo(distDir, options);
    
    await ensureReadmeExists(distDir, packageName);
    
    if (options.dryRun) {
      console.log(`\n🔍 Dry run mode - package ${packageName}@${packageVersion} would be published to NPM`);
      
      await updateNpmMetadata(distDir, packageVersion, config);
      
      return {
        registry: "npm",
        name: packageName,
        version: packageVersion,
        link: `https://www.npmjs.com/package/${packageName}`
      };
    }
    
    await updateNpmMetadata(distDir, packageVersion, config);

    let attempt = 0;
    const maxRetries = 3;
    let currentVersion = packageVersion;
    while (attempt <= maxRetries) {
      await updateNpmMetadata(distDir, currentVersion, config);
      console.log(`\n🚀 Publishing ${packageName}@${currentVersion} to NPM...`);
      const publishResult = await runNpmPublish(distDir, { dryRun: options.dryRun });
      if (publishResult.success) {
        console.log(`\n✅ Successfully published ${packageName}@${currentVersion} to NPM`);
        await updateNpmMetadata(distDir, currentVersion, config);
        return {
          registry: "npm",
          name: packageName,
          version: currentVersion,
          link: `https://www.npmjs.com/package/${packageName}`
        };
      } else {
        const errorOutput = publishResult.error || "Unknown error";
        const errorAnalysis = analyzeNpmError(errorOutput);
        if (errorAnalysis.type === ErrorType.VERSION_CONFLICT && attempt < maxRetries) {
          let localVersion = currentVersion;
          const pkgPath = join(distDir, "package.json");
          const pkgJson = await readJSONFile(pkgPath);
          if (pkgJson && typeof pkgJson.version === "string") {
            localVersion = pkgJson.version;
          }
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
    
    return {
      registry: "npm",
      name: packageName,
      version: currentVersion,
      link: `❌ Maximum retry attempts reached`
    };
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

function analyzeNpmError(errorOutput: string): { type: ErrorType; message: string } {
  const errorInfo = detectNpmError(errorOutput);
  return {
    type: errorInfo.type,
    message: errorInfo.message
  };
}