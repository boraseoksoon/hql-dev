// src/system-macros.ts

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

/**
 * Registry of system macro files
 * Add new macro files here to make them available to the system
 */
export const SYSTEM_MACRO_PATHS = [
  "core/lib/macro/core.hql",
  "core/lib/macro/loop.hql"
];

/**
 * Get the absolute paths for all system macro files
 */
export function getSystemMacroPaths(): string[] {
  const cwd = Deno.cwd();
  
  // Check if we're already in the core directory
  const isInCoreDir = cwd.endsWith("/core") || cwd.endsWith("\\core");
  
  // Paths without 'core/' prefix when already in core directory
  const actualPaths = isInCoreDir 
    ? SYSTEM_MACRO_PATHS.map(p => p.replace(/^core\//, ''))
    : SYSTEM_MACRO_PATHS;
  
  return actualPaths.map(macroPath => path.join(cwd, macroPath));
}