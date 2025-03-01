// src/transpiler/path-utils.ts
import { join, resolve, dirname } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Utility functions for path handling in the transpiler
 */

/**
 * Check if a path refers to an external module
 */
export function isExternalModule(path: string): boolean {
  return path.startsWith('http://') ||
         path.startsWith('https://') ||
         path.startsWith('npm:') ||
         path.startsWith('jsr:');
}

/**
 * Resolve a relative import path against a base directory
 */
export function resolveImportPath(importPath: string, currentDir: string): string {
  if (isExternalModule(importPath)) {
    return importPath;
  }
  
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return resolve(join(currentDir, importPath));
  }
  
  return importPath;
}

/**
 * Convert an HQL path to its corresponding JS path
 */
export function hqlToJsPath(hqlPath: string): string {
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
 */
export function ensureAbsolutePath(filePath: string): string {
  return isExternalModule(filePath) ? filePath : resolve(filePath);
}