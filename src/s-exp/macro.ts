// src/s-exp/macro.ts - Simplified implementation with proper hygiene
import {
  createList,
  createLiteral,
  createNilLiteral,
  isDefMacro,
  isList,
  isLiteral,
  isSymbol,
  isUserMacro,
  SExp,
  sexpToString,
  SList,
  SSymbol,
} from "./types.ts";
import { Environment } from "../environment.ts";
import { Logger } from "../logger.ts";
import { MacroFn } from "../environment.ts";
import { MacroError, TransformError } from "../transpiler/errors.ts";
import { gensym } from "../gensym.ts";
import { LRUCache } from "../utils/lru-cache.ts";
import { perform } from "../transpiler/error-utils.ts"

// Maximum number of expansion iterations to prevent infinite recursion
const MAX_EXPANSION_ITERATIONS = 100;

// Cache to avoid repeated checks during transform
export const macroCache = new Map<string, Map<string, boolean>>();

// Cache for macro expansion results
const macroExpansionCache = new LRUCache<string, SExp>(5000);

// Symbol tracking for hygiene
const symbolRenameMap = new Map<string, Map<string, string>>();

/**
 * Options for macro expansion
 */
interface MacroExpanderOptions {
  verbose?: boolean;
  maxExpandDepth?: number;
  currentFile?: string;
  useCache?: boolean;
}

/**
 * Register a global macro definition
 */
export function defineMacro(
  macroForm: SList,
  env: Environment,
  logger: Logger,
): void {
  try {
    // Validate macro definition: (defmacro name [params...] body...)
    if (macroForm.elements.length < 4) {
      throw new MacroError(
        "defmacro requires a name, parameter list, and body",
        "defmacro",
      );
    }

    // Get macro name
    const macroNameExp = macroForm.elements[1];
    if (!isSymbol(macroNameExp)) {
      throw new MacroError(
        "Macro name must be a symbol",
        "defmacro",
      );
    }
    const macroName = macroNameExp.name;

    // Get parameter list
    const paramsExp = macroForm.elements[2];
    if (!isList(paramsExp)) {
      throw new MacroError(
        "Macro parameters must be a list",
        macroName,
      );
    }

    // Process parameter list, handling rest parameters
    const { params, restParam } = processParamList(paramsExp, logger);

    // Get macro body (all remaining forms)
    const body = macroForm.elements.slice(3);

    // Create macro function
    const macroFn = createMacroFunction(
      macroName,
      params,
      restParam,
      body,
      logger,
    );

    // Register the macro in the environment
    env.defineMacro(macroName, macroFn);
    logger.debug(`Registered global macro: ${macroName}`);
  } catch (error) {
    const macroName =
      macroForm.elements.length > 1 && isSymbol(macroForm.elements[1])
        ? (macroForm.elements[1] as SSymbol).name
        : "unknown";

    throw new MacroError(
      `Failed to define macro: ${
        error instanceof Error ? error.message : String(error)
      }`,
      macroName,
    );
  }
}

/**
 * Define a user-level macro in the module scope
 */
export function defineUserMacro(
  macroForm: SList,
  filePath: string,
  env: Environment,
  logger: Logger,
): void {
  try {
    // Validate macro definition: (macro name [params...] body...)
    if (macroForm.elements.length < 4) {
      throw new MacroError(
        "macro requires a name, parameter list, and body",
        "macro",
        filePath,
      );
    }

    // Get macro name
    const macroNameExp = macroForm.elements[1];
    if (!isSymbol(macroNameExp)) {
      throw new MacroError(
        "Macro name must be a symbol",
        "macro",
        filePath,
      );
    }
    const macroName = macroNameExp.name;

    // Skip if already defined (avoid redundant work)
    if (env.hasModuleMacro(filePath, macroName)) {
      logger.debug(
        `Macro ${macroName} already defined in ${filePath}, skipping`,
      );
      return;
    }

    // Get parameter list
    const paramsExp = macroForm.elements[2];
    if (!isList(paramsExp)) {
      throw new MacroError(
        "Macro parameters must be a list",
        macroName,
        filePath,
      );
    }

    // Process parameter list, handling rest parameters
    const { params, restParam } = processParamList(paramsExp, logger);

    // Get macro body (all remaining forms)
    const body = macroForm.elements.slice(3);

    // Create macro function
    const macroFn = createMacroFunction(
      macroName,
      params,
      restParam,
      body,
      logger,
      filePath,
    );

    // Register the macro in the module's registry
    env.defineModuleMacro(filePath, macroName, macroFn);
    logger.debug(`Defined user-level macro ${macroName} in ${filePath}`);
  } catch (error) {
    if (error instanceof MacroError) {
      throw error;
    }

    const macroName =
      macroForm.elements.length > 1 && isSymbol(macroForm.elements[1])
        ? (macroForm.elements[1] as SSymbol).name
        : "unknown";

    throw new MacroError(
      `Failed to define user macro in ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      macroName,
      filePath,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Main function to expand all macros in a list of S-expressions
 */
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  options: MacroExpanderOptions = {},
): SExp[] {
  try {
    const logger = new Logger(options.verbose || false);
    const currentFile = options.currentFile;
    const useCache = options.useCache !== false; // Default to using cache

    logger.debug(
      `Starting macro expansion on ${exprs.length} expressions${
        currentFile ? ` in ${currentFile}` : ""
      }`,
    );

    // If we have a current file, set it in the environment
    if (currentFile) {
      env.setCurrentFile(currentFile);
      logger.debug(`Setting current file to: ${currentFile}`);
    }

    // First pass: register all global and user-level macro definitions
    processMacroDefinitions(exprs, env, currentFile, logger);

    // Use fixed-point iteration to expand all macros
    let currentExprs = [...exprs];
    let iteration = 0;
    let changed = true;

    // Keep expanding until no changes occur (fixed point) or max iterations reached
    while (changed && iteration < MAX_EXPANSION_ITERATIONS) {
      changed = false;
      iteration++;

      logger.debug(`Macro expansion iteration ${iteration}`);

      // Expand all expressions in the current pass with simplified caching
      const newExprs = currentExprs.map((expr) => {
        const exprStr = useCache ? sexpToString(expr) : "";

        // Simplified cache handling
        if (useCache && macroExpansionCache.has(exprStr)) {
          logger.debug(
            `Cache hit for expression: ${exprStr.substring(0, 30)}...`,
          );
          return macroExpansionCache.get(exprStr)!;
        }

        // Otherwise expand and update cache
        const expandedExpr = expandMacroExpression(expr, env, options, 0);

        // Cache result if caching is enabled
        if (useCache) {
          macroExpansionCache.set(exprStr, expandedExpr);
        }

        return expandedExpr;
      });

      // Check if anything changed
      const oldStr = currentExprs.map(sexpToString).join("\n");
      const newStr = newExprs.map(sexpToString).join("\n");

      if (oldStr !== newStr) {
        changed = true;
        currentExprs = newExprs;
        logger.debug(
          `Changes detected in iteration ${iteration}, continuing expansion`,
        );
      } else {
        logger.debug(
          `No changes in iteration ${iteration}, fixed point reached`,
        );
      }
    }

    if (iteration >= MAX_EXPANSION_ITERATIONS) {
      logger.warn(
        `Macro expansion reached maximum iterations (${MAX_EXPANSION_ITERATIONS}). Check for infinite recursion.`,
      );
    }

    logger.debug(`Completed macro expansion after ${iteration} iterations`);

    // Filter out macro definitions from the final result
    currentExprs = filterMacroDefinitions(currentExprs, logger);

    // Clean up environment when done
    if (currentFile) {
      env.setCurrentFile(null);
      logger.debug(`Clearing current file`);
    }

    return currentExprs;
  } catch (error) {
    throw new MacroError(
      `Macro expansion failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "",
      options.currentFile,
    );
  }
}

/**
 * Check if a symbol represents a user-level macro
 * with caching.
 */
export function isUserLevelMacro(symbolName: string, currentDir: string): boolean {
  const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

  return perform(
    () => {
      if (macroCache.has(currentDir)) {
        const fileCache = macroCache.get(currentDir)!;
        if (fileCache.has(symbolName)) {
          return fileCache.get(symbolName)!;
        }
      } else {
        macroCache.set(currentDir, new Map<string, boolean>());
      }

      const env = Environment.getGlobalEnv();
      if (!env) {
        logger.debug(
          `No global environment found, assuming '${symbolName}' is not a macro`,
        );
        macroCache.get(currentDir)!.set(symbolName, false);
        return false;
      }

      const result = env.isUserLevelMacro(symbolName, currentDir);
      macroCache.get(currentDir)!.set(symbolName, result);
      logger.debug(
        `Checking if '${symbolName}' is a user-level macro: ${result}`,
      );
      return result;
    },
    `isUserLevelMacro '${symbolName}'`,
    TransformError,
    [symbolName, currentDir],
  );
}

/**
 * Get renamed symbol if it exists
 */
function getSymbolRename(
  context: string,
  original: string,
): string | undefined {
  return symbolRenameMap.get(context)?.get(original);
}

/**
 * Register a symbol rename mapping
 */
function registerSymbolRename(
  context: string,
  original: string,
  renamed: string,
): void {
  if (!symbolRenameMap.has(context)) {
    symbolRenameMap.set(context, new Map<string, string>());
  }

  symbolRenameMap.get(context)!.set(original, renamed);
}

/**
 * Helper function to create a macro function with consistent implementation
 */
function createMacroFunction(
  macroName: string,
  params: string[],
  restParam: string | null,
  body: SExp[],
  logger: Logger,
  sourceFile?: string,
): MacroFn {
  try {
    const macroFn = (args: SExp[], callEnv: Environment): SExp => {
      const source = sourceFile ? ` from ${sourceFile}` : "";
      logger.debug(
        `Expanding ${
          sourceFile ? "module " : ""
        }macro ${macroName}${source} with ${args.length} args`,
      );

      // Set current macro context for hygiene
      callEnv.setCurrentMacroContext(`macro_${macroName}`);

      // Create new environment for macro expansion with proper hygiene
      const macroEnv = createMacroEnv(
        callEnv,
        params,
        restParam,
        args,
        logger,
      );

      // Evaluate body expressions with error handling
      let result: SExp = createNilLiteral();

      for (const expr of body) {
        result = evaluateForMacro(expr, macroEnv, logger);
      }

      // Apply hygiene transformation to result
      result = applyHygiene(result, macroName, logger);

      // Clear the macro context
      callEnv.setCurrentMacroContext(null);

      logger.debug(`Macro ${macroName} expanded to: ${sexpToString(result)}`);
      return result;
    };

    // Tag the function as a macro
    Object.defineProperty(macroFn, "isMacro", { value: true });
    Object.defineProperty(macroFn, "macroName", { value: macroName });

    // Additional metadata for user-level macros
    if (sourceFile) {
      Object.defineProperty(macroFn, "sourceFile", { value: sourceFile });
      Object.defineProperty(macroFn, "isUserMacro", { value: true });
    }

    return macroFn;
  } catch (error) {
    throw new MacroError(
      `Failed to create macro function for ${macroName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      macroName,
      sourceFile,
    );
  }
}

/**
 * Apply hygiene transformations to an expression
 */
function applyHygiene(expr: SExp, macroName: string, logger: Logger): SExp {
  try {
    const hygieneContext = `macro_${macroName}`;

    // Helper for recursive processing
    // deno-lint-ignore no-inner-declarations
    function processExpr(expr: SExp): SExp {
      // Handle different expression types
      if (isList(expr)) {
        const list = expr as SList;
        const elements = list.elements.map((elem) => processExpr(elem));
        return { type: "list", elements };
      } else if (isSymbol(expr)) {
        const originalName = (expr as SSymbol).name;
        const renamedSymbol = getSymbolRename(hygieneContext, originalName);

        if (renamedSymbol) {
          logger.debug(
            `Using renamed symbol ${originalName} -> ${renamedSymbol}`,
          );
          return { type: "symbol", name: renamedSymbol };
        }

        return expr;
      }

      // Other expression types remain unchanged
      return expr;
    }

    return processExpr(expr);
  } catch (error) {
    logger.warn(
      `Error applying hygiene to expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return expr; // Return original expression on error to avoid breaking things
  }
}

/**
 * Process a parameter list, handling rest parameters
 */
function processParamList(
  paramsExp: SList
): { params: string[]; restParam: string | null } {
  try {
    const params: string[] = [];
    let restParam: string | null = null;
    let restMode = false;

    for (let i = 0; i < paramsExp.elements.length; i++) {
      const param = paramsExp.elements[i];
      if (!isSymbol(param)) {
        throw new Error(
          `Macro parameter at position ${i + 1} must be a symbol, got: ${
            sexpToString(param)
          }`,
        );
      }

      const paramName = param.name;

      if (paramName === "&") {
        restMode = true;
        continue;
      }

      if (restMode) {
        if (restParam !== null) {
          throw new Error(
            `Multiple rest parameters not allowed: found '${restParam}' and '${paramName}'`,
          );
        }
        restParam = paramName;
      } else {
        params.push(paramName);
      }
    }

    return { params, restParam };
  } catch (error) {
    throw new Error(
      `Error processing parameter list: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Create a new environment for macro expansion with parameter bindings
 * Enhanced with proper hygiene using gensym for parameters
 */
function createMacroEnv(
  parent: Environment,
  params: string[],
  restParam: string | null,
  args: SExp[],
  logger: Logger,
): Environment {
  try {
    const env = parent.extend(); // Create a child environment
    const macroContext = parent.getCurrentMacroContext();

    // Bind positional parameters with hygiene
    for (let i = 0; i < params.length; i++) {
      // Create unique symbol names for parameters to maintain hygiene
      const hygienicParamName = `${params[i]}_${gensym("param")}`;

      // Register the rename mapping
      if (macroContext) {
        registerSymbolRename(macroContext, params[i], hygienicParamName);
      }

      // Bind both the hygienic name and original name
      const paramValue = i < args.length ? args[i] : createNilLiteral();
      env.define(hygienicParamName, paramValue);
      env.define(params[i], paramValue); // For backward compatibility
    }

    // Bind rest parameter if present
    if (restParam !== null) {
      // Get the rest arguments
      const restArgs = args.slice(params.length);
      logger.debug(
        `Creating rest parameter '${restParam}' with ${restArgs.length} elements`,
      );

      // Create a proper SList for the rest arguments
      const restList = createList(...restArgs);

      // Tag it as a rest parameter for special handling
      Object.defineProperty(restList, "isRestParameter", { value: true });

      // Create hygienic name for rest parameter
      const hygienicRestName = `${restParam}_${gensym("rest")}`;

      // Register the rename mapping
      if (macroContext) {
        registerSymbolRename(macroContext, restParam, hygienicRestName);
      }

      // Define both names
      env.define(hygienicRestName, restList);
      env.define(restParam, restList); // For backward compatibility
    }

    return env;
  } catch (error) {
    throw new Error(
      `Error creating macro environment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Evaluate an S-expression for macro expansion
 */
export function evaluateForMacro(
  expr: SExp,
  env: Environment,
  logger: Logger,
): SExp {
  try {
    logger.debug(`Evaluating for macro: ${sexpToString(expr)}`);

    // Handle literals
    if (isLiteral(expr)) {
      return expr;
    }

    // Handle symbols (look up in environment)
    if (isSymbol(expr)) {
      return evaluateSymbol(expr as SSymbol, env, logger);
    }

    // Handle lists
    if (isList(expr)) {
      return evaluateList(expr as SList, env, logger);
    }

    // Unknown expression type
    return expr;
  } catch (error) {
    logger.warn(
      `Error evaluating expression for macro: ${sexpToString(expr)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return expr; // Return original expression on error as a fallback
  }
}

// Modified evaluateSymbol in src/s-exp/macro.ts to validate module property access

function evaluateSymbol(expr: SSymbol, env: Environment, logger: Logger): SExp {
  try {
    try {
      // Handle module property access (dot notation)
      if (expr.name.includes(".") && !expr.name.startsWith(".")) {
        const parts = expr.name.split(".");
        const moduleName = parts[0];
        const propertyPath = parts.slice(1).join(".");
        
        try {
          // Get the module
          const moduleValue = env.lookup(moduleName);
          
          // If we're in a macro expansion context, do validation
          const macroContext = env.getCurrentMacroContext();
          const currentFile = env.getCurrentFile();
          
          if (macroContext && currentFile) {
            // Get the module file path by matching moduleExports or moduleMacros
            let moduleFilePath: string | null = null;
            
            // Check in moduleExports first (non-macro modules)
            for (const [modPath, exports] of env.moduleExports.entries()) {
              if (modPath === moduleName || modPath.endsWith(`/${moduleName}`)) {
                moduleFilePath = modPath;
                break;
              }
            }
            
            // If not found, check in moduleMacros (macro modules)
            if (!moduleFilePath) {
              for (const [path, exportedMacros] of env.moduleMacros.entries()) {
                if (path.endsWith(moduleName + ".hql") || path.includes(`/${moduleName}.hql`)) {
                  moduleFilePath = path;
                  break;
                }
              }
            }
            
            // If this is accessing a known module, validate exports
            if (moduleFilePath) {
              // Try to get exported properties using getExportedModuleProps
              const exportedProps = env.getExportedModuleProps?.(moduleFilePath);
              
              if (exportedProps && !exportedProps.has(propertyPath)) {
                logger.warn(
                  `Warning: Macro '${macroContext}' accessing non-exported property '${propertyPath}' from module '${moduleName}' (${moduleFilePath})`
                );
                // We'll allow it but warn for now to maintain compatibility
              }
            } else {
              // Module filepath couldn't be determined, but access is allowed
              logger.debug(
                `Module file path for '${moduleName}' couldn't be determined for export validation`
              );
            }
          }
          
          // If we get here, continue with the property access
          let result = moduleValue;
          
          // Access the property
          if (typeof result === "object" && result !== null && propertyPath in (result as Record<string, unknown>)) {
            result = (result as Record<string, unknown>)[propertyPath];
          } else {
            // Property not found
            logger.debug(`Property '${propertyPath}' not found in module '${moduleName}'`);
            return expr; // Return the symbol as is
          }
          
          // Convert to S-expression
          if (typeof result === "object" && result !== null && "type" in result) {
            return result as SExp;
          } else if (Array.isArray(result)) {
            return createList(
              ...result.map((item) =>
                typeof item === "object" && item !== null && "type" in item
                  ? item as SExp
                  : createLiteral(item)
              ),
            );
          } else {
            return createLiteral(result);
          }
        } catch (e) {
          // For symbol lookup failures, provide more context in debug mode
          logger.debug(
            `Module property access failed: ${expr.name} during macro evaluation`
          );
          return expr; // Return symbol as is if not found
        }
      }

      // Handle regular symbol lookups (unchanged)
      try {
        const value = env.lookup(expr.name);

        // Convert JS values to S-expressions
        if (typeof value === "object" && value !== null && "type" in value) {
          return value as SExp;
        } else if (Array.isArray(value)) {
          return createList(
            ...value.map((item) =>
              typeof item === "object" && item !== null && "type" in item
                ? item as SExp
                : createLiteral(item)
            ),
          );
        } else {
          return createLiteral(value);
        }
      } catch (e) {
        // For symbol lookup failures, provide more context in debug mode
        logger.debug(
          `Symbol lookup failed for '${expr.name}' during macro evaluation`,
        );
        return expr; // Return symbol as is if not found
      }
    } catch (error) {
      logger.warn(
        `Error evaluating symbol ${expr.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return expr;
    }
  } catch (error) {
    logger.warn(
      `Unhandled error evaluating symbol ${expr.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return expr;
  }
}

/**
 * Evaluate a list expression during macro expansion
 */
function evaluateList(expr: SList, env: Environment, logger: Logger): SExp {
  try {
    // Empty list
    if (expr.elements.length === 0) {
      return expr;
    }

    const first = expr.elements[0];

    // Handle special forms
    if (isSymbol(first)) {
      const op = (first as SSymbol).name;

      switch (op) {
        case "quote":
          return evaluateQuote(expr, env, logger);
        case "quasiquote":
          return evaluateQuasiquote(expr, env, logger);
        case "unquote":
        case "unquote-splicing":
          throw new MacroError(
            `${op} not in quasiquote context`,
            op,
          );
        case "if":
          return evaluateIf(expr, env, logger);
        case "cond":
          return evaluateCond(expr, env, logger);
        case "let":
          return evaluateLet(expr, env, logger);
        case "def":
        case "defn":
        case "fn":
          return createNilLiteral(); // Ignored during macro evaluation
      }

      // Check for macro call
      if (env.hasMacro(op)) {
        return evaluateMacroCall(expr, env, logger);
      }

      // Try to look up as a function
      try {
        return evaluateFunctionCall(expr, env, logger);
      } catch (error) {
        throw new MacroError(
          `Error evaluating function call '${op}': ${
            error instanceof Error ? error.message : String(error)
          }`,
          op,
        );
      }
    }

    // Not a symbol in first position, evaluate all elements
    return createList(
      ...expr.elements.map((elem) => evaluateForMacro(elem, env, logger)),
    );
  } catch (error) {
    logger.warn(
      `Error evaluating list for macro: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return expr;
  }
}

/**
 * Evaluate a quoted expression
 */
function evaluateQuote(list: SList, env: Environment, logger: Logger): SExp {
  try {
    if (list.elements.length !== 2) {
      throw new MacroError("quote requires exactly one argument", "quote");
    }
    return list.elements[1];
  } catch (error) {
    throw new MacroError(
      `Error evaluating quote: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "quote",
    );
  }
}

/**
 * Evaluate a conditional (if) expression
 */
function evaluateIf(list: SList, env: Environment, logger: Logger): SExp {
  try {
    if (list.elements.length < 3 || list.elements.length > 4) {
      throw new MacroError(
        `'if' requires 2 or 3 arguments, got ${list.elements.length - 1}`,
        "if",
      );
    }

    // Evaluate the test condition
    const test = evaluateForMacro(list.elements[1], env, logger);

    // Determine truth value
    let isTruthy = false;
    if (isLiteral(test)) {
      const value = (test as any).value;
      isTruthy = value !== false && value !== null && value !== undefined;
    } else {
      // Non-literals (lists, symbols) are considered truthy
      isTruthy = true;
    }

    if (isTruthy) {
      // Evaluate "then" branch
      return evaluateForMacro(list.elements[2], env, logger);
    } else if (list.elements.length > 3) {
      // Evaluate "else" branch if present
      return evaluateForMacro(list.elements[3], env, logger);
    } else {
      // No else branch, return nil
      return createNilLiteral();
    }
  } catch (error) {
    throw new MacroError(
      `Error evaluating if expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "if",
    );
  }
}

/**
 * Evaluate a cond expression
 */
function evaluateCond(list: SList, env: Environment, logger: Logger): SExp {
  try {
    // Check each clause
    for (let i = 1; i < list.elements.length; i++) {
      const clause = list.elements[i];
      if (!isList(clause)) {
        throw new MacroError("cond clauses must be lists", "cond");
      }

      const clauseList = clause as SList;
      if (clauseList.elements.length < 2) {
        throw new MacroError(
          "cond clauses must have a test and a result",
          "cond",
        );
      }

      const test = evaluateForMacro(clauseList.elements[0], env, logger);

      // Convert to boolean value
      let isTruthy = false;
      if (isLiteral(test)) {
        const value = (test as any).value;
        isTruthy = value !== false && value !== null && value !== undefined;
      } else {
        // Non-literals are truthy
        isTruthy = true;
      }

      if (isTruthy) {
        return evaluateForMacro(clauseList.elements[1], env, logger);
      }
    }

    // No matching clause
    return createNilLiteral();
  } catch (error) {
    throw new MacroError(
      `Error evaluating cond expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "cond",
    );
  }
}

/**
 * Evaluate a let expression
 */
function evaluateLet(list: SList, env: Environment, logger: Logger): SExp {
  try {
    if (list.elements.length < 2) {
      throw new MacroError(
        "let requires bindings and at least one body form",
        "let",
      );
    }

    const bindings = list.elements[1];
    if (!isList(bindings)) {
      throw new MacroError("let bindings must be a list", "let");
    }

    const bindingsList = bindings as SList;
    if (bindingsList.elements.length % 2 !== 0) {
      throw new MacroError(
        "let bindings must have an even number of forms",
        "let",
      );
    }

    // Create a new environment for let bindings
    const letEnv = env.extend();

    // Evaluate bindings
    for (let i = 0; i < bindingsList.elements.length; i += 2) {
      const name = bindingsList.elements[i];
      const value = bindingsList.elements[i + 1];

      if (!isSymbol(name)) {
        throw new MacroError("let binding names must be symbols", "let");
      }

      const evalValue = evaluateForMacro(value, letEnv, logger);
      letEnv.define((name as SSymbol).name, evalValue);
    }

    // Evaluate body in the new environment
    let result: SExp = createNilLiteral();
    for (let i = 2; i < list.elements.length; i++) {
      result = evaluateForMacro(list.elements[i], letEnv, logger);
    }

    return result;
  } catch (error) {
    throw new MacroError(
      `Error evaluating let expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "let",
    );
  }
}

/**
 * Evaluate a macro call
 */
function evaluateMacroCall(
  list: SList,
  env: Environment,
  logger: Logger,
): SExp {
  try {
    const op = (list.elements[0] as SSymbol).name;
    const macroFn = env.getMacro(op);

    if (!macroFn) {
      throw new MacroError(`Macro not found: ${op}`, op);
    }

    // Get macro arguments (don't evaluate them)
    const args = list.elements.slice(1);

    // Apply the macro
    const expanded = macroFn(args, env);
    logger.debug(`Macro ${op} expanded to: ${sexpToString(expanded)}`);

    // Recursively evaluate the result
    return evaluateForMacro(expanded, env, logger);
  } catch (error) {
    const op = list.elements.length > 0 && isSymbol(list.elements[0])
      ? (list.elements[0] as SSymbol).name
      : "unknown";

    throw new MacroError(
      `Error evaluating macro call: ${
        error instanceof Error ? error.message : String(error)
      }`,
      op,
    );
  }
}

/**
 * Evaluate a function call with improved error handling
 */
function evaluateFunctionCall(
  list: SList,
  env: Environment,
  logger: Logger,
): SExp {
  try {
    const first = list.elements[0];

    // If first element is a symbol, create a function call with that name
    if (isSymbol(first)) {
      const op = (first as SSymbol).name;

      try {
        // Try to find a regular function with this name
        const fn = env.lookup(op);

        if (typeof fn === "function") {
          // Evaluate the arguments
          const evalArgs = list.elements.slice(1).map((arg) => {
            const evalArg = evaluateForMacro(arg, env, logger);
            // Convert S-expressions to JS values for function calls
            if (isLiteral(evalArg)) {
              return (evalArg as any).value;
            } else if (isList(evalArg)) {
              // Convert lists to arrays
              return (evalArg as SList).elements.map((e) => {
                if (isLiteral(e)) return (e as any).value;
                return e;
              });
            }
            return evalArg;
          });

          // Call the function with improved error handling
          try {
            // Handle special cases for commonly used JS functions
            if (op === "Math.abs" || op.endsWith(".abs")) {
              return createLiteral(Math.abs(evalArgs[0]));
            } else if (op === "Math.round" || op.endsWith(".round")) {
              return createLiteral(Math.round(evalArgs[0]));
            } else if (op === "Math.max" || op.endsWith(".max")) {
              return createLiteral(Math.max(...evalArgs));
            } else {
              // Regular function call
              const result = fn(...evalArgs);
              return convertJsValueToSExp(result);
            }
          } catch (callError) {
            // Change to debug level instead of warning to reduce noise
            logger.debug(
              `Error calling function ${op} during macro expansion: ${
                callError instanceof Error
                  ? callError.message
                  : String(callError)
              }`,
            );

            // Provide sensible defaults for common operations
            if (op.includes(".abs") || op === "abs") {
              return createLiteral(0);
            } else if (op.includes(".round") || op === "round") {
              return createLiteral(0);
            } else if (op.includes(".max") || op === "max") {
              return createLiteral(0);
            } else {
              // For other cases, return the unevaluated structure
              return createList(
                ...list.elements.map((elem) =>
                  evaluateForMacro(elem, env, logger)
                ),
              );
            }
          }
        }
      } catch (lookupError) {
        // Function not found, log with debug level
        logger.debug(`Function '${op}' not found during macro expansion`);
        // Continue with normal list evaluation
      }
    }

    // For other cases or when function lookup/call fails, evaluate all elements
    return createList(
      ...list.elements.map((elem) => evaluateForMacro(elem, env, logger)),
    );
  } catch (error) {
    logger.warn(
      `Error evaluating function call: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    // Return the list with evaluated elements on error
    return createList(
      ...list.elements.map((elem) => evaluateForMacro(elem, env, logger)),
    );
  }
}

/**
 * Convert a JavaScript value to an S-expression
 */
function convertJsValueToSExp(value: any): SExp {
  try {
    if (value === null || value === undefined) {
      return createNilLiteral();
    } else if (
      typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return createLiteral(value);
    } else if (Array.isArray(value)) {
      return createList(...value.map((item) => convertJsValueToSExp(item)));
    } else if (typeof value === "object" && "type" in value) {
      // Already an S-expression
      return value as SExp;
    } else {
      return createLiteral(String(value));
    }
  } catch (error) {
    throw new Error(
      `Error converting JS value to S-expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Process a quasiquoted expression (backtick syntax)
 */
function evaluateQuasiquote(
  expr: SList,
  env: Environment,
  logger: Logger,
): SExp {
  try {
    // The first element is 'quasiquote', the second is the expression to process
    if (expr.elements.length !== 2) {
      throw new MacroError(
        "quasiquote requires exactly one argument",
        "quasiquote",
      );
    }

    const quasiquotedExpr = expr.elements[1];
    logger.debug(`Evaluating quasiquote: ${sexpToString(quasiquotedExpr)}`);

    // Delegate to helper function for actual processing
    return processQuasiquotedExpr(quasiquotedExpr, env, logger);
  } catch (error) {
    throw new MacroError(
      `Error evaluating quasiquote: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "quasiquote",
    );
  }
}

/**
 * Process a quasiquoted expression, handling unquote and unquote-splicing
 */
function processQuasiquotedExpr(
  expr: SExp,
  env: Environment,
  logger: Logger,
): SExp {
  try {
    // Base case: not a list - just return the expression
    if (!isList(expr)) {
      return expr;
    }

    // Empty list - return as is
    if ((expr as SList).elements.length === 0) {
      return expr;
    }

    const list = expr as SList;
    const first = list.elements[0];

    // Handle unquote (~)
    if (isSymbol(first) && (first as SSymbol).name === "unquote") {
      if (list.elements.length !== 2) {
        throw new MacroError(
          "unquote requires exactly one argument",
          "unquote",
        );
      }
      // Evaluate the unquoted expression
      logger.debug(`Evaluating unquote: ${sexpToString(list.elements[1])}`);
      return evaluateForMacro(list.elements[1], env, logger);
    }

    // Handle unquote-splicing (error if not inside a list)
    if (isSymbol(first) && (first as SSymbol).name === "unquote-splicing") {
      throw new MacroError(
        "unquote-splicing not in list context",
        "unquote-splicing",
      );
    }

    // Process list contents
    const processedElements: SExp[] = [];

    for (let i = 0; i < list.elements.length; i++) {
      const element = list.elements[i];

      // Handle unquote-splicing (~@)
      if (
        isList(element) &&
        (element as SList).elements.length > 0 &&
        isSymbol((element as SList).elements[0]) &&
        ((element as SList).elements[0] as SSymbol).name ===
          "unquote-splicing"
      ) {
        const spliceList = element as SList;

        if (spliceList.elements.length !== 2) {
          throw new MacroError(
            "unquote-splicing requires exactly one argument",
            "unquote-splicing",
          );
        }

        // Get the expression to splice
        const splicedExpr = spliceList.elements[1];
        logger.debug(
          `Processing unquote-splicing: ${sexpToString(splicedExpr)}`,
        );

        // Evaluate the expression
        const spliced = evaluateForMacro(splicedExpr, env, logger);
        logger.debug(
          `Evaluated unquote-splicing to: ${sexpToString(spliced)}`,
        );

        // Handle different types of spliced values
        if (isList(spliced)) {
          logger.debug(
            `Splicing elements from list with ${
              (spliced as SList).elements.length
            } items`,
          );
          // Splice the elements into the result list
          processedElements.push(...(spliced as SList).elements);
        } // Handle array-like objects with a special isRestParameter flag
        else if (
          typeof spliced === "object" && spliced !== null &&
          "isRestParameter" in spliced && (spliced as any).isRestParameter
        ) {
          // Access the elements property which should contain the list items
          if ("elements" in spliced) {
            const elements = (spliced as any).elements;
            logger.debug(
              `Splicing elements from rest parameter with ${elements.length} items`,
            );
            processedElements.push(...elements);
          } else {
            logger.warn(`Rest parameter doesn't have elements property`);
          }
        } // Fall back to adding the value as a single element
        else {
          logger.warn(
            `unquote-splicing received a non-list value: ${
              sexpToString(spliced)
            }`,
          );
          processedElements.push(spliced);
        }
      } // For other elements, process them recursively
      else {
        const processed = processQuasiquotedExpr(element, env, logger);
        processedElements.push(processed);
      }
    }

    // Create a new list with the processed elements
    return createList(...processedElements);
  } catch (error) {
    throw new MacroError(
      `Error processing quasiquote: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "quasiquote",
    );
  }
}

/**
 * Expand a single S-expression and all its nested expressions
 */
function expandMacroExpression(
  expr: SExp,
  env: Environment,
  options: MacroExpanderOptions,
  depth: number,
): SExp {
  try {
    // Prevent excessive recursion
    const maxDepth = options.maxExpandDepth || 100;
    if (depth > maxDepth) {
      const logger = new Logger(options.verbose || false);
      logger.warn(
        `Reached maximum expansion depth (${maxDepth}). Possible recursive macro?`,
      );
      return expr;
    }

    // Only lists can contain macro calls
    if (!isList(expr)) {
      return expr;
    }

    const list = expr as SList;

    // Empty list - return as is
    if (list.elements.length === 0) {
      return list;
    }

    const first = list.elements[0];

    // Check if the first element is a symbol that might be a macro
    if (isSymbol(first)) {
      const op = (first as SSymbol).name;

      // Skip defmacro and macro forms during expansion
      if (op === "defmacro" || op === "macro") {
        return expr;
      }

      // Check if this is a macro call
      if (env.hasMacro(op)) {
        // Get the macro function
        const macroFn = env.getMacro(op);

        if (!macroFn) {
          // This should not happen given the hasMacro check, but just to be safe
          return expr;
        }

        // Apply the macro
        const args = list.elements.slice(1);
        const expanded = macroFn(args, env);

        // Recursively expand the result with increased depth
        return expandMacroExpression(expanded, env, options, depth + 1);
      }
    }

    // Not a macro call, expand each element recursively
    const expandedElements = list.elements.map((elem) =>
      expandMacroExpression(elem, env, options, depth + 1)
    );

    // Create a new list with the expanded elements
    return createList(...expandedElements);
  } catch (error) {
    const logger = new Logger(options.verbose || false);
    logger.warn(
      `Error expanding macro expression: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return expr;
  }
}

/**
 * Process all macro definitions (both system and user-level)
 */
function processMacroDefinitions(
  exprs: SExp[],
  env: Environment,
  currentFile: string | undefined,
  logger: Logger,
): void {
  try {
    // First register all global macro definitions
    for (const expr of exprs) {
      if (isDefMacro(expr) && isList(expr)) {
        try {
          defineMacro(expr as SList, env, logger);
        } catch (error) {
          if (error instanceof MacroError) {
            throw error;
          }

          // Get the macro name if possible
          let macroName = "unknown";
          if (
            (expr as SList).elements.length > 1 &&
            (expr as SList).elements[1].type === "symbol"
          ) {
            macroName = ((expr as SList).elements[1] as SSymbol).name;
          }

          throw new MacroError(
            `Error defining global macro: ${
              error instanceof Error ? error.message : String(error)
            }`,
            macroName,
            currentFile,
            error instanceof Error ? error : undefined,
          );
        }
      }
    }

    // Then register user-level macros if we have a current file
    if (currentFile) {
      for (const expr of exprs) {
        if (isUserMacro(expr) && isList(expr)) {
          try {
            defineUserMacro(expr as SList, currentFile, env, logger);
          } catch (error) {
            if (error instanceof MacroError) {
              throw error;
            }

            // Get the macro name if possible
            let macroName = "unknown";
            if (
              (expr as SList).elements.length > 1 &&
              (expr as SList).elements[1].type === "symbol"
            ) {
              macroName = ((expr as SList).elements[1] as SSymbol).name;
            }

            throw new MacroError(
              `Error defining user macro: ${
                error instanceof Error ? error.message : String(error)
              }`,
              macroName,
              currentFile,
              error instanceof Error ? error : undefined,
            );
          }
        }
      }
    }
  } catch (error) {
    throw new MacroError(
      `Error processing macro definitions: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "",
      currentFile,
    );
  }
}

/**
 * Filter out macro definitions (both system and user-level)
 */
function filterMacroDefinitions(exprs: SExp[], logger: Logger): SExp[] {
  try {
    return exprs.filter((expr) => {
      // Remove defmacro forms
      if (isDefMacro(expr)) {
        logger.debug(
          `Filtering out system macro definition: ${sexpToString(expr)}`,
        );
        return false;
      }

      // Remove user-level macro forms
      if (isUserMacro(expr)) {
        logger.debug(
          `Filtering out user macro definition: ${sexpToString(expr)}`,
        );
        return false;
      }

      // Keep everything else
      return true;
    });
  } catch (error) {
    logger.warn(
      `Error filtering macro definitions: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return exprs;
  }
}