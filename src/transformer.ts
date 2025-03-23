// src/transformer.ts - Complete solution without any hardcoding

import { transformToIR } from "./transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "./transpiler/ts-ast-to-ts-code.ts";
import { expandMacros } from "./s-exp/macro.ts";
import { Logger } from "./logger.ts";
import { Environment } from "./environment.ts";
import { RUNTIME_FUNCTIONS } from "./transpiler/runtime.ts";
import { TranspilerError, TransformError, CodeGenError, MacroError, createErrorReport } from "./transpiler/errors.ts";
import { perform, performAsync } from "./transpiler/error-utils.ts";

/**
 * Options for code transformation.
 */
interface TransformOptions {
  verbose?: boolean;
  bundle?: boolean;
  module?: "esm"; // Only ESM supported
}

/**
 * Import source information to be maintained during processing
 */
const importSourceRegistry = new Map<string, string>();

/**
 * Register an import source in the global registry
 * This function should be called from the import processor
 */
export function registerImportSource(moduleName: string, importPath: string): void {
  importSourceRegistry.set(moduleName, importPath);
}

/**
 * Get all currently registered import sources
 */
export function getImportSources(): Map<string, string> {
  return new Map(importSourceRegistry);
}

/**
 * Transforms HQL AST nodes through the new pipeline.
 * Now properly handles module references without hardcoding.
 */
export async function transformAST(
  astNodes: any[],
  currentDir: string,
  options: TransformOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose);
  const startTime = performance.now();
  let currentPhase = "initialization";
  
  try {
    logger.debug(`Starting transformation with ${astNodes.length} AST nodes`);
    logger.debug(`Current directory: ${currentDir}`);
    
    // Get the global environment (reusing existing instance)
    currentPhase = "environment initialization";
    const envStartTime = performance.now();
    
    const env = await performAsync(
      async () => Environment.getGlobalEnv() || 
                   await Environment.initializeGlobalEnv({ verbose: options.verbose }),
      "Failed to initialize environment",
      TranspilerError
    );
    
    const envTime = performance.now() - envStartTime;
    logger.debug(`Environment initialized in ${envTime.toFixed(2)}ms`);
    
    // Expand macros using new macro.ts
    currentPhase = "macro expansion";
    const macroStartTime = performance.now();
    
    const macroExpandedAst = await performAsync(
      async () => await expandMacros(astNodes, env, { 
        verbose: options.verbose,
        currentFile: currentDir
      }),
      "Failed to expand macros",
      MacroError,
      ["", currentDir]
    );
    
    const macroTime = performance.now() - macroStartTime;
    logger.debug(`Macro expansion completed in ${macroTime.toFixed(2)}ms with ${macroExpandedAst.length} nodes`);
    
    // Find modules used in the expanded AST
    const usedModuleNames = findUsedModuleNames(macroExpandedAst);
    logger.debug(`Found ${usedModuleNames.size} module references in expanded AST`);
    
    // Look up the import paths from our registry
    const usedModules = new Map<string, string>();
    for (const moduleName of usedModuleNames) {
      if (importSourceRegistry.has(moduleName)) {
        usedModules.set(moduleName, importSourceRegistry.get(moduleName)!);
        logger.debug(`Found import source for ${moduleName}: ${importSourceRegistry.get(moduleName)}`);
      } else {
        logger.warn(`No import source found for module reference: ${moduleName}`);
      }
    }
    
    // Create a full AST with imported modules
    const fullAST = [];
    
    // Add imports for all used modules
    for (const [moduleName, importPath] of usedModules.entries()) {
      logger.debug(`Adding import for module: ${moduleName} from ${importPath}`);
      
      fullAST.push({
        type: "list",
        elements: [
          { type: "symbol", name: "js-import" },
          { type: "symbol", name: moduleName },
          { type: "literal", value: importPath }
        ]
      });    
    }
    
    // Add the original expanded nodes
    fullAST.push(...macroExpandedAst);
    
    // Convert the expanded AST (if needed)
    currentPhase = "AST conversion";
    const astConvStartTime = performance.now();
    
    const convertedAst = perform(
      () => convertAST(fullAST), // Use the augmented AST with imports
      "Failed to convert AST",
      TranspilerError
    );
    
    const astConvTime = performance.now() - astConvStartTime;
    logger.debug(`AST conversion completed in ${astConvTime.toFixed(2)}ms`);
    
    // Transform the converted AST into IR
    currentPhase = "IR transformation";
    const irStartTime = performance.now();
    
    const ir = perform(
      () => transformToIR(convertedAst, currentDir),
      "Failed to transform AST to IR",
      TransformError,
      [`${convertedAst.length} AST nodes`, "AST to IR transformation", convertedAst]
    );
    
    const irTime = performance.now() - irStartTime;
    logger.debug(`IR transformation completed in ${irTime.toFixed(2)}ms with ${ir.body.length} nodes`);
    
    // Generate TypeScript code from IR
    currentPhase = "TypeScript code generation";
    const tsGenStartTime = performance.now();
    
    const tsCode = perform(
      () => generateTypeScript(ir),
      "Failed to generate TypeScript code",
      CodeGenError,
      ["TypeScript generation", ir]
    );
    
    const tsGenTime = performance.now() - tsGenStartTime;
    logger.debug(`TypeScript code generation completed in ${tsGenTime.toFixed(2)}ms`);
    
    // Prepend the runtime functions to the generated code
    const finalCode = `${RUNTIME_FUNCTIONS}\n\n${tsCode}`;
    
    // Calculate and log total time
    const totalTime = performance.now() - startTime;
    logger.debug(`Total transformation completed in ${totalTime.toFixed(2)}ms`);
    
    // If verbose, log a breakdown of the times
    if (options.verbose) {
      logger.debug("Transformation time breakdown:");
      logger.debug(`  Environment setup:   ${envTime.toFixed(2)}ms (${(envTime/totalTime*100).toFixed(1)}%)`);
      logger.debug(`  Macro expansion:     ${macroTime.toFixed(2)}ms (${(macroTime/totalTime*100).toFixed(1)}%)`);
      logger.debug(`  AST conversion:      ${astConvTime.toFixed(2)}ms (${(astConvTime/totalTime*100).toFixed(1)}%)`);
      logger.debug(`  IR transformation:   ${irTime.toFixed(2)}ms (${(irTime/totalTime*100).toFixed(1)}%)`);
      logger.debug(`  TS code generation:  ${tsGenTime.toFixed(2)}ms (${(tsGenTime/totalTime*100).toFixed(1)}%)`);
      logger.debug(`  Total:               ${totalTime.toFixed(2)}ms`);
    }
    
    return finalCode;
  } catch (error) {
    // Create a detailed error report
    const errorReport = createErrorReport(
      error instanceof Error ? error : new Error(String(error)),
      `transformation phase: ${currentPhase}`,
      {
        currentDirectory: currentDir,
        options: options,
        nodeCount: astNodes.length
      }
    );
    
    // Always log detailed error report in verbose mode
    if (options.verbose) {
      console.error("Detailed transformation error report:");
      console.error(errorReport);
    }
    
    // Log a warning if this isn't a known TranspilerError type
    if (!(error instanceof TranspilerError)) {
      logger.error(`Unexpected error during ${currentPhase}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    throw error;
  }
}

/**
 * Helper function to find module names referenced in js-call and js-get nodes
 * This only collects the module names, not their sources
 */
function findUsedModuleNames(nodes: any[]): Set<string> {
  const usedModules = new Set<string>();
  
  function traverse(node: any) {
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
        usedModules.add(moduleName);
      }
      
      // Check for js-get pattern
      if (
        elements.length >= 3 &&
        elements[0].type === "symbol" &&
        elements[0].name === "js-get" &&
        elements[1].type === "symbol"
      ) {
        const moduleName = elements[1].name;
        usedModules.add(moduleName);
      }
      
      // Also check for nested js-call patterns like (js-call (js-get chalk "green") text)
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
        usedModules.add(moduleName);
      }
      
      // Traverse all elements
      elements.forEach(traverse);
    }
  }
  
  nodes.forEach(traverse);
  return usedModules;
}

/**
 * This module takes the raw HQL AST (possibly already macro-expanded)
 * and applies all necessary conversions so that it becomes a "clean" AST
 */
function convertAST(rawAst: any[]): any[] {
  return perform(
    () => {
      // Map through each node and transform export forms into standard HQL node types
      return rawAst.map(node => {
        if (
          node.type === "list" &&
          node.elements.length >= 3 &&
          node.elements[0].type === "symbol" &&
          node.elements[0].name === "export"
        ) {
          const exportNameNode = node.elements[1];
          const localNode = node.elements[2];
          if (exportNameNode.type === "literal" && typeof exportNameNode.value === "string") {
            return {
              type: "list",
              elements: [
                { type: "symbol", name: "js-export" },
                exportNameNode,
                localNode
              ]
            };
          }
        }
        
        // Also handle vector exports if they exist in the code
        if (
          node.type === "ExportNamedDeclaration" && 
          node.specifiers && 
          Array.isArray(node.specifiers)
        ) {
          // Convert to a series of standard js-export list nodes
          const exportElements = node.specifiers.map(spec => {
            return {
              type: "list",
              elements: [
                { type: "symbol", name: "js-export" },
                { type: "literal", value: spec.exported.name },
                spec.local
              ]
            };
          });
          
          // If there's only one export, return it directly
          if (exportElements.length === 1) {
            return exportElements[0];
          }
          
          // If there are multiple exports, create a list of them
          return {
            type: "list",
            elements: [
              { type: "symbol", name: "do" },
              ...exportElements
            ]
          };
        }
        
        return node;
      });
    },
    "Error in AST conversion process",
    TranspilerError
  );
}