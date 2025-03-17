import { parse } from "./transpiler/parser.ts";
import { transformToIR } from "./transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "./transpiler/ts-ast-to-ts-code.ts";
import { dirname, resolve, readTextFile, writeTextFile } from "./platform/platform.ts";
import { expandMacros } from "./macro-expander.ts";
import { HQLNode, ListNode, SymbolNode, isImportNode } from "./transpiler/hql_ast.ts";
import { HQLImportHandler } from "./hql_import_handler.ts";
import { moduleRegistry } from "./macro-expander.ts";
import { initializeGlobalEnv } from "./bootstrap.ts";
import { RUNTIME_FUNCTIONS } from "./transpiler/runtime.ts";
import { Logger } from "./logger.ts";
import { Env } from "./environment.ts";

/**
 * Configuration options for code transformation
 */
export interface TransformOptions {
  verbose?: boolean;
  bundle?: boolean;
  module?: "esm"; // Only ESM supported
}

/**
 * Transform HQL AST nodes to JavaScript code
 */
export async function transformAST(
  astNodes: HQLNode[], 
  currentDir: string, 
  options: TransformOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  
  try {
    // Initialize environment for macro expansion
    const env = await initializeGlobalEnv({ verbose: options.verbose });
    
    // Expand macros with the new S-expression system
    const expandedNodes = await expandMacros(astNodes, env, currentDir, { verbose: options.verbose });
    logger.debug("Macro expansion completed");
    
    // Fix export statements to be valid ES module exports
    const fixedNodes = fixExportStatements(expandedNodes, logger);
    
    // Transform to IR using existing pipeline
    const ir = transformToIR(fixedNodes, currentDir);
    logger.debug("Transformed to IR");
    
    // Generate TypeScript code
    const tsCode = generateTypeScript(ir);
    logger.debug("Generated TypeScript code");
    
    return RUNTIME_FUNCTIONS + tsCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Transformation error: ${errorMessage}`);
    throw error;
  }
}

/**
 * Helper function to fix export statements
 */
function fixExportStatements(nodes: HQLNode[], logger: Logger): HQLNode[] {
  return nodes.map(node => {
    if (node.type === "list" && 
        node.elements.length > 0 && 
        node.elements[0].type === "symbol" && 
        (node.elements[0] as SymbolNode).name === "js-export") {
      
      // Convert js-export to a proper ES module export
      const nameNode = node.elements[1];
      const valueNode = node.elements[2];
      
      // Create a list representing ES module syntax
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "export-named-declaration" },
          { 
            type: "list",
            elements: [valueNode]
          },
          nameNode
        ]
      };
    }
    return node;
  });
}

/**
 * Transpile HQL source code to JavaScript
 */
export async function transpile(
  source: string, 
  filePath: string, 
  options: TransformOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  
  try {
    // Create an import handler for preprocessing HQL imports
    const importHandler = new HQLImportHandler(options);
    
    // First, preprocess all HQL imports to generate JS equivalents
    await importHandler.preprocessImports(source, filePath);
    
    // Parse the HQL source into an AST
    const astNodes = parse(source);
    logger.debug("Parsed HQL to AST");

    // Now do the macro expansion
    // Get the directory of the file for proper path resolution
    const fileDir = dirname(filePath);
    
    // Initialize the environment
    const env = await initializeGlobalEnv({ verbose: options.verbose });
    
    // Expand macros
    const expandedNodes = await expandMacros(astNodes, env, fileDir, { verbose: options.verbose });
    logger.debug("Expanded macros");
    
    // Transform to IR
    const ir = transformToIR(expandedNodes, dirname(filePath));
    logger.debug("Transformed to IR");
    
    // Generate TypeScript code
    const tsCode = generateTypeScript(ir);
    logger.debug("Generated TypeScript code");
    
    // Prepend runtime functions and return
    return RUNTIME_FUNCTIONS + tsCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Transpile error: ${errorMessage}`);
  }
}

/**
 * Transpile an HQL file to JavaScript
 */
export async function transpileFile(
  inputPath: string, 
  outputPath?: string, 
  options: TransformOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  const absPath = resolve(inputPath);
  
  try {
    const source = await readTextFile(absPath);
    const tsCode = await transpile(source, absPath, options);
    
    if (outputPath) {
      await writeTextFile(outputPath, tsCode);
      logger.log(`Output written to: ${outputPath}`);
    }
    
    return tsCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to transpile "${inputPath}": ${errorMessage}`);
  }
}

export default transpile;