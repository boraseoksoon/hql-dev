// metadata_utils.ts - Utilities for handling metadata files in the HQL publish system
import { exists } from "jsr:@std/fs@1.0.13";
import { writeTextFile, join, dirname } from "@platform/platform.ts";
import { globalLogger as logger } from "@core/logger.ts";
import { buildJsModule } from "./build_js_module.ts";

export type MetadataFileType = "package.json" | "deno.json" | "jsr.json";

// Cache for build operations to avoid redundant builds when running in parallel
const buildCache = new Map<string, Promise<string>>();

/**
 * Builds a module, with caching to avoid redundant builds
 * @param entryFile Path to the entry file
 * @param options Build options
 * @returns Promise resolving to the dist directory path
 */
export function getCachedBuild(
  entryFile: string, 
  options: { verbose?: boolean; dryRun?: boolean }
): Promise<string> {
  if (!buildCache.has(entryFile)) {
    logger.debug && logger.debug(`Creating new build for ${entryFile}`);
    const buildPromise = buildJsModule(entryFile, options);
    buildCache.set(entryFile, buildPromise);
    
    // Clear cache entry if build fails
    buildPromise.catch(() => {
      buildCache.delete(entryFile);
    });
    
    return buildPromise;
  }
  
  logger.debug && logger.debug(`Reusing cached build for ${entryFile}`);
  return buildCache.get(entryFile)!;
}

/**
 * Detects metadata files for npm and jsr in the specified directory
 * @param dir Directory to check for metadata files
 * @returns Object with metadata status for each platform
 */
export async function detectMetadataFiles(dir: string): Promise<Record<string, MetadataFileType | null>> {
  const result: Record<string, MetadataFileType | null> = {
    npm: null,
    jsr: null
  };

  // Check in both the main directory and the dist directory
  const dirsToCheck = [dir, join(dir, "dist")];
  
  for (const checkDir of dirsToCheck) {
    // Check for package.json (NPM)
    if (!result.npm && await exists(join(checkDir, "package.json"))) {
      result.npm = "package.json";
      logger.debug && logger.debug(`Found package.json in ${checkDir}`);
    }

    // Check for deno.json or jsr.json (JSR)
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

/**
 * Processes CLI arguments to determine target platforms (npm/jsr/all)
 * @param args CLI arguments
 * @returns Array of target platforms
 */
export function getPlatformsFromArgs(args: string[]): ("jsr" | "npm")[] {
  // Acceptable forms for platform selection
  const allForms = new Set(['all', '-all', '--all', '-a']);
  const npmForms = new Set(['npm', '-npm', '--npm']);
  const jsrForms = new Set(['jsr', '-jsr', '--jsr']);

  // Check for platform flags/args
  let isAll = false, isNpm = false, isJsr = false;

  for (const arg of args) {
    if (allForms.has(arg)) isAll = true;
    else if (npmForms.has(arg)) isNpm = true;
    else if (jsrForms.has(arg)) isJsr = true;
  }

  // If no specific platform is selected, default to JSR
  if (!isAll && !isNpm && !isJsr) {
    return ["jsr"];
  }

  // If "all" is specified, publish to both JSR and NPM
  if (isAll) {
    return ["jsr", "npm"];
  }

  // Otherwise, use explicitly specified platforms
  const platforms: ("jsr" | "npm")[] = [];
  if (isJsr) platforms.push("jsr");
  if (isNpm) platforms.push("npm");
  
  return platforms;
}

/**
 * Reads a JSON file and returns its contents
 * @param path Path to the JSON file
 * @returns Parsed JSON data
 */
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

/**
 * Writes data to a JSON file
 * @param path Path to write the JSON file
 * @param data Data to write
 */
export async function writeJSONFile(path: string, data: Record<string, unknown>): Promise<void> {
  try {
    // Ensure the directory exists
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

/**
 * Increments the patch version number
 * @param version Semantic version string (x.y.z)
 * @returns Incremented version
 */
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

/**
 * Prompts user for input with a default value
 * @param message Prompt message
 * @param defaultValue Default value
 * @returns User input or default value
 */
export async function promptUser(message: string, defaultValue = ""): Promise<string> {
  // Show default value in the prompt
  const promptMessage = defaultValue 
    ? `${message} (${defaultValue}):` 
    : `${message}:`;
  
  console.log(promptMessage);
  const buf = new Uint8Array(1024);
  await Deno.stdout.write(new TextEncoder().encode(`> `));
  const n = await Deno.stdin.read(buf);
  const input = n 
    ? new TextDecoder().decode(buf.subarray(0, n)).trim() 
    : "";
  
  return input || defaultValue;
}


/**
 * Ensures a README exists for the package
 */
export async function ensureReadmeExists(distDir: string, packageName: string): Promise<void> {
  const readmePath = join(distDir, "README.md");
  if (!(await exists(readmePath))) {
    console.log(`  → Creating default README.md`);
    await writeTextFile(
      readmePath,
      `# ${packageName}\n\nGenerated HQL module.\n`,
    );
  }
}