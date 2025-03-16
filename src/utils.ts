// src/utils.ts - Enhanced with identifier sanitization

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
  
  // Handle question mark suffixes (common in predicate functions)
  if (sanitized.endsWith('?')) {
    sanitized = sanitized.slice(0, -1) + '_pred';
  }
  
  // Handle question marks in other positions
  sanitized = sanitized.replace(/\?/g, '_pred_');
  
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