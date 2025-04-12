// src/transformer.ts - Prevents duplicate import errors

import { transformToIR } from "./transpiler/pipeline/hql-ast-to-hql-ir.ts";
import { getLogger } from "./logger-init.ts";
import { generateTypeScript } from "./transpiler/pipeline/ts-ast-to-ts-code.ts";
import { expandMacros } from "./s-exp/macro.ts";
import { Logger } from "./logger.ts";
import { Environment } from "./environment.ts";
import { RUNTIME_FUNCTIONS } from "./transpiler/runtime/runtime.ts";
import { isImportNode } from "./transpiler/type/hql_ast.ts";
import { HQLNode } from "./transpiler/type/hql_ast.ts";
import {
  extractImportInfo,
  findExistingImports,
  findExternalModuleReferences,
  importSourceRegistry,
} from "./utils/import-utils.ts";

import {
  CodeGenError,
  createErrorReport,
  TransformError,
  TranspilerError,
} from "./transpiler/error/errors.ts";

/**
 * Options for code transformation.
 */
interface TransformOptions {
  verbose?: boolean;
  replMode?: boolean;
}

/**
 * Transforms HQL AST nodes through the pipeline.
 */
export async function transformAST(
  astNodes: HQLNode[],
  currentDir: string,
  options: TransformOptions = {},
): Promise<string> {
  const logger = getLogger({ verbose: options.verbose });
  const startTime = performance.now();
  let currentPhase = "initialization";

  try {
    logger.debug(`Starting transformation with ${astNodes.length} AST nodes`);
    logger.debug(`Current directory: ${currentDir}`);

    // Get the global environment (reusing existing instance)
    currentPhase = "environment initialization";
    const envStartTime = performance.now();

    const env = Environment.getGlobalEnv() ||
      await Environment.initializeGlobalEnv({ verbose: options.verbose });

    const envTime = performance.now() - envStartTime;
    logger.debug(`Environment initialized in ${envTime.toFixed(2)}ms`);

    // Expand macros
    currentPhase = "macro expansion";
    const macroStartTime = performance.now();

    const macroExpandedAst = await expandMacros(astNodes, env, {
      verbose: options.verbose,
      currentFile: currentDir,
    });

    const macroTime = performance.now() - macroStartTime;
    logger.debug(
      `Macro expansion completed in ${
        macroTime.toFixed(2)
      }ms with ${macroExpandedAst.length} nodes`,
    );

    // Find modules with proper context
    const moduleReferences = findExternalModuleReferences(
      macroExpandedAst,
      env,
    );
    logger.debug(`Found ${moduleReferences.size} external module references`);

    // Create a full AST with imported modules
    const fullAST: any[] = [];
    const processedImports = new Set<string>(); // Track imported modules to prevent duplicates

    // Process the AST to extract all existing imports
    // This will also help us avoid duplicating imports that are already in the AST
    const existingImports = findExistingImports(macroExpandedAst);
    for (const [moduleName, importPath] of existingImports) {
      logger.debug(
        `Found existing import in AST: ${moduleName} from ${importPath}`,
      );
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
        logger.debug(
          `Adding import for module: ${moduleName} from ${importPath}`,
        );

        fullAST.push({
          type: "list",
          elements: [
            { type: "symbol", name: "js-import" },
            { type: "symbol", name: moduleName },
            { type: "literal", value: importPath },
          ],
        });

        // Mark as processed to avoid duplicates
        processedImports.add(moduleName);
      }
    }

    // Now filter macroExpandedAst to remove duplicate imports
    const filteredAst = macroExpandedAst.filter((node) => {
      // Check if it's an import node we need to potentially skip
      if (isImportNode(node)) {
        const [moduleName, importPath] = extractImportInfo(node);

        // If this is a duplicate import but not the first one we've seen, skip it
        if (
          moduleName && processedImports.has(moduleName) &&
          !existingImports.has(moduleName)
        ) {
          logger.debug(
            `Removing duplicate import: ${moduleName} from ${importPath}`,
          );
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

    const convertedAst = convertAST(fullAST);

    const astConvTime = performance.now() - astConvStartTime;
    logger.debug(`AST conversion completed in ${astConvTime.toFixed(2)}ms`);

    // Transform the converted AST into IR
    currentPhase = "IR transformation";
    const irStartTime = performance.now();

    try {
      const ir = transformToIR(convertedAst, currentDir);
      const irTime = performance.now() - irStartTime;
      logger.debug(
        `IR transformation completed in ${
          irTime.toFixed(2)
        }ms with ${ir.body.length} nodes`,
      );

      // Generate TypeScript code from IR
      currentPhase = "TypeScript code generation";
      const tsGenStartTime = performance.now();

      try {
        const tsCode = generateTypeScript(ir);
        const tsGenTime = performance.now() - tsGenStartTime;
        logger.debug(
          `TypeScript code generation completed in ${tsGenTime.toFixed(2)}ms`,
        );

        // In REPL mode, don't add runtime functions to avoid redefinition errors
        let finalCode;
        if (options.replMode) {
          finalCode = tsCode;
        } else {
          finalCode = `${RUNTIME_FUNCTIONS}\n\n${tsCode}`;
        }

        // Calculate and log total time
        const totalTime = performance.now() - startTime;
        logger.debug(
          `Total transformation completed in ${totalTime.toFixed(2)}ms`,
        );

        // If verbose, log a breakdown of the times
        if (options.verbose) {
          logger.debug("Transformation time breakdown:");
          logger.debug(
            `  Environment setup:   ${envTime.toFixed(2)}ms (${
              (envTime / totalTime * 100).toFixed(1)
            }%)`,
          );
          logger.debug(
            `  Macro expansion:     ${macroTime.toFixed(2)}ms (${
              (macroTime / totalTime * 100).toFixed(1)
            }%)`,
          );
          logger.debug(
            `  AST conversion:      ${astConvTime.toFixed(2)}ms (${
              (astConvTime / totalTime * 100).toFixed(1)
            }%)`,
          );
          logger.debug(
            `  IR transformation:   ${irTime.toFixed(2)}ms (${
              (irTime / totalTime * 100).toFixed(1)
            }%)`,
          );
          logger.debug(
            `  TS code generation:  ${tsGenTime.toFixed(2)}ms (${
              (tsGenTime / totalTime * 100).toFixed(1)
            }%)`,
          );
          logger.debug(`  Total:               ${totalTime.toFixed(2)}ms`);
        }

        return finalCode;
      } catch (error) {
        throw new CodeGenError(
          `Failed to generate TypeScript: ${error instanceof Error ? error.message : String(error)}`,
          "TypeScript generation",
          ir,
        );
      }
    } catch (error) {
      throw new TransformError(
        `Failed to transform AST to IR: ${error instanceof Error ? error.message : String(error)}`,
        `${convertedAst.length} AST nodes`,
        "AST to IR transformation",
        convertedAst,
      );
    }
  } catch (error) {
    // Create a detailed error report
    const errorReport = createErrorReport(
      error instanceof Error ? error : new Error(String(error)),
      `transformation phase: ${currentPhase}`,
      {
        currentDirectory: currentDir,
        options: options,
        nodeCount: astNodes.length,
      },
    );

    // Always log detailed error report in verbose mode
    if (options.verbose) {
      console.error("Detailed transformation error report:");
      console.error(errorReport);
    }

    // Log a warning if this isn't a known TranspilerError type
    if (!(error instanceof TranspilerError)) {
      logger.error(
        `Unexpected error during ${currentPhase}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    throw error;
  }
}

/**
 * AST conversion function
 */
function convertAST(rawAst: any[]): HQLNode[] {
  try {
    // Map through each node and transform export forms into standard HQL node types
    return rawAst.map((node) => {
      // Handle js-export form
      if (
        node.type === "list" &&
        node.elements?.length >= 3 &&
        node.elements[0].type === "symbol" &&
        node.elements[0].name === "export"
      ) {
        const exportNameNode = node.elements[1];
        const localNode = node.elements[2];
        if (
          exportNameNode.type === "literal" &&
          typeof exportNameNode.value === "string"
        ) {
          return {
            type: "list",
            elements: [
              { type: "symbol", name: "js-export" },
              exportNameNode,
              localNode,
            ],
          };
        }
      }

      // Check if node is a special export declaration (this is a TS-specific structure)
      if (
        typeof node === 'object' &&
        node !== null &&
        node.type === "ExportNamedDeclaration" &&
        Array.isArray(node.specifiers)
      ) {
        // Convert to a series of standard js-export list nodes
        const exportElements = node.specifiers.map((spec: any) => {
          return {
            type: "list",
            elements: [
              { type: "symbol", name: "js-export" },
              { type: "literal", value: spec.exported.name },
              spec.local,
            ],
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
            ...exportElements,
          ],
        };
      }

      return node;
    });
  } catch (error) {
    throw new TranspilerError(
      `Error in AST conversion process: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
