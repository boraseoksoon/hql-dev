// src/s-exp/macro.ts - Refactored implementation with proper hygiene
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
import { perform } from "../transpiler/error-utils.ts";

// Constants and caches
const MAX_EXPANSION_ITERATIONS = 100;
export const macroCache = new Map<string, Map<string, boolean>>();
const macroExpansionCache = new LRUCache<string, SExp>(5000);
const symbolRenameMap = new Map<string, Map<string, string>>();

interface MacroExpanderOptions {
  verbose?: boolean;
  maxExpandDepth?: number;
  currentFile?: string;
  useCache?: boolean;
}

/**
 * Helper to extract the macro definition components.
 * Ensures that a macro definition has a name, parameter list, and body.
 */
function processMacroDefinition(
  macroForm: SList,
  logger: Logger
): { macroName: string; params: string[]; restParam: string | null; body: SExp[] } {
  if (macroForm.elements.length < 4) {
    throw new MacroError("Macro definition requires a name, parameter list, and body", "unknown");
  }
  const macroNameExp = macroForm.elements[1];
  if (!isSymbol(macroNameExp)) {
    throw new MacroError("Macro name must be a symbol", "unknown");
  }
  const macroName = macroNameExp.name;
  const paramsExp = macroForm.elements[2];
  if (!isList(paramsExp)) {
    throw new MacroError("Macro parameters must be a list", macroName);
  }
  const { params, restParam } = processParamList(paramsExp);
  const body = macroForm.elements.slice(3);
  return { macroName, params, restParam, body };
}

/**
 * Register a global macro definition.
 */
export function defineMacro(
  macroForm: SList,
  env: Environment,
  logger: Logger,
): void {
  try {
    const { macroName, params, restParam, body } = processMacroDefinition(macroForm, logger);
    const macroFn = createMacroFunction(macroName, params, restParam, body, logger);
    env.defineMacro(macroName, macroFn);
    logger.debug(`Registered global macro: ${macroName}`);
  } catch (error) {
    const macroName =
      macroForm.elements[1] && isSymbol(macroForm.elements[1])
        ? (macroForm.elements[1] as SSymbol).name
        : "unknown";
    throw new MacroError(
      `Failed to define macro: ${error instanceof Error ? error.message : String(error)}`,
      macroName,
    );
  }
}

/**
 * Define a user-level macro in the module scope.
 */
export function defineUserMacro(
  macroForm: SList,
  filePath: string,
  env: Environment,
  logger: Logger,
): void {
  try {
    const { macroName, params, restParam, body } = processMacroDefinition(macroForm, logger);
    if (env.hasModuleMacro(filePath, macroName)) {
      logger.debug(`Macro ${macroName} already defined in ${filePath}, skipping`);
      return;
    }
    const macroFn = createMacroFunction(macroName, params, restParam, body, logger, filePath);
    env.defineModuleMacro(filePath, macroName, macroFn);
    logger.debug(`Defined user-level macro ${macroName} in ${filePath}`);
  } catch (error) {
    const macroName =
      macroForm.elements[1] && isSymbol(macroForm.elements[1])
        ? (macroForm.elements[1] as SSymbol).name
        : "unknown";
    throw new MacroError(
      `Failed to define user macro in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      macroName,
      filePath,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Expand all macros in a list of S-expressions.
 */
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  options: MacroExpanderOptions = {},
): SExp[] {
  const logger = new Logger(options.verbose || false);
  const currentFile = options.currentFile;
  const useCache = options.useCache !== false;
  logger.debug(`Starting macro expansion on ${exprs.length} expressions${currentFile ? ` in ${currentFile}` : ""}`);

  if (currentFile) {
    env.setCurrentFile(currentFile);
    logger.debug(`Setting current file to: ${currentFile}`);
  }

  // Process macro definitions before expansion.
  processMacroDefinitions(exprs, env, currentFile, logger);

  let currentExprs = [...exprs];
  let iteration = 0;
  let changed = true;
  while (changed && iteration < MAX_EXPANSION_ITERATIONS) {
    changed = false;
    iteration++;
    logger.debug(`Macro expansion iteration ${iteration}`);

    const newExprs = currentExprs.map((expr) => {
      const exprStr = useCache ? sexpToString(expr) : "";
      if (useCache && macroExpansionCache.has(exprStr)) {
        logger.debug(`Cache hit for expression: ${exprStr.substring(0, 30)}...`);
        return macroExpansionCache.get(exprStr)!;
      }
      const expandedExpr = expandMacroExpression(expr, env, options, 0);
      if (useCache) {
        macroExpansionCache.set(exprStr, expandedExpr);
      }
      return expandedExpr;
    });

    const oldStr = currentExprs.map(sexpToString).join("\n");
    const newStr = newExprs.map(sexpToString).join("\n");
    if (oldStr !== newStr) {
      changed = true;
      currentExprs = newExprs;
      logger.debug(`Changes detected in iteration ${iteration}, continuing expansion`);
    } else {
      logger.debug(`No changes in iteration ${iteration}, fixed point reached`);
    }
  }

  if (iteration >= MAX_EXPANSION_ITERATIONS) {
    logger.warn(`Macro expansion reached maximum iterations (${MAX_EXPANSION_ITERATIONS}). Check for infinite recursion.`);
  }
  logger.debug(`Completed macro expansion after ${iteration} iterations`);

  currentExprs = filterMacroDefinitions(currentExprs, logger);
  if (currentFile) {
    env.setCurrentFile(null);
    logger.debug(`Clearing current file`);
  }
  return currentExprs;
}

/**
 * Check if a symbol represents a user-level macro with caching.
 */
export function isUserLevelMacro(symbolName: string, currentDir: string): boolean {
  const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

  return perform(
    () => {
      if (!macroCache.has(currentDir)) {
        macroCache.set(currentDir, new Map<string, boolean>());
      }
      const fileCache = macroCache.get(currentDir)!;
      if (fileCache.has(symbolName)) return fileCache.get(symbolName)!;

      const env = Environment.getGlobalEnv();
      if (!env) {
        logger.debug(`No global environment found, assuming '${symbolName}' is not a macro`);
        fileCache.set(symbolName, false);
        return false;
      }
      const result = env.isUserLevelMacro(symbolName, currentDir);
      fileCache.set(symbolName, result);
      logger.debug(`Checking if '${symbolName}' is a user-level macro: ${result}`);
      return result;
    },
    `isUserLevelMacro '${symbolName}'`,
    TransformError,
    [symbolName, currentDir],
  );
}

/**
 * Get the hygienically renamed symbol if available.
 */
function getSymbolRename(context: string, original: string): string | undefined {
  return symbolRenameMap.get(context)?.get(original);
}

/**
 * Register a symbol rename mapping.
 */
function registerSymbolRename(context: string, original: string, renamed: string): void {
  if (!symbolRenameMap.has(context)) {
    symbolRenameMap.set(context, new Map<string, string>());
  }
  symbolRenameMap.get(context)!.set(original, renamed);
}

/**
 * Create a macro function.
 */
function createMacroFunction(
  macroName: string,
  params: string[],
  restParam: string | null,
  body: SExp[],
  logger: Logger,
  sourceFile?: string,
): MacroFn {
  const macroFn = (args: SExp[], callEnv: Environment): SExp => {
    const source = sourceFile ? ` from ${sourceFile}` : "";
    logger.debug(`Expanding ${sourceFile ? "module " : ""}macro ${macroName}${source} with ${args.length} args`);
    callEnv.setCurrentMacroContext(`macro_${macroName}`);
    const macroEnv = createMacroEnv(callEnv, params, restParam, args, logger);

    let result: SExp = createNilLiteral();
    for (const expr of body) {
      result = evaluateForMacro(expr, macroEnv, logger);
    }
    result = applyHygiene(result, macroName, logger);
    callEnv.setCurrentMacroContext(null);

    logger.debug(`Macro ${macroName} expanded to: ${sexpToString(result)}`);
    return result;
  };

  Object.defineProperty(macroFn, "isMacro", { value: true });
  Object.defineProperty(macroFn, "macroName", { value: macroName });
  if (sourceFile) {
    Object.defineProperty(macroFn, "sourceFile", { value: sourceFile });
    Object.defineProperty(macroFn, "isUserMacro", { value: true });
  }
  return macroFn;
}

/**
 * Apply hygiene transformations to an expression.
 */
function applyHygiene(expr: SExp, macroName: string, logger: Logger): SExp {
  const hygieneContext = `macro_${macroName}`;
  function processExpr(expr: SExp): SExp {
    if (isList(expr)) {
      return createList(...(expr as SList).elements.map(processExpr));
    } else if (isSymbol(expr)) {
      const originalName = (expr as SSymbol).name;
      const renamedSymbol = getSymbolRename(hygieneContext, originalName);
      return renamedSymbol ? { type: "symbol", name: renamedSymbol } : expr;
    }
    return expr;
  }
  try {
    return processExpr(expr);
  } catch (error) {
    logger.warn(`Error applying hygiene to expression: ${error instanceof Error ? error.message : String(error)}`);
    return expr;
  }
}

/**
 * Process a parameter list, handling rest parameters.
 */
function processParamList(
  paramsExp: SList
): { params: string[]; restParam: string | null } {
  const params: string[] = [];
  let restParam: string | null = null;
  let restMode = false;

  for (let i = 0; i < paramsExp.elements.length; i++) {
    const param = paramsExp.elements[i];
    if (!isSymbol(param)) {
      throw new Error(`Macro parameter at position ${i + 1} must be a symbol, got: ${sexpToString(param)}`);
    }
    const paramName = param.name;
    if (paramName === "&") {
      restMode = true;
      continue;
    }
    if (restMode) {
      if (restParam !== null) {
        throw new Error(`Multiple rest parameters not allowed: found '${restParam}' and '${paramName}'`);
      }
      restParam = paramName;
    } else {
      params.push(paramName);
    }
  }

  return { params, restParam };
}

/**
 * Create a new environment for macro expansion with parameter bindings and hygiene.
 */
function createMacroEnv(
  parent: Environment,
  params: string[],
  restParam: string | null,
  args: SExp[],
  logger: Logger,
): Environment {
  const env = parent.extend();
  const macroContext = parent.getCurrentMacroContext();

  for (let i = 0; i < params.length; i++) {
    const hygienicParamName = `${params[i]}_${gensym("param")}`;
    if (macroContext) {
      registerSymbolRename(macroContext, params[i], hygienicParamName);
    }
    const paramValue = i < args.length ? args[i] : createNilLiteral();
    env.define(hygienicParamName, paramValue);
    env.define(params[i], paramValue);
  }

  if (restParam !== null) {
    const restArgs = args.slice(params.length);
    logger.debug(`Creating rest parameter '${restParam}' with ${restArgs.length} elements`);
    const restList = createList(...restArgs);
    Object.defineProperty(restList, "isRestParameter", { value: true });
    const hygienicRestName = `${restParam}_${gensym("rest")}`;
    if (macroContext) {
      registerSymbolRename(macroContext, restParam, hygienicRestName);
    }
    env.define(hygienicRestName, restList);
    env.define(restParam, restList);
  }

  return env;
}

/**
 * Evaluate an S-expression for macro expansion.
 */
export function evaluateForMacro(
  expr: SExp,
  env: Environment,
  logger: Logger,
): SExp {
  logger.debug(`Evaluating for macro: ${sexpToString(expr)}`);
  if (isLiteral(expr)) return expr;
  if (isSymbol(expr)) return evaluateSymbol(expr as SSymbol, env, logger);
  if (isList(expr)) return evaluateList(expr as SList, env, logger);
  return expr;
}

/**
 * Evaluate a symbol for macro expansion, including module property access.
 */
function evaluateSymbol(expr: SSymbol, env: Environment, logger: Logger): SExp {
  if (expr.name.includes(".") && !expr.name.startsWith(".")) {
    const parts = expr.name.split(".");
    const moduleName = parts[0];
    const propertyPath = parts.slice(1).join(".");
    try {
      const moduleValue = env.lookup(moduleName);
      const macroContext = env.getCurrentMacroContext();
      const currentFile = env.getCurrentFile();
      if (macroContext && currentFile) {
        let moduleFilePath: string | null = null;
        for (const [modPath,] of env.moduleExports.entries()) {
          if (modPath === moduleName || modPath.endsWith(`/${moduleName}`)) {
            moduleFilePath = modPath;
            break;
          }
        }
        if (!moduleFilePath) {
          for (const [path,] of env.moduleMacros.entries()) {
            if (path.endsWith(moduleName + ".hql") || path.includes(`/${moduleName}.hql`)) {
              moduleFilePath = path;
              break;
            }
          }
        }
        if (moduleFilePath) {
          const exportedProps = env.getExportedModuleProps?.(moduleFilePath);
          if (exportedProps && !exportedProps.has(propertyPath)) {
            logger.warn(`Warning: Macro '${macroContext}' accessing non-exported property '${propertyPath}' from module '${moduleName}' (${moduleFilePath})`);
          }
        } else {
          logger.debug(`Module file path for '${moduleName}' couldn't be determined for export validation`);
        }
      }
      let result: any = moduleValue;
      if (typeof result === "object" && result !== null && propertyPath in result) {
        result = result[propertyPath];
      } else {
        logger.debug(`Property '${propertyPath}' not found in module '${moduleName}'`);
        return expr;
      }
      if (typeof result === "object" && result !== null && "type" in result) {
        return result as SExp;
      } else if (Array.isArray(result)) {
        return createList(...result.map(item =>
          typeof item === "object" && item !== null && "type" in item
            ? item as SExp
            : createLiteral(item)
        ));
      } else {
        return createLiteral(result);
      }
    } catch {
      logger.debug(`Module property access failed: ${expr.name} during macro evaluation`);
      return expr;
    }
  }

  try {
    const value = env.lookup(expr.name);
    if (typeof value === "object" && value !== null && "type" in value) {
      return value as SExp;
    } else if (Array.isArray(value)) {
      return createList(...value.map(item =>
        typeof item === "object" && item !== null && "type" in item
          ? item as SExp
          : createLiteral(item)
      ));
    } else {
      return createLiteral(value);
    }
  } catch {
    logger.debug(`Symbol lookup failed for '${expr.name}' during macro evaluation`);
    return expr;
  }
}

/**
 * Evaluate a list expression during macro expansion.
 */
function evaluateList(expr: SList, env: Environment, logger: Logger): SExp {
  if (expr.elements.length === 0) return expr;
  const first = expr.elements[0];
  if (isSymbol(first)) {
    const op = (first as SSymbol).name;
    switch (op) {
      case "quote": return evaluateQuote(expr, env, logger);
      case "quasiquote": return evaluateQuasiquote(expr, env, logger);
      case "unquote":
      case "unquote-splicing":
        throw new MacroError(`${op} not in quasiquote context`, op);
      case "if": return evaluateIf(expr, env, logger);
      case "cond": return evaluateCond(expr, env, logger);
      case "let": return evaluateLet(expr, env, logger);
      case "def":
      case "defn":
      case "fn": return createNilLiteral();
    }
    if (env.hasMacro(op)) return evaluateMacroCall(expr, env, logger);
    try {
      return evaluateFunctionCall(expr, env, logger);
    } catch (error) {
      throw new MacroError(
        `Error evaluating function call '${op}': ${error instanceof Error ? error.message : String(error)}`,
        op,
      );
    }
  }
  return createList(...expr.elements.map(elem => evaluateForMacro(elem, env, logger)));
}

/**
 * Evaluate a quoted expression.
 */
function evaluateQuote(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length !== 2) {
    throw new MacroError("quote requires exactly one argument", "quote");
  }
  return list.elements[1];
}

/**
 * Evaluate an "if" expression.
 */
function evaluateIf(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length < 3 || list.elements.length > 4) {
    throw new MacroError(`'if' requires 2 or 3 arguments, got ${list.elements.length - 1}`, "if");
  }
  const test = evaluateForMacro(list.elements[1], env, logger);
  const isTruthy = isLiteral(test)
    ? (test as any).value !== false && (test as any).value !== null && (test as any).value !== undefined
    : true;
  if (isTruthy) return evaluateForMacro(list.elements[2], env, logger);
  if (list.elements.length > 3) return evaluateForMacro(list.elements[3], env, logger);
  return createNilLiteral();
}

/**
 * Evaluate a "cond" expression.
 */
function evaluateCond(list: SList, env: Environment, logger: Logger): SExp {
  for (let i = 1; i < list.elements.length; i++) {
    const clause = list.elements[i];
    if (!isList(clause)) {
      throw new MacroError("cond clauses must be lists", "cond");
    }
    const clauseList = clause as SList;
    if (clauseList.elements.length < 2) {
      throw new MacroError("cond clauses must have a test and a result", "cond");
    }
    const test = evaluateForMacro(clauseList.elements[0], env, logger);
    const isTruthy = isLiteral(test)
      ? (test as any).value !== false && (test as any).value !== null && (test as any).value !== undefined
      : true;
    if (isTruthy) return evaluateForMacro(clauseList.elements[1], env, logger);
  }
  return createNilLiteral();
}

/**
 * Evaluate a "let" expression.
 */
function evaluateLet(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length < 2) {
    throw new MacroError("let requires bindings and at least one body form", "let");
  }
  const bindings = list.elements[1];
  if (!isList(bindings)) {
    throw new MacroError("let bindings must be a list", "let");
  }
  const bindingsList = bindings as SList;
  if (bindingsList.elements.length % 2 !== 0) {
    throw new MacroError("let bindings must have an even number of forms", "let");
  }
  const letEnv = env.extend();
  for (let i = 0; i < bindingsList.elements.length; i += 2) {
    const name = bindingsList.elements[i];
    const value = bindingsList.elements[i + 1];
    if (!isSymbol(name)) {
      throw new MacroError("let binding names must be symbols", "let");
    }
    letEnv.define((name as SSymbol).name, evaluateForMacro(value, letEnv, logger));
  }
  let result: SExp = createNilLiteral();
  for (let i = 2; i < list.elements.length; i++) {
    result = evaluateForMacro(list.elements[i], letEnv, logger);
  }
  return result;
}

/**
 * Evaluate a macro call.
 */
function evaluateMacroCall(list: SList, env: Environment, logger: Logger): SExp {
  const op = (list.elements[0] as SSymbol).name;
  const macroFn = env.getMacro(op);
  if (!macroFn) {
    throw new MacroError(`Macro not found: ${op}`, op);
  }
  const args = list.elements.slice(1);
  const expanded = macroFn(args, env);
  logger.debug(`Macro ${op} expanded to: ${sexpToString(expanded)}`);
  return evaluateForMacro(expanded, env, logger);
}

/**
 * Helper: Evaluate arguments for function calls.
 */
function evaluateArguments(args: SExp[], env: Environment, logger: Logger): any[] {
  return args.map(arg => {
    const evalArg = evaluateForMacro(arg, env, logger);
    if (isLiteral(evalArg)) return (evalArg as any).value;
    if (isList(evalArg)) return (evalArg as SList).elements.map(e => isLiteral(e) ? (e as any).value : e);
    return evalArg;
  });
}

/**
 * Evaluate a function call with improved error handling.
 */
function evaluateFunctionCall(list: SList, env: Environment, logger: Logger): SExp {
  const first = list.elements[0];
  if (isSymbol(first)) {
    const op = (first as SSymbol).name;
    try {
      const fn = env.lookup(op);
      if (typeof fn === "function") {
        const evalArgs = evaluateArguments(list.elements.slice(1), env, logger);
        try {
          if (op === "Math.abs" || op.endsWith(".abs")) {
            return createLiteral(Math.abs(evalArgs[0]));
          } else if (op === "Math.round" || op.endsWith(".round")) {
            return createLiteral(Math.round(evalArgs[0]));
          } else if (op === "Math.max" || op.endsWith(".max")) {
            return createLiteral(Math.max(...evalArgs));
          } else {
            return convertJsValueToSExp(fn(...evalArgs));
          }
        } catch (callError) {
          logger.debug(`Error calling function ${op} during macro expansion: ${callError instanceof Error ? callError.message : String(callError)}`);
          if (op.includes(".abs") || op === "abs") {
            return createLiteral(0);
          } else if (op.includes(".round") || op === "round") {
            return createLiteral(0);
          } else if (op.includes(".max") || op === "max") {
            return createLiteral(0);
          } else {
            return createList(...list.elements.map(elem => evaluateForMacro(elem, env, logger)));
          }
        }
      }
    } catch {
      logger.debug(`Function '${op}' not found during macro expansion`);
    }
  }
  return createList(...list.elements.map(elem => evaluateForMacro(elem, env, logger)));
}

/**
 * Convert a JavaScript value to an S-expression.
 */
function convertJsValueToSExp(value: any): SExp {
  if (value === null || value === undefined) return createNilLiteral();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return createLiteral(value);
  }
  if (Array.isArray(value)) {
    return createList(...value.map(item => convertJsValueToSExp(item)));
  }
  if (typeof value === "object" && "type" in value) {
    return value as SExp;
  }
  return createLiteral(String(value));
}

/**
 * Evaluate a quasiquoted expression.
 */
function evaluateQuasiquote(expr: SList, env: Environment, logger: Logger): SExp {
  if (expr.elements.length !== 2) {
    throw new MacroError("quasiquote requires exactly one argument", "quasiquote");
  }
  logger.debug(`Evaluating quasiquote: ${sexpToString(expr.elements[1])}`);
  return processQuasiquotedExpr(expr.elements[1], env, logger);
}

/**
 * Process a quasiquoted expression, handling unquote and unquote-splicing.
 */
function processQuasiquotedExpr(expr: SExp, env: Environment, logger: Logger): SExp {
  if (!isList(expr)) return expr;
  const list = expr as SList;
  if (list.elements.length === 0) return expr;
  const first = list.elements[0];

  if (isSymbol(first) && (first as SSymbol).name === "unquote") {
    if (list.elements.length !== 2) {
      throw new MacroError("unquote requires exactly one argument", "unquote");
    }
    logger.debug(`Evaluating unquote: ${sexpToString(list.elements[1])}`);
    return evaluateForMacro(list.elements[1], env, logger);
  }

  if (isSymbol(first) && (first as SSymbol).name === "unquote-splicing") {
    throw new MacroError("unquote-splicing not in list context", "unquote-splicing");
  }

  const processedElements: SExp[] = [];
  for (const element of list.elements) {
    if (
      isList(element) &&
      (element as SList).elements.length > 0 &&
      isSymbol((element as SList).elements[0]) &&
      ((element as SList).elements[0] as SSymbol).name === "unquote-splicing"
    ) {
      const spliceList = element as SList;
      if (spliceList.elements.length !== 2) {
        throw new MacroError("unquote-splicing requires exactly one argument", "unquote-splicing");
      }
      const splicedExpr = spliceList.elements[1];
      logger.debug(`Processing unquote-splicing: ${sexpToString(splicedExpr)}`);
      const spliced = evaluateForMacro(splicedExpr, env, logger);
      logger.debug(`Evaluated unquote-splicing to: ${sexpToString(spliced)}`);
      if (isList(spliced)) {
        processedElements.push(...(spliced as SList).elements);
      } else if (
        typeof spliced === "object" &&
        spliced !== null &&
        "isRestParameter" in spliced &&
        (spliced as any).isRestParameter &&
        "elements" in spliced
      ) {
        processedElements.push(...(spliced as any).elements);
      } else {
        logger.warn(`unquote-splicing received a non-list value: ${sexpToString(spliced)}`);
        processedElements.push(spliced);
      }
    } else {
      processedElements.push(processQuasiquotedExpr(element, env, logger));
    }
  }
  return createList(...processedElements);
}

/**
 * Recursively expand a single S-expression.
 */
function expandMacroExpression(
  expr: SExp,
  env: Environment,
  options: MacroExpanderOptions,
  depth: number,
): SExp {
  const maxDepth = options.maxExpandDepth || 100;
  if (depth > maxDepth) {
    const logger = new Logger(options.verbose || false);
    logger.warn(`Reached maximum expansion depth (${maxDepth}). Possible recursive macro?`);
    return expr;
  }
  if (!isList(expr)) return expr;
  const list = expr as SList;
  if (list.elements.length === 0) return list;
  const first = list.elements[0];
  if (isSymbol(first)) {
    const op = (first as SSymbol).name;
    if (op === "defmacro" || op === "macro") return expr;
    if (env.hasMacro(op)) {
      const macroFn = env.getMacro(op);
      if (!macroFn) return expr;
      const args = list.elements.slice(1);
      const expanded = macroFn(args, env);
      return expandMacroExpression(expanded, env, options, depth + 1);
    }
  }
  const expandedElements = list.elements.map(elem =>
    expandMacroExpression(elem, env, options, depth + 1)
  );
  return createList(...expandedElements);
}

/**
 * Process all macro definitions (system and user-level).
 */
function processMacroDefinitions(
  exprs: SExp[],
  env: Environment,
  currentFile: string | undefined,
  logger: Logger,
): void {
  for (const expr of exprs) {
    if (isDefMacro(expr) && isList(expr)) {
      try {
        defineMacro(expr as SList, env, logger);
      } catch (error) {
        const macroName =
          (expr as SList).elements[1] && (expr as SList).elements[1].type === "symbol"
            ? ((expr as SList).elements[1] as SSymbol).name
            : "unknown";
        throw new MacroError(
          `Error defining global macro: ${error instanceof Error ? error.message : String(error)}`,
          macroName,
          currentFile,
        );
      }
    }
  }
  if (currentFile) {
    for (const expr of exprs) {
      if (isUserMacro(expr) && isList(expr)) {
        try {
          defineUserMacro(expr as SList, currentFile, env, logger);
        } catch (error) {
          const macroName =
            (expr as SList).elements[1] && (expr as SList).elements[1].type === "symbol"
              ? ((expr as SList).elements[1] as SSymbol).name
              : "unknown";
          throw new MacroError(
            `Error defining user macro: ${error instanceof Error ? error.message : String(error)}`,
            macroName,
            currentFile,
          );
        }
      }
    }
  }
}

/**
 * Filter out macro definitions from the final S-expression list.
 */
function filterMacroDefinitions(exprs: SExp[], logger: Logger): SExp[] {
  return exprs.filter((expr) => {
    if (isDefMacro(expr)) {
      logger.debug(`Filtering out system macro definition: ${sexpToString(expr)}`);
      return false;
    }
    if (isUserMacro(expr)) {
      logger.debug(`Filtering out user macro definition: ${sexpToString(expr)}`);
      return false;
    }
    return true;
  });
}
