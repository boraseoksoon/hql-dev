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
  // Always resolve macro paths relative to the core/src/s-exp directory (the location of this file)
  const systemMacrosDir = path.dirname(path.fromFileUrl(import.meta.url));
  // Go up two levels to reach the project root, then resolve macro files
  const projectRoot = path.resolve(systemMacrosDir, '../../..');
  return SYSTEM_MACRO_PATHS.map(macroPath => path.join(projectRoot, macroPath));
}