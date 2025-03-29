// src/transpiler/hql-transpiler.ts - Enhanced with better error handling, diagnostics, and syntax transformation
import * as path from "https://deno.land/std/path/mod.ts";
import { sexpToString } from "../s-exp/types.ts";
import { parse } from "../s-exp/parser.ts";
import { Environment } from "../environment.ts";
import { expandMacros } from "../s-exp/macro.ts";
import { processImports } from "../s-exp/imports.ts";
import { convertToHqlAst } from "../s-exp/macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { Logger } from "../logger.ts";
import { transformSyntax } from "./syntax-transformer.ts";
import {
  createErrorReport,
  ImportError,
  MacroError,
  ParseError,
  TransformError,
  TranspilerError,
} from "./errors.ts";

// Environment singleton for consistent state
let globalEnv: Environment | null = null;
let coreHqlLoaded = false;

// Cache for parsed core.hql to avoid re-parsing
let cachedCoreExpressions: any[] | null = null;

/**
 * Options for processing HQL source code
 */
interface ProcessOptions {
  verbose?: boolean;
  baseDir?: string;
  sourceDir?: string;
  tempDir?: string;
}

/**
 * Process HQL source code through the S-expression layer
 */
export async function processHql(
  source: string,
  options: ProcessOptions = {},
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.debug("Processing HQL source with S-expression layer");

  const startTotalTime = performance.now();
  const sourceFilename = options.baseDir
    ? path.basename(options.baseDir)
    : "unknown";

  try {
    // Step 1: Parse the source into S-expressions
    logger.debug(`Parsing HQL source (${source.length} characters)`);
    const startParseTime = performance.now();

    let sexps;
    try {
      sexps = parse(source);
      logger.debug(`Successfully parsed ${sexps.length} S-expressions`);
    } catch (error) {
      if (error instanceof ParseError) {
        throw error; // Re-throw ParseError with position info
      }
      throw new ParseError(
        `Failed to parse HQL source: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { line: 1, column: 1, offset: 0 },
        source,
      );
    }

    const parseTime = performance.now() - startParseTime;
    logger.debug(`Parsing completed in ${parseTime.toFixed(2)}ms`);

    if (options.verbose) {
      logParsedExpressions(sexps, logger);
    }

    // Step 2: Apply syntax transformations to convert all sugar to canonical forms
    logger.debug("Applying syntax transformations");
    const startSyntaxTime = performance.now();

    try {
      sexps = transformSyntax(sexps, { verbose: options.verbose });
      logger.debug(
        `Syntax transformation completed for ${sexps.length} expressions`,
      );
    } catch (error) {
      if (error instanceof TransformError) {
        throw error;
      }
      throw new TransformError(
        `Failed to transform syntax: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "syntax transformation",
        "valid HQL expressions",
        sexps,
      );
    }

    const syntaxTime = performance.now() - startSyntaxTime;
    logger.debug(
      `Syntax transformation completed in ${syntaxTime.toFixed(2)}ms`,
    );

    if (options.verbose) {
      logTransformedExpressions(sexps, logger);
    }

    // Step 3: Get or initialize the global environment
    logger.debug("Getting global environment with macros");
    const startEnvTime = performance.now();

    const env = await getGlobalEnv(options);

    const envTime = performance.now() - startEnvTime;
    logger.debug(
      `Environment initialization completed in ${envTime.toFixed(2)}ms`,
    );

    // Set the current file if baseDir is provided
    const currentFile = options.baseDir;
    if (currentFile) {
      logger.debug(`Setting current file to: ${currentFile}`);
      env.setCurrentFile(currentFile);
    }

    // Step 4: Process imports in the user code
    logger.debug("Processing imports in user code");
    const startImportTime = performance.now();

    try {
      await processImports(sexps, env, {
        verbose: options.verbose,
        baseDir: options.baseDir || Deno.cwd(),
        tempDir: options.tempDir,
        currentFile: currentFile,
      });
    } catch (error) {
      if (error instanceof ImportError) {
        throw error; // Re-throw ImportError with detailed info
      }
      throw new ImportError(
        `Failed to process imports: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "unknown",
        currentFile,
        error instanceof Error ? error : undefined,
      );
    }

    const importTime = performance.now() - startImportTime;
    logger.debug(`Import processing completed in ${importTime.toFixed(2)}ms`);

    // Step 5: Expand macros in the user code
    logger.debug("Expanding macros in user code");
    const startMacroTime = performance.now();

    let expanded;
    try {
      expanded = expandMacros(sexps, env, {
        verbose: options.verbose,
        currentFile: currentFile,
        useCache: true, // Use macro expansion cache
      });
    } catch (error) {
      if (error instanceof MacroError) {
        throw error; // Re-throw MacroError with detailed info
      }
      throw new MacroError(
        `Failed to expand macros: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "",
        currentFile,
        error instanceof Error ? error : undefined,
      );
    }

    const macroTime = performance.now() - startMacroTime;
    logger.debug(`Macro expansion completed in ${macroTime.toFixed(2)}ms`);

    if (options.verbose) {
      logExpandedExpressions(expanded, logger);
    }

    // Step 6: Convert to HQL AST
    // Step 6: Convert to HQL AST
    logger.debug("Converting to HQL AST");
    const startAstTime = performance.now();

    const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });

    const astTime = performance.now() - startAstTime;
    logger.debug(
      `AST conversion completed in ${
        astTime.toFixed(2)
      }ms with ${hqlAst.length} nodes`,
    );

    // Step 7: Transform to JavaScript using existing pipeline
    logger.debug("Transforming to JavaScript");
    const startTransformTime = performance.now();

    const jsCode = await transformAST(hqlAst, options.baseDir || Deno.cwd(), {
      verbose: options.verbose,
    });

    const transformTime = performance.now() - startTransformTime;
    logger.debug(
      `JavaScript transformation completed in ${transformTime.toFixed(2)}ms`,
    );

    // Clear current file when done
    if (currentFile) {
      env.setCurrentFile(null);
    }

    const totalTime = performance.now() - startTotalTime;
    logger.debug(`Total processing completed in ${totalTime.toFixed(2)}ms`);

    // Log performance metrics
    if (options.verbose) {
      console.log(
        `✅ Successfully processed ${sourceFilename} in ${
          totalTime.toFixed(2)
        }ms`,
      );
      console.log("Performance metrics:");
      console.log(
        `  Parsing:             ${parseTime.toFixed(2)}ms (${
          (parseTime / totalTime * 100).toFixed(1)
        }%)`,
      );
      console.log(
        `  Syntax transform:    ${syntaxTime.toFixed(2)}ms (${
          (syntaxTime / totalTime * 100).toFixed(1)
        }%)`,
      );
      console.log(
        `  Environment setup:   ${envTime.toFixed(2)}ms (${
          (envTime / totalTime * 100).toFixed(1)
        }%)`,
      );
      console.log(
        `  Import processing:   ${importTime.toFixed(2)}ms (${
          (importTime / totalTime * 100).toFixed(1)
        }%)`,
      );
      console.log(
        `  Macro expansion:     ${macroTime.toFixed(2)}ms (${
          (macroTime / totalTime * 100).toFixed(1)
        }%)`,
      );
      console.log(
        `  AST conversion:      ${astTime.toFixed(2)}ms (${
          (astTime / totalTime * 100).toFixed(1)
        }%)`,
      );
      console.log(
        `  JS transformation:   ${transformTime.toFixed(2)}ms (${
          (transformTime / totalTime * 100).toFixed(1)
        }%)`,
      );
      console.log(`  Total:               ${totalTime.toFixed(2)}ms`);
    }

    return jsCode;
  } catch (error) {
    // Create a comprehensive error report
    let errorReport: string;

    if (
      error instanceof ParseError ||
      error instanceof MacroError ||
      error instanceof ImportError ||
      error instanceof TranspilerError ||
      error instanceof TransformError
    ) {
      // Use the formatMessage method for specific error types
      errorReport = error.formatMessage();
    } else {
      // Create a generic error report for unknown errors
      errorReport = createErrorReport(
        error instanceof Error ? error : new Error(String(error)),
        "HQL processing",
        {
          sourceLength: source.length,
          options: options,
          file: sourceFilename,
        },
      );
    }

    // Always log the error
    logger.error(
      `❌ Error processing HQL: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    // Display detailed error report in verbose mode
    if (options.verbose) {
      console.error("Detailed error report:");
      console.error(errorReport);
    }

    // Rethrow the original error or wrap it
    if (
      error instanceof ParseError ||
      error instanceof MacroError ||
      error instanceof ImportError ||
      error instanceof TranspilerError ||
      error instanceof TransformError
    ) {
      throw error;
    } else {
      throw new TranspilerError(
        `Error processing HQL: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * Helper function to log parsed expressions when in verbose mode
 */
function logParsedExpressions(sexps: any[], logger: Logger): void {
  logger.debug(`Parsed ${sexps.length} expressions`);

  // Only log the first few expressions to avoid overwhelming output
  const MAX_EXPRESSIONS_TO_LOG = 5;
  for (let i = 0; i < Math.min(sexps.length, MAX_EXPRESSIONS_TO_LOG); i++) {
    logger.debug(`Expression ${i + 1}: ${sexpToString(sexps[i])}`);
  }

  if (sexps.length > MAX_EXPRESSIONS_TO_LOG) {
    logger.debug(
      `...and ${sexps.length - MAX_EXPRESSIONS_TO_LOG} more expressions`,
    );
  }
}

/**
 * Helper function to log syntax-transformed expressions when in verbose mode
 */
function logTransformedExpressions(sexps: any[], logger: Logger): void {
  logger.debug(`Transformed to ${sexps.length} canonical expressions`);

  // Only log the first few expressions to avoid overwhelming output
  const MAX_EXPRESSIONS_TO_LOG = 5;
  for (let i = 0; i < Math.min(sexps.length, MAX_EXPRESSIONS_TO_LOG); i++) {
    logger.debug(`Transformed ${i + 1}: ${sexpToString(sexps[i])}`);
  }

  if (sexps.length > MAX_EXPRESSIONS_TO_LOG) {
    logger.debug(
      `...and ${sexps.length - MAX_EXPRESSIONS_TO_LOG} more expressions`,
    );
  }
}

/**
 * Helper function to log expanded expressions when in verbose mode
 */
function logExpandedExpressions(expanded: any[], logger: Logger): void {
  logger.debug(`Expanded to ${expanded.length} expressions`);

  // Only log the first few expressions to avoid overwhelming output
  const MAX_EXPRESSIONS_TO_LOG = 5;
  for (let i = 0; i < Math.min(expanded.length, MAX_EXPRESSIONS_TO_LOG); i++) {
    logger.debug(`Expanded ${i + 1}: ${sexpToString(expanded[i])}`);
  }

  if (expanded.length > MAX_EXPRESSIONS_TO_LOG) {
    logger.debug(
      `...and ${expanded.length - MAX_EXPRESSIONS_TO_LOG} more expressions`,
    );
  }
}

/**
 * Load and process core.hql to establish the standard library
 */
async function loadCoreHql(
  env: Environment,
  options: ProcessOptions,
): Promise<void> {
  const logger = new Logger(options.verbose || false);

  // Skip if already loaded to prevent duplicate loading
  if (coreHqlLoaded) {
    logger.debug("core.hql already loaded, skipping");
    return;
  }

  logger.debug("Loading core.hql standard library");

  try {
    // Look for lib/core.hql from the current directory
    const cwd = Deno.cwd();
    const corePath = path.join(cwd, "lib/core.hql");

    logger.debug(`Looking for core.hql at: ${corePath}`);

    // Check if we need to parse core.hql or if we can use cached expressions
    let coreExps;
    if (cachedCoreExpressions) {
      logger.debug("Using cached core.hql expressions");
      coreExps = cachedCoreExpressions;
    } else {
      // Use the environment's file tracking to avoid redundant processing
      if (env.hasProcessedFile(corePath)) {
        logger.debug(
          `Core.hql already processed in this environment, skipping`,
        );
        coreHqlLoaded = true;
        return;
      }

      // Read the file
      let coreSource;
      try {
        coreSource = await Deno.readTextFile(corePath);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        logger.error(
          `Could not find or read lib/core.hql at ${corePath}`,
        );

        throw new ImportError(
          `Could not find lib/core.hql at ${corePath}. Make sure you are running from the project root.`,
          corePath,
          undefined,
          error,
        );
      }

      logger.debug(
        `Found core.hql at: ${corePath} (${coreSource.length} bytes)`,
      );

      // Parse the core.hql file
      try {
        coreExps = parse(coreSource);
        cachedCoreExpressions = coreExps; // Cache for future use
        logger.debug(
          `Parsed core.hql and cached ${coreExps.length} expressions`,
        );
      } catch (error) {
        throw new ParseError(
          `Failed to parse core.hql: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { line: 1, column: 1, offset: 0 },
          coreSource,
        );
      }
    }

    // Apply syntax transformations to core.hql
    logger.debug("Applying syntax transformations to core.hql");
    coreExps = transformSyntax(coreExps, { verbose: options.verbose });

    // Process imports in core.hql
    await processImports(coreExps, env, {
      verbose: options.verbose || false,
      baseDir: path.dirname(corePath),
      currentFile: corePath, // Set current file to the core.hql path
    });

    // Expand macros defined in core.hql
    expandMacros(coreExps, env, {
      verbose: options.verbose,
      currentFile: corePath,
    });

    // Mark core as loaded and processed
    coreHqlLoaded = true;
    env.markFileProcessed(corePath);

    logger.debug("Core.hql loaded and all macros registered successfully");
  } catch (error) {
    throw new TranspilerError(
      `Loading core.hql standard library: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Initialize the global environment once
 * Uses singleton pattern for consistency
 */
async function getGlobalEnv(options: ProcessOptions): Promise<Environment> {
  const logger = new Logger(options.verbose);

  try {
    // If we already have a global environment, reuse it
    if (globalEnv) {
      logger.debug("Reusing existing global environment");
      return globalEnv;
    }

    // Otherwise, initialize a new one
    const startTime = performance.now();
    logger.debug("Initializing new global environment");

    // Create the environment
    globalEnv = await Environment.initializeGlobalEnv({
      verbose: options.verbose,
    });

    await loadCoreHql(globalEnv, options);

    const endTime = performance.now();
    logger.debug(
      `Global environment initialization took ${
        (endTime - startTime).toFixed(2)
      }ms`,
    );

    return globalEnv;
  } catch (error) {
    throw new TranspilerError(
      `Initializing global environment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
