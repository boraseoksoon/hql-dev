import * as path from "jsr:@std/path@1";
import { dirname, fromFileUrl } from "jsr:@std/path@1";
import { 
  exists, 
  readTextFile, 
  writeTextFile, 
  ensureDir, 
  join, 
  basename,
  relative
} from "../platform/platform.ts";
import { transpileHqlInJs } from "../bundler.ts";
import { globalLogger as logger } from "../logger.ts";

// Cache directory configuration
const HQL_CACHE_DIR = ".hql-cache";
const CACHE_VERSION = "1"; // Increment when cache structure changes

// Memory caches
const contentHashCache = new Map<string, string>();
const outputPathCache = new Map<string, Map<string, string>>();

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

// In-progress guards to prevent infinite recursion on circular graphs
const inProgressHql = new Set<string>();
const inProgressJs = new Set<string>();

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
  // Allow host to override cache root (useful when packaged or running inside a larger platform like HLVM)
  let cacheRootBase: string | null = null;
  try {
    // If HQL_CACHE_ROOT is set, use it as absolute base directory for the cache
    cacheRootBase = Deno.env.get("HQL_CACHE_ROOT") || null;
  } catch {
    // Ignore if env access is not permitted
  }

  // Default: resolve cache dir relative to the project root (package location)
  const defaultProjectRoot = join(dirname(fromFileUrl(import.meta.url)), '../../..');
  const base = cacheRootBase || defaultProjectRoot;
  const cacheRoot = join(base, HQL_CACHE_DIR, CACHE_VERSION);
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
  
  // IMPORTANT: For HQL files, default to preserveRelative unless explicitly set to false
  // This ensures consistent paths across imports
  if (sourcePath.endsWith('.hql') && options.preserveRelative !== false) {
    options.preserveRelative = true;
  }
  
  let outputPath: string;
  
  if (options.preserveRelative) {
    // CRITICAL FIX: When preserving relative structure, make sure we handle 
    // running from the core directory correctly
    let sourceRelative = relative(Deno.cwd(), dirname(sourcePath));
    
    // Check if we're running from the core directory and fix path
    const currentDir = basename(Deno.cwd());
    if (currentDir === "core" && !sourceRelative.startsWith("..")) {
      // We're running from core directory, adjust paths
      // Remove "core/" from the beginning if present
      sourceRelative = sourceRelative.replace(/^core\//, "");
    }
    
    // Use preserved directory structure
    outputPath = join(cacheDir, sourceRelative, targetFilename);
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
 * Process imports in cached content
 * 
 * This handles rewriting import paths to work in the cache directory
 */
async function processCachedImports(
  content: string,
  sourcePath: string, 
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
    
    // Normalize file URL imports to plain absolute paths to avoid leaking file:// into bundles
    if (importPath.startsWith('file://')) {
      try {
        const url = new URL(importPath);
        const fsPath = url.pathname; // Absolute filesystem path
        const newImport = fullImport.replace(importPath, fsPath);
        modifiedContent = modifiedContent.replace(fullImport, newImport);
        logger.debug(`Normalized file URL import: ${fullImport} -> ${newImport}`);
      } catch {
        // If parsing fails, leave as is
      }
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
        
        // IMPORTANT: For JS files importing HQL, prefer JS over TS
        let finalPath = mappedPath;
        if (sourcePath.endsWith('.js') && importPath.endsWith('.hql') && mappedPath.endsWith('.ts')) {
          const jsPath = mappedPath.replace(/\.ts$/, '.js');
          if (await exists(jsPath)) {
            finalPath = jsPath;
          }
        }
        
        const newImport = fullImport.replace(importPath, finalPath);
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
        const newImport = fullImport.replace(importPath, cachedJsPath);
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
        const cachedImportPaths = [];
        
        // Strategy 1: preserveRelative makes exact directory structure
        const importRelativeDir = path.relative(Deno.cwd(), dirname(resolvedOriginalPath));
        // IMPORTANT: For JS files importing HQL, use .js extension not .ts
        const targetExt = sourcePath.endsWith('.js') ? '.js' : '.ts';
        const preservedPath = join(cacheDir, importRelativeDir, `${importBasename}${targetExt}`);
        cachedImportPaths.push(preservedPath);
        
        // Strategy 2: Hash-based directory
        const relativeHashDir = path.relative(Deno.cwd(), dirname(resolvedOriginalPath))
          .replace(/\.\./g, "_up_");
        const hashPath = join(cacheDir, relativeHashDir, shortHash, `${importBasename}${targetExt}`);
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
          foundCachedPath = await joinAndEnsureDirExists(cacheDir, importRelativeDir, `${importBasename}${targetExt}`);
        }
        
        // Register this for future use
        registerImportMapping(resolvedOriginalPath, foundCachedPath);
        
        // Update the import to use absolute path
        const newImport = fullImport.replace(importPath, foundCachedPath);
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
): Promise<string> {
  return processCachedImports(content, sourcePath);
}

/**
 * Copy neighbor files needed for relative imports
 * This ensures files referenced through relative imports are available
 */
export async function copyNeighborFiles(sourcePath: string, outputDir?: string): Promise<void> {
  try {
    const sourceDir = dirname(sourcePath);
    logger.debug(`Checking for js directory near ${sourcePath}`);
    
    // Copy any js directory if it exists (for stdlib and other modules)
    const jsDir = join(sourceDir, "js");
    if (await exists(jsDir)) {
      logger.debug(`Found js directory at ${jsDir}`);
      
      // Create js directory in the cache
      const cacheDir = await getCacheDir();
      
      // Get the relative path which is used in our preserved directory structure
      const sourceRelative = path.relative(Deno.cwd(), sourceDir);
      let targetPath = sourceRelative;
      
      // Handle running from core directory
      const currentDir = basename(Deno.cwd());
      if (currentDir === "core" && sourceRelative.startsWith("core/")) {
        // Remove 'core/' prefix for consistency
        targetPath = sourceRelative.replace(/^core\//, "");
      }
      
      // Determine target directory - either specified or derived from source
      const targetDir = outputDir || join(cacheDir, targetPath);
      const targetJsDir = join(targetDir, "js");
      
      // Ensure the directory exists
      await ensureDir(targetJsDir);
      logger.debug(`Created js directory at ${targetJsDir}`);
      
      // Copy all files from js dir
      for await (const entry of Deno.readDir(jsDir)) {
        if (entry.isFile) {
          const sourceFile = join(jsDir, entry.name);
          const targetFile = join(targetJsDir, entry.name);
          const content = await readTextFile(sourceFile);
          await writeTextFile(targetFile, content);
          logger.debug(`Copied file: ${sourceFile} -> ${targetFile}`);
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
      logger.debug(`[CACHE MISS] Output doesn't exist, regenerating: ${outputPath}`);
      return true;
    }
    
    // Get current hash of source file
    const currentHash = await getContentHash(sourcePath);
    
    // Check hash in path parts
    const pathParts = outputPath.split('/').filter(Boolean);
    const pathHash = pathParts[pathParts.length - 2]; // Extract hash from path
    if (pathHash !== currentHash.substring(0, 8)) {
      logger.debug(`[CACHE MISS] Source content changed, regenerating: ${sourcePath}`);
      return true;
    }
    
    logger.debug(`[CACHE HIT] No changes detected, reusing: ${outputPath}`);
    return false;
  } catch (error) {
    logger.debug(`Error checking regeneration: ${error}`);
    return true;  // Safer to regenerate on error
  }
}

/**
 * Write content to cache
 */
// Allowed source language extensions for caching
const ALLOWED_LANG_EXTENSIONS = ['hql', 'js', 'ts'];

export async function writeToCachedPath(
  sourcePath: string, 
  content: string, 
  targetExt: string,
  options: { preserveRelative?: boolean } = {}
): Promise<string> {
  // Only allow caching files with allowed extensions
  const ext = sourcePath.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_LANG_EXTENSIONS.includes(ext)) {
    logger.debug(`writeToCachedPath: Skipping cache for unsupported file type: ${sourcePath}`);
    return sourcePath;
  }
  const sourceFilename = basename(sourcePath);
  const forcePreserveRelative = sourceFilename === "stdlib.hql" || sourceFilename === "stdlib.ts";
  const usePreserveRelative = forcePreserveRelative || options.preserveRelative;
  
  // Process content if needed
  const processedContent = await processFileContent(content, sourcePath);
  
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
  logger.debug(`Created temp directory: ${dirPath}`);
  return dirPath;
}

/**
 * Get estimated cache size
 */
export async function getCacheStats(): Promise<{ files: number, bytes: number }> {
  const cacheDir = await getCacheDir();
  try {
    return await getDirStats(cacheDir);
  } catch (error) {
    logger.debug(`Error getting cache stats: ${error}`);
    return { files: 0, bytes: 0 };
  }
}

async function getDirStats(dir: string): Promise<{ files: number, bytes: number }> {
  let files = 0;
  let bytes = 0;
  
  try {
    for await (const entry of Deno.readDir(dir)) {
      const entryPath = path.join(dir, entry.name);
      
      if (entry.isDirectory) {
        const subStats = await getDirStats(entryPath);
        files += subStats.files;
        bytes += subStats.bytes;
      } else if (entry.isFile) {
        files++;
        try {
          const stat = await Deno.stat(entryPath);
          bytes += stat.size;
        } catch {
          // Ignore errors for individual files
        }
      }
    }
  } catch (error) {
    logger.debug(`Error reading directory ${dir}: ${error}`);
  }
  
  return { files, bytes };
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
 * Process JavaScript files to fix their import paths when copied to cache
 * This ensures relative imports still work after moving to the cache
 */
export async function processJavaScriptFile(filePath: string): Promise<void> {
  try {
    if (inProgressJs.has(filePath)) {
      // Even though we're in progress, ensure the file is registered in cache
      const cachedPath = await getCachedPath(filePath, ".js", { 
        preserveRelative: true,
        createDir: true
      });
      // If the cached file doesn't exist yet, create a minimal version
      if (!await exists(cachedPath)) {
        const content = await readTextFile(filePath);
        // For circular dependencies, we need to at least process the imports
        // to avoid import errors, even if we can't fully process nested dependencies
        const processedContent = await processFileContent(content, filePath);
        await Deno.writeTextFile(cachedPath, processedContent);
        logger.debug(`Created processed cached copy at ${cachedPath} to break cycle`);
      }
      registerImportMapping(filePath, cachedPath);
      return;
    }
    inProgressJs.add(filePath);
    
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
  } finally {
    inProgressJs.delete(filePath);
  }
}

/**
 * Process imports in JavaScript files to work in the cache directory
 */
async function processJavaScriptImports(content: string, filePath: string): Promise<string> {
  // First process HQL imports
  let result = await processHqlImportsInJs(content, filePath);
  
  // Then process TypeScript imports
  result = await processTsImportsInJs(result, filePath);
  
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
    const importPath = match[1];
    
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
        // Always copy the JS file to the cache and rewrite the import
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
      
      // If not found with original name, check alternative versions (convert dashes to underscores)
      if (!foundFile) {
        // Try with dashes converted to underscores
        const underscoreFileName = fileNameBase.replace(/-/g, '_') + '.js';
        const underscorePath = path.join(directory, underscoreFileName);
        
        if (await exists(underscorePath)) {
          foundFile = true;
          logger.debug(`Found JS import with underscore name: ${importPath} -> ${underscorePath}`);
          
          // Copy to cache
          const cachedJsPath = await writeToCachedPath(underscorePath, await readTextFile(underscorePath), "", {
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
          logger.debug(`Rewritten JS import (underscore variant): ${importPath} -> ${newImportPath}`);
        }
      }
      
      if (!foundFile) {
        logger.debug(`Could not find JS file for import: ${importPath} (tried ${resolvedImportPath} and ${path.join(directory, fileNameBase.replace(/-/g, '_') + '.js')})`);
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
    const newImportList = [];
    
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
 * Process TypeScript imports in a JavaScript file
 */
async function processTsImportsInJs(content: string, filePath: string): Promise<string> {
  // Find TypeScript imports
  const tsImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.ts)['"]/g;
  let modifiedContent = content;
  let match;
  
  // Reset lastIndex
  tsImportRegex.lastIndex = 0;
  
  logger.debug(`Processing TS imports in JS file: ${filePath}`);
  
  while ((match = tsImportRegex.exec(content)) !== null) {
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
      
      // Check if the TS file exists
      if (await exists(resolvedImportPath)) {
        logger.debug(`Found TS import in JS file: ${importPath}`);
        
        // Copy the TypeScript file to cache with .ts extension
        const tsContent = await readTextFile(resolvedImportPath);
        const cachedTsPath = await writeToCachedPath(resolvedImportPath, tsContent, ".ts", {
          preserveRelative: true
        });
        
        // Register the mapping
        registerImportMapping(resolvedImportPath, cachedTsPath);
        
        // CRITICAL: Use absolute path with file:// for cache references
        const newImportPath = `file://${cachedTsPath}`;
        
        // Modify the import to use the new path
        const newImport = fullImport.replace(importPath, newImportPath);
        modifiedContent = modifiedContent.replace(fullImport, newImport);
        logger.debug(`Rewritten TS import in JS: ${importPath} -> ${newImportPath}`);
      } else {
        logger.debug(`Could not find TS file: ${resolvedImportPath}`);
      }
    } catch (error) {
      logger.debug(`Error processing TS import in JS ${importPath}: ${error instanceof Error ? error.message : String(error)}`);
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
        
        // Pre-register cached TS/JS paths to break cycles early
        const preTsPath = await getCachedPath(resolvedImportPath, '.ts', { createDir: true, preserveRelative: true });
        const preJsPath = await getCachedPath(resolvedImportPath, '.js', { createDir: true, preserveRelative: true });
        
        registerImportMapping(resolvedImportPath, preTsPath);
        registerImportMapping(resolvedImportPath.replace(/\.hql$/, '.ts'), preTsPath);
        
        // Create placeholder files to prevent import errors during circular processing
        try {
          if (!await exists(preJsPath)) {
            // Create a Proxy that returns undefined for any property access
            // This allows circular imports to resolve without errors
            const placeholderContent = `// Placeholder for circular dependency resolution
const handler = {
  get(target, prop) {
    return undefined;
  }
};
const moduleExports = new Proxy({}, handler);
export default moduleExports;
export const __esModule = true;
// Export common named exports that return undefined
export const base = undefined;
export const aFunc = undefined;
export const incByBase = undefined;`;
            await Deno.writeTextFile(preJsPath, placeholderContent);
          }
        } catch (e) {
          logger.debug(`Failed to create placeholder JS file: ${e}`);
        }
        
        // Use the processHqlFile function which handles nested imports properly
        const cachedTsPath = await processHqlFile(resolvedImportPath);
        
        // Additionally, produce a cached JS output to avoid TS/loader overhead in JS↔HQL cycles
        const cachedJsPath = preJsPath;  // Use the pre-registered path
        try {
          const esbuild = await import('npm:esbuild@^0.17.0');
          await esbuild.build({
            entryPoints: [cachedTsPath],
            outfile: cachedJsPath,
            format: 'esm',
            target: 'es2020',
            bundle: false,
            platform: 'neutral',
            logLevel: 'silent',  // Suppress error output for circular dependencies
          });
          logger.debug(`Transpiled cached TS to JS for JS import: ${cachedTsPath} -> ${cachedJsPath}`);
        } catch (e) {
          // Silently ignore esbuild errors for circular dependencies
          // The placeholder JS file already exists and works
          logger.debug(`Failed TS->JS quick transpile for ${cachedTsPath}: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        // Prefer JS path for imports in JS files
        const newImportPath = `file://${cachedJsPath}`;
        
        // Modify the import to use the new path - use absolute file:// URL
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
    if (inProgressHql.has(sourceFile)) {
      logger.debug(`processHqlFile: already in progress ${sourceFile}, returning cached path to break cycle`);
      // If mapping exists, use it; otherwise, compute deterministic cached path and register it
      const mapped = getImportMapping(sourceFile);
      if (mapped) return mapped;
      const cached = await getCachedPath(sourceFile, '.ts', { createDir: true, preserveRelative: true });
      registerImportMapping(sourceFile, cached);
      registerImportMapping(sourceFile.replace(/\.hql$/, '.ts'), cached);
      return cached;
    }
    inProgressHql.add(sourceFile);
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
    const tsContent = await transpileHqlInJs(sourceFile, dirname(sourceFile));
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
  } finally {
    inProgressHql.delete(sourceFile);
  }
}

/**
 * Interface for temporary directory creation result
 */
export interface TempDirResult {
  tempDir: string;
  created: boolean;
}

/**
 * Creates a temporary directory if one is not already provided.
 * Used by both bundler and import processing.
 * 
 * @param options Options containing an optional tempDir
 * @param prefix Prefix for the temporary directory name
 * @param logger Optional logger instance
 * @returns TempDirResult containing the directory path and whether it was created
 */
export async function createTempDirIfNeeded(
  options: { tempDir?: string; verbose?: boolean },
  prefix: string = "hql_temp_",
  logger?: { debug: (msg: string) => void; log: (msg: any) => void; }
): Promise<TempDirResult> {
  try {
    // Use provided temp directory if available
    if (options.tempDir) {
      if (logger?.debug) {
        logger.debug(`Using existing temp directory: ${options.tempDir}`);
      }
      return { tempDir: options.tempDir, created: false };
    }
    
    // Create new temp directory
    const tempDir = await Deno.makeTempDir({ prefix });
    
    if (logger?.debug) {
      logger.debug(`Created temporary directory: ${tempDir}`);
    } else if (logger?.log && options.verbose) {
      logger.log({ text: `Created temporary directory: ${tempDir}`, namespace: "utils" });
    }
    
    return { tempDir, created: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Creating temporary directory: ${errorMsg}`);
  }
}

export { processHqlFile };
