// File: src/transformer.ts
// ------------------------------------------------
// HQL transformer with improved source map and error handling support
// ------------------------------------------------

import { transformToIR } from "./transpiler/pipeline/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "./transpiler/pipeline/ts-ast-to-ts-code.ts";
import { expandMacros } from "./s-exp/macro.ts";
import { globalLogger as logger, Logger } from "./logger.ts";
import { Environment } from "./environment.ts";
import type { HQLNode } from "./transpiler/type/hql_ast.ts";
import { TransformError } from "./common/error.ts";
import {
  extractImportInfo,
  findExistingImports,
  findExternalModuleReferences,
  importSourceRegistry,
} from "./common/import-utils.ts";

/**
 * Options controlling transformation behavior.
 */
export interface TransformOptions {
  verbose?: boolean;
  replMode?: boolean;
  sourceFile?: string;
  currentFile?: string;
}

/**
 * Timer helper to measure and log transformation phases.
 */
class Timer {
  private start = performance.now();
  private last = this.start;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  phase(name: string) {
    const now = performance.now();
    const elapsed = now - this.last;
    this.last = now;
    this.logger.debug(`${name} completed in ${elapsed.toFixed(2)}ms`);
  }

  breakdown(label = "Total transformation") {
    const total = performance.now() - this.start;
    this.logger.debug(`${label} completed in ${total.toFixed(2)}ms`);
  }
}

/**
 * Get or initialize the global Environment.
 */
async function getGlobalEnvironment() {
  let env = Environment.getGlobalEnv();
  if (!env) {
    env = await Environment.initializeGlobalEnv();
  }
  return env;
}

/**
 * Deduplicate and inject missing imports in AST.
 */
function processImports(ast: HQLNode[], env: Environment): HQLNode[] {
  const existing = new Map<string, string>(findExistingImports(ast));
  const refs = findExternalModuleReferences(ast, env);
  const processed = new Set(existing.keys());
  const importNodes: HQLNode[] = [];

  for (const name of refs) {
    if (processed.has(name) || !importSourceRegistry.has(name)) continue;
    importNodes.push({
      type: "list",
      elements: [
        { type: "symbol", name: "js-import" },
        { type: "symbol", name },
        { type: "literal", value: importSourceRegistry.get(name)! },
      ],
    } as any);
    processed.add(name);
  }

  const filtered = ast.filter((node) => {
    const [modName] = extractImportInfo(node as any);
    if (!modName) return true;
    if (processed.has(modName) && !existing.has(modName)) {
      return false;
    }
    processed.add(modName);
    return true;
  });

  return [...importNodes, ...filtered];
}

/**
 * Normalize legacy export declarations into HQL export forms.
 */
function convertExports(rawAst: any[]): HQLNode[] {
  return rawAst.map((node) => {
    if (
      node.type === "list" &&
      node.elements.length >= 3 &&
      node.elements[0].type === "symbol" &&
      node.elements[0].name === "export"
    ) {
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "js-export" },
          node.elements[1],
          node.elements[2],
        ],
      } as any;
    }

    if (
      node.type === "ExportNamedDeclaration" &&
      Array.isArray((node as any).specifiers)
    ) {
      const specs = (node as any).specifiers;
      const exportsList = specs.map((spec: any) => ({
        type: "list",
        elements: [
          { type: "symbol", name: "js-export" },
          { type: "literal", value: spec.exported.name },
          spec.local,
        ],
      }));
      if (exportsList.length === 1) return exportsList[0];
      return {
        type: "list",
        elements: [{ type: "symbol", name: "do" }, ...exportsList],
      } as any;
    }

    return node;
  });
}

/**
 * Transforms HQL AST nodes through all pipeline phases and outputs TS code.
 */
// Update transformAST function in transformer.ts
export async function transformAST(
  astNodes: HQLNode[],
  currentDir: string,
  options: TransformOptions = {}
): Promise<{ code: string; sourceMap?: string }> {
  try {
    const timer = new Timer(logger);
    logger.debug(`Starting transformation: ${astNodes.length} nodes`);
    timer.phase("initialization");
  
    // Initialize or get global environment
    const env = await getGlobalEnvironment();
    timer.phase("environment init");
  
    // Macro expansion
    const expanded = await expandMacros(astNodes, env, {
      verbose: options.verbose,
      currentFile: currentDir,
    });
    timer.phase("macro expansion");
    
    const withImports = processImports(expanded, env);
    timer.phase("import processing");

    const converted = convertExports(withImports as any);
    timer.phase("AST conversion");

    const sourceFilePath = options.sourceFile || currentDir;
    
    const ir = transformToIR(converted, currentDir);
    
    timer.phase("IR transformation");

    const tsResult = await generateTypeScript(ir, { sourceFilePath: sourceFilePath, currentFilePath: options.currentFile });
    
    const tsCode = tsResult.code;
    const sourceMap = tsResult.sourceMap;

    timer.phase("TS code generation");

    const finalCode = tsCode;

    timer.breakdown();
    
    return { code: finalCode, sourceMap };
  } catch (error) {
    throw new TransformError(
      `Transformation failed: ${error instanceof Error ? error.message : String(error)}`,
      "Transformation failed",
      {
        filePath: options.sourceFile || currentDir
      }
    );
  }
}
