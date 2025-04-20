// File: src/transformer.ts
// ------------------------------------------------
// HQL transformer with improved source map and error handling support
// ------------------------------------------------

import { transformToIR } from "./transpiler/pipeline/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "./transpiler/pipeline/ts-ast-to-ts-code.ts";
import { expandMacros } from "./s-exp/macro.ts";
import { globalLogger as logger, Logger } from "./logger.ts";
import { RUNTIME_FUNCTIONS } from "./transpiler/runtime/runtime.ts";
import { Environment } from "./environment.ts";
import type { HQLNode } from "./transpiler/type/hql_ast.ts";
import {
  CodeGenError,
  TransformError,
  TranspilerError,
} from "./transpiler/error/errors.ts";
import {
  extractImportInfo,
  findExistingImports,
  findExternalModuleReferences,
  importSourceRegistry,
} from "./common/import-utils.ts";
import { registerSourceMapData } from "./common/error-source-map-registry.ts";

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
async function getGlobalEnvironment(verbose?: boolean) {
  let env = Environment.getGlobalEnv();
  if (!env) {
    env = await Environment.initializeGlobalEnv({ verbose });
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
 * Options controlling transformation behavior.
 */
export interface TransformOptions {
  verbose?: boolean;
  replMode?: boolean;
  sourceFile?: string;  // Added for source map support
}

/**
 * Get the original source content from a file path
 */
async function getOriginalSource(filePath: string): Promise<string> {
  try {
    if (await Deno.stat(filePath).then(stat => stat.isFile)) {
      return await Deno.readTextFile(filePath);
    }
  } catch (error) {
    logger.debug(`Failed to read source file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Try to find in example directories if direct path fails
  try {
    const fileName = filePath.split('/').pop() || '';
    
    // Try common example paths
    for (const dir of ['doc/examples', '../doc/examples', 'examples']) {
      const testPath = `${dir}/${fileName}`;
      try {
        if (await Deno.stat(testPath).then(stat => stat.isFile)) {
          logger.debug(`Found source file at ${testPath}`);
          return await Deno.readTextFile(testPath);
        }
      } catch {
        // Continue to next path
      }
    }
  } catch (error) {
    logger.debug(`Failed to find source file in alternative paths: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return "";
}

/**
 * Transforms HQL AST nodes through all pipeline phases and outputs TS code.
 */
export async function transformAST(
  astNodes: HQLNode[],
  currentDir: string,
  options: TransformOptions = {}
): Promise<string> {
  const timer = new Timer(logger);
  try {
    logger.debug(`Starting transformation: ${astNodes.length} nodes`);
    timer.phase("initialization");

    // Initialize or get global environment
    const env = await getGlobalEnvironment(options.verbose);
    timer.phase("environment init");

    // Macro expansion
    const expanded = await expandMacros(astNodes, env, {
      verbose: options.verbose,
      currentFile: currentDir,
    });
    timer.phase("macro expansion");

    // Import processing (dedupe + inject)
    const withImports = processImports(expanded, env);
    timer.phase("import processing");

    // Convert legacy exports
    const converted = convertExports(withImports as any);
    timer.phase("AST conversion");

    // Determine source file path - prioritize options.sourceFile if provided
    const sourceFilePath = options.sourceFile || 
                          (currentDir.endsWith('.hql') ? currentDir : `${currentDir}/input.hql`);
    
    // Fetch original source content for source map generation
    const originalSource = await getOriginalSource(sourceFilePath);
    if (originalSource) {
      logger.debug(`Retrieved original source for ${sourceFilePath}: ${originalSource.length} bytes`);
    } else {
      logger.debug(`No original source found for ${sourceFilePath}`);
    }

    // AST -> IR
    let ir;
    try {
      ir = transformToIR(converted, currentDir);
      timer.phase("IR transformation");
    } catch (err) {
      throw new TransformError(
        `AST to IR failed: ${err instanceof Error ? err.message : String(err)}`,
        `${converted.length} nodes`,
        "AST to IR",
        converted
      );
    }

    // IR -> TS code (with source map generation)
    let tsCode;
    let sourceMap;
    try {
      const tsResult = await generateTypeScript(ir, {
        sourceFilePath: sourceFilePath,
        generateSourceMap: true,
        inlineSourceMap: true,
        originalSource: originalSource
      });
      
      tsCode = tsResult.code;
      sourceMap = tsResult.sourceMap;
      timer.phase("TS code generation");
      
      // Register source map data with the error registry for accurate error reporting
      if (sourceMap) {
        await registerSourceMapData(
          sourceFilePath,  // The file path used in error stacks
          sourceFilePath,  // Original source file path
          sourceMap,       // Source map content
          originalSource   // Original source content
        );
        
        logger.debug(`Registered source map for ${sourceFilePath}`);
      }
    } catch (err) {
      throw new CodeGenError(
        `TS generation failed: ${err instanceof Error ? err.message : String(err)}`,
        "TS generation",
        ir
      );
    }

    // Prepend runtime unless in REPL mode
    const finalCode = options.replMode
      ? tsCode
      : `${RUNTIME_FUNCTIONS}\n\n${tsCode}`;
    timer.breakdown();
    return finalCode;

  } catch (error) {
    if (options.verbose && !(error instanceof TranspilerError)) {
      console.error("Detailed transformer error:", error);
    }
    throw error;
  }
}