// src/utils.ts - Enhanced with identifier sanitization

/**
 * Convert hyphenated names to camelCase
 * e.g., "my-var-name" → "myVarName"
 */
export function hyphenToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Sanitize a string to be a valid JavaScript identifier
 * - Converts hyphens to underscores
 * - Ensures the name starts with a valid character
 * - Removes any invalid characters
 */
export function sanitizeIdentifier(name: string): string {
  // Replace hyphens with underscores
  let sanitized = name.replace(/-/g, '_');
  
  // Ensure the name starts with a letter, underscore, or dollar sign
  if (!/^[a-zA-Z_$]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  
  // Remove any remaining invalid characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9_$]/g, '');
  
  return sanitized;
}