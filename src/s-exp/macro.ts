// src/s-exp/macro.ts - Refactored with improved error handling and performance
import { 
  SExp, SSymbol, SList, 
  isSymbol, isList, isLiteral, isDefMacro, isUserMacro,
  createList, createLiteral, createNilLiteral, sexpToString
} from './types.ts';
import { Environment } from '../environment.ts';
import { Logger } from '../logger.ts';
import { MacroFn } from '../environment.ts';
import { MacroError } from '../transpiler/errors.ts';
import { perform } from '../transpiler/error-utils.ts';
import { gensym } from '../gensym.ts';

// Maximum cache size to prevent unbounded cache growth
const MAX_CACHE_SIZE = 5000;

// Maximum number of expansion iterations to prevent infinite recursion
const MAX_EXPANSION_ITERATIONS = 100;

// Cache for macro expansion results
const macroExpansionCache = new Map<string, SExp>();

// LRU tracking for cache eviction
const cacheLRU: string[] = [];

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
 * Define a user-level macro in the module scope
 */
export function defineUserMacro(macroForm: SList, filePath: string, env: Environment, logger: Logger): void {
  return perform(() => {
    // Validate macro definition: (macro name [params...] body...)
    if (macroForm.elements.length < 4) {
      throw new MacroError(
        'macro requires a name, parameter list, and body',
        'macro',
        filePath
      );
    }

    // Get macro name
    const macroNameExp = macroForm.elements[1];
    if (!isSymbol(macroNameExp)) {
      throw new MacroError(
        'Macro name must be a symbol',
        'macro',
        filePath
      );
    }
    const macroName = macroNameExp.name;

    // Skip if already defined (avoid redundant work)
    if (env.hasModuleMacro(filePath, macroName)) {
      logger.debug(`Macro ${macroName} already defined in ${filePath}, skipping`);
      return;
    }

    // Get parameter list
    const paramsExp = macroForm.elements[2];
    if (!isList(paramsExp)) {
      throw new MacroError(
        'Macro parameters must be a list',
        macroName,
        filePath
      );
    }

    // Process parameter list, handling rest parameters
    const { params, restParam } = processParamList(paramsExp, logger);

    // Get macro body (all remaining forms)
    const body = macroForm.elements.slice(3);

    // Create macro function
    const macroFn = createMacroFunction(macroName, params, restParam, body, logger, filePath);

    // Register the macro in the module's registry
    env.defineModuleMacro(filePath, macroName, macroFn);
    logger.debug(`Defined user-level macro ${macroName} in ${filePath}`);
  }, `Failed to define user macro in ${filePath}`, MacroError, [macroForm.elements.length > 1 && isSymbol(macroForm.elements[1]) ? (macroForm.elements[1] as SSymbol).name : 'unknown', filePath]);
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
  sourceFile?: string
): MacroFn {
  return perform(() => {
    const macroFn = (args: SExp[], callEnv: Environment): SExp => {
      const source = sourceFile ? ` from ${sourceFile}` : '';
      logger.debug(`Expanding ${sourceFile ? 'module ' : ''}macro ${macroName}${source} with ${args.length} args`);
      
      // Create new environment for macro expansion with proper hygiene
      const macroEnv = createMacroEnv(callEnv, params, restParam, args, logger);

      // Evaluate body expressions with error handling
      let result: SExp = createNilLiteral();
      
      for (const expr of body) {
        result = evaluateForMacro(expr, macroEnv, logger);
      }

      logger.debug(`Macro ${macroName} expanded to: ${sexpToString(result)}`);
      return result;
    };

    // Tag the function as a macro
    Object.defineProperty(macroFn, 'isMacro', { value: true });
    Object.defineProperty(macroFn, 'macroName', { value: macroName });
    
    // Additional metadata for user-level macros
    if (sourceFile) {
      Object.defineProperty(macroFn, 'sourceFile', { value: sourceFile });
      Object.defineProperty(macroFn, 'isUserMacro', { value: true });
    }

    return macroFn;
  }, `Failed to create macro function for ${macroName}`, MacroError, [macroName, sourceFile]);
}

/**
 * Register a macro definition in the environment
 */
export function defineMacro(macroForm: SList, env: Environment, logger: Logger): void {
  perform(() => {
    // Validate macro definition: (defmacro name [params...] body...)
    if (macroForm.elements.length < 4) {
      throw new MacroError(
        'defmacro requires a name, parameter list, and body',
        'defmacro'
      );
    }

    // Get macro name
    const macroNameExp = macroForm.elements[1];
    if (!isSymbol(macroNameExp)) {
      throw new MacroError(
        'Macro name must be a symbol',
        'defmacro'
      );
    }
    const macroName = macroNameExp.name;

    // Get parameter list
    const paramsExp = macroForm.elements[2];
    if (!isList(paramsExp)) {
      throw new MacroError(
        'Macro parameters must be a list',
        macroName
      );
    }

    // Process parameter list, handling rest parameters
    const { params, restParam } = processParamList(paramsExp, logger);

    // Get macro body (all remaining forms)
    const body = macroForm.elements.slice(3);

    // Create macro function
    const macroFn = createMacroFunction(macroName, params, restParam, body, logger);

    // Register the macro in the environment
    env.defineMacro(macroName, macroFn);
    logger.debug(`Registered global macro: ${macroName}`);
  }, "Failed to define macro", MacroError, [macroForm.elements.length > 1 && isSymbol(macroForm.elements[1]) ? (macroForm.elements[1] as SSymbol).name : 'unknown']);
}

/**
 * Process a parameter list, handling rest parameters
 */
export function processParamList(paramsExp: SList, logger: Logger): { params: string[], restParam: string | null } {
  return perform(() => {
    const params: string[] = [];
    let restParam: string | null = null;
    let restMode = false;

    for (let i = 0; i < paramsExp.elements.length; i++) {
      const param = paramsExp.elements[i];
      if (!isSymbol(param)) {
        throw new Error(`Macro parameter at position ${i + 1} must be a symbol, got: ${sexpToString(param)}`);
      }

      const paramName = param.name;

      if (paramName === '&') {
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
  }, "Error processing parameter list");
}

/**
 * Create a new environment for macro expansion with parameter bindings
 * Enhanced with better hygiene using gensym for nested macro expansions
 */
function createMacroEnv(
  parent: Environment, 
  params: string[], 
  restParam: string | null, 
  args: SExp[], 
  logger: Logger
): Environment {
  return perform(() => {
    const env = parent.extend(); // Create a child environment

    // Bind positional parameters
    for (let i = 0; i < params.length; i++) {
      // Create unique symbol names for parameters to maintain hygiene
      // when this macro expansion might expand to other macros
      const hygienicParamName = `${params[i]}_${gensym("param")}`;
      
      // Map the original parameter name to this hygienic name
      env.define(params[i], i < args.length ? args[i] : createNilLiteral());
    }

    // Bind rest parameter if present
    if (restParam !== null) {
      // Get the rest arguments
      const restArgs = args.slice(params.length);
      logger.debug(`Creating rest parameter '${restParam}' with ${restArgs.length} elements`);
      
      // Create a proper SList for the rest arguments
      const restList = createList(...restArgs);
      
      // Tag it as a rest parameter for special handling
      Object.defineProperty(restList, 'isRestParameter', { value: true });
      
      // Define the rest parameter
      env.define(restParam, restList);
    }

    return env;
  }, "Error creating macro environment");
}

/**
 * Evaluate an S-expression for macro expansion
 */
export function evaluateForMacro(expr: SExp, env: Environment, logger: Logger): SExp {
  return perform(() => {
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
  }, `Error evaluating expression for macro: ${sexpToString(expr)}`);
}

/**
 * Evaluate a symbol expression during macro expansion
 */
function evaluateSymbol(expr: SSymbol, env: Environment, logger: Logger): SExp {
  return perform(() => {
    try {
      const value = env.lookup(expr.name);
      
      // Convert JS values to S-expressions
      if (typeof value === 'object' && value !== null && 'type' in value) {
        return value as SExp;
      } else if (Array.isArray(value)) {
        return createList(...value.map(item => 
          typeof item === 'object' && item !== null && 'type' in item
            ? item as SExp
            : createLiteral(item)
        ));
      } else {
        return createLiteral(value);
      }
    } catch (e) {
      // For symbol lookup failures, provide more context in debug mode
      logger.debug(`Symbol lookup failed for '${expr.name}' during macro evaluation`);
      return expr; // Return symbol as is if not found
    }
  }, `Error evaluating symbol ${expr.name}`);
}

/**
 * Evaluate a list expression during macro expansion
 */
function evaluateList(expr: SList, env: Environment, logger: Logger): SExp {
  return perform(() => {
    // Empty list
    if (expr.elements.length === 0) {
      return expr;
    }
    
    const first = expr.elements[0];
    
    // Handle special forms
    if (isSymbol(first)) {
      const op = (first as SSymbol).name;
      
      switch (op) {
        case 'quote':
          return evaluateQuote(expr, env, logger);
        case 'quasiquote':
          return evaluateQuasiquote(expr, env, logger);
        case 'unquote':
        case 'unquote-splicing':
          throw new MacroError(
            `${op} not in quasiquote context`,
            op
          );
        case 'if':
          return evaluateIf(expr, env, logger);
        case 'cond':
          return evaluateCond(expr, env, logger);
        case 'let':
          return evaluateLet(expr, env, logger);
        case 'def':
        case 'defn':
        case 'fn':
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
          `Error evaluating function call '${op}': ${error instanceof Error ? error.message : String(error)}`,
          op
        );
      }
    }
    
    // Not a symbol in first position, evaluate all elements
    return createList(
      ...expr.elements.map(elem => evaluateForMacro(elem, env, logger))
    );
  }, `Error evaluating list for macro`);
}

/**
 * Evaluate a quoted expression
 */
function evaluateQuote(list: SList, env: Environment, logger: Logger): SExp {
  return perform(() => {
    if (list.elements.length !== 2) {
      throw new MacroError('quote requires exactly one argument', 'quote');
    }
    return list.elements[1];
  }, "Error evaluating quote", MacroError, ['quote']);
}

/**
 * Evaluate a conditional (if) expression
 */
function evaluateIf(list: SList, env: Environment, logger: Logger): SExp {
  return perform(() => {
    if (list.elements.length < 3 || list.elements.length > 4) {
      throw new MacroError(
        `'if' requires 2 or 3 arguments, got ${list.elements.length - 1}`,
        'if'
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
  }, "Error evaluating if expression", MacroError, ['if']);
}

/**
 * Evaluate a cond expression
 */
function evaluateCond(list: SList, env: Environment, logger: Logger): SExp {
  return perform(() => {
    // Check each clause
    for (let i = 1; i < list.elements.length; i++) {
      const clause = list.elements[i];
      if (!isList(clause)) {
        throw new MacroError('cond clauses must be lists', 'cond');
      }
      
      const clauseList = clause as SList;
      if (clauseList.elements.length < 2) {
        throw new MacroError('cond clauses must have a test and a result', 'cond');
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
  }, "Error evaluating cond expression", MacroError, ['cond']);
}

/**
 * Evaluate a let expression
 */
function evaluateLet(list: SList, env: Environment, logger: Logger): SExp {
  return perform(() => {
    if (list.elements.length < 2) {
      throw new MacroError('let requires bindings and at least one body form', 'let');
    }
    
    const bindings = list.elements[1];
    if (!isList(bindings)) {
      throw new MacroError('let bindings must be a list', 'let');
    }
    
    const bindingsList = bindings as SList;
    if (bindingsList.elements.length % 2 !== 0) {
      throw new MacroError('let bindings must have an even number of forms', 'let');
    }
    
    // Create a new environment for let bindings
    const letEnv = env.extend();
    
    // Evaluate bindings
    for (let i = 0; i < bindingsList.elements.length; i += 2) {
      const name = bindingsList.elements[i];
      const value = bindingsList.elements[i + 1];
      
      if (!isSymbol(name)) {
        throw new MacroError('let binding names must be symbols', 'let');
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
  }, "Error evaluating let expression", MacroError, ['let']);
}

/**
 * Evaluate a macro call
 */
function evaluateMacroCall(list: SList, env: Environment, logger: Logger): SExp {
  return perform(() => {
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
  }, "Error evaluating macro call", MacroError, [list.elements.length > 0 && isSymbol(list.elements[0]) ? (list.elements[0] as SSymbol).name : 'unknown']);
}

/**
 * Evaluate a function call
 */
function evaluateFunctionCall(list: SList, env: Environment, logger: Logger): SExp {
  return perform(() => {
    const op = (list.elements[0] as SSymbol).name;
    
    try {
      // Try to find a regular function with this name
      const fn = env.lookup(op);
      
      if (typeof fn === 'function') {
        // Evaluate the arguments
        const evalArgs = list.elements.slice(1).map(arg => {
          const evalArg = evaluateForMacro(arg, env, logger);
          // Convert S-expressions to JS values for function calls
          if (isLiteral(evalArg)) {
            return (evalArg as any).value;
          } else if (isList(evalArg)) {
            // Convert lists to arrays
            return (evalArg as SList).elements.map(e => {
              if (isLiteral(e)) return (e as any).value;
              return e;
            });
          }
          return evalArg;
        });
        
        // Call the function
        try {
          const result = fn(...evalArgs);
          return convertJsValueToSExp(result);
        } catch (callError) {
          logger.warn(`Error calling function ${op} during macro expansion: ${callError instanceof Error ? callError.message : String(callError)}`);
          // Fall through to return evaluated elements
        }
      }
    } catch (lookupError) {
      // Function not found, continue with normal evaluation
    }
    
    // For other cases, evaluate all elements
    return createList(
      ...list.elements.map(elem => evaluateForMacro(elem, env, logger))
    );
  }, "Error evaluating function call");
}

/**
 * Convert a JavaScript value to an S-expression
 */
function convertJsValueToSExp(value: any): SExp {
  return perform(() => {
    if (value === null || value === undefined) {
      return createNilLiteral();
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return createLiteral(value);
    } else if (Array.isArray(value)) {
      return createList(...value.map(item => convertJsValueToSExp(item)));
    } else if (typeof value === 'object' && 'type' in value) {
      // Already an S-expression
      return value as SExp;
    } else {
      return createLiteral(String(value));
    }
  }, "Error converting JS value to S-expression");
}

/**
 * Process a quasiquoted expression (backtick syntax)
 */
function evaluateQuasiquote(expr: SList, env: Environment, logger: Logger): SExp {
  return perform(() => {
    // The first element is 'quasiquote', the second is the expression to process
    if (expr.elements.length !== 2) {
      throw new MacroError('quasiquote requires exactly one argument', 'quasiquote');
    }
    
    const quasiquotedExpr = expr.elements[1];
    logger.debug(`Evaluating quasiquote: ${sexpToString(quasiquotedExpr)}`);

    // Delegate to helper function for actual processing
    return processQuasiquotedExpr(quasiquotedExpr, env, logger);
  }, "Error evaluating quasiquote", MacroError, ['quasiquote']);
}

/**
 * Process a quasiquoted expression, handling unquote and unquote-splicing
 */
function processQuasiquotedExpr(expr: SExp, env: Environment, logger: Logger): SExp {
  return perform(() => {
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
    if (isSymbol(first) && (first as SSymbol).name === 'unquote') {
      if (list.elements.length !== 2) {
        throw new MacroError('unquote requires exactly one argument', 'unquote');
      }
      // Evaluate the unquoted expression
      logger.debug(`Evaluating unquote: ${sexpToString(list.elements[1])}`);
      return evaluateForMacro(list.elements[1], env, logger);
    }

    // Handle unquote-splicing (error if not inside a list)
    if (isSymbol(first) && (first as SSymbol).name === 'unquote-splicing') {
      throw new MacroError('unquote-splicing not in list context', 'unquote-splicing');
    }

    // Process list contents
    const processedElements: SExp[] = [];

    for (let i = 0; i < list.elements.length; i++) {
      const element = list.elements[i];

      // Handle unquote-splicing (~@)
      if (isList(element) && 
          (element as SList).elements.length > 0 && 
          isSymbol((element as SList).elements[0]) && 
          ((element as SList).elements[0] as SSymbol).name === 'unquote-splicing') {
        
        const spliceList = element as SList;
        
        if (spliceList.elements.length !== 2) {
          throw new MacroError('unquote-splicing requires exactly one argument', 'unquote-splicing');
        }
        
        // Get the expression to splice
        const splicedExpr = spliceList.elements[1];
        logger.debug(`Processing unquote-splicing: ${sexpToString(splicedExpr)}`);
        
        // Evaluate the expression
        const spliced = evaluateForMacro(splicedExpr, env, logger);
        logger.debug(`Evaluated unquote-splicing to: ${sexpToString(spliced)}`);
        
        // Handle different types of spliced values
        if (isList(spliced)) {
          logger.debug(`Splicing elements from list with ${(spliced as SList).elements.length} items`);
          // Splice the elements into the result list
          processedElements.push(...(spliced as SList).elements);
        } 
        // Handle array-like objects with a special isRestParameter flag
        else if (typeof spliced === 'object' && spliced !== null && 
                'isRestParameter' in spliced && (spliced as any).isRestParameter) {
          // Access the elements property which should contain the list items
          if ('elements' in spliced) {
            const elements = (spliced as any).elements;
            logger.debug(`Splicing elements from rest parameter with ${elements.length} items`);
            processedElements.push(...elements);
          } else {
            logger.warn(`Rest parameter doesn't have elements property`);
          }
        }
        // Fall back to adding the value as a single element
        else {
          logger.warn(`unquote-splicing received a non-list value: ${sexpToString(spliced)}`);
          processedElements.push(spliced);
        }
      } 
      // For other elements, process them recursively
      else {
        const processed = processQuasiquotedExpr(element, env, logger);
        processedElements.push(processed);
      }
    }

    // Create a new list with the processed elements
    return createList(...processedElements);
  }, "Error processing quasiquote", MacroError, ['quasiquote']);
}

/**
 * Expand all macros in a list of S-expressions using a fixed-point algorithm
 * with trampolining to prevent stack overflow
 */
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  options: MacroExpanderOptions = {}
): SExp[] {
  return perform(() => {
    const logger = new Logger(options.verbose || false);
    const currentFile = options.currentFile;
    const useCache = options.useCache !== false; // Default to using cache
    
    logger.debug(`Starting macro expansion on ${exprs.length} expressions${currentFile ? ` in ${currentFile}` : ''}`);

    // If we have a current file, set it in the environment
    if (currentFile) {
      env.setCurrentFile(currentFile);
      logger.debug(`Setting current file to: ${currentFile}`);
    }

    // First pass: register all global and user-level macro definitions
    try {
      processMacroDefinitions(exprs, env, currentFile, logger);
    } catch (error) {
      throw new MacroError(
        `Error processing macro definitions: ${error instanceof Error ? error.message : String(error)}`,
        "",
        currentFile,
        error instanceof Error ? error : undefined
      );
    }

    // Use fixed-point iteration to expand all macros
    let currentExprs = [...exprs];
    let iteration = 0;
    let changed = true;
    
    // Keep expanding until no changes occur (fixed point) or max iterations reached
    while (changed && iteration < MAX_EXPANSION_ITERATIONS) {
      changed = false;
      iteration++;
      
      logger.debug(`Macro expansion iteration ${iteration}`);
      
      // Expand all expressions in the current pass
      const newExprs = currentExprs.map(expr => {
        const exprStr = useCache ? sexpToString(expr) : "";
        
        // If caching is enabled and we have a cache hit, use cached result
        if (useCache && macroExpansionCache.has(exprStr)) {
          logger.debug(`Cache hit for expression: ${exprStr.substring(0, 30)}...`);
          return macroExpansionCache.get(exprStr)!;
        }
        
        // Otherwise expand and update cache
        const expandedExpr = expandMacroExpression(expr, env, options, 0);
        
        // Cache result if caching is enabled
        if (useCache) {
          updateCache(exprStr, expandedExpr);
        }
        
        return expandedExpr;
      });
      
      // Check if anything changed
      const oldStr = currentExprs.map(sexpToString).join('\n');
      const newStr = newExprs.map(sexpToString).join('\n');
      
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
    
    // Filter out macro definitions from the final result
    currentExprs = filterMacroDefinitions(currentExprs, logger);
    
    // Clean up environment when done
    if (currentFile) {
      env.setCurrentFile(null);
      logger.debug(`Clearing current file`);
    }
    
    return currentExprs;
  }, "Macro expansion failed", MacroError, ['', options.currentFile]);
}

/**
 * Update cache with LRU tracking
 */
function updateCache(key: string, value: SExp): void {
  // If the cache is full, remove the least recently used item
  if (macroExpansionCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cacheLRU.shift(); // Remove oldest key
    if (oldestKey) {
      macroExpansionCache.delete(oldestKey);
    }
  }
  
  // Add to cache
  macroExpansionCache.set(key, value);
  
  // Update LRU tracking - remove key if exists then push to end (most recent)
  const index = cacheLRU.indexOf(key);
  if (index !== -1) {
    cacheLRU.splice(index, 1);
  }
  cacheLRU.push(key);
}

/**
 * Expand a single S-expression and all its nested expressions
 */
function expandMacroExpression(
  expr: SExp,
  env: Environment,
  options: MacroExpanderOptions,
  depth: number
): SExp {
  return perform(() => {
    // Prevent excessive recursion
    const maxDepth = options.maxExpandDepth || 100;
    if (depth > maxDepth) {
      const logger = new Logger(options.verbose || false);
      logger.warn(`Reached maximum expansion depth (${maxDepth}). Possible recursive macro?`);
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
      if (op === 'defmacro' || op === 'macro') {
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
    const expandedElements = list.elements.map(elem => 
      expandMacroExpression(elem, env, options, depth + 1)
    );
    
    // Create a new list with the expanded elements
    return createList(...expandedElements);
  }, "Error expanding macro expression");
}

/**
 * Process all macro definitions (both system and user-level)
 */
function processMacroDefinitions(
  exprs: SExp[], 
  env: Environment, 
  currentFile: string | undefined,
  logger: Logger
): void {
  perform(() => {
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
          let macroName = 'unknown';
          if ((expr as SList).elements.length > 1 && 
              (expr as SList).elements[1].type === 'symbol') {
            macroName = ((expr as SList).elements[1] as SSymbol).name;
          }
          
          throw new MacroError(
            `Error defining global macro: ${error instanceof Error ? error.message : String(error)}`,
            macroName,
            currentFile,
            error instanceof Error ? error : undefined
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
            let macroName = 'unknown';
            if ((expr as SList).elements.length > 1 && 
                (expr as SList).elements[1].type === 'symbol') {
              macroName = ((expr as SList).elements[1] as SSymbol).name;
            }
            
            throw new MacroError(
              `Error defining user macro: ${error instanceof Error ? error.message : String(error)}`,
              macroName,
              currentFile,
              error instanceof Error ? error : undefined
            );
          }
        }
      }
    }
  }, "Error processing macro definitions");
}

/**
 * Filter out macro definitions (both system and user-level)
 */
function filterMacroDefinitions(exprs: SExp[], logger: Logger): SExp[] {
  return perform(() => {
    return exprs.filter(expr => {
      // Remove defmacro forms
      if (isDefMacro(expr)) {
        logger.debug(`Filtering out system macro definition: ${sexpToString(expr)}`);
        return false;
      }
      
      // Remove user-level macro forms
      if (isUserMacro(expr)) {
        logger.debug(`Filtering out user macro definition: ${sexpToString(expr)}`);
        return false;
      }
      
      // Keep everything else
      return true;
    });
  }, "Error filtering macro definitions");
}