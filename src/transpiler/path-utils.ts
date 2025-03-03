// src/transpiler/path-utils.ts - Fixed return type issue
import { join, resolve, dirname, isAbsolute } from "jsr:@std/path@1.0.8";

// Caches for improved performance
const normalizedPathCache = new Map<string, string>();
const externalPathCache = new Map<string, boolean>();
const absolutePathCache = new Map<string, string>();
const importPathCache = new Map<string, Map<string, string>>();
const extensionResolveCache = new Map<string, string | null | undefined>();

/**
 * Check if a path refers to an external module
 * @param path The path to check
 * @returns True if the path is an external module reference
 */
export function isExternalModule(path: string | null | undefined): boolean {
  // Handle invalid input
  if (typeof path !== 'string') {
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
 * Normalize path separators for consistent usage
 * @param filePath The path to normalize
 * @returns Normalized path
 */
export function normalizePath(filePath: string): string {
  // Type safety
  if (typeof filePath !== 'string') {
    throw new Error(`Path must be a string: ${JSON.stringify(filePath)}`);
  }
  
  // Skip external modules
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
 * Resolve a relative import path against a base directory
 * @param importPath The import path to resolve
 * @param currentDir The base directory
 * @returns Resolved absolute path
 */
export function resolveImportPath(importPath: string, currentDir: string): string {
  // Skip external modules
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
 * @param hqlPath The HQL file path
 * @returns Equivalent JS file path
 */
export function hqlToJsPath(hqlPath: string): string {
  if (isExternalModule(hqlPath)) {
    return hqlPath;
  }
  return hqlPath.replace(/\.hql$/, '.js');
}

/**
 * Convert import specifiers to their canonical form
 * @param specifier The import specifier
 * @returns Canonical form of the import specifier
 */
export function convertImportSpecifier(specifier: string): string {
  // Handle npm: specifiers
  if (specifier.startsWith('npm:')) {
    return `https://esm.sh/${specifier.substring(4)}`;
  }
  
  // Handle jsr: specifiers
  if (specifier.startsWith('jsr:')) {
    return specifier; // Keep JSR specifiers as-is
  }
  
  // Handle std: specifiers (Deno standard library)
  if (specifier.startsWith('std:')) {
    const version = "0.170.0"; // Could be configurable
    const path = specifier.substring(4);
    return `https://deno.land/std@${version}/${path}`;
  }
  
  // Handle deno: specifiers
  if (specifier.startsWith('deno:')) {
    return specifier; // Built-ins, keep as-is
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

/**
 * Check if a file path has a specific extension
 * @param filePath The file path
 * @param ext The extension to check
 * @returns True if the file has the specified extension
 */
export function hasExtension(filePath: string, ext: string): boolean {
  return filePath.endsWith(ext);
}

/**
 * Check if a path exists (file or directory)
 * @param filePath The path to check
 * @returns Promise resolving to true if the path exists
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
 * @param basePath The base path without extension
 * @param extensions Array of extensions to try
 * @returns Promise resolving to the found path or null
 */
export async function resolveWithExtensions(
  basePath: string, 
  extensions = ['.hql', '.js', '.ts', '.tsx']
): Promise<string | null> {
  // Check cache first
  const cacheKey = `${basePath}:${extensions.join(',')}`;
  const cachedResult = extensionResolveCache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  // First try the path as-is
  if (await pathExists(basePath)) {
    extensionResolveCache.set(cacheKey, basePath);
    return basePath;
  }
  
  // Try with each extension
  for (const ext of extensions) {
    const pathWithExt = basePath.endsWith(ext) ? basePath : `${basePath}${ext}`;
    if (await pathExists(pathWithExt)) {
      extensionResolveCache.set(cacheKey, pathWithExt);
      return pathWithExt;
    }
  }
  
  // Try index files in directory
  if (!basePath.endsWith('/')) {
    for (const ext of extensions) {
      const indexPath = `${basePath}/index${ext}`;
      if (await pathExists(indexPath)) {
        extensionResolveCache.set(cacheKey, indexPath);
        return indexPath;
      }
    }
  }
  
  // Cache the negative result
  extensionResolveCache.set(cacheKey, null);
  return null;
}

/**
 * Get the directory from a file path
 * @param filePath The file path
 * @returns Directory containing the file
 */
export function getDirectory(filePath: string): string {
  return dirname(resolve(filePath));
}

/**
 * Helper to ensure a file path is absolute
 * @param filePath The file path
 * @returns Absolute path
 */
export function ensureAbsolutePath(filePath: string): string {
  // Type check to avoid errors
  if (typeof filePath !== 'string') {
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