// src/utils.ts - Refactored

import { 
  isTypeScriptFile as isTypeScript, 
  isJsFile as isJs, 
  isHqlFile as isHql 
} from "./import-utils.ts";
import * as path from "https://deno.land/std@0.203.0/path/mod.ts";

const REMOTE_PATH_PREFIXES = new Set(["npm:", "jsr:", "http:", "https:"]);

/**
 * Resolve a source path to an absolute, real file path.
 * Handles:
 *   - file URLs
 *   - pseudo-rooted paths ("/foo/bar" relative to project root)
 *   - relative paths
 *   - absolute paths
 *   - existence checks & fallback
 * @param inputPath The path to resolve (may be relative, pseudo-rooted, file URL, or absolute)
 * @param projectRoot The root directory of the project (for pseudo-rooted paths)
 * @returns The resolved absolute file path
 */
export async function resolveSourcePath(inputPath: string, projectRoot: string): Promise<string> {
  let resolved = inputPath;

  // Convert file URLs to paths
  if (resolved.startsWith("file://")) {
    resolved = path.fromFileUrl(resolved);
  }

  // Handle pseudo-rooted paths ("/foo/bar" but not a real absolute file)
  if (resolved.startsWith("/") && !(await exists(resolved))) {
    resolved = path.resolve(projectRoot, resolved.replace(/^\/+/g, ""));
  }

  // Handle relative paths
  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(projectRoot, resolved);
  }

  // Final existence check
  if (!(await exists(resolved))) {
    throw new Error(`Resolved path does not exist: ${resolved}`);
  }

  return resolved;
}

// Helper: check file existence
async function exists(filePath: string): Promise<boolean> {
  try {
    await Deno.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize a string to be a valid JavaScript identifier
 * - Preserves dots for module property access
 * - Converts hyphens to underscores
 * - Converts question marks to _pred suffix
 */
export function sanitizeIdentifier(name: string): string {
  // Special handling for module property access (name contains a dot)
  if (name.includes(".")) {
    const parts = name.split(".");
    // Sanitize each part separately, then rejoin with dots
    return parts.map((part) => sanitizeBasicIdentifier(part)).join(".");
  }

  // No dots, use standard sanitization
  return sanitizeBasicIdentifier(name);
}

/**
 * Sanitize a basic identifier without dots
 */
function sanitizeBasicIdentifier(name: string): string {
  let sanitized = name;

  // Replace hyphens with underscores
  sanitized = sanitized.replace(/-/g, "_");

  // Ensure the name starts with a letter, underscore, or dollar sign
  if (!/^[a-zA-Z_$]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }

  // Remove any remaining invalid characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9_$]/g, "");

  return sanitized;
}

/**
 * Check if a path is a URL
 */
export function isUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://");
}

/**
 * Check if a module path is a remote module
 */
export function isRemoteModule(modulePath: string): boolean {
  return Array.from(REMOTE_PATH_PREFIXES).some((prefix) =>
    modulePath.startsWith(prefix)
  );
}

/**
 * Check if a path is a remote path (npm, jsr, http)
 */
export function isRemotePath(path: string): boolean {
  return Array.from(REMOTE_PATH_PREFIXES).some((prefix) =>
    path.startsWith(prefix)
  );
}

// File processing functions
export function checkForHqlImports(source: string): boolean {
  return /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g.test(source);
}

/**
 * Simple string hash function
 * Enhanced with error handling using the perform utility
 */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Check if a file is an HQL file
 */
export function isHqlFile(filePath: string): boolean {
  return isHql(filePath)
}

/**
 * Check if a file is a JavaScript file
 */
export function isJsFile(filePath: string): boolean {
  return isJs(filePath)
}

/**
 * Check if a file is a TypeScript file
 */
export function isTypeScriptFile(filePath: string): boolean {
  return isTypeScript(filePath)
}

/**
 * Read a file with standardized error handling.
 * 
 * @param filePath Path to the file to read
 * @param context Optional context for error messages
 * @returns File content as string
 */
export async function readFile(
  filePath: string,
  context?: string
): Promise<string> {
  try {
    const content = await Deno.readTextFile(filePath);
    return content;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Reading file ${filePath}${context ? ` (${context})` : ''}: ${errorMsg}`
    );
  }
}

/**
 * Try to read a file, returning null if it doesn't exist or can't be read.
 * 
 * @param filePath Path to the file to read
 * @param logger Optional logger to record debug information
 * @returns File content or null if the file can't be read
 */
export async function tryReadFile(
  filePath: string,
  logger?: { debug: (msg: string) => void }
): Promise<string | null> {
  try {
    const content = await Deno.readTextFile(filePath);
    if (logger?.debug) {
      logger.debug(`Successfully read ${content.length} bytes from ${filePath}`);
    }
    return content;
  } catch (e) {
    if (logger?.debug) {
      logger.debug(
        `Failed to read file ${filePath}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    return null;
  }
}

/**
 * Find the actual path of a file by checking multiple possible locations.
 * 
 * @param filePath Primary path to check
 * @param logger Optional logger for debug information
 * @param alternativePaths Additional paths to check
 * @returns The actual file path
 */
export async function findActualFilePath(
  filePath: string,
  logger?: { debug: (msg: string) => void; error: (msg: string) => void },
  alternativePaths: string[] = []
): Promise<string> {
  // Check primary path
  if (await tryReadFile(filePath, logger) !== null) {
    return filePath;
  }
  
  if (logger?.debug) {
    logger.debug(`File not found at ${filePath}, trying alternative locations`);
  }
  
  // Check provided alternative paths
  for (const altPath of alternativePaths) {
    if (await tryReadFile(altPath, logger) !== null) {
      if (logger?.debug) {
        logger.debug(`Found file at alternative location: ${altPath}`);
      }
      return altPath;
    }
  }
  
  // Try basename in current directory as fallback
  const basename = filePath.split('/').pop() || filePath;
  const alternativePath = Deno.cwd() + '/' + basename;
  
  if (await tryReadFile(alternativePath, logger) !== null) {
    if (logger?.debug) {
      logger.debug(`Found file at fallback location: ${alternativePath}`);
    }
    return alternativePath;
  }
  
  // No path worked
  const triedPaths = [filePath, ...alternativePaths, alternativePath].join(', ');
  const errorMsg = `File not found: ${filePath}, also tried: ${triedPaths}`;
  if (logger?.error) {
    logger.error(errorMsg);
  }
  throw new Error(errorMsg);
}