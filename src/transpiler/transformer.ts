// src/transpiler/transformer.ts - Updated with minimal runtime

import { parse } from "./parser.ts";
import { transformToIR } from "./hql-code-to-hql-ir.ts";
import { generateTypeScript } from "./ts-ast-to-ts-code.ts";
import { dirname, resolve, readTextFile, writeTextFile } from "../platform/platform.ts";
import { expandMacros } from "../macro-expander.ts";
import { HQLNode, ListNode, SymbolNode } from "./hql_ast.ts";
import { HQLImportHandler } from "./hql_import_handler.ts";
import { moduleRegistry } from "../macro-expander.ts";
import { Env, initializeGlobalEnv } from "../bootstrap.ts";
import { RUNTIME_FUNCTIONS } from "./runtime.ts"
export interface TransformOptions {
  verbose?: boolean;
  bundle?: boolean;
  module?: "esm"; // Only ESM supported
}

/**
 * Transform a parsed AST with macro expansion.
 */
export async function transformAST(
  astNodes: HQLNode[], 
  currentDir: string, 
  options: TransformOptions = {}
): Promise<string> {
  try {
    const env: Env = await initializeGlobalEnv();

    // Step 1: Expand macros in the AST
    const expandedNodes = await expandMacros(astNodes, env);
    
    if (options.verbose) {
      console.log("Expanded AST : ", JSON.stringify(expandedNodes, null, 2));
    }

    // Check for modules used in the expanded AST
    const usedModules = findUsedModulesInNodes(expandedNodes);

    if (options.verbose) {
      console.log("Used modules:", Array.from(usedModules));
    }
   
    const fullAST: HQLNode[] = [];
    const processedImports = new Set<string>();
    
    console.log("moduleRegistry : ", moduleRegistry);
    console.log("env : ", env);

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
    for (const moduleName of usedModules) {
      if (moduleRegistry.has(moduleName) && !processedImports.has(moduleName)) {
        const importPath = moduleRegistry.get(moduleName)!;
        console.log(`[transformAST] Adding implicit import for module: ${moduleName} from ${importPath}`);
        
        fullAST.unshift({
          type: "list" as const,
          elements: [
            { type: "symbol" as const, name: "js-import" },
            { type: "symbol" as const, name: moduleName },
            { type: "literal" as const, value: importPath }
          ]
        });    
        
        processedImports.add(moduleName);
      }
    }

    // Step 2: Transform to IR with the augmented AST
    const ir = transformToIR(fullAST, currentDir);
    
    if (options.verbose) {
      console.log("IR:", JSON.stringify(ir, null, 2));
    }
    
    // Step 3: Generate TypeScript code 
    const tsCode = generateTypeScript(ir);
    
    // Step 4: Prepend runtime functions
    return RUNTIME_FUNCTIONS + tsCode;
  } catch (error) {
    console.error("Transformation error:", error);
    throw error;
  }
}

/**
 * Check if a node is an import statement
 */
function isImportNode(node: HQLNode): boolean {
  return (
    node.type === "list" &&
    node.elements.length >= 3 &&
    node.elements[0].type === "symbol" &&
    ((node.elements[0] as SymbolNode).name === "import" || 
     (node.elements[0] as SymbolNode).name === "js-import")
  );
}

export async function transpile(
  source: string, 
  filePath: string, 
  options: TransformOptions = {}
): Promise<string> {
  try {
    // Create an import handler for preprocessing HQL imports
    const importHandler = new HQLImportHandler(options);
    
    // First, preprocess all HQL imports to generate JS equivalents
    await importHandler.preprocessImports(source, filePath);
    
    // Parse the HQL source into an AST
    const astNodes = parse(source);

    if (options.verbose) {
      console.log("Parsed AST:", JSON.stringify(astNodes, null, 2));
    }
    
    // Now do the usual macro expansion
    const expandedNodes = await expandMacros(astNodes);
    
    if (options.verbose) {
      console.log("Expanded AST:", JSON.stringify(expandedNodes, null, 2));
    }

    const ir = transformToIR(expandedNodes, dirname(filePath));
    
    if (options.verbose) {
      console.log("IR:", JSON.stringify(ir, null, 2));
    }
    
    // Generate TypeScript code
    const tsCode = generateTypeScript(ir);
    
    // Prepend runtime functions
    return RUNTIME_FUNCTIONS + tsCode;
  } catch (error) {
    throw new Error(`Transpile error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper function to find modules used in js-call nodes
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
 * Transpile an HQL file to TypeScript.
 */
export async function transpileFile(
  inputPath: string, 
  outputPath?: string, 
  options: TransformOptions = {}
): Promise<string> {
  const absPath = resolve(inputPath);
  try {
    const source = await readTextFile(absPath);
    const tsCode = await transpile(source, absPath, options);
    if (outputPath) {
      await writeTextFile(outputPath, tsCode);
    }
    return tsCode;
  } catch (error) {
    throw new Error(`Failed to transpile "${inputPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default transpile;