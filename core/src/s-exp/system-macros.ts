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
  // Get the absolute path to the project root
  const cwd = Deno.cwd();
  
  // Extract the project root
  // This handles running from core/, repl/, or the project root
  let projectRoot = cwd;
  
  // If we're in a subdirectory like 'core' or 'repl'
  if (cwd.includes('/core') || cwd.includes('/repl')) {
    // Go up to find the project root - handles cases like:
    // /path/to/hql/core or /path/to/hql/core/examples
    const parts = cwd.split('/');
    let rootIndex = -1;
    
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === 'core' || parts[i] === 'repl') {
        rootIndex = i;
        break;
      }
    }
    
    if (rootIndex >= 0) {
      // Go up one directory from the 'core' or 'repl' folder
      projectRoot = parts.slice(0, rootIndex).join('/');
    }
  }
  
  // Use shared directory for macros
  const sharedMacroDir = path.join(projectRoot, "shared", "lib", "macro");
  
  // Return absolute paths to the macro files
  return [
    path.join(sharedMacroDir, "core.hql"),
    path.join(sharedMacroDir, "loop.hql")
  ];
}