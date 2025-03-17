// src/transformer.ts - New unified transformer

import { parse } from "./transpiler/parser.ts";
import { transformToIR } from "./transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "./transpiler/ts-ast-to-ts-code.ts";
import { expandMacros } from "./s-exp/macro.ts";
import { Logger } from "./logger.ts";
import { Env } from "./environment.ts";
import { convertAST } from "./converter.ts"
import { RUNTIME_FUNCTIONS } from "./transpiler/runtime.ts"

/**
 * Options for code transformation.
 */
export interface TransformOptions {
  verbose?: boolean;
  bundle?: boolean;
  module?: "esm"; // Only ESM supported
}

/**
 * Transforms HQL AST nodes through the new pipeline.
 *
 * Steps:
 * 1. Initialize the environment.
 * 2. Expand macros using the new unified expansion.
 * 3. Transform the expanded AST into an IR.
 * 4. Generate TypeScript code.
 */
export async function transformAST(
  astNodes: any[],
  currentDir: string,
  options: TransformOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  try {
    // Initialize environment
    const env: Env = await Env.initializeGlobalEnv({ verbose: options.verbose });
    
    // Expand macros using new macro.ts.
    const macroExpandedAst = await expandMacros(astNodes, env, currentDir, { verbose: options.verbose });
    logger.debug("Macro expansion completed", macroExpandedAst);

    // Convert the expanded AST (if needed)
    const convertedAst = convertAST(macroExpandedAst);
    logger.debug("AST conversion completed", convertedAst);

    // Transform the converted AST into IR.
    const ir = transformToIR(convertedAst, currentDir);
    logger.debug("Transformed to IR", ir);

    // Generate TypeScript code from IR.
    const tsCode = generateTypeScript(ir);
    logger.debug("Generated TypeScript code");

    // Prepend the runtime functions to the generated code.
    const finalCode = `${RUNTIME_FUNCTIONS}\n\n${tsCode}`;
    logger.debug("Final code assembled");

    return finalCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Transformation error: ${errorMessage}`);
    throw error;
  }
}


/**
 * A simplified API for quick transpilation of HQL source.
 */
export async function transpileHql(
  source: string,
  baseDir: string = Deno.cwd(),
  verbose: boolean = false
): Promise<string> {
  const astNodes = parse(source);
  return transformAST(astNodes, baseDir, { verbose, module: "esm", bundle: false });
}

if (import.meta.main) {
  // Test the transformer in standalone mode.
  const source = `
    (defn greet [name]
      (console.log "Hello," name))
    
    (greet "World")
  `;
  const jsCode = await transpileHql(source, Deno.cwd(), true);
  console.log(jsCode);
}

export default transpileHql;
