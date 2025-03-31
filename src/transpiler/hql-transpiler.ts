// src/transpiler/hql-transpiler.ts - Refactored
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { sexpToString } from "../s-exp/types.ts";
import { parse } from "../s-exp/parser.ts";
import { Environment } from "../environment.ts";
import { expandMacros } from "../s-exp/macro.ts";
import { processImports } from "../s-exp/imports.ts";
import { convertToHqlAst } from "../s-exp/macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { Logger } from "../logger.ts";
import { transformSyntax } from "./syntax-transformer.ts";
import { getSystemMacroPaths } from "../s-exp/system-macros.ts";
import {
  createErrorReport,
  ImportError,
  MacroError,
  ParseError,
  TransformError,
  TranspilerError,
} from "./errors.ts";

let globalEnv: Environment | null = null;
let systemMacrosLoaded = false;
const macroExpressionsCache = new Map<string, any[]>();

interface ProcessOptions {
  verbose?: boolean;
  baseDir?: string;
  sourceDir?: string;
  tempDir?: string;
}

export async function processHql(
  source: string,
  options: ProcessOptions = {},
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.debug("Processing HQL source with S-expression layer");

  const timings = new Map<string, number>();
  const start = () => performance.now();
  const end = (label: string, s: number) => {
    const t = performance.now() - s;
    timings.set(label, t);
    logger.debug(`${label} completed in ${t.toFixed(2)}ms`);
  };

  const sourceFilename = options.baseDir ? path.basename(options.baseDir) : "unknown";

  try {
    // Step 1: Parse
    const t0 = start();
    const sexps = parseWithHandling(source, logger);
    end("Parsing", t0);
    if (options.verbose) logExpressions("Parsed", sexps, logger);

    // Step 2: Syntax Transform
    const t1 = start();
    const canonicalSexps = transformWithHandling(sexps, options.verbose, logger);
    end("Syntax transform", t1);
    if (options.verbose) logExpressions("Transformed", canonicalSexps, logger);

    // Step 3: Global Environment
    const t2 = start();
    const env = await getGlobalEnv(options);
    if (options.baseDir) env.setCurrentFile(options.baseDir);
    end("Environment setup", t2);

    // Step 4: Imports
    const t3 = start();
    await processImportsWithHandling(canonicalSexps, env, options);
    end("Import processing", t3);

    // Step 5: Macro Expansion
    const t4 = start();
    const expanded = expandWithHandling(canonicalSexps, env, options, logger);
    end("Macro expansion", t4);
    if (options.verbose) logExpressions("Expanded", expanded, logger);

    // Step 6: Convert to AST
    const t5 = start();
    const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
    end("AST conversion", t5);

    // Step 7: Transform to JS
    const t6 = start();
    const jsCode = await transformAST(hqlAst, options.baseDir || Deno.cwd(), { verbose: options.verbose });
    end("JS transformation", t6);

    if (options.baseDir) env.setCurrentFile(null);

    if (options.verbose) logPerformance(timings, sourceFilename);
    return jsCode;
  } catch (error) {
    handleProcessError(error, source, options, sourceFilename, logger);
  }
}

function parseWithHandling(source: string, logger: Logger) {
  try {
    const sexps = parse(source);
    logger.debug(`Parsed ${sexps.length} S-expressions`);
    return sexps;
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(`Failed to parse HQL source: ${error.message}`, { line: 1, column: 1, offset: 0 }, source);
  }
}

function transformWithHandling(sexps: any[], verbose: boolean | undefined, logger: Logger) {
  try {
    const result = transformSyntax(sexps, { verbose });
    logger.debug(`Transformed ${result.length} expressions`);
    return result;
  } catch (error) {
    if (error instanceof TransformError) throw error;
    throw new TransformError(`Failed to transform syntax: ${error.message}`, "syntax transformation", "valid HQL expressions", sexps);
  }
}

async function processImportsWithHandling(sexps: any[], env: Environment, options: ProcessOptions) {
  try {
    await processImports(sexps, env, {
      verbose: options.verbose,
      baseDir: options.baseDir || Deno.cwd(),
      tempDir: options.tempDir,
      currentFile: options.baseDir,
    });
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(`Failed to process imports: ${error.message}`, "unknown", options.baseDir, error);
  }
}

function expandWithHandling(sexps: any[], env: Environment, options: ProcessOptions, logger: Logger) {
  try {
    return expandMacros(sexps, env, {
      verbose: options.verbose,
      currentFile: options.baseDir,
      useCache: true,
    });
  } catch (error) {
    if (error instanceof MacroError) throw error;
    throw new MacroError(`Failed to expand macros: ${error.message}`, "", options.baseDir, error);
  }
}

function logExpressions(label: string, sexps: any[], logger: Logger) {
  const maxLog = 5;
  logger.debug(`${label} ${sexps.length} expressions`);
  sexps.slice(0, maxLog).forEach((s, i) => logger.debug(`${label} ${i + 1}: ${sexpToString(s)}`));
  if (sexps.length > maxLog) logger.debug(`...and ${sexps.length - maxLog} more expressions`);
}

function logPerformance(timings: Map<string, number>, file: string) {
  const total = Array.from(timings.values()).reduce((a, b) => a + b, 0);
  console.log(`✅ Successfully processed ${file} in ${total.toFixed(2)}ms`);
  console.log("Performance metrics:");
  for (const [label, time] of timings.entries()) {
    console.log(`  ${label.padEnd(20)} ${time.toFixed(2)}ms (${((time / total) * 100).toFixed(1)}%)`);
  }
  console.log(`  Total                ${total.toFixed(2)}ms`);
}

function handleProcessError(
  error: unknown,
  source: string,
  options: ProcessOptions,
  sourceFilename: string,
  logger: Logger,
) {
  let report;
  if (
    error instanceof ParseError ||
    error instanceof MacroError ||
    error instanceof ImportError ||
    error instanceof TranspilerError ||
    error instanceof TransformError
  ) {
    report = error.formatMessage();
  } else {
    report = createErrorReport(
      error instanceof Error ? error : new Error(String(error)),
      "HQL processing",
      { sourceLength: source.length, options, file: sourceFilename },
    );
  }

  logger.error(`❌ Error processing HQL: ${error instanceof Error ? error.message : String(error)}`);
  if (options.verbose) console.error("Detailed error report:\n" + report);

  if (
    error instanceof ParseError ||
    error instanceof MacroError ||
    error instanceof ImportError ||
    error instanceof TranspilerError ||
    error instanceof TransformError
  ) {
    throw error;
  } else {
    throw new TranspilerError(`Error processing HQL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadSystemMacros(env: Environment, options: ProcessOptions): Promise<void> {
  const logger = new Logger(options.verbose || false);
  if (systemMacrosLoaded) {
    logger.debug("System macros already loaded, skipping");
    return;
  }

  try {
    const macroPaths = getSystemMacroPaths();
    for (const macroPath of macroPaths) {
      if (env.hasProcessedFile(macroPath)) continue;

      const macroSource = await Deno.readTextFile(macroPath).catch(e => {
        throw new ImportError(`Could not find macro file at ${macroPath}.`, macroPath, undefined, e);
      });

      const macroExps = macroExpressionsCache.get(macroPath) || parse(macroSource);
      macroExpressionsCache.set(macroPath, macroExps);

      const transformed = transformSyntax(macroExps, { verbose: options.verbose });

      await processImports(transformed, env, {
        verbose: options.verbose || false,
        baseDir: path.dirname(macroPath),
        currentFile: macroPath,
      });

      expandMacros(transformed, env, { verbose: options.verbose, currentFile: macroPath });
      env.markFileProcessed(macroPath);
    }
    systemMacrosLoaded = true;
  } catch (error) {
    throw new TranspilerError(`Loading system macro files: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getGlobalEnv(options: ProcessOptions): Promise<Environment> {
  const logger = new Logger(options.verbose);
  if (globalEnv) {
    logger.debug("Reusing existing global environment");
    return globalEnv;
  }

  const t = performance.now();
  logger.debug("Initializing new global environment");
  globalEnv = await Environment.initializeGlobalEnv({ verbose: options.verbose });
  await loadSystemMacros(globalEnv, options);
  logger.debug(`Global environment initialization took ${(performance.now() - t).toFixed(2)}ms`);

  return globalEnv;
}
