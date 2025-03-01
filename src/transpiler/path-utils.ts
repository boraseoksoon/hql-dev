// src/transpiler/path-utils.ts
import { join, resolve, dirname, isAbsolute } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Cache for normalized paths to avoid redundant operations
 */
const normalizedPathCache = new Map<string, string>();

/**
 * Cache for checking if a path is external
 */
const externalPathCache = new Map<string, boolean>();

/**
 * Cache for absolute path resolution
 */
const absolutePathCache = new Map<string, string>();

/**
 * Cache for resolved import paths
 */
const importPathCache = new Map<string, Map<string, string>>();

/**
 * Check if a path refers to an external module
 * This includes all supported Deno module systems
 * Uses a cache to avoid redundant checks
 */
export function isExternalModule(path: string | null | undefined): boolean {
  // Type check to avoid errors
  if (typeof path !== 'string') {
    console.warn(`Invalid path provided to isExternalModule:`, path);
    return false;
  }
  
  // Check cache first
  if (externalPathCache.has(path)) {
    return externalPathCache.get(path)!;
  }
  
  const result = path.startsWith('http://') ||
         path.startsWith('https://') ||
         path.startsWith('npm:') ||
         path.startsWith('jsr:') ||
         path.startsWith('deno:') ||
         path.startsWith('std:') ||
         path.startsWith('node:') ||
         (!path.startsWith('./') && 
          !path.startsWith('../') && 
          !path.startsWith('/') &&
          !isAbsolute(path) &&
          !path.includes(':'));  // Bare specifiers (but not Windows drive letters)
  
  // Cache the result
  externalPathCache.set(path, result);
  return result;
}

/**
 * Resolve a relative import path against a base directory
 * Uses a cache to avoid redundant resolutions
 */
export function resolveImportPath(importPath: string, currentDir: string): string {
  if (isExternalModule(importPath)) {
    return importPath;
  }
  
  // Check cache first
  if (!importPathCache.has(currentDir)) {
    importPathCache.set(currentDir, new Map());
  }
  
  const dirCache = importPathCache.get(currentDir)!;
  if (dirCache.has(importPath)) {
    return dirCache.get(importPath)!;
  }
  
  let resolvedPath: string;
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    resolvedPath = normalizePath(resolve(join(currentDir, importPath)));
  } else if (importPath.startsWith('/') || isAbsolute(importPath)) {
    resolvedPath = normalizePath(resolve(importPath));
  } else {
    resolvedPath = importPath;
  }
  
  // Cache the result
  dirCache.set(importPath, resolvedPath);
  return resolvedPath;
}

/**
 * Convert an HQL path to its corresponding JS path
 */
export function hqlToJsPath(hqlPath: string): string {
  if (isExternalModule(hqlPath)) {
    // For external modules, keep the same path
    return hqlPath;
  }
  return hqlPath.replace(/\.hql$/, '.js');
}

/**
 * Get the directory from a file path
 */
export function getDirectory(filePath: string): string {
  return dirname(resolve(filePath));
}

/**
 * Check if a file path has a specific extension
 */
export function hasExtension(filePath: string, ext: string): boolean {
  return filePath.endsWith(ext);
}

/**
 * Helper to ensure a file path is absolute
 * Uses a cache to avoid redundant operations
 */
export function ensureAbsolutePath(filePath: string | any): string {
  // Type check to avoid errors
  if (typeof filePath !== 'string') {
    console.error(`ensureAbsolutePath received non-string:`, filePath);
    throw new Error(`Path must be a string. Received ${JSON.stringify(filePath)}`);
  }
  
  // External modules are already absolute
  if (isExternalModule(filePath)) {
    return filePath;
  }
  
  // Check cache first
  if (absolutePathCache.has(filePath)) {
    return absolutePathCache.get(filePath)!;
  }
  
  const absPath = resolve(filePath);
  
  // Cache the result
  absolutePathCache.set(filePath, absPath);
  return absPath;
}

/**
 * Normalize path separators for consistent usage in maps and comparisons
 * Uses a cache to avoid redundant operations
 */
export function normalizePath(filePath: string | any): string {
  // Type check to avoid errors
  if (typeof filePath !== 'string') {
    console.error(`normalizePath received non-string:`, filePath);
    throw new Error(`Path must be a string. Received ${JSON.stringify(filePath)}`);
  }
  
  // External modules don't need normalization
  if (isExternalModule(filePath)) {
    return filePath;
  }
  
  // Check cache first
  if (normalizedPathCache.has(filePath)) {
    return normalizedPathCache.get(filePath)!;
  }
  
  // Replace Windows path separators with Unix ones for consistency
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Cache the result
  normalizedPathCache.set(filePath, normalizedPath);
  return normalizedPath;
}

/**
 * Check if a path exists (file or directory)
 */
export async function pathExists(filePath: string): Promise<boolean> {
  if (isExternalModule(filePath)) {
    return true; // Assume external modules exist
  }
  
  try {
    await Deno.stat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

/**
 * Try multiple extensions to find a file
 */
export async function resolveWithExtensions(
  basePath: string, 
  extensions = ['.hql', '.js', '.ts', '.tsx']
): Promise<string | null> {
  // First try the path as-is
  if (await pathExists(basePath)) {
    return basePath;
  }
  
  // Try with each extension
  for (const ext of extensions) {
    const pathWithExt = basePath.endsWith(ext) ? basePath : `${basePath}${ext}`;
    if (await pathExists(pathWithExt)) {
      return pathWithExt;
    }
  }
  
  // Try index files in directory
  if (!basePath.endsWith('/')) {
    for (const ext of extensions) {
      const indexPath = `${basePath}/index${ext}`;
      if (await pathExists(indexPath)) {
        return indexPath;
      }
    }
  }
  
  return null;
}

/**
 * Convert import specifiers to their equivalent JS paths
 */
export function convertImportSpecifier(specifier: string): string {
  // Handle npm: specifiers
  if (specifier.startsWith('npm:')) {
    // Convert npm: to node_modules/ (simplified for illustration)
    return `https://esm.sh/${specifier.substring(4)}`;
  }
  
  // Handle jsr: specifiers
  if (specifier.startsWith('jsr:')) {
    // JSR imports can be used directly in Deno, but for bundling we
    // may want to convert to their CDN URLs
    return specifier;
  }
  
  // Handle std: specifiers (Deno standard library)
  if (specifier.startsWith('std:')) {
    const version = "0.170.0"; // Could be configurable
    const path = specifier.substring(4);
    return `https://deno.land/std@${version}/${path}`;
  }
  
  // Handle deno: specifiers
  if (specifier.startsWith('deno:')) {
    // These are built-ins, so keep them as is
    return specifier;
  }
  
  // Handle node: specifiers
  if (specifier.startsWith('node:')) {
    // Convert node: specifiers to Deno-compatible polyfills
    const nodePath = specifier.substring(5);
    return `https://deno.land/std@0.170.0/node/${nodePath}.ts`;
  }
  
  // For bare specifiers (e.g., 'lodash')
  if (isExternalModule(specifier) && 
      !specifier.startsWith('http:') && 
      !specifier.startsWith('https:')) {
    // Use esm.sh as a CDN for Node packages
    return `https://esm.sh/${specifier}`;
  }
  
  return specifier;
}