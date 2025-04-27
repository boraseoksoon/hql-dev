import { exists } from "jsr:@std/fs@1.0.13";
import { writeTextFile, join, dirname } from "@platform/platform.ts";
import { globalLogger as logger } from "@core/logger.ts";
import { buildJsModule } from "./build_js_module.ts";
import { runCmd } from "../../src/platform/platform.ts";

export interface RunCommandOptions {
  cmd: string[];
  cwd: string;
  dryRun?: boolean;
  verbose?: boolean;
  extraFlags?: string[];
}

export type MetadataFileType = "package.json" | "deno.json" | "jsr.json";

const buildCache = new Map<string, Promise<string>>();

export function getCachedBuild(
  entryFile: string, 
  options: { verbose?: boolean; dryRun?: boolean }
): Promise<string> {
  if (!buildCache.has(entryFile)) {
    logger.debug && logger.debug(`Creating new build for ${entryFile}`);
    const buildPromise = buildJsModule(entryFile, options);
    buildCache.set(entryFile, buildPromise);
    
    buildPromise.catch(() => {
      buildCache.delete(entryFile);
    });
    
    return buildPromise;
  }
  
  logger.debug && logger.debug(`Reusing cached build for ${entryFile}`);
  return buildCache.get(entryFile)!;
}

export async function detectMetadataFiles(dir: string): Promise<Record<string, MetadataFileType | null>> {
  const result: Record<string, MetadataFileType | null> = {
    npm: null,
    jsr: null
  };

  const dirsToCheck = [dir, join(dir, "dist")];
  
  for (const checkDir of dirsToCheck) {
    if (!result.npm && await exists(join(checkDir, "package.json"))) {
      result.npm = "package.json";
      logger.debug && logger.debug(`Found package.json in ${checkDir}`);
    }

    if (!result.jsr && await exists(join(checkDir, "deno.json"))) {
      result.jsr = "deno.json";
      logger.debug && logger.debug(`Found deno.json in ${checkDir}`);
    } else if (!result.jsr && await exists(join(checkDir, "jsr.json"))) {
      result.jsr = "jsr.json";
      logger.debug && logger.debug(`Found jsr.json in ${checkDir}`);
    }
  }

  logger.debug && logger.debug(`Detected metadata files: ${JSON.stringify(result)}`);
  
  return result;
}

export function getPlatformsFromArgs(args: string[]): ("jsr" | "npm")[] {
  const allForms = new Set(['all', '-all', '--all', '-a']);
  const npmForms = new Set(['npm', '-npm', '--npm']);
  const jsrForms = new Set(['jsr', '-jsr', '--jsr']);

  let isAll = false, isNpm = false, isJsr = false;

  for (const arg of args) {
    if (allForms.has(arg)) isAll = true;
    else if (npmForms.has(arg)) isNpm = true;
    else if (jsrForms.has(arg)) isJsr = true;
  }

  if (!isAll && !isNpm && !isJsr) {
    return ["jsr"];
  }

  if (isAll) {
    return ["jsr", "npm"];
  }

  const platforms: ("jsr" | "npm")[] = [];
  if (isJsr) platforms.push("jsr");
  if (isNpm) platforms.push("npm");
  
  return platforms;
}

export async function readJSONFile(path: string): Promise<Record<string, unknown>> {
  try {
    logger.debug && logger.debug(`Reading JSON file: ${path}`);
    const text = await Deno.readTextFile(path);
    return JSON.parse(text);
  } catch (error) {
    logger.debug && logger.debug(`Error reading JSON file ${path}: ${error}`);
    return {};
  }
}

export async function writeJSONFile(path: string, data: Record<string, unknown>): Promise<void> {
  try {
    const dir = dirname(path);
    try {
      await Deno.mkdir(dir, { recursive: true });
    } catch (e) {
      // Ignore if directory already exists
    }
    
    logger.debug && logger.debug(`Writing JSON file: ${path}`);
    await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.debug && logger.debug(`Error writing JSON file ${path}: ${error}`);
    throw new Error(`Failed to write JSON file ${path}: ${error}`);
  }
}

export function incrementPatchVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) {
    return "0.0.1";
  }
  
  try {
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    let patch = parseInt(parts[2], 10);
    patch++;
    
    return `${major}.${minor}.${patch}`;
  } catch {
    return "0.0.1";
  }
}

export async function promptUser(message: string, defaultValue = ""): Promise<string> {
  const promptMessage = defaultValue 
    ? `${message} (${defaultValue}):` 
    : `${message}:`;
  
  console.log(promptMessage);
  
  // Wrap the prompt in a Promise to maintain async signature while using built-in prompt
  const input = await new Promise<string>(resolve => {
    const result = prompt(`> `);
    resolve(result || "");
  });
  
  return input.trim() || defaultValue;
}

/**
 * Updates the version field in source metadata files (e.g., jsr.json, deno.json, package.json) if they exist.
 * @param distDir The distribution directory (used to find the source dir)
 * @param metaFiles Array of metadata filenames to update
 * @param version The version string to set
 */
/**
 * Compare two semver version strings (e.g., "1.2.3").
 * Returns -1 if a < b, 1 if a > b, 0 if equal.
 */
/**
 * Resolves the next version to publish by comparing remote and local versions.
 * If the remote version is lower than local, prompts the user to confirm the next version.
 * @param remoteVersion Version string from the registry (may be null)
 * @param localVersion Version string from local metadata (may be null)
 * @param promptUserFn Function to prompt the user (message, defaultValue) => Promise<string>
 * @param incrementPatchVersionFn Function to increment a version string (semver)
 * @param registryName Name of the registry (for messages)
 * @returns The version string to use for publish
 */
export async function resolveNextPublishVersion(
  remoteVersion: string | null,
  localVersion: string | null,
  promptUserFn: (msg: string, def: string) => Promise<string>,
  incrementPatchVersionFn: (v: string) => string,
  registryName: string
): Promise<string> {
  let candidateVersion: string;
  if (remoteVersion && localVersion) {
    if (compareVersions(remoteVersion, localVersion) < 0) {
      const suggested = incrementPatchVersionFn(
        compareVersions(remoteVersion, localVersion) > 0 ? remoteVersion : localVersion
      );
      console.warn(
        `  → Warning: Remote ${registryName} version (${remoteVersion}) is lower than local version (${localVersion}).`
      );
      candidateVersion = await promptUserFn(
        `Remote ${registryName} version (${remoteVersion}) is lower than your local metadata version (${localVersion}).\nPlease confirm the version to publish`,
        suggested
      );
    } else {
      candidateVersion = incrementPatchVersionFn(remoteVersion);
    }
  } else if (remoteVersion) {
    candidateVersion = incrementPatchVersionFn(remoteVersion);
  } else if (localVersion) {
    candidateVersion = incrementPatchVersionFn(localVersion);
  } else {
    candidateVersion = "0.0.1";
  }
  return candidateVersion;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

export async function updateSourceMetadataFiles(distDir: string, metaFiles: string[], version: string): Promise<void> {
  const { dirname, join } = await import("../../src/platform/platform.ts");
  const { exists } = await import("jsr:@std/fs@1.0.13");
  const { readJSONFile, writeJSONFile } = await import("./utils.ts");
  const sourceDir = dirname(distDir);
  for (const metaFile of metaFiles) {
    const sourceMetaPath = join(sourceDir, metaFile);
    if (await exists(sourceMetaPath)) {
      try {
        const sourceConfig = await readJSONFile(sourceMetaPath);
        sourceConfig.version = version;
        await writeJSONFile(sourceMetaPath, sourceConfig);
        console.log(`  → Updated source ${metaFile} file with version ${version}`);
      } catch (e) {
        console.warn(`  → Warning: Could not update source ${metaFile}: ${e}`);
      }
    }
  }
}

export async function ensureReadmeExists(distDir: string, packageName: string): Promise<void> {
  const readmePath = join(distDir, "README.md");
  if (!(await exists(readmePath))) {
    console.log(`  → Creating default README.md`);
    await writeTextFile(
      readmePath,
      `# ${packageName}\n\n> **This is a template README automatically generated by [HQL Publish](https://github.com/boraseoksoon/hql-dev).**\n> Please update this file with your own project details!\n\n---\n\n## 📦 About\n\nThis is a module published with [HQL](https://github.com/boraseoksoon/hql-dev).\nDescribe your project here!\n\n## 🚀 Getting Started\n\nInstall via your preferred registry:\n\n- **JSR:**\n  \`\`\`sh\n  deno add ${packageName}\n  \`\`\`\n- **NPM:**\n  \`\`\`sh\n  npm install ${packageName}\n  \`\`\`\n\n## 🛠 Publishing with HQL\n\nTo publish updates, run:\n\n\`\`\`sh\nhql publish <entry-file> [jsr|npm] [version] [--dry-run]\n\`\`\`\nSee [HQL Publish Guide](https://github.com/boraseoksoon/hql-dev) for full details.\n\n## 📄 Customizing this README\n\nEdit this file (\`README.md\`) to add your own project description, usage examples, API docs, contribution guidelines, and more.\n\n## 📚 Resources\n\n- [HQL Documentation](https://github.com/boraseoksoon/hql-dev)\n- [Report Issues](https://github.com/boraseoksoon/hql-dev/issues)\n\n---\n\n## 📝 License\n\n[MIT](./LICENSE) (or your preferred license)\n`,
    );
  }
}

/**
 * Executes a command and handles its output and errors in a standardized way
 * 
 * @param options The command options
 * @returns A result object with success status and optional error output
 */
export async function executeCommand(
  options: RunCommandOptions
): Promise<{ success: boolean; error?: string }> {
  const { cmd, cwd, extraFlags = [] } = options;
  
  try {
    const process = runCmd({
      cmd: [...cmd, ...extraFlags],
      cwd,
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
