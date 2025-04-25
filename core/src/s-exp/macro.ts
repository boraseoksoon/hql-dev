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
import { MacroError, TransformError } from "../common/error-pipeline.ts";
import { perform } from "../common/error-pipeline.ts";
import { gensym } from "../gensym.ts";
import { LRUCache } from "../common/lru-cache.ts";
import { globalLogger as logger } from "../logger.ts";

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

/* Helper: Checks truthiness for S-expression values */
function isTruthy(expr: SExp): boolean {
  return isLiteral(expr)
    ? (expr as any).value !== false && (expr as any).value !== null && (expr as any).value !== undefined
    : true;
}

/* Helper: Convert a JavaScript value to an S-expression */
function convertJsValueToSExp(value: any): SExp {
  if (value === null || value === undefined) return createNilLiteral();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return createLiteral(value);
  }
  if (Array.isArray(value)) {
    return createList(...value.map((item) => convertJsValueToSExp(item)));
  }
  if (typeof value === "object" && "type" in value) {
    return value as SExp;
  }
  return createLiteral(String(value));
}

/* Helper: Extract macro definition parts */
function processMacroDefinition(
  macroForm: SList,
  logger: Logger,
): {
  macroName: string;
  params: string[];
  restParam: string | null;
  body: SExp[];
} {
  if (macroForm.elements.length < 4) {
    throw new MacroError(
      "Macro definition requires a name, parameter list, and body",
      "unknown",
    );
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

/* Helper: Process a parameter list (including rest parameters) */
function processParamList(
  paramsExp: SList,
): { params: string[]; restParam: string | null } {
  const params: string[] = [];
  let restParam: string | null = null;
  let restMode = false;

  for (let i = 0; i < paramsExp.elements.length; i++) {
    const param = paramsExp.elements[i];
    if (!isSymbol(param)) {
      throw new Error(
        `Macro parameter at position ${i + 1} must be a symbol, got: ${sexpToString(param)}`,
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
}

/* Helper: Registers a macro (global or user-level) */
function registerMacroDefinition(
  macroForm: SList,
  env: Environment,
  logger: Logger,
  register: (macroName: string, macroFn: MacroFn) => void,
  macroType: "global" | "user",
  filePath?: string,
): void {
  try {
    const { macroName, params, restParam, body } = processMacroDefinition(macroForm, logger);
    if (macroType === "user" && filePath && env.hasModuleMacro(filePath, macroName)) {
      logger.debug(`Macro ${macroName} already defined in ${filePath}, skipping`);
      return;
    }
    const macroFn = createMacroFunction(macroName, params, restParam, body, logger, filePath);
    register(macroName, macroFn);
    logger.debug(
      `${macroType === "global" ? "Registered global" : "Defined user-level"} macro ${macroName}${filePath ? " in " + filePath : ""}`,
    );
  } catch (error) {
    const macroName = macroForm.elements[1] && isSymbol(macroForm.elements[1])
      ? (macroForm.elements[1] as SSymbol).name
      : "unknown";
    throw new MacroError(
      `Failed to define ${macroType === "global" ? "macro" : "user macro"}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      macroName,
      filePath,
      error instanceof Error ? error : undefined,
    );
  }
}

/* Exported: Register a global macro definition */
export function defineMacro(
  macroForm: SList,
  env: Environment,
  logger: Logger,
): void {
  registerMacroDefinition(macroForm, env, logger, (name, macroFn) => env.defineMacro(name, macroFn), "global");
}

/* Exported: Define a user-level macro in the module scope */
export function defineUserMacro(
  macroForm: SList,
  filePath: string,
  env: Environment,
  logger: Logger,
): void {
  registerMacroDefinition(macroForm, env, logger, (name, macroFn) => env.defineModuleMacro(filePath, name, macroFn), "user", filePath);
}

/* Expand all macros in a list of S-expressions */
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  options: MacroExpanderOptions = {},
): SExp[] {
  const currentFile = options.currentFile;
  const useCache = options.useCache !== false;
  logger.debug(
    `Starting macro expansion on ${exprs.length} expressions${currentFile ? ` in ${currentFile}` : ""}`,
  );

  if (currentFile) {
    env.setCurrentFile(currentFile);
    logger.debug(`Setting current file to: ${currentFile}`);
  }

  // Process macro definitions (global first, then user-level if a current file is provided)
  for (const expr of exprs) {
    if (isDefMacro(expr) && isList(expr)) {
      defineMacro(expr as SList, env, logger);
    }
  }
  if (currentFile) {
    for (const expr of exprs) {
      if (isUserMacro(expr) && isList(expr)) {
        defineUserMacro(expr as SList, currentFile, env, logger);
      }
    }
  }

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
    logger.warn(
      `Macro expansion reached maximum iterations (${MAX_EXPANSION_ITERATIONS}). Check for infinite recursion.`,
    );
  }
  logger.debug(`Completed macro expansion after ${iteration} iterations`);

  currentExprs = filterMacroDefinitions(currentExprs, logger);
  if (currentFile) {
    env.setCurrentFile(null);
    logger.debug(`Clearing current file`);
  }
  return currentExprs;
}

/* Check if a symbol represents a user-level macro with caching. */
export function isUserLevelMacro(
  symbolName: string,
  currentDir: string,
): boolean {
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

/* Evaluate an S-expression for macro expansion */
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

/* Evaluate a symbol for macro expansion, including module property access */
function evaluateSymbol(expr: SSymbol, env: Environment, logger: Logger): SExp {
  if (expr.name.includes(".") && !expr.name.startsWith(".")) {
    const parts = expr.name.split(".");
    const moduleName = parts[0];
    const propertyPath = parts.slice(1).join(".");
    try {
      const moduleValue = env.lookup(moduleName);
      // Optional export validation
      const macroContext = env.getCurrentMacroContext();
      const currentFile = env.getCurrentFile();
      if (macroContext && currentFile) {
        let moduleFilePath: string | null = null;
        for (const [modPath] of env.moduleExports.entries()) {
          if (modPath === moduleName || modPath.endsWith(`/${moduleName}`)) {
            moduleFilePath = modPath;
            break;
          }
        }
        if (!moduleFilePath) {
          for (const [path] of env.moduleMacros.entries()) {
            if (path.endsWith(moduleName + ".hql") || path.includes(`/${moduleName}.hql`)) {
              moduleFilePath = path;
              break;
            }
          }
        }
      }
      
      let result: any = moduleValue;
      if (typeof result === "object" && result !== null && propertyPath in result) {
        result = result[propertyPath];
      } else {
        logger.debug(`Property '${propertyPath}' not found in module '${moduleName}'`);
        return expr;
      }
      return convertJsValueToSExp(result);
    } catch {
      logger.debug(`Module property access failed: ${expr.name} during macro evaluation`);
      return expr;
    }
  }
  try {
    const value = env.lookup(expr.name);
    return convertJsValueToSExp(value);
  } catch {
    logger.debug(`Symbol lookup failed for '${expr.name}' during macro evaluation`);
    return expr;
  }
}

/* Evaluate a list expression during macro expansion */
function evaluateList(expr: SList, env: Environment, logger: Logger): SExp {
  if (expr.elements.length === 0) return expr;
  const first = expr.elements[0];
  if (isSymbol(first)) {
    const op = (first as SSymbol).name;
    switch (op) {
      case "quote":
        return evaluateQuote(expr, env, logger);
      case "quasiquote":
        return evaluateQuasiquote(expr, env, logger);
      case "unquote":
      case "unquote-splicing":
        throw new MacroError(`${op} not in quasiquote context`, op);
      case "if":
        return evaluateIf(expr, env, logger);
      case "cond":
        return evaluateCond(expr, env, logger);
      case "let":
        return evaluateLet(expr, env, logger);
      case "lambda":
        return createNilLiteral();
    }
    if (env.hasMacro(op)) return evaluateMacroCall(expr, env, logger);
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
  return createList(
    ...expr.elements.map((elem) => evaluateForMacro(elem, env, logger)),
  );
}

/* Evaluate a quoted expression */
function evaluateQuote(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length !== 2) {
    throw new MacroError("quote requires exactly one argument", "quote");
  }
  return list.elements[1];
}

/* Evaluate an "if" expression */
function evaluateIf(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length < 3 || list.elements.length > 4) {
    throw new MacroError(`'if' requires 2 or 3 arguments, got ${list.elements.length - 1}`, "if");
  }
  const test = evaluateForMacro(list.elements[1], env, logger);
  if (isTruthy(test)) {
    return evaluateForMacro(list.elements[2], env, logger);
  }
  return list.elements.length > 3
    ? evaluateForMacro(list.elements[3], env, logger)
    : createNilLiteral();
}

/* Evaluate a "cond" expression */
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
    if (isTruthy(test)) return evaluateForMacro(clauseList.elements[1], env, logger);
  }
  return createNilLiteral();
}

/* Evaluate a "let" expression */
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

/* Evaluate a macro call */
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

/* Helper: Evaluate arguments for function calls */
function evaluateArguments(
  args: SExp[],
  env: Environment,
  logger: Logger,
): any[] {
  return args.map((arg) => {
    const evalArg = evaluateForMacro(arg, env, logger);
    if (isLiteral(evalArg)) return (evalArg as any).value;
    if (isList(evalArg)) {
      return (evalArg as SList).elements.map((e) =>
        isLiteral(e) ? (e as any).value : e
      );
    }
    return evalArg;
  });
}

/* Helper: Centralize math operations during function calls */
function tryMathOperation(op: string, args: any[], logger: Logger): SExp {
  try {
    if (op === "Math.abs" || op.endsWith(".abs")) return createLiteral(Math.abs(args[0]));
    if (op === "Math.round" || op.endsWith(".round")) return createLiteral(Math.round(args[0]));
    if (op === "Math.max" || op.endsWith(".max")) return createLiteral(Math.max(...args));
  } catch (callError) {
    logger.debug(`Error calling math function ${op}: ${callError instanceof Error ? callError.message : String(callError)}`);
    return createLiteral(0);
  }
  // Should not reach here if op matches math functions
  return createLiteral(0);
}

/* Evaluate a function call with improved error handling */
function evaluateFunctionCall(list: SList, env: Environment, logger: Logger): SExp {
  const first = list.elements[0];
  if (isSymbol(first)) {
    const op = (first as SSymbol).name;
    try {
      const fn = env.lookup(op);
      if (typeof fn === "function") {
        const evalArgs = evaluateArguments(list.elements.slice(1), env, logger);
        if (
          op === "Math.abs" || op.endsWith(".abs") ||
          op === "Math.round" || op.endsWith(".round") ||
          op === "Math.max" || op.endsWith(".max")
        ) {
          return tryMathOperation(op, evalArgs, logger);
        }
        return convertJsValueToSExp(fn(...evalArgs));
      }
    } catch {
      logger.debug(`Function '${op}' not found during macro expansion`);
    }
  }
  return createList(
    ...list.elements.map((elem) => evaluateForMacro(elem, env, logger)),
  );
}

/* Evaluate a quasiquoted expression */
function evaluateQuasiquote(expr: SList, env: Environment, logger: Logger): SExp {
  if (expr.elements.length !== 2) {
    throw new MacroError("quasiquote requires exactly one argument", "quasiquote");
  }
  logger.debug(`Evaluating quasiquote: ${sexpToString(expr.elements[1])}`);
  return processQuasiquotedExpr(expr.elements[1], env, logger);
}

/* Process a quasiquoted expression, handling unquote and unquote-splicing */
function processQuasiquotedExpr(
  expr: SExp,
  env: Environment,
  logger: Logger,
): SExp {
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

/* Modified expandMacroExpression with visualization support */
function expandMacroExpression(
  expr: SExp,
  env: Environment,
  options: MacroExpanderOptions,
  depth: number,
): SExp {
  const maxDepth = options.maxExpandDepth || 100;
  
  if (depth > maxDepth) {
    logger.warn(`Reached maximum expansion depth (${maxDepth}). Possible recursive macro?`, "macro");
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
      const originalExpr = list;
      
      logger.debug(`Expanding macro ${op} at depth ${depth}`, "macro");
      
      const expanded = macroFn(args, env);
      visualizeMacroExpansion(originalExpr, expanded, op, logger);
      return expandMacroExpression(expanded, env, options, depth + 1);
    }
  }
  
  const expandedElements = list.elements.map((elem) =>
    expandMacroExpression(elem, env, options, depth + 1)
  );
  
  return createList(...expandedElements);
}

/* Filter out macro definitions from the final S-expression list */
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

/* Visualize the macro expansion process with ASCII graphics */
export function visualizeMacroExpansion(
  original: SExp,
  expanded: SExp,
  macroName: string,
  logger: Logger,
): void {
  if (!logger.isNamespaceEnabled("macro")) return;

  const originalStr = sexpToString(original);
  const expandedStr = sexpToString(expanded);
  const separator = "=".repeat(80);
  const header = `MACRO EXPANSION: ${macroName}`;
  const headerLine = `== ${header} ${"=".repeat(Math.max(0, separator.length - header.length - 4))}`;

  logger.log({
    text: `\n${separator}\n${headerLine}\n${separator}\n`,
    namespace: "macro"
  });
  logger.log({
    text: `ORIGINAL:\n${formatExpression(originalStr)}`,
    namespace: "macro"
  });
  logger.log({
    text: `\n   |\n   V\n`,
    namespace: "macro"
  });
  logger.log({
    text: `EXPANDED:\n${formatExpression(expandedStr)}\n`,
    namespace: "macro"
  });
  logger.log({ text: separator, namespace: "macro" });
}

/* Format an S-expression string for readability */
function formatExpression(expr: string): string {
  let indentLevel = 0;
  let result = "";
  let inString = false;

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if (char === '"' && (i === 0 || expr[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      continue;
    }
    if (inString) {
      result += char;
      continue;
    }
    switch (char) {
      case '(':
        result += char;
        indentLevel++;
        if (i + 1 < expr.length && expr[i + 1] !== ')') {
          result += '\n' + ' '.repeat(indentLevel * 2);
        }
        break;
      case ')':
        indentLevel--;
        result = result.endsWith(' ') ? result.trimEnd() : result;
        result += char;
        break;
      case ' ':
        if (i > 0 && expr[i - 1] !== '(' && expr[i - 1] !== ' ') {
          result += '\n' + ' '.repeat(indentLevel * 2);
        }
        break;
      default:
        result += char;
    }
  }
  return result;
}

/* Log detailed macro evaluation environment information */
export function visualizeEnvironment(
  env: Environment,
  context: string,
  logger: Logger,
): void {
  if (!logger.isNamespaceEnabled("macro")) return;

  logger.log({
    text: `\n== MACRO ENVIRONMENT: ${context} ==`,
    namespace: "macro"
  });
  logger.log({ text: "Variables:", namespace: "macro" });
  
  if (env.variables.size === 0) {
    logger.log({ text: "  (none)", namespace: "macro" });
  } else {
    for (const [key, value] of env.variables.entries()) {
      logger.log({ text: `  ${key}: ${formatValue(value)}`, namespace: "macro" });
    }
  }

  const currentFile = env.getCurrentFile();
  if (currentFile && env.moduleMacros.has(currentFile)) {
    logger.log({ text: "\nLocal Macros:", namespace: "macro" });
    const moduleMacros = env.moduleMacros.get(currentFile)!;
    for (const [name, _] of moduleMacros.entries()) {
      logger.log({ text: `  ${name}`, namespace: "macro" });
    }
  }
}

/* Format a value for display */
function formatValue(value: any): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return `[Array: ${value.length} items]`;
    if ('type' in value) return sexpToString(value);
    return '[Object]';
  }
  return String(value);
}

/* Create a macro function */
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

/* Apply hygiene transformations to an expression */
function applyHygiene(expr: SExp, macroName: string, logger: Logger): SExp {
  const hygieneContext = `macro_${macroName}`;
  function processExpr(expr: SExp): SExp {
    if (isList(expr)) {
      return createList(...(expr as SList).elements.map(processExpr));
    } else if (isSymbol(expr)) {
      const originalName = (expr as SSymbol).name;
      const renamedSymbol = symbolRenameMap.get(hygieneContext)?.get(originalName);
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

/* Create a new environment for macro expansion with parameter bindings and hygiene */
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
      if (!symbolRenameMap.has(macroContext)) {
        symbolRenameMap.set(macroContext, new Map());
      }
      symbolRenameMap.get(macroContext)!.set(params[i], hygienicParamName);
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
      if (!symbolRenameMap.has(macroContext)) {
        symbolRenameMap.set(macroContext, new Map());
      }
      symbolRenameMap.get(macroContext)!.set(restParam, hygienicRestName);
    }
    env.define(hygienicRestName, restList);
    env.define(restParam, restList);
  }
  return env;
}
