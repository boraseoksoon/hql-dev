// src/utils.ts - Refactored

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

const REMOTE_PATH_PREFIXES = new Set(['npm:', 'jsr:', 'http:', 'https:']);


/**
 * Sanitize a string to be a valid JavaScript identifier
 * - Preserves dots for module property access
 * - Converts hyphens to underscores
 * - Converts question marks to _pred suffix
 */
export function sanitizeIdentifier(name: string): string {
  // Special handling for module property access (name contains a dot)
  if (name.includes('.')) {
    const parts = name.split('.');
    // Sanitize each part separately, then rejoin with dots
    return parts.map(part => sanitizeBasicIdentifier(part)).join('.');
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
  sanitized = sanitized.replace(/-/g, '_');
  
  // Ensure the name starts with a letter, underscore, or dollar sign
  if (!/^[a-zA-Z_$]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  
  // Remove any remaining invalid characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9_$]/g, '');
  
  return sanitized;
}

/**
 * Check if a path is a URL
 */
export function isUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

/**
 * Check if a module path is a remote module
 */
export function isRemoteModule(modulePath: string): boolean {
  return Array.from(REMOTE_PATH_PREFIXES).some(prefix => modulePath.startsWith(prefix));
}

/**
 * Check if a module is a JavaScript module
 */
export function isJavaScriptModule(modulePath: string): boolean {
  return modulePath.endsWith('.js') || 
         modulePath.endsWith('.mjs') || 
         modulePath.endsWith('.cjs');
}

/**
 * Check if a path is a remote path (npm, jsr, http)
 */
export function isRemotePath(path: string): boolean {
  return Array.from(REMOTE_PATH_PREFIXES).some(prefix => path.startsWith(prefix));
}

/**
 * Helper to escape special regex characters
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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