// File: src/transformer.ts
// ------------------------------------------------
// HQL transformer with improved source map and error handling support
// ------------------------------------------------

import { transformToIR } from "./transpiler/pipeline/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "./transpiler/pipeline/ts-ast-to-ts-code.ts";
import { expandMacros } from "./s-exp/macro.ts";
import { globalLogger as logger } from "./logger.ts";
import { Environment } from "./environment.ts";
import { TransformError } from "./common/error.ts";
import { Timer } from "./common/timer.ts";
import type { HQLNode } from "./transpiler/type/hql_ast.ts";
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
 * Deduplicate and inject missing imports in AST.
 */
function processImports(ast: HQLNode[], env: Environment): HQLNode[] {
  const existing = new Map<string, string>(findExistingImports(ast));
  const references = findExternalModuleReferences(ast, env);
  const processed = new Set(existing.keys());
  const importNodes: HQLNode[] = [];

  for (const reference of references) {
    if (processed.has(reference) || !importSourceRegistry.has(reference)) continue;
    importNodes.push({
      type: "list",
      elements: [

        { type: "symbol", name: reference },
        { type: "literal", value: importSourceRegistry.get(reference)! },
      ],
    } as any);
    processed.add(reference);
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
  
    const env = await Environment.getGlobalEnv() ?? await Environment.initializeGlobalEnv();
    
    timer.phase("environment init");
  
    const macroOptions = { verbose: options.verbose, currentFile: currentDir };
    const expanded = expandMacros(astNodes, env, macroOptions);
    
    timer.phase("macro expansion");
    
    const imports = processImports(expanded, env);

    timer.phase("import processing");

    const ir = transformToIR(imports, currentDir);
    
    timer.phase("IR transformation");

    const sourceFilePath = options.sourceFile || currentDir;
    const typescript = await generateTypeScript(ir, { sourceFilePath: sourceFilePath, currentFilePath: options.currentFile });

    timer.phase("TS code generation");

    timer.breakdown();
    
    return { code: typescript.code };
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