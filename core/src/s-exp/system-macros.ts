// src/system-macros.ts
// Central registry of all system macro files

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { Environment } from "../environment.ts";
import { parse } from "../transpiler/pipeline/parser.ts";
import { expandMacros } from "./macro.ts";
import { processImports } from "../imports.ts";
import { transformSyntax } from "../transpiler/pipeline/syntax-transformer.ts";
import { globalLogger as logger } from "../logger.ts";
import { ImportError, TranspilerError } from "../transpiler/error/errors.ts";

// Maps macro name to the file path where it's defined
const macroFileMap: Map<string, string> = new Map();
// Maps file paths to their parsed and cached expressions
const macroExpressionsCache: Map<string, any[]> = new Map();
// Set of already loaded macro files
const loadedMacroFiles: Set<string> = new Set();
// Cache for resolved file paths to avoid repeatedly searching
const resolvedPathCache: Map<string, string> = new Map();

/**
 * Registry of system macro files
 * Always use relative paths from project root
 */
export const SYSTEM_MACRO_PATHS = [
  "core/lib/macro/core.hql",
  "core/lib/macro/loop.hql"
];

/**
 * Get the project root directory
 * This attempts multiple strategies to find the project root
 */
function getProjectRoot(): string {
  try {
    // Strategy 1: Start with current directory and look for key marker files
    const markerFiles = ['core/lib/macro/core.hql', 'repl/repl/repl.ts', 'package.json'];
    
    let currentDir = Deno.cwd();
    // Try up to 3 levels up from current directory
    for (let i = 0; i < 3; i++) {
      for (const marker of markerFiles) {
        try {
          const testPath = path.join(currentDir, marker);
          const stat = Deno.statSync(testPath);
          if (stat.isFile) {
            logger.debug(`Found project root at: ${currentDir} (using marker: ${marker})`);
            return currentDir;
          }
        } catch (_) {
          // Continue to next marker
        }
      }
      // Move up one directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached root
      currentDir = parentDir;
    }
    
    // Strategy 2: Check if we're in a known location within the project
    const cwd = Deno.cwd();
    if (cwd.endsWith('/core') || cwd.endsWith('\\core')) {
      return path.dirname(cwd);
    }
    if (cwd.endsWith('/repl') || cwd.endsWith('\\repl')) {
      return path.dirname(cwd);
    }
    
    // Strategy 3: Check for specific subdirectories
    if (cwd.includes('/core/') || cwd.includes('\\core\\')) {
      const parts = cwd.split(/[\/\\]/); // Split on both forward and backslash
      const coreIndex = parts.indexOf('core');
      if (coreIndex >= 0) {
        return parts.slice(0, coreIndex).join('/'); // Join with forward slash
      }
    }
    
    // Strategy 4: Hard-coded fallback for common test scenarios
    // If we're running a test from the /core directory
    try {
      const corePath = path.join(Deno.cwd(), 'lib/macro/core.hql');
      const stat = Deno.statSync(corePath);
      if (stat.isFile) {
        logger.debug(`Found project root at: ${Deno.cwd()} (using core.hql)`);
        return Deno.cwd();
      }
    } catch (_) {
      // Fall through
    }
    
    // No reliable indicators - return current directory as last resort
    logger.warn(`Could not determine project root, using current directory: ${Deno.cwd()}`);
    return Deno.cwd();
  } catch (error) {
    logger.error(`Error finding project root: ${error}`);
    return Deno.cwd();
  }
}

// Find and cache the project root on load
const PROJECT_ROOT = getProjectRoot();
logger.debug(`Detected project root: ${PROJECT_ROOT}`);

/**
 * Resolve a relative path within the project
 * This ensures a consistent approach regardless of where the code is run from
 */
function resolveProjectPath(relativePath: string): string {
  return path.resolve(PROJECT_ROOT, relativePath);
}

/**
 * Initialize the macro file map by scanning the macro file signatures
 * This only reads the macro names and their source files without fully loading them
 */
export async function initMacroFileMap(): Promise<void> {
  macroFileMap.clear();
  
  for (const relativePathInProject of SYSTEM_MACRO_PATHS) {
    try {
      // Resolve the macro file path against project root for reliability
      const macroPath = resolveProjectPath(relativePathInProject);
      
      logger.debug(`Scanning macro file: ${macroPath}`);
      const macroSource = await Deno.readTextFile(macroPath).catch(e => {
        throw new ImportError(`Could not find macro file at ${macroPath}.`, macroPath, undefined, e);
      });
      
      // Quick regex scan to find macro definitions
      // This avoids fully parsing and loading the file
      const macroDefRegex = /\(defmacro\s+([a-zA-Z0-9_-]+)/g;
      let match;
      
      while ((match = macroDefRegex.exec(macroSource)) !== null) {
        const macroName = match[1];
        macroFileMap.set(macroName, relativePathInProject);
        logger.debug(`Registered macro ${macroName} from ${relativePathInProject}`);
      }
      
      // Cache the resolved path for this macro file
      resolvedPathCache.set(relativePathInProject, macroPath);
    } catch (error) {
      logger.warn(`Error scanning macro file ${relativePathInProject}: ${error}`);
    }
  }
  
  logger.debug(`Initialized macro file map with ${macroFileMap.size} macros`);
}

/**
 * Get the absolute file path for a macro file
 * This handles all resolution strategies and maintains a cache
 */
export function getAbsoluteMacroPath(macroPath: string): string {
  // Check cache first
  if (resolvedPathCache.has(macroPath)) {
    return resolvedPathCache.get(macroPath)!;
  }
  
  // If it's already an absolute path, just use it
  if (path.isAbsolute(macroPath)) {
    resolvedPathCache.set(macroPath, macroPath);
    return macroPath;
  }
  
  // Otherwise, resolve against project root
  const absolutePath = resolveProjectPath(macroPath);
  resolvedPathCache.set(macroPath, absolutePath);
  
  // Verify the file exists
  try {
    const stat = Deno.statSync(absolutePath);
    if (!stat.isFile) {
      logger.warn(`Path exists but is not a file: ${absolutePath}`);
    }
  } catch (error) {
    logger.warn(`File not found at resolved path: ${absolutePath}`);
  }
  
  return absolutePath;
}

/**
 * Load a specific system macro file on demand
 */
export async function loadSystemMacroFile(
  macroPath: string, 
  env: Environment, 
  options: { verbose?: boolean } = {}
): Promise<void> {
  const absolutePath = getAbsoluteMacroPath(macroPath);
  
  if (loadedMacroFiles.has(absolutePath)) {
    logger.debug(`Macro file ${absolutePath} already loaded, skipping`);
    return;
  }

  try {
    logger.debug(`Lazy loading macro file: ${absolutePath}`);
    
    const macroSource = await Deno.readTextFile(absolutePath).catch(e => {
      throw new ImportError(`Could not find macro file at ${absolutePath}.`, absolutePath, undefined, e);
    });
    
    const macroExps = macroExpressionsCache.get(absolutePath) || parse(macroSource);
    macroExpressionsCache.set(absolutePath, macroExps);

    const transformed = transformSyntax(macroExps, { verbose: options.verbose });

    await processImports(transformed, env, {
      verbose: options.verbose || false,
      baseDir: path.dirname(absolutePath),
      currentFile: absolutePath,
    });

    expandMacros(transformed, env, { verbose: options.verbose, currentFile: absolutePath });
    env.markFileProcessed(absolutePath);
    loadedMacroFiles.add(absolutePath);
    
    logger.debug(`Loaded macro file: ${absolutePath}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new TranspilerError(`Loading system macro file ${absolutePath}: ${error.message}`);
    } else {
      throw new TranspilerError(`Loading system macro file ${absolutePath}: ${String(error)}`);
    }
  }
}

/**
 * Load a specific macro by name on demand
 */
export async function loadSystemMacroByName(
  macroName: string,
  env: Environment,
  options: { verbose?: boolean } = {}
): Promise<boolean> {
  const relativeMacroPath = macroFileMap.get(macroName);
  
  if (!relativeMacroPath) {
    logger.debug(`No system macro found with name: ${macroName}`);
    return false;
  }
  
  await loadSystemMacroFile(relativeMacroPath, env, options);
  return true;
}

/**
 * Get the full paths to all system macro files
 */
export function getSystemMacroPaths(): string[] {
  return SYSTEM_MACRO_PATHS.map(p => getAbsoluteMacroPath(p));
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