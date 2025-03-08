// src/utils.ts - Enhanced with identifier sanitization

/**
 * Sanitize a string to be a valid JavaScript identifier
 * - Converts hyphens to underscores
 * - Converts question marks and other special chars to valid suffixes
 * - Ensures the name starts with a valid character
 * - Removes any other invalid characters
 */
export function sanitizeIdentifier(name: string): string {
  // Special handling for Lisp-style naming conventions
  let sanitized = name;
  
  // Handle question mark suffixes (common in predicate functions)
  if (sanitized.endsWith('?')) {
    sanitized = sanitized.slice(0, -1) + '_pred';
  }
  
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