// src/system-macros.ts
// Central registry of all system macro files

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

/**
 * Registry of system macro files
 * Add new macro files here to make them available to the system
 */
export const SYSTEM_MACRO_PATHS = [
  "lib/macro/core.hql",
  "lib/macro/loop.hql"
];

/**
 * Get the absolute paths for all system macro files
 */
export function getSystemMacroPaths(): string[] {
  const cwd = Deno.cwd();
  return SYSTEM_MACRO_PATHS.map(macroPath => path.join(cwd, macroPath));
}

/**
 * Check if a file is a system macro file
 */
export function isSystemMacroFile(filePath: string): boolean {
  // Get the base file name
  const baseName = path.basename(filePath);
  
  // Check if any system macro path ends with this file name
  return SYSTEM_MACRO_PATHS.some(macroPath => {
    const systemBaseName = path.basename(macroPath);
    return systemBaseName === baseName;
  });
}