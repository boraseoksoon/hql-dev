import {
  basename,
  dirname,
  getEnv,
  join,
  runCmd,
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
} from "./utils.ts";
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

async function determineJsrPackageInfo(
  distDir: string,
  options: PublishJSROptions
): Promise<{ packageName: string; packageVersion: string; config: Record<string, unknown> }> {
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
    
    const jsrUser = packageName.startsWith("@") ? 
      packageName.substring(1, packageName.indexOf("/")) : 
      getEnv("USER") || getEnv("USERNAME") || "user";

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
        
        if (latestVersion) {
          packageVersion = incrementPatchVersion(latestVersion);
          console.log(`  → Incremented version to: ${packageVersion}`);
        } else if (config.version) {
          packageVersion = incrementPatchVersion(String(config.version));
          console.log(`  → Remote version not found, incrementing local metadata version to: ${packageVersion}`);
        } else {
          packageVersion = "0.0.1";
          console.log(`  → Using default initial version: ${packageVersion}`);
        }
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
    
    config = {
      name: packageName,
      version: packageVersion,
      exports: "./esm/index.js",
      license: "MIT",
      publish: { include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"] },
      description: `HQL module: ${packageName}`
    };
    await writeJSONFile(join(distDir, "jsr.json"), config);
    await writeJSONFile(join(distDir, "deno.json"), config);
    console.log(`  → Created new JSR metadata files (jsr.json, deno.json)`);
  }
  
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
}

async function updateJsrMetadata(
  distDir: string, 
  packageName: string, 
  packageVersion: string, 
  config: Record<string, unknown>
): Promise<void> {
  config.version = packageVersion;
  
  await writeJSONFile(join(distDir, "jsr.json"), config);
  await writeJSONFile(join(distDir, "deno.json"), config);
  
  console.log(`  → Updated JSR metadata files with version ${packageVersion}`);
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

async function runJsrPublish(
  distDir: string,
  options: { dryRun?: boolean; verbose?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const publishFlags = ["--allow-dirty"];
  if (options.dryRun) publishFlags.push("--dry-run");
  if (options.verbose) publishFlags.push("--verbose");
  
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
      
      const errorChunks: Uint8Array[] = [];
      if (process.stderr) {
        for await (const chunk of process.stderr) {
          errorChunks.push(chunk);
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
  
  console.log(`  → jsr CLI not found, trying deno publish...`);
  try {
    const process = runCmd({
      cmd: ["deno", "publish", ...publishFlags],
      cwd: distDir,
      stdout: "inherit",
      stderr: "piped"
    });
    
    const errorChunks: Uint8Array[] = [];
    if (process.stderr) {
      for await (const chunk of process.stderr) {
        errorChunks.push(chunk);
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

export async function publishJSR(options: PublishJSROptions): Promise<PublishSummary> {
  try {
    console.log(`\n🔨 Building module from "${options.entryFile}"...`);
    const distDir = await getCachedBuild(options.entryFile, {
      verbose: options.verbose,
      dryRun: options.dryRun
    });
    console.log(`  → Module built successfully to: ${distDir}`);
    
    console.log(`\n📝 Configuring JSR package...`);
    const { packageName, packageVersion, config } = await determineJsrPackageInfo(distDir, options);
    
    await ensureReadmeExists(distDir, packageName);
    
    if (options.dryRun) {
      console.log(`\n🔍 Dry run mode - package ${packageName}@${packageVersion} would be published to JSR`);
      
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
      console.log(`\n🚀 Publishing ${packageName}@${currentVersion} to JSR...`);
      const publishResult = await runJsrPublish(distDir, { 
        dryRun: options.dryRun,
        verbose: options.verbose
      });
      if (publishResult.success) {
        console.log(`\n✅ Successfully published ${packageName}@${currentVersion} to JSR`);
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
        if (errorAnalysis.type === ErrorType.VERSION_CONFLICT && attempt < maxRetries) {
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
    
    return {
      registry: "jsr",
      name: packageName,
      version: currentVersion,
      link: `❌ Maximum retry attempts reached`
    };
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

function analyzeJsrError(errorOutput: string): { type: ErrorType; message: string } {
  const errorInfo = detectJsrError(errorOutput);
  return {
    type: errorInfo.type,
    message: errorInfo.message
  };
}