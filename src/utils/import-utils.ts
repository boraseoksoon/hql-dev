// src/utils/import-utils.ts - Centralized import utilities to improve code organization
import * as path from "https://deno.land/std/path/mod.ts";
import { HQLNode, isImportNode } from "../transpiler/hql_ast.ts";
import { Environment } from "../environment.ts";
import { Logger } from "../logger.ts";
import { ImportError } from "../transpiler/errors.ts";
/**
 * Registry to track import sources and their modules
 * This is used across the codebase to resolve module paths
 */
export const importSourceRegistry = new Map<string, string>();

/**
 * Check if a path is a remote URL
 */
export function isRemoteUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://");
}

/**
 * Check if a module path represents a remote module (npm:, jsr:, http:, https:)
 */
export function isRemoteModule(modulePath: string): boolean {
  return modulePath.startsWith("npm:") ||
    modulePath.startsWith("jsr:") ||
    modulePath.startsWith("http:") ||
    modulePath.startsWith("https:");
}

/**
 * Check if a file path is an HQL file
 */
export function isHqlFile(filePath: string): boolean {
  return filePath.endsWith(".hql");
}

/**
 * Check if a file path is a JavaScript module
 */
export function isJavaScriptModule(filePath: string): boolean {
  return filePath.endsWith(".js") ||
    filePath.endsWith(".mjs") ||
    filePath.endsWith(".cjs");
}

/**
 * Extract import information from an import node
 * Returns [moduleName, importPath] or [null, null] if not an import
 */
export function extractImportInfo(
  node: HQLNode,
): [string | null, string | null] {
  try {
    if (node.type === "list" && node.elements[0].type === "symbol") {
      // Handle namespace imports: (import name from "path")
      if (
        node.elements[0].name === "import" &&
        node.elements.length === 4 &&
        node.elements[1].type === "symbol" &&
        node.elements[2].type === "symbol" &&
        node.elements[2].name === "from" &&
        node.elements[3].type === "literal"
      ) {
        return [node.elements[1].name, node.elements[3].value as string];
      }

      // Handle JS imports: (js-import name "path")
      if (
        node.elements[0].name === "js-import" &&
        node.elements.length === 3 &&
        node.elements[1].type === "symbol" &&
        node.elements[2].type === "literal"
      ) {
        return [node.elements[1].name, node.elements[2].value as string];
      }
    }
  } catch {
    // If anything fails, return null values
  }

  return [null, null];
}

/**
 * Determine if a module is external and needs to be imported
 */
export function isModuleExternal(
  moduleName: string,
  env: Environment,
  logger: Logger,
): boolean {
  // Check if this module is already registered as an import
  if (importSourceRegistry.has(moduleName)) {
    return true;
  }

  try {
    // Try to determine if it's a JavaScript global
    if (typeof globalThis !== "undefined" && moduleName in globalThis) {
      logger.debug(`Module ${moduleName} identified as global, not external`);
      return false;
    }

    // Check if it's defined in the environment
    try {
      env.lookup(moduleName);
      logger.debug(`Module ${moduleName} found in environment, not external`);
      return false;
    } catch {
      // Not defined in env, continue checking
    }

    // Check if it's a macro
    if (env.hasMacro(moduleName)) {
      logger.debug(`Module ${moduleName} identified as macro, not external`);
      return false;
    }

    // If we got here, it's likely an external module
    logger.debug(`Module ${moduleName} identified as external module`);
    return true;
  } catch {
    // If anything fails, assume it could be external just to be safe
    logger.debug(`Error checking module ${moduleName}, assuming external`);
    return true;
  }
}

/**
 * Resolve a module path trying multiple strategies in parallel
 * Returns a resolved path or throws an error if resolution fails
 */
export async function resolveModulePath(
  modulePath: string,
  currentDir: string,
  sourceDir: string | undefined,
  logger: Logger,
): Promise<string> {
  logger.debug(`Resolving module path: ${modulePath}`);

  // If it's a remote module, no need to resolve
  if (isRemoteModule(modulePath)) {
    return modulePath;
  }

  // Create resolution strategies
  const strategies = [
    // Strategy 1: Resolve relative to current directory
    {
      name: "relative to current dir",
      path: path.resolve(currentDir, modulePath),
      check: async (p: string) => {
        try {
          await Deno.stat(p);
          return true;
        } catch {
          return false;
        }
      },
    },
    // Strategy 2: Resolve relative to source directory
    {
      name: "relative to source dir",
      path: sourceDir ? path.resolve(sourceDir, modulePath) : modulePath,
      check: async (p: string) => {
        if (!sourceDir) return false;
        try {
          await Deno.stat(p);
          return true;
        } catch {
          return false;
        }
      },
    },
    // Strategy 3: Resolve relative to CWD
    {
      name: "relative to CWD",
      path: path.resolve(Deno.cwd(), modulePath),
      check: async (p: string) => {
        try {
          await Deno.stat(p);
          return true;
        } catch {
          return false;
        }
      },
    },
  ];

  // Try all strategies in parallel
  const results = await Promise.all(
    strategies.map(async (strategy) => ({
      name: strategy.name,
      path: strategy.path,
      exists: await strategy.check(strategy.path),
    })),
  );

  // Find the first successful resolution
  const success = results.find((result) => result.exists);
  if (success) {
    logger.debug(`Resolved ${modulePath} to ${success.path} (${success.name})`);
    return success.path;
  }

  // If all strategies fail, throw an error
  const tried = results.map((r) => r.path).join(", ");
  throw new ImportError(
    `Could not resolve module path: ${modulePath}. Tried: ${tried}`,
    modulePath,
    currentDir,
  );
}

/**
 * Identify which modules are used in a list of nodes
 * Returns a Set of module names that should be imported
 */
export function findUsedModules(
  nodes: HQLNode[],
  env: Environment,
  logger: Logger,
): Set<string> {
  const usedModules = new Set<string>();

  function traverse(node: HQLNode): void {
    if (node.type !== "list") return;

    const elements = node.elements;

    // Check for js-call and js-get patterns
    if (elements.length >= 3 && elements[0].type === "symbol") {
      if (
        (elements[0].name === "js-call" || elements[0].name === "js-get") &&
        elements[1].type === "symbol"
      ) {
        const moduleName = elements[1].name;
        if (isModuleExternal(moduleName, env, logger)) {
          usedModules.add(moduleName);
        }
      }
    }

    // Recursively check all elements
    for (const elem of elements) {
      traverse(elem);
    }
  }

  // Traverse all nodes
  for (const node of nodes) {
    traverse(node);
  }

  return usedModules;
}

/**
 * Register a module path in the import registry
 */
export function registerModulePath(
  moduleName: string,
  modulePath: string,
): void {
  importSourceRegistry.set(moduleName, modulePath);
}

/**
 * Find all existing imports in the AST
 */
export function findExistingImports(nodes: HQLNode[]): Map<string, string> {
  const imports = new Map<string, string>();

  for (const node of nodes) {
    if (isImportNode(node)) {
      const [moduleName, importPath] = extractImportInfo(node);
      if (moduleName && importPath) {
        imports.set(moduleName, importPath);
      }
    }
  }

  return imports;
}

/**
 * Find which modules are external and require imports
 */
export function findExternalModuleReferences(
  nodes: HQLNode[],
  env: Environment,
): Set<string> {
  const externalModules = new Set<string>();

  function isModuleExternal(moduleName: string): boolean {
    // Check if this module is already registered as an import
    if (importSourceRegistry.has(moduleName)) {
      return true;
    }

    try {
      // Try to determine if it's a JavaScript global
      if (typeof globalThis !== "undefined" && moduleName in globalThis) {
        return false; // It's a built-in global
      }

      // Check if it's defined in the environment
      try {
        env.lookup(moduleName);
        return false; // It's defined in the environment
      } catch {
        // Not defined in env, could be external
      }

      // Check if it's a macro
      if (env.hasMacro(moduleName)) {
        return false; // It's a macro
      }

      // If we got here, it's likely an external module
      return true;
    } catch {
      // If anything fails, assume it could be external just to be safe
      return true;
    }
  }

  function traverse(node: HQLNode) {
    if (node.type === "list") {
      const elements = node.elements;

      // Check for js-call pattern
      if (
        elements.length >= 3 &&
        elements[0].type === "symbol" &&
        elements[0].name === "js-call" &&
        elements[1].type === "symbol"
      ) {
        const moduleName = elements[1].name;
        if (isModuleExternal(moduleName)) {
          externalModules.add(moduleName);
        }
      }

      // Check for js-get pattern
      if (
        elements.length >= 3 &&
        elements[0].type === "symbol" &&
        elements[0].name === "js-get" &&
        elements[1].type === "symbol"
      ) {
        const moduleName = elements[1].name;
        if (isModuleExternal(moduleName)) {
          externalModules.add(moduleName);
        }
      }

      // Nested js-call patterns
      if (
        elements.length >= 3 &&
        elements[0].type === "symbol" &&
        elements[0].name === "js-call" &&
        elements[1].type === "list" &&
        elements[1].elements.length >= 3 &&
        elements[1].elements[0].type === "symbol" &&
        elements[1].elements[0].name === "js-get" &&
        elements[1].elements[1].type === "symbol"
      ) {
        const moduleName = elements[1].elements[1].name;
        if (isModuleExternal(moduleName)) {
          externalModules.add(moduleName);
        }
      }

      // Recursively check all elements
      elements.forEach(traverse);
    }
  }

  nodes.forEach(traverse);
  return externalModules;
}
