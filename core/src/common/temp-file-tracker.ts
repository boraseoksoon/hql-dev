import { globalLogger as logger } from "../logger.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { 
  exists, 
  readTextFile, 
  writeTextFile, 
  ensureDir, 
  dirname, 
  join, 
  resolve,
  basename,
  relative
} from "../platform/platform.ts";
import { transpileHqlInJs } from "../bundler.ts";
import { 
  isHqlFile, 
  isJsFile, 
  isTypeScriptFile,
  escapeRegExp 
} from "./utils.ts";

// Cache directory configuration
const HQL_CACHE_DIR = ".hql-cache";
const CACHE_VERSION = "1"; // Increment when cache structure changes

// Memory caches
const contentHashCache = new Map<string, string>();
const outputPathCache = new Map<string, Map<string, string>>();
const tempDirs = new Set<string>();
const explicitOutputs = new Set<string>();

/**
 * Map of original imports to cached paths 
 * This helps resolve imports between cached files
 */
const importPathMap = new Map<string, string>();

/**
 * Register an import mapping
 */
export function registerImportMapping(original: string, cached: string): void {
  importPathMap.set(original, cached);
  // Also add a reverse mapping to help with path resolution
  registerReverseImportMapping(cached, original);
  logger.debug(`Registered import mapping: ${original} -> ${cached}`);
}

/**
 * Reverse import mapping cache for resolving original paths from cached paths
 */
const reverseImportPathMap = new Map<string, string>();

/**
 * Register a reverse mapping from cache path to original path
 */
function registerReverseImportMapping(cached: string, original: string): void {
  reverseImportPathMap.set(cached, original);
}

/**
 * Get original path for a cached path
 */
export function getOriginalPath(cached: string): string | undefined {
  return reverseImportPathMap.get(cached);
}

/**
 * Get cached path for an import
 */
export function getImportMapping(original: string): string | undefined {
  return importPathMap.get(original);
}

/**
 * Get the cache directory path
 */
export async function getCacheDir(): Promise<string> {
  const cacheRoot = join(Deno.cwd(), HQL_CACHE_DIR, CACHE_VERSION);
  await ensureDir(cacheRoot);
  return cacheRoot;
}

/**
 * Calculate hash for content
 */
async function calculateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or calculate content hash for a file
 */
export async function getContentHash(filePath: string): Promise<string> {
  // Return cached hash if available
  if (contentHashCache.has(filePath)) {
    return contentHashCache.get(filePath)!;
  }

  try {
    // Read and hash the file content
    const content = await readTextFile(filePath);
    const hash = await calculateHash(content);
    
    // Cache the hash
    contentHashCache.set(filePath, hash);
    return hash;
  } catch (error) {
    logger.debug(`Error getting content hash for ${filePath}: ${error}`);
    throw new Error(`Failed to hash ${filePath}: ${error}`);
  }
}

/**
 * Ensure the relative source directory is preserved in cache
 * 
 * This is important for imports that refer to neighboring files
 */
async function prepareSourceDirInCache(sourcePath: string, hash: string): Promise<string> {
  const cacheDir = await getCacheDir();
  const sourceDir = dirname(sourcePath);
  
  // Create a path structure that includes entire relative directory structure
  const relativePath = path.relative(Deno.cwd(), sourceDir);
  const cacheDirForSource = join(cacheDir, relativePath);
  
  // Create source directory in cache to maintain relative imports
  await ensureDir(cacheDirForSource);
  
  return cacheDirForSource;
}

/**
 * Get cached path for a source file with specific target extension
 */
export async function getCachedPath(
  sourcePath: string, 
  targetExt: string,
  options: { createDir?: boolean; preserveRelative?: boolean } = {}
): Promise<string> {
  // Get cache directory - this should have the version number
  const cacheDir = await getCacheDir();
  
  // Calculate hash for versioning
  const hash = await getContentHash(sourcePath);
  const shortHash = hash.substring(0, 8);
  
  // Get base file name (without extension)
  const sourceFilename = basename(sourcePath);
  const baseFilename = sourceFilename.replace(/\.[^\.]+$/, '');
  const targetFilename = baseFilename + targetExt;
  
  // Determine if this is a preserveRelative case (e.g. stdlib)
  const forcePreserveRelative = sourceFilename === "stdlib.hql" || sourceFilename === "stdlib.ts";
  const shouldPreserveRelative = options.preserveRelative || forcePreserveRelative;
  
  // IMPORTANT: For HQL files, default to preserveRelative unless explicitly set to false
  // This ensures consistent paths across imports
  if (sourcePath.endsWith('.hql') && options.preserveRelative !== false) {
    options.preserveRelative = true;
  }
  
  let outputPath: string;
  
  if (shouldPreserveRelative) {
    // CRITICAL FIX: When preserving relative structure, make sure we handle 
    // running from the core directory correctly
    let sourceRelative = relative(Deno.cwd(), dirname(sourcePath));
    
    // Check if we're running from the core directory and fix path
    const currentDir = basename(Deno.cwd());
    if (currentDir === "core" && !sourceRelative.startsWith("..")) {
      // We're running from core directory, adjust paths
      // Remove "core/" from the beginning if present
      sourceRelative = sourceRelative.replace(/^core\//, "");
      
      // Use project root (parent of core) as the base
      outputPath = join(cacheDir, sourceRelative, targetFilename);
    } else {
      // Normal case - preserve directory structure
      outputPath = join(cacheDir, sourceRelative, targetFilename);
    }
  } else {
    // Use standard hash-based structure (flat)
    outputPath = join(cacheDir, "temp", shortHash + targetExt);
  }
  
  if (options.createDir) {
    await ensureDir(dirname(outputPath));
  }
  
  return outputPath;
}

/**
 * Ensure stdlib files are properly cached and accessible
 */
export async function ensureStdlibInCache(): Promise<string> {
  const cacheDir = await getCacheDir();
  const stdlibSource = join(Deno.cwd(), "lib", "stdlib", "stdlib.hql");
  
  try {
    // Check if stdlib exists
    if (!await exists(stdlibSource)) {
      // Try alternative location (core/lib/stdlib)
      const altStdlibSource = join(Deno.cwd(), "core", "lib", "stdlib", "stdlib.hql");
      if (await exists(altStdlibSource)) {
        logger.debug(`Found stdlib at alternate location: ${altStdlibSource}`);
        
        // Cache the stdlib file with preserveRelative option
        // This ensures its directory structure is maintained
        const hash = await getContentHash(altStdlibSource);
        const shortHash = hash.substring(0, 8);
        
        // Create the directory structure in cache that matches expected imports
        const stdlibCacheDir = join(cacheDir, "lib", "stdlib");
        const hashDir = join(stdlibCacheDir, shortHash);
        await ensureDir(hashDir);
        
        // Also ensure the non-hashed path exists for direct imports
        await ensureDir(stdlibCacheDir);
        
        // Process stdlib and copy to cache
        const hqlSource = await readTextFile(altStdlibSource);
        
        // Copy the HQL file itself
        await writeTextFile(join(stdlibCacheDir, "stdlib.hql"), hqlSource);
        
        // Handle JS directory if it exists (for stdlib implementations)
        const jsDir = join(dirname(altStdlibSource), "js");
        if (await exists(jsDir)) {
          // Copy JS directory to both locations
          const targetJsDir = join(stdlibCacheDir, "js");
          const hashJsDir = join(hashDir, "js");
          await ensureDir(targetJsDir);
          await ensureDir(hashJsDir);
          
          // Copy all files
          for await (const entry of Deno.readDir(jsDir)) {
            if (entry.isFile) {
              const content = await readTextFile(join(jsDir, entry.name));
              await writeTextFile(join(targetJsDir, entry.name), content);
              await writeTextFile(join(hashJsDir, entry.name), content);
              logger.debug(`Copied stdlib JS file to cache: ${entry.name}`);
            }
          }
        }
        
        logger.debug(`Prepared stdlib in cache at: ${stdlibCacheDir}`);
        return join(stdlibCacheDir, "stdlib.hql");
      }
      
      logger.warn(`Stdlib not found at expected locations`);
      return stdlibSource;
    }
    
    // Same process for the standard location
    const hash = await getContentHash(stdlibSource);
    const shortHash = hash.substring(0, 8);
    const stdlibCacheDir = join(cacheDir, "lib", "stdlib");
    const hashDir = join(stdlibCacheDir, shortHash);
    
    await ensureDir(hashDir);
    await ensureDir(stdlibCacheDir);
    
    const hqlSource = await readTextFile(stdlibSource);
    await writeTextFile(join(stdlibCacheDir, "stdlib.hql"), hqlSource);
    
    // Copy JS directory if it exists
    const jsDir = join(dirname(stdlibSource), "js");
    if (await exists(jsDir)) {
      const targetJsDir = join(stdlibCacheDir, "js");
      const hashJsDir = join(hashDir, "js");
      await ensureDir(targetJsDir);
      await ensureDir(hashJsDir);
      
      for await (const entry of Deno.readDir(jsDir)) {
        if (entry.isFile) {
          const content = await readTextFile(join(jsDir, entry.name));
          await writeTextFile(join(targetJsDir, entry.name), content);
          await writeTextFile(join(hashJsDir, entry.name), content);
        }
      }
    }
    
    logger.debug(`Prepared stdlib in cache at: ${stdlibCacheDir}`);
    return join(stdlibCacheDir, "stdlib.hql");
  } catch (error) {
    logger.debug(`Error preparing stdlib: ${error}`);
    return stdlibSource;
  }
}

/**
 * Process imports in cached content
 * 
 * This handles rewriting import paths to work in the cache directory
 */
export async function processCachedImports(
  content: string,
  sourcePath: string, 
  targetExt: string
): Promise<string> {
  // Skip processing if no imports
  if (!content.includes('import') || !content.includes('from')) {
    return content;
  }
  
  // Find all imports with the pattern: import ... from "path"
  const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
  let modifiedContent = content;
  let match;
  
  // We need to reset the lastIndex to ensure we get all matches
  importRegex.lastIndex = 0;
  
  while ((match = importRegex.exec(content)) !== null) {
    const fullImport = match[0];
    const importPath = match[1];
    
    // Skip if already an absolute path
    if (importPath.startsWith('file://')) {
      continue;
    }
    
    // Process all imports, not just HQL files
    try {
      // Try to resolve the import relative to the source file
      let resolvedOriginalPath = '';
      
      if (importPath.startsWith('.')) {
        // Relative import
        resolvedOriginalPath = path.resolve(dirname(sourcePath), importPath);
      } else {
        // Try to resolve from project root or various other locations
        const possiblePaths = [
          path.resolve(Deno.cwd(), importPath),
          path.resolve(Deno.cwd(), 'core', importPath),
          path.resolve(dirname(sourcePath), importPath)
        ];
        
        for (const p of possiblePaths) {
          if (await exists(p)) {
            resolvedOriginalPath = p;
            break;
          }
        }
        
        if (!resolvedOriginalPath) {
          logger.debug(`Couldn't resolve import path: ${importPath} from ${sourcePath}`);
          continue;
        }
      }
      
      // If we have a special mapping for this import, use it (for ANY file type)
      if (importPathMap.has(resolvedOriginalPath)) {
        const mappedPath = importPathMap.get(resolvedOriginalPath)!;
        const newImport = fullImport.replace(importPath, `file://${mappedPath}`);
        modifiedContent = modifiedContent.replace(fullImport, newImport);
        logger.debug(`Rewritten import using mapping: ${fullImport} -> ${newImport}`);
        continue;
      }
      
      // Special handling for relative imports to JS files in the same directory
      // This is common for stdlib and other modules that have js implementations
      if (importPath.startsWith('./js/') && importPath.endsWith('.js')) {
        // Compute where this JavaScript file would be in cache
        const cacheDir = await getCacheDir();
        const importerRelativeDir = path.relative(Deno.cwd(), dirname(sourcePath));
        const jsRelativePath = importPath.slice(2); // Remove './'
        const cachedJsPath = join(cacheDir, importerRelativeDir, jsRelativePath);
        
        // Register mapping and rewrite import
        registerImportMapping(resolvedOriginalPath, cachedJsPath);
        const newImport = fullImport.replace(importPath, `file://${cachedJsPath}`);
        modifiedContent = modifiedContent.replace(fullImport, newImport);
        logger.debug(`Rewritten relative JS import: ${fullImport} -> ${newImport}`);
        continue;
      }
      
      // Handle HQL files uniformly, regardless of which file it is
      if (importPath.endsWith('.hql')) {
        // Generate the cached path for the import
        const importHash = await getContentHash(resolvedOriginalPath);
        const shortHash = importHash.substring(0, 8);
        
        // Compute the likely cached path
        const cacheDir = await getCacheDir();
        const importBasename = path.basename(resolvedOriginalPath, '.hql');
        
        // Two possible locations: hash-based or preserveRelative
        let cachedImportPaths = [];
        
        // Strategy 1: preserveRelative makes exact directory structure
        const importRelativeDir = path.relative(Deno.cwd(), dirname(resolvedOriginalPath));
        const preservedPath = join(cacheDir, importRelativeDir, `${importBasename}.ts`);
        cachedImportPaths.push(preservedPath);
        
        // Strategy 2: Hash-based directory
        const relativeHashDir = path.relative(Deno.cwd(), dirname(resolvedOriginalPath))
          .replace(/\.\./g, "_up_");
        const hashPath = join(cacheDir, relativeHashDir, shortHash, `${importBasename}.ts`);
        cachedImportPaths.push(hashPath);
        
        // Check if any of these paths exist
        let foundCachedPath = '';
        for (const p of cachedImportPaths) {
          if (await exists(p)) {
            foundCachedPath = p;
            break;
          }
        }
        
        if (!foundCachedPath) {
          // If not found, we'll create the import mapping for later - cachePath is our best guess
          foundCachedPath = await joinAndEnsureDirExists(cacheDir, importRelativeDir, `${importBasename}.ts`);
        }
        
        // Register this for future use
        registerImportMapping(resolvedOriginalPath, foundCachedPath);
        
        // Update the import to use absolute path
        const newImport = fullImport.replace(importPath, `file://${foundCachedPath}`);
        modifiedContent = modifiedContent.replace(fullImport, newImport);
        logger.debug(`Resolved import path: ${fullImport} -> ${newImport}`);
      }
    } catch (error) {
      logger.debug(`Error processing import ${importPath}: ${error}`);
      // Skip this import if there's an error
      continue;
    }
  }
  
  return modifiedContent;
}

/**
 * Helper to join path parts and ensure directory exists
 */
async function joinAndEnsureDirExists(...parts: string[]): Promise<string> {
  const result = join(...parts);
  await ensureDir(dirname(result));
  return result;
}

/**
 * Process source file content to fix imports
 * This rewrites relative imports to use absolute paths
 */
async function processFileContent(
  content: string,
  sourcePath: string,
  targetExt: string
): Promise<string> {
  // Handle all source files consistently by using the cached imports processor
  return processCachedImports(content, sourcePath, targetExt);
}

/**
 * Copy neighbor files needed for relative imports
 * This ensures files referenced through relative imports are available
 */
export async function copyNeighborFiles(sourcePath: string, outputDir: string): Promise<void> {
  try {
    const sourceDir = dirname(sourcePath);
    logger.debug(`Checking for js directory near ${sourcePath}`);
    
    // Copy any js directory if it exists (for stdlib and other modules)
    const jsDir = join(sourceDir, "js");
    if (await exists(jsDir)) {
      logger.debug(`Found js directory at ${jsDir}`);
      
      // Create js directory in all possible output locations
      const cacheDir = await getCacheDir();
      
      // Copy to multiple locations to ensure it works regardless of how files are referenced
      const locations = [];
      
      // 1. In the cache directory preserving relative structure from working directory
      const sourceRelative = path.relative(Deno.cwd(), sourceDir);
      const preservedJsDir = join(cacheDir, sourceRelative, "js");
      locations.push(preservedJsDir);
      
      // 2. With the hash-based directory structure
      const hash = await getContentHash(sourcePath);
      const shortHash = hash.substring(0, 8);
      const hashJsDir = join(cacheDir, sourceRelative, shortHash, "js");
      locations.push(hashJsDir);
      
      // 3. Handle running from core directory - remove 'core/' prefix if needed
      if (sourceRelative.startsWith("core/")) {
        const coreRelative = sourceRelative.replace(/^core\//, "");
        const coreJsDir = join(cacheDir, coreRelative, "js");
        locations.push(coreJsDir);
        
        // Also with hash
        const coreHashJsDir = join(cacheDir, coreRelative, shortHash, "js");
        locations.push(coreHashJsDir);
      }
      
      // Create all target directories and copy files
      for (const targetDir of locations) {
        await ensureDir(targetDir);
        logger.debug(`Created js directory at ${targetDir}`);
        
        // Copy all files from js dir
        for await (const entry of Deno.readDir(jsDir)) {
          if (entry.isFile) {
            const sourceFile = join(jsDir, entry.name);
            const targetFile = join(targetDir, entry.name);
            const content = await readTextFile(sourceFile);
            await writeTextFile(targetFile, content);
            logger.debug(`Copied file: ${sourceFile} -> ${targetFile}`);
          }
        }
      }
    } else {
      logger.debug(`No js directory found at ${jsDir}`);
    }
  } catch (error) {
    logger.debug(`Error copying neighbor files: ${error}`);
  }
}

/**
 * Check if a file needs to be regenerated
 */
export async function needsRegeneration(
  sourcePath: string, 
  targetExt: string
): Promise<boolean> {
  try {
    // Get cached output path
    const outputPath = await getCachedPath(sourcePath, targetExt);
    
    // Always regenerate if output doesn't exist
    if (!await exists(outputPath)) {
      logger.debug(`Output doesn't exist, regenerating: ${outputPath}`);
      return true;
    }
    
    // Get current hash of source file
    const currentHash = await getContentHash(sourcePath);
    
    // Check hash in path parts
    const pathParts = outputPath.split('/').filter(Boolean);
    const pathHash = pathParts[pathParts.length - 2]; // Extract hash from path
    if (pathHash !== currentHash.substring(0, 8)) {
      logger.debug(`Source content changed, regenerating: ${sourcePath}`);
      return true;
    }
    
    logger.debug(`No changes detected, reusing: ${outputPath}`);
    return false;
  } catch (error) {
    logger.debug(`Error checking regeneration: ${error}`);
    return true;  // Safer to regenerate on error
  }
}

/**
 * Write content to cache
 */
export async function writeToCachedPath(
  sourcePath: string, 
  content: string, 
  targetExt: string,
  options: { preserveRelative?: boolean } = {}
): Promise<string> {
  // Always use preserveRelative for stdlib files
  const sourceFilename = basename(sourcePath);
  const forcePreserveRelative = sourceFilename === "stdlib.hql" || sourceFilename === "stdlib.ts";
  const usePreserveRelative = forcePreserveRelative || options.preserveRelative;
  
  // Process content if needed
  const processedContent = await processFileContent(content, sourcePath, targetExt);
  
  // Get cached path with potentially forced preserveRelative option
  const outputPath = await getCachedPath(sourcePath, targetExt, { 
    createDir: true,
    preserveRelative: usePreserveRelative
  });
  
  // Register this cached path for import resolution
  registerImportMapping(sourcePath, outputPath);
  
  // Write content
  await writeTextFile(outputPath, processedContent);
  logger.debug(`Written ${targetExt} output for ${sourcePath} to ${outputPath}`);
  
  return outputPath;
}

/**
 * Get cached output path
 */
export function getCachedOutput(
  sourcePath: string, 
  targetExt: string
): string | undefined {
  return outputPathCache.get(sourcePath)?.get(targetExt);
}

/**
 * Create a temporary directory in the cache
 */
export async function createTempDir(
  prefix: string = "tmp"
): Promise<string> {
  const cacheDir = await getCacheDir();
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const dirPath = join(cacheDir, "temp", `${prefix}-${timestamp}-${random}`);
  
  await ensureDir(dirPath);
  tempDirs.add(dirPath);
  
  logger.debug(`Created temp directory: ${dirPath}`);
  return dirPath;
}

/**
 * Mark a file as an explicit output that should be preserved
 */
export function registerExplicitOutput(outputPath: string): void {
  explicitOutputs.add(outputPath);
  logger.debug(`Registered explicit output: ${outputPath}`);
}

/**
 * Clean up all temporary cache directories
 */
export async function cleanupAllTempFiles(): Promise<void> {
  // Remove temp directories
  for (const dir of tempDirs) {
    try {
      await Deno.remove(dir, { recursive: true });
      logger.debug(`Removed temp directory: ${dir}`);
    } catch (error) {
      logger.debug(`Failed to remove temp directory ${dir}: ${error}`);
    }
  }
  
  // Copy explicit outputs from cache to their final destination
  for (const outputPath of explicitOutputs) {
    for (const sourceMap of outputPathCache.values()) {
      for (const [ext, cachePath] of sourceMap.entries()) {
        // Find if this output path matches the target extension
        if (outputPath.endsWith(ext)) {
          try {
            // If cache file exists, copy to explicit output
            if (await exists(cachePath)) {
              const content = await readTextFile(cachePath);
              
              // IMPORTANT: For user-level files, we need to restore relative paths 
              // instead of using absolute file:// URLs to cache
              let outputContent = content;
              
              // Process content to replace absolute cache paths with relative paths
              if (outputPath.endsWith('.js') || outputPath.endsWith('.ts')) {
                outputContent = await restoreRelativePaths(content, outputPath, cachePath);
              }
              
              await writeTextFile(outputPath, outputContent);
              logger.debug(`Copied cached output to explicit path: ${cachePath} -> ${outputPath}`);
            }
          } catch (error) {
            logger.debug(`Failed to copy explicit output ${cachePath} -> ${outputPath}: ${error}`);
          }
        }
      }
    }
  }
  
  // Clear in-memory trackers
  tempDirs.clear();
  explicitOutputs.clear();
  
  logger.debug("Cache cleanup complete");
}

/**
 * Restore relative paths in output files to maintain proper imports
 */
async function restoreRelativePaths(
  content: string, 
  outputPath: string,
  cachePath: string
): Promise<string> {
  // This is where we fix imports that were absolute cache paths back to relative paths
  // in the final output
  
  const cacheDir = await getCacheDir();
  const outputDir = dirname(outputPath);
  let result = content;
  
  // Get the project root (important for path resolution)
  const projectRoot = Deno.cwd().endsWith('/core') ? 
    dirname(Deno.cwd()) : Deno.cwd();
  
  // Find all cache path references
  const cachePathRegex = new RegExp(`file:\/\/(${escapeRegExp(cacheDir)}\/[^"']+)`, 'g');
  
  result = result.replace(cachePathRegex, (match, p1) => {
    // Get the original path this cache file is for
    const originalPath = getOriginalPath(p1);
    
    if (originalPath) {
      // Calculate relative path from output file to original
      try {
        // First check if we're dealing with the core/ path issue
        const isCachePath = p1.includes('/.hql-cache/');
        const isCoreCachePath = p1.includes('/core/.hql-cache/');
        
        // If we have a core/.hql-cache path, we need to fix it
        if (isCoreCachePath) {
          // Remove core/ from the path
          const fixedPath = p1.replace('/core/.hql-cache/', '/.hql-cache/');
          
          // If it's a relative import in the same directory, use ./
          if (dirname(fixedPath) === dirname(cachePath)) {
            return `./${basename(originalPath)}`;
          }
          
          // Otherwise calculate proper relative path
          let relativePath = relative(outputDir, dirname(originalPath));
          if (!relativePath.startsWith('.')) {
            relativePath = `./${relativePath}`;
          }
          
          return `${relativePath}/${basename(originalPath)}`;
        }
        
        // Normal case - calculate relative path
        let relativePath = relative(outputDir, dirname(originalPath));
        if (!relativePath.startsWith('.')) {
          relativePath = `./${relativePath}`;
        }
        
        return `${relativePath}/${basename(originalPath)}`;
      } catch (error) {
        logger.debug(`Error calculating relative path: ${error}`);
        // Fall back to original file name only as a last resort
        return `./${basename(originalPath)}`;
      }
    }
    
    logger.debug(`No original path found for ${p1}, keeping as is`);
    // No mapping, keep as is
    return match;
  });
  
  return result;
}

/**
 * Get estimated cache size
 */
export async function getCacheStats(): Promise<{ files: number, bytes: number }> {
  const cacheDir = await getCacheDir();
  let files = 0;
  let bytes = 0;
  
  try {
    for await (const entry of Deno.readDir(cacheDir)) {
      if (entry.isFile) {
        files++;
        const info = await Deno.stat(join(cacheDir, entry.name));
        bytes += info.size;
      } else if (entry.isDirectory) {
        // Recursively process subdirectories
        const { files: subFiles, bytes: subBytes } = await getDirStats(join(cacheDir, entry.name));
        files += subFiles;
        bytes += subBytes;
      }
    }
  } catch (error) {
    logger.debug(`Error getting cache stats: ${error}`);
  }
  
  return { files, bytes };
}

/**
 * Helper to get stats for a directory
 */
async function getDirStats(dir: string): Promise<{ files: number, bytes: number }> {
  let files = 0;
  let bytes = 0;
  
  try {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile) {
        files++;
        const info = await Deno.stat(fullPath);
        bytes += info.size;
      } else if (entry.isDirectory) {
        const { files: subFiles, bytes: subBytes } = await getDirStats(fullPath);
        files += subFiles;
        bytes += subBytes;
      }
    }
  } catch (error) {
    logger.debug(`Error getting directory stats for ${dir}: ${error}`);
  }
  
  return { files, bytes };
}

// Backward compatibility functions
export function registerTempFile(path: string): void {
  logger.debug(`Received request to register temp file: ${path}`);
  // In the new system, we don't need to track individual files
  // But we keep this function for backward compatibility
}

export function registerExceptionTempFile(path: string): void {
  logger.debug(`Received request to register exception file: ${path}`);
  // Register as explicit output in new system
  registerExplicitOutput(path);
}

export function getCachedFileContent(filePath: string): string | undefined {
  logger.debug(`Received request to get cached content for: ${filePath}`);
  // This function existed in the old system but we don't use it in the new one
  // Return undefined as we don't cache file contents in memory anymore
  return undefined;
}

export function getAllTrackedFiles(): string[] {
  // Legacy function for backward compatibility
  return [];
}

/**
 * Clear cache
 * This function removes all cached files to force regeneration
 */
export async function clearCache(): Promise<void> {
  const cacheDir = await getCacheDir();
  try {
    await Deno.remove(cacheDir, { recursive: true });
    logger.debug(`Cleared cache directory: ${cacheDir}`);
  } catch (error) {
    logger.debug(`Error clearing cache: ${error}`);
  }
  
  // Reset in-memory caches too
  contentHashCache.clear();
  outputPathCache.clear();
  
  // Recreate the cache directory
  await ensureDir(cacheDir);
}

/**
 * Special function to prepare stdlib in the cache
 * This creates a predictable location for the stdlib files
 */
export async function prepareStdlibInCache(): Promise<void> {
  const cacheDir = await getCacheDir();
  let stdlibSource = '';
  let jsDir = '';
  
  // Try to find stdlib in various locations
  const possibleLocations = [
    join(Deno.cwd(), "lib", "stdlib", "stdlib.hql"),
    join(Deno.cwd(), "core", "lib", "stdlib", "stdlib.hql"),
    join(Deno.cwd(), "..", "lib", "stdlib", "stdlib.hql")
  ];
  
  for (const location of possibleLocations) {
    if (await exists(location)) {
      stdlibSource = location;
      jsDir = join(dirname(location), "js");
      break;
    }
  }
  
  if (!stdlibSource) {
    logger.warn("Could not find stdlib.hql in any of the expected locations");
    return;
  }
  
  logger.debug(`Found stdlib at: ${stdlibSource}`);
  
  try {
    // Create predictable cache locations for stdlib
    const stdlibCacheDir = join(cacheDir, "lib", "stdlib");
    await ensureDir(stdlibCacheDir);
    
    // 1. Copy the HQL file itself
    const hqlContent = await readTextFile(stdlibSource);
    const stdlibHqlPath = join(stdlibCacheDir, "stdlib.hql");
    await writeTextFile(stdlibHqlPath, hqlContent);
    
    // 2. Create typescript version
    try {
      // We don't want to import the whole transpiler, so we'll just create a basic .ts wrapper
      const tsContent = `// Generated TypeScript wrapper for stdlib.hql
import { _take, _map, _filter, _reduce, _range, _rangeGenerator, _groupBy, _keys } from "./js/stdlib.js";

export const take = _take;
export const map = _map;
export const filter = _filter;
export const reduce = _reduce;
export const range = _range;
export const groupBy = _groupBy;
export const keys = _keys;
`;
      const stdlibTsPath = join(stdlibCacheDir, "stdlib.ts");
      await writeTextFile(stdlibTsPath, tsContent);
      logger.debug(`Created stdlib TypeScript wrapper at: ${stdlibTsPath}`);
      
      // Register this as a known mapping
      registerImportMapping(stdlibSource, stdlibTsPath);
      registerImportMapping(stdlibSource.replace(/\.hql$/, '.ts'), stdlibTsPath);
      
      // Also register with hash directory format
      const hash = await getContentHash(stdlibSource);
      const shortHash = hash.substring(0, 8);
      const hashDir = join(stdlibCacheDir, shortHash);
      await ensureDir(hashDir);
      
      const hashedStdlibTsPath = join(hashDir, "stdlib.ts");
      await writeTextFile(hashedStdlibTsPath, tsContent);
      logger.debug(`Created hashed stdlib TypeScript wrapper at: ${hashedStdlibTsPath}`);
      
      // 3. Copy JS implementations if they exist
      if (await exists(jsDir)) {
        const jsCacheDir = join(stdlibCacheDir, "js");
        const hashedJsCacheDir = join(hashDir, "js");
        await ensureDir(jsCacheDir);
        await ensureDir(hashedJsCacheDir);
        
        for await (const entry of Deno.readDir(jsDir)) {
          if (entry.isFile) {
            let jsContent = await readTextFile(join(jsDir, entry.name));
            
            // Sanitize any exported identifiers with hyphens
            const exportWithHyphenRegex = /export\s+(const|let|var|function)\s+([a-zA-Z0-9_-]+)/g;
            let exportMatch;
            while ((exportMatch = exportWithHyphenRegex.exec(jsContent)) !== null) {
              const exportId = exportMatch[2];
              if (exportId.includes('-')) {
                const sanitized = sanitizeHqlIdentifier(exportId);
                const fullMatch = exportMatch[0];
                const replacement = fullMatch.replace(exportId, sanitized);
                jsContent = jsContent.replace(fullMatch, replacement);
                
                // Also replace all other occurrences of this identifier
                const idRegex = new RegExp(`\\b${exportId}\\b`, 'g');
                jsContent = jsContent.replace(idRegex, sanitized);
              }
            }
            
            await writeTextFile(join(jsCacheDir, entry.name), jsContent);
            await writeTextFile(join(hashedJsCacheDir, entry.name), jsContent);
            logger.debug(`Copied JS implementation: ${entry.name}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Error preparing stdlib TypeScript: ${error}`);
    }
  } catch (error) {
    logger.error(`Error preparing stdlib in cache: ${error}`);
  }
}

/**
 * Process JavaScript files to fix their import paths when copied to cache
 * This ensures relative imports still work after moving to the cache
 */
export async function processJavaScriptFile(filePath: string): Promise<void> {
  try {
    // Check if the file exists
    if (!await exists(filePath)) {
      logger.debug(`JavaScript file does not exist: ${filePath}`);
      return;
    }
    
    // Read the JS file
    const content = await readTextFile(filePath);
    
    // Process the file for imports
    const processedContent = await processJavaScriptImports(content, filePath);
    
    // Write to cache
    const cachedPath = await writeToCachedPath(filePath, processedContent, ".js", { 
      preserveRelative: true
    });
    
    // Register this path for import resolution
    registerImportMapping(filePath, cachedPath);
    
    logger.debug(`Processed JavaScript file ${filePath} -> ${cachedPath}`);
  } catch (error) {
    logger.debug(`Error processing JavaScript file ${filePath}: ${error}`);
  }
}

/**
 * Process imports in JavaScript files to work in the cache directory
 */
async function processJavaScriptImports(content: string, filePath: string): Promise<string> {
  // First process HQL imports
  let result = await processHqlImportsInJs(content, filePath);
  
  // Then process JS imports to handle hyphenated filenames
  result = await processJsImportsInJs(result, filePath);
  
  return result;
}

/**
 * Process JavaScript imports in a JavaScript file, handling potential hyphenated filenames.
 * This is specifically for fixing issues with files that have hyphens in their names.
 */
async function processJsImportsInJs(content: string, filePath: string): Promise<string> {
  // Find JavaScript imports (both .js and without extension)
  const jsImportRegex = /import\s+.*\s+from\s+['"]([^'"]+(?:\.js|(?!\.\w+)(?!["'])))['"]/g;
  let modifiedContent = content;
  let match;
  
  // Reset lastIndex
  jsImportRegex.lastIndex = 0;
  
  logger.debug(`Processing JS imports in JS file: ${filePath}`);
  
  while ((match = jsImportRegex.exec(content)) !== null) {
    const fullImport = match[0];
    let importPath = match[1];
    
    // Skip absolute imports
    if (importPath.startsWith('file://') || importPath.startsWith('http') || 
        importPath.startsWith('npm:') || importPath.startsWith('jsr:')) {
      logger.debug(`Skipping absolute import: ${importPath}`);
      continue;
    }
    
    // Ensure the import path has a .js extension for path resolution
    const pathForResolving = importPath.endsWith('.js') ? importPath : importPath + '.js';
    
    try {
      // Resolve relative import path
      const resolvedImportPath = path.resolve(dirname(filePath), pathForResolving);
      
      // Handle potential filename variations for hyphenated paths
      const directory = dirname(resolvedImportPath);
      const fileName = path.basename(resolvedImportPath);
      const fileNameBase = fileName.replace(/\.js$/, '');
      
      // Check original filename
      let foundFile = false;
      if (await exists(resolvedImportPath)) {
        foundFile = true;
        // For cached files, copy the JS file to the cache
        if (!explicitOutputs.has(filePath)) {
          const cachedJsPath = await writeToCachedPath(resolvedImportPath, await readTextFile(resolvedImportPath), "", {
            preserveRelative: true
          });
          
          // Register the mapping
          registerImportMapping(resolvedImportPath, cachedJsPath);
          
          // Determine new import path
          let newImportPath: string;
          if (importPath.endsWith('.js')) {
            newImportPath = `file://${cachedJsPath}`;
          } else {
            // Preserve the original import without extension if that's how it was written
            newImportPath = `file://${cachedJsPath.replace(/\.js$/, '')}`;
          }
          
          const newImport = fullImport.replace(importPath, newImportPath);
          modifiedContent = modifiedContent.replace(fullImport, newImport);
          logger.debug(`Rewritten JS import: ${importPath} -> ${newImportPath}`);
        }
      }
      
      // If not found with original name, check alternative versions (convert dashes to underscores)
      if (!foundFile) {
        // Try with dashes converted to underscores
        const underscoreFileName = fileNameBase.replace(/-/g, '_') + '.js';
        const underscorePath = path.join(directory, underscoreFileName);
        
        if (await exists(underscorePath)) {
          logger.debug(`Found JS import with underscore name: ${importPath} -> ${underscorePath}`);
          
          // For cached files, copy the JS file to the cache
          if (!explicitOutputs.has(filePath)) {
            const cachedJsPath = await writeToCachedPath(underscorePath, await readTextFile(underscorePath), "", {
              preserveRelative: true
            });
            
            // Register the mapping
            registerImportMapping(resolvedImportPath, cachedJsPath); // Map from the expected path to the actual cache path
            
            // Determine new import path
            let newImportPath: string;
            if (importPath.endsWith('.js')) {
              newImportPath = `file://${cachedJsPath}`;
            } else {
              // Preserve the original import without extension if that's how it was written
              newImportPath = `file://${cachedJsPath.replace(/\.js$/, '')}`;
            }
            
            const newImport = fullImport.replace(importPath, newImportPath);
            modifiedContent = modifiedContent.replace(fullImport, newImport);
            logger.debug(`Rewritten JS import (underscore variant): ${importPath} -> ${newImportPath}`);
          }
        } else {
          logger.debug(`Could not find JS file for import: ${importPath} (tried ${resolvedImportPath} and ${underscorePath})`);
        }
      }
    } catch (error) {
      logger.debug(`Error processing JS import ${importPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Also handle namespace/named imports with hyphens
  const namedImportRegex = /import\s+{([^}]+)}\s+from/g;
  let importMatch;
  namedImportRegex.lastIndex = 0;
  
  while ((importMatch = namedImportRegex.exec(modifiedContent)) !== null) {
    const importedIds = importMatch[1].split(',').map(id => id.trim());
    let needsUpdate = false;
    let newImportList = [];
    
    for (const id of importedIds) {
      // Handle "as" syntax in imports
      const parts = id.split(' as ');
      const baseName = parts[0].trim();
      
      if (baseName.includes('-')) {
        const sanitized = sanitizeHqlIdentifier(baseName);
        if (parts.length > 1) {
          // Has 'as' alias
          newImportList.push(`${sanitized} as ${parts[1].trim()}`);
        } else {
          newImportList.push(sanitized);
        }
        needsUpdate = true;
      } else {
        newImportList.push(id);
      }
    }
    
    if (needsUpdate) {
      const oldImportSection = `{ ${importMatch[1]} }`;
      const newImportSection = `{ ${newImportList.join(', ')} }`;
      modifiedContent = modifiedContent.replace(oldImportSection, newImportSection);
      logger.debug(`Sanitized import identifiers: ${oldImportSection} -> ${newImportSection}`);
    }
  }
  
  // Also update namespace imports with hyphens (import * as name-with-hyphen from...)
  const namespaceImportRegex = /import\s+\*\s+as\s+([a-zA-Z0-9_-]+)\s+from/g;
  namespaceImportRegex.lastIndex = 0;
  
  while ((match = namespaceImportRegex.exec(modifiedContent)) !== null) {
    const importName = match[1];
    if (importName.includes('-')) {
      const sanitized = sanitizeHqlIdentifier(importName);
      
      // Replace in the import statement
      const oldImport = `* as ${importName} from`;
      const newImport = `* as ${sanitized} from`;
      modifiedContent = modifiedContent.replace(oldImport, newImport);
      
      // Also replace all other occurrences of this identifier
      const idRegex = new RegExp(`\\b${importName}\\b`, 'g');
      modifiedContent = modifiedContent.replace(idRegex, sanitized);
      
      logger.debug(`Sanitized namespace import: ${importName} -> ${sanitized}`);
    }
  }
  
  return modifiedContent;
}

/**
 * Process HQL imports in a JavaScript file, transpiling the HQL files and updating import paths.
 */
async function processHqlImportsInJs(content: string, filePath: string): Promise<string> {
  // Find HQL imports
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.(hql))['"]/g;
  let modifiedContent = content;
  let match;
  
  // Reset lastIndex
  hqlImportRegex.lastIndex = 0;
  
  logger.debug(`Processing HQL imports in JS file: ${filePath}`);
  
  while ((match = hqlImportRegex.exec(content)) !== null) {
    const fullImport = match[0];
    const importPath = match[1];
    
    // Skip absolute imports
    if (importPath.startsWith('file://') || importPath.startsWith('http') || 
        importPath.startsWith('npm:') || importPath.startsWith('jsr:')) {
      logger.debug(`Skipping absolute import: ${importPath}`);
      continue;
    }
    
    try {
      // Resolve relative import path
      const resolvedImportPath = path.resolve(dirname(filePath), importPath);
      
      // Check if the HQL file exists
      if (await exists(resolvedImportPath)) {
        logger.debug(`Found HQL import in JS file: ${importPath}`);
        
        // Use the processHqlFile function which handles nested imports properly
        const cachedTsPath = await processHqlFile(resolvedImportPath);
        
        // CRITICAL: Use absolute path with file:// for cache references
        const newImportPath = `file://${cachedTsPath}`;
        
        // Modify the import to use the new path
        const newImport = fullImport.replace(importPath, newImportPath);
        modifiedContent = modifiedContent.replace(fullImport, newImport);
        logger.debug(`Rewritten HQL import in JS: ${importPath} -> ${newImportPath}`);
      } else {
        logger.debug(`Could not find HQL file: ${resolvedImportPath}`);
      }
    } catch (error) {
      logger.debug(`Error processing HQL import in JS ${importPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return modifiedContent;
}

/**
 * Process nested imports in transpiled TypeScript content
 * This is critical for handling multi-level dependencies correctly
 */
async function processNestedImports(
  content: string, 
  originalPath: string, 
  cachedPath: string
): Promise<string> {
  // Find all imports in the transpiled TypeScript
  const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
  let modifiedContent = content;
  let match;
  
  // Reset lastIndex
  importRegex.lastIndex = 0;
  
  logger.debug(`Processing nested imports in ${cachedPath}`);
  
  while ((match = importRegex.exec(content)) !== null) {
    const fullImport = match[0];
    const importPath = match[1];
    
    // Skip absolute imports
    if (importPath.startsWith('file://') || importPath.startsWith('http') || 
        importPath.startsWith('npm:') || importPath.startsWith('jsr:')) {
      continue;
    }
    
    try {
      // Resolve the import path relative to the original source file
      const originalDir = dirname(originalPath);
      const resolvedImportPath = path.resolve(originalDir, importPath);
      
      // Check if this import is for an HQL file that needs to be cached
      if (resolvedImportPath.endsWith('.hql')) {
        if (await exists(resolvedImportPath)) {
          // Process the HQL file to ensure it's in the cache
          // This ensures the import chain is processed correctly
          const processedHqlPath = await processHqlFile(resolvedImportPath);
          
          // CRITICAL: Update import to use absolute file:// URL to cached path
          const newImport = fullImport.replace(importPath, `file://${processedHqlPath}`);
          modifiedContent = modifiedContent.replace(fullImport, newImport);
          logger.debug(`Rewritten nested import: ${importPath} -> file://${processedHqlPath}`);
        }
      } 
      // Handle TypeScript imports specially to ensure they reference cached versions
      else if (resolvedImportPath.endsWith('.ts')) {
        if (await exists(resolvedImportPath)) {
          // Get or create the cached version
          const cachedImportPath = await getCachedPath(resolvedImportPath, '.ts', {
            preserveRelative: true,
            createDir: true
          });
          
          // Register the mapping
          registerImportMapping(resolvedImportPath, cachedImportPath);
          
          // CRITICAL: Update import to use absolute file:// URL to cached path
          const newImport = fullImport.replace(importPath, `file://${cachedImportPath}`);
          modifiedContent = modifiedContent.replace(fullImport, newImport);
          logger.debug(`Rewritten nested TS import: ${importPath} -> file://${cachedImportPath}`);
        }
      }
      // Handle JavaScript imports
      else if (resolvedImportPath.endsWith('.js')) {
        if (await exists(resolvedImportPath)) {
          // Process JS file to handle any HQL imports it might have
          await processJavaScriptFile(resolvedImportPath);
          
          // Check if the JS file has been mapped to a cached version
          const cachedJsPath = getImportMapping(resolvedImportPath);
          
          if (cachedJsPath) {
            // Use the cached version
            const newImport = fullImport.replace(importPath, `file://${cachedJsPath}`);
            modifiedContent = modifiedContent.replace(fullImport, newImport);
            logger.debug(`Rewritten nested JS import: ${importPath} -> file://${cachedJsPath}`);
          } else {
            // Use the original path but with file:// prefix for absolute imports
            const newImport = fullImport.replace(importPath, `file://${resolvedImportPath}`);
            modifiedContent = modifiedContent.replace(fullImport, newImport);
            logger.debug(`Rewritten JS import to absolute path: ${importPath} -> file://${resolvedImportPath}`);
          }
        }
      }
    } catch (error) {
      logger.debug(`Error processing nested import ${importPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return modifiedContent;
}

/**
 * Convert hyphenated names to JavaScript-compatible names
 * (either camelCase or snake_case depending on configuration)
 */
function sanitizeHqlIdentifier(name: string, useSnakeCase = true): string {
  if (!name.includes('-')) {
    return name;
  }
  
  if (useSnakeCase) {
    // Convert hyphens to underscores (snake_case)
    return name.replace(/-/g, '_');
  } else {
    // Convert to camelCase
    return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }
}

/**
 * Process HQL file to TypeScript, ensuring correct cache paths for imports
 */
async function processHqlFile(sourceFile: string): Promise<string> {
  logger.debug(`Processing HQL file: ${sourceFile}`);
  
  try {
    // ALWAYS use preserveRelative for HQL files to ensure consistent path structure
    const cachedTsPath = await getCachedPath(sourceFile, '.ts', { 
      createDir: true,
      preserveRelative: true  // Always preserve relative structure for HQL files
    });
    
    // Check if we need to process this file
    if (await exists(cachedTsPath)) {
      // File exists in cache, check if it's still valid
      if (!await needsRegeneration(sourceFile, '.ts')) {
        logger.debug(`Using cached TypeScript for ${sourceFile}: ${cachedTsPath}`);
        
        // Register the mapping for future use
        registerImportMapping(sourceFile, cachedTsPath);
        registerImportMapping(sourceFile.replace(/\.hql$/, '.ts'), cachedTsPath);
        
        return cachedTsPath;
      }
    }
    
    // Process the HQL file to TypeScript
    logger.debug(`Transpiling HQL to TypeScript: ${sourceFile}`);
    
    // Run the transpiler via bundler
    const content = await readTextFile(sourceFile);
    const tsContent = await transpileHqlInJs(sourceFile, dirname(sourceFile));
    
    // Process any nested imports in the TypeScript content
    // This is critical for handling multi-level dependencies
    const processedContent = await processNestedImports(tsContent, sourceFile, cachedTsPath);
    
    // Write to cache
    await Deno.writeTextFile(cachedTsPath, processedContent);
    
    // Register the mapping for future use
    registerImportMapping(sourceFile, cachedTsPath);
    registerImportMapping(sourceFile.replace(/\.hql$/, '.ts'), cachedTsPath);
    
    logger.debug(`Processed HQL file ${sourceFile} to ${cachedTsPath}`);
    
    return cachedTsPath;
  } catch (error) {
    logger.error(`Error processing HQL file ${sourceFile}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Add this to the exports at the top of the file
export { processHqlFile };

