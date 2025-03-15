// src/transformer.ts - Refactored for cleaner module structure and improved logging

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
import { Env } from "./environment.ts"

/**
 * Configuration options for code transformation
 */
export interface TransformOptions {
  verbose?: boolean;
  bundle?: boolean;
  module?: "esm"; // Only ESM supported
}

/**
 * Transform a parsed AST by applying macro expansion and code generation
 * @param astNodes AST nodes to transform
 * @param currentDir Current directory for resolving imports
 * @param options Transformation options
 * @returns Generated TypeScript code
 */
export async function transformAST(
  astNodes: HQLNode[], 
  currentDir: string, 
  options: TransformOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  
  try {
    // Initialize the environment for macro expansion
    const env: Env = await initializeGlobalEnv({ verbose: options.verbose });

    // Step 1: Expand macros in the AST
    const expandedNodes = await expandMacros(astNodes, env, { verbose: options.verbose });
    
    logger.debug("Macro expansion completed");
    
    // Check for modules used in the expanded AST
    const usedModules = findUsedModulesInNodes(expandedNodes);
    logger.debug(`Used modules: ${Array.from(usedModules).join(', ')}`);
   
    // Prepare the full AST by handling imports
    const fullAST = prepareFullAST(expandedNodes, usedModules);
    
    // Step 2: Transform to IR with the augmented AST
    const ir = transformToIR(fullAST, currentDir);
    logger.debug("Transformed to IR");
    
    // Step 3: Generate TypeScript code 
    const tsCode = generateTypeScript(ir);
    logger.debug("Generated TypeScript code");
    
    // Step 4: Prepend runtime functions
    return RUNTIME_FUNCTIONS + tsCode;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Transformation error: ${errorMessage}`);
    throw error;
  }
}

/**
 * Find modules used in js-call nodes
 * @param nodes AST nodes to search
 * @returns Set of module names
 */
function findUsedModulesInNodes(nodes: HQLNode[]): Set<string> {
  const usedModules = new Set<string>();
  
  function traverse(node: HQLNode) {
    if (node.type === "list") {
      const listNode = node as ListNode;
      
      // Check for js-call pattern
      if (
        listNode.elements.length >= 3 &&
        listNode.elements[0].type === "symbol" &&
        (listNode.elements[0] as SymbolNode).name === "js-call" &&
        listNode.elements[1].type === "symbol"
      ) {
        const moduleName = (listNode.elements[1] as SymbolNode).name;
        usedModules.add(moduleName);
      }
      
      // Traverse all elements
      listNode.elements.forEach(traverse);
    }
  }
  
  nodes.forEach(traverse);
  return usedModules;
}

/**
 * Prepare the full AST by handling imports and used modules
 * @param expandedNodes Expanded AST nodes
 * @param usedModules Set of used module names
 * @returns Full AST with all necessary imports
 */
function prepareFullAST(expandedNodes: HQLNode[], usedModules: Set<string>): HQLNode[] {
  const fullAST: HQLNode[] = [];
  const processedImports = new Set<string>();

  // First, extract import statements from the expanded nodes
  for (const node of expandedNodes) {
    if (isImportNode(node)) {
      if (node.type === "list" && 
        (node as ListNode).elements.length >= 3 &&
        (node as ListNode).elements[1].type === "symbol" &&
        (node as ListNode).elements[2].type === "literal") { 
        
        const moduleName = (node.elements[1] as SymbolNode).name;
        // Skip if we've already processed this import
        if (processedImports.has(moduleName)) {
          continue;
        }
        
        // Add to our AST and mark as processed
        fullAST.push(node);
        processedImports.add(moduleName);
      }
    } else {
      // Non-import nodes are added as-is
      fullAST.push(node);
    }
  }
  
  // Add any used modules from registry that weren't explicitly imported
  addImplicitImports(fullAST, usedModules, processedImports);
  
  return fullAST;
}

/**
 * Add implicit imports for modules that are used but not explicitly imported
 * @param fullAST AST to add imports to
 * @param usedModules Set of used module names
 * @param processedImports Set of already processed module names
 */
function addImplicitImports(
  fullAST: HQLNode[],
  usedModules: Set<string>,
  processedImports: Set<string>
): void {
  for (const moduleName of usedModules) {
    if (moduleRegistry.has(moduleName) && !processedImports.has(moduleName)) {
      const importPath = moduleRegistry.get(moduleName)!;
      
      // Create an import node and add it to the beginning of the AST
      const importNode: ListNode = {
        type: "list",
        elements: [
          { type: "symbol", name: "js-import" },
          { type: "symbol", name: moduleName },
          { type: "literal", value: importPath }
        ]
      };
      
      fullAST.unshift(importNode);
      processedImports.add(moduleName);
    }
  }
}

/**
 * Transpile HQL source code to JavaScript
 * @param source Source code to transpile
 * @param filePath Path of the source file
 * @param options Transpilation options
 * @returns Transpiled JavaScript code
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

    // Now do the usual macro expansion
    const expandedNodes = await expandMacros(astNodes);
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
 * @param inputPath Path to input file
 * @param outputPath Optional output path
 * @param options Transpilation options
 * @returns Generated JavaScript code
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