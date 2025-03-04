// src/utils.ts
// Core utilities that don't have external dependencies

/**
 * Convert kebab-case to camelCase
 * @param name String to convert
 * @returns camelCase version of the input
 */
export function hyphenToCamel(name: string): string {
    if (!name || typeof name !== 'string') {
      return name;
    }
    
    // Replace any character after a hyphen with its uppercase version
    return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }