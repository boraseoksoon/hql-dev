// Simple TypeScript module that exports functions

/**
 * Format a string with a TypeScript prefix
 */
export function formatString(input: string): string {
  return `[TS] ${input}`;
}

/**
 * Convert a string to uppercase
 */
export function uppercaseString(input: string): string {
  return input.toUpperCase();
}

/**
 * TypeScript version information
 */
export const TS_INFO = {
  version: "1.0.0",
  language: "TypeScript",
  timestamp: new Date().toISOString()
}; 