// src/transformer.ts - Prevents duplicate import errors

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
 * Transforms HQL AST nodes through the pipeline.
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
    
    // Find modules with proper context
    const moduleReferences = findExternalModuleReferences(macroExpandedAst, env);
    logger.debug(`Found ${moduleReferences.size} external module references`);
    
    // Create a full AST with imported modules
    const fullAST = [];
    const processedImports = new Set<string>(); // Track imported modules to prevent duplicates
    
    // Process the AST to extract all existing imports
    // This will also help us avoid duplicating imports that are already in the AST
    const existingImports = findExistingImports(macroExpandedAst);
    for (const [moduleName, importPath] of existingImports) {
      logger.debug(`Found existing import in AST: ${moduleName} from ${importPath}`);
      processedImports.add(moduleName);
    }
    
    // Add imports for all required external modules that aren't already imported
    for (const moduleName of moduleReferences) {
      // Skip if we've already added this import
      if (processedImports.has(moduleName)) {
        logger.debug(`Skipping duplicate import for module: ${moduleName}`);
        continue;
      }
      
      if (importSourceRegistry.has(moduleName)) {
        const importPath = importSourceRegistry.get(moduleName)!;
        logger.debug(`Adding import for module: ${moduleName} from ${importPath}`);
        
        fullAST.push({
          type: "list",
          elements: [
            { type: "symbol", name: "js-import" },
            { type: "symbol", name: moduleName },
            { type: "literal", value: importPath }
          ]
        });
        
        // Mark as processed to avoid duplicates
        processedImports.add(moduleName);
      }
    }
    
    // Now filter macroExpandedAst to remove duplicate imports
    const filteredAst = macroExpandedAst.filter(node => {
      // Check if it's an import node we need to potentially skip
      if (isImportNode(node)) {
        const [moduleName, importPath] = extractImportInfo(node);
        
        // If this is a duplicate import but not the first one we've seen, skip it
        if (moduleName && processedImports.has(moduleName) && !existingImports.has(moduleName)) {
          logger.debug(`Removing duplicate import: ${moduleName} from ${importPath}`);
          return false;
        }
        
        // Mark this import as processed if we're keeping it
        if (moduleName) {
          processedImports.add(moduleName);
        }
      }
      return true;
    });
    
    // Add the filtered original nodes
    fullAST.push(...filteredAst);
    
    // Convert the expanded AST (if needed)
    currentPhase = "AST conversion";
    const astConvStartTime = performance.now();
    
    const convertedAst = perform(
      () => convertAST(fullAST),
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
 * Check if a node is an import statement
 */
function isImportNode(node: any): boolean {
  return (
    node.type === "list" &&
    node.elements.length >= 3 &&
    node.elements[0].type === "symbol" &&
    (node.elements[0].name === "import" || node.elements[0].name === "js-import")
  );
}

/**
 * Extract import module name and path from an import node
 */
function extractImportInfo(node: any): [string | null, string | null] {
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
        return [node.elements[1].name, node.elements[3].value];
      }
      
      // Handle JS imports: (js-import name "path")
      if (
        node.elements[0].name === "js-import" &&
        node.elements.length === 3 &&
        node.elements[1].type === "symbol" &&
        node.elements[2].type === "literal"
      ) {
        return [node.elements[1].name, node.elements[2].value];
      }
      
      // Add more import patterns if needed
    }
  } catch (e) {
    // If anything fails, return null values
  }
  
  return [null, null];
}

/**
 * Find all existing imports in the AST
 */
function findExistingImports(nodes: any[]): Map<string, string> {
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
function findExternalModuleReferences(nodes: any[], env: Environment): Set<string> {
  const logger = new Logger(false);
  const externalModules = new Set<string>();
  
  function isModuleExternal(moduleName: string): boolean {
    // Check if this module is already registered as an import
    if (importSourceRegistry.has(moduleName)) {
      return true;
    }
    
    try {
      // Try to determine if it's a JavaScript global
      if (typeof globalThis !== 'undefined' && moduleName in globalThis) {
        return false; // It's a built-in global
      }

      // Check if it's defined in the environment
      try {
        env.lookup(moduleName);
        return false; // It's defined in the environment
      } catch (e) {
        // Not defined in env, could be external
      }
      
      // Check if it's a macro
      if (env.hasMacro(moduleName)) {
        return false; // It's a macro
      }
      
      // If we got here, it's likely an external module
      return true;
      
    } catch (e) {
      // If anything fails, assume it could be external just to be safe
      return true;
    }
  }
  
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

/**
 * AST conversion function
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