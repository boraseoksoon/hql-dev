// src/s-exp/macro.ts - Complete updated version with module-level macro support
import { 
  SExp, SSymbol, SList, 
  isSymbol, isList, isLiteral, isDefMacro, isUserMacro,
  createSymbol, createList, createLiteral, createNilLiteral, sexpToString,
  cloneSExp
} from './types.ts';
import { Environment } from '../environment.ts';
import { Logger } from '../logger.ts';
import { gensym } from '../gensym.ts';

/**
 * Options for macro expansion
 */
interface MacroExpanderOptions {
  verbose?: boolean;
  maxExpandDepth?: number;
  maxPasses?: number; // Maximum number of expansion passes
  currentFile?: string; // Track the current file being processed
}

/**
 * Register a macro definition in the environment
 */
export function defineMacro(macroForm: SList, env: Environment, logger: Logger): void {
  // Validate macro definition: (defmacro name [params...] body...)
  if (macroForm.elements.length < 4) {
    throw new Error('defmacro requires a name, parameter list, and body');
  }

  // Get macro name
  const macroNameExp = macroForm.elements[1];
  if (!isSymbol(macroNameExp)) {
    throw new Error('Macro name must be a symbol');
  }
  const macroName = macroNameExp.name;

  // Get parameter list
  const paramsExp = macroForm.elements[2];
  if (!isList(paramsExp)) {
    throw new Error('Macro parameters must be a list');
  }

  // Process parameter list, handling rest parameters
  const { params, restParam } = processParamList(paramsExp, logger);

  // Get macro body (all remaining forms)
  const body = macroForm.elements.slice(3);

  // Create macro function
  const macroFn = (args: SExp[], callEnv: Environment): SExp => {
    logger.debug(`Expanding macro ${macroName} with ${args.length} args`);
    
    // Create new environment for macro expansion
    const macroEnv = createMacroEnv(callEnv, { params, restParam }, args, logger);

    // Evaluate body expressions
    let result: SExp = createNilLiteral();
    for (const expr of body) {
      result = evaluateForMacro(expr, macroEnv, logger);
    }

    logger.debug(`Macro ${macroName} expanded to: ${sexpToString(result)}`);
    return result;
  };

  // Tag as a macro function
  Object.defineProperty(macroFn, 'isMacro', { value: true });
  Object.defineProperty(macroFn, 'macroName', { value: macroName });

  // Register the macro in the environment
  env.defineMacro(macroName, macroFn);
  logger.debug(`Registered global macro: ${macroName}`);
}

/**
 * Define a user-level macro in the module scope
 */
export function defineUserMacro(macroForm: SList, filePath: string, env: Environment, logger: Logger): void {
  // Validate macro definition: (macro name [params...] body...)
  if (macroForm.elements.length < 4) {
    throw new Error('macro requires a name, parameter list, and body');
  }

  // Get macro name
  const macroNameExp = macroForm.elements[1];
  if (!isSymbol(macroNameExp)) {
    throw new Error('Macro name must be a symbol');
  }
  const macroName = macroNameExp.name;

  // Get parameter list
  const paramsExp = macroForm.elements[2];
  if (!isList(paramsExp)) {
    throw new Error('Macro parameters must be a list');
  }

  // Process parameter list, handling rest parameters
  const { params, restParam } = processParamList(paramsExp, logger);

  // Get macro body (all remaining forms)
  const body = macroForm.elements.slice(3);

  // Create macro function (same as in defineMacro)
  const macroFn = (args: SExp[], callEnv: Environment): SExp => {
    logger.debug(`Expanding module macro ${macroName} from ${filePath} with ${args.length} args`);
    
    // Create new environment for macro expansion
    const macroEnv = createMacroEnv(callEnv, { params, restParam }, args, logger);

    // Evaluate body expressions
    let result: SExp = createNilLiteral();
    for (const expr of body) {
      result = evaluateForMacro(expr, macroEnv, logger);
    }

    logger.debug(`Module macro ${macroName} expanded to: ${sexpToString(result)}`);
    return result;
  };

  // Tag the function as a module-level macro
  Object.defineProperty(macroFn, 'isMacro', { value: true });
  Object.defineProperty(macroFn, 'macroName', { value: macroName });
  Object.defineProperty(macroFn, 'sourceFile', { value: filePath });
  Object.defineProperty(macroFn, 'isUserMacro', { value: true });

  // Register the macro in the module's registry
  env.defineModuleMacro(filePath, macroName, macroFn);
  
  logger.debug(`Registered user-level macro: ${macroName} in ${filePath}`);
}

/**
 * Process a parameter list, handling rest parameters
 */
export function processParamList(paramsExp: SList, logger: Logger): { params: string[], restParam: string | null } {
  const params: string[] = [];
  let restParam: string | null = null;
  let restMode = false;

  for (const param of paramsExp.elements) {
    if (!isSymbol(param)) {
      throw new Error('Macro parameters must be symbols');
    }

    const paramName = param.name;

    if (paramName === '&') {
      restMode = true;
      continue;
    }

    if (restMode) {
      if (restParam !== null) {
        throw new Error('Multiple rest parameters not allowed');
      }
      restParam = paramName;
    } else {
      params.push(paramName);
    }
  }

  return { params, restParam };
}

/**
 * Create a new environment for macro expansion with parameter bindings
 */
function createMacroEnv(
  parent: Environment, 
  { params, restParam }: { params: string[], restParam: string | null }, 
  args: SExp[], 
  logger: Logger
): Environment {
  const env = parent.extend(); // Create a child environment

  // Bind positional parameters
  for (let i = 0; i < params.length; i++) {
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
}

/**
 * Evaluate an S-expression for macro expansion
 */
export function evaluateForMacro(expr: SExp, env: Environment, logger: Logger): SExp {
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
    logger.error(`Error evaluating expression for macro: ${error.message}`);
    logger.error(`Problematic expression: ${sexpToString(expr)}`);
    throw error;
  }
}

/**
 * Evaluate a symbol expression during macro expansion
 */
function evaluateSymbol(expr: SSymbol, env: Environment, logger: Logger): SExp {
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
    return expr; // Return symbol as is if not found
  }
}

/**
 * Evaluate a list expression during macro expansion
 */
function evaluateList(expr: SList, env: Environment, logger: Logger): SExp {
  // Empty list
  if (expr.elements.length === 0) {
    return expr;
  }
  
  const first = expr.elements[0];
  
  // Handle special forms
  if (isSymbol(first)) {
    const op = (first as SSymbol).name;
    
    // Dispatch to specialized handlers for each special form
    switch (op) {
      case 'quote':
        return evaluateQuote(expr, env, logger);
      case 'quasiquote':
        return evaluateQuasiquote(expr, env, logger);
      case 'unquote':
      case 'unquote-splicing':
        throw new Error(`${op} not in quasiquote context`);
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
    return evaluateFunctionCall(expr, env, logger);
  }
  
  // Not a symbol in first position, evaluate all elements
  return createList(
    ...expr.elements.map(elem => evaluateForMacro(elem, env, logger))
  );
}

/**
 * Evaluate a quoted expression
 */
function evaluateQuote(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length !== 2) {
    throw new Error('quote requires exactly one argument');
  }
  return list.elements[1];
}

/**
 * Evaluate a conditional (if) expression
 */
function evaluateIf(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length < 3 || list.elements.length > 4) {
    throw new Error('if requires 2 or 3 arguments');
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
}

/**
 * Evaluate a cond expression
 */
function evaluateCond(list: SList, env: Environment, logger: Logger): SExp {
  // Check each clause
  for (let i = 1; i < list.elements.length; i++) {
    const clause = list.elements[i];
    if (!isList(clause)) {
      throw new Error('cond clauses must be lists');
    }
    
    const clauseList = clause as SList;
    if (clauseList.elements.length < 2) {
      throw new Error('cond clauses must have a test and a result');
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
}

/**
 * Evaluate a let expression
 */
function evaluateLet(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length < 2) {
    throw new Error('let requires bindings and at least one body form');
  }
  
  const bindings = list.elements[1];
  if (!isList(bindings)) {
    throw new Error('let bindings must be a list');
  }
  
  const bindingsList = bindings as SList;
  if (bindingsList.elements.length % 2 !== 0) {
    throw new Error('let bindings must have an even number of forms');
  }
  
  // Create a new environment for let bindings
  const letEnv = env.extend();
  
  // Evaluate bindings
  for (let i = 0; i < bindingsList.elements.length; i += 2) {
    const name = bindingsList.elements[i];
    const value = bindingsList.elements[i + 1];
    
    if (!isSymbol(name)) {
      throw new Error('let binding names must be symbols');
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
}

/**
 * Evaluate a macro call
 */
function evaluateMacroCall(list: SList, env: Environment, logger: Logger): SExp {
  const op = (list.elements[0] as SSymbol).name;
  const macroFn = env.getMacro(op);
  
  if (!macroFn) {
    throw new Error(`Macro not found: ${op}`);
  }
  
  // Get macro arguments (don't evaluate them)
  const args = list.elements.slice(1);
  
  // Apply the macro
  try {
    const expanded = macroFn(args, env);
    logger.debug(`Macro ${op} expanded to: ${sexpToString(expanded)}`);
    
    // Recursively evaluate the result
    return evaluateForMacro(expanded, env, logger);
  } catch (error) {
    logger.error(`Error expanding macro ${op}: ${error.message}`);
    throw error;
  }
}

/**
 * Evaluate a function call
 */
function evaluateFunctionCall(list: SList, env: Environment, logger: Logger): SExp {
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
        logger.warn(`Error calling function ${op} during macro expansion: ${callError.message}`);
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
}

/**
 * Convert a JavaScript value to an S-expression
 */
function convertJsValueToSExp(value: any): SExp {
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
}

/**
 * Process a quasiquoted expression (backtick syntax)
 */
function evaluateQuasiquote(expr: SList, env: Environment, logger: Logger): SExp {
  // The first element is 'quasiquote', the second is the expression to process
  if (expr.elements.length !== 2) {
    throw new Error('quasiquote requires exactly one argument');
  }
  
  const quasiquotedExpr = expr.elements[1];
  logger.debug(`Evaluating quasiquote: ${sexpToString(quasiquotedExpr)}`);

  // Delegate to helper function for actual processing
  return processQuasiquotedExpr(quasiquotedExpr, env, logger);
}

/**
 * Process a quasiquoted expression, handling unquote and unquote-splicing
 */
function processQuasiquotedExpr(expr: SExp, env: Environment, logger: Logger): SExp {
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
      throw new Error('unquote requires exactly one argument');
    }
    // Evaluate the unquoted expression
    logger.debug(`Evaluating unquote: ${sexpToString(list.elements[1])}`);
    return evaluateForMacro(list.elements[1], env, logger);
  }

  // Handle unquote-splicing (error if not inside a list)
  if (isSymbol(first) && (first as SSymbol).name === 'unquote-splicing') {
    throw new Error('unquote-splicing not in list context');
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
        throw new Error('unquote-splicing requires exactly one argument');
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
}

/**
 * Expand all macros in a list of S-expressions
 */
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  currentFile: string | undefined = undefined,
  options: MacroExpanderOptions = {}
): SExp[] {
  const logger = new Logger(options.verbose || false);
  const maxPasses = options.maxPasses || 20; // Reasonable limit to prevent infinite expansion
  
  logger.debug(`Starting macro expansion on ${exprs.length} expressions`);

  // If we have a current file, set it in the environment
  if (currentFile) {
    env.setCurrentFile(currentFile);
    logger.debug(`Setting current file to: ${currentFile}`);
  }

  // First pass: register all global macro definitions
  for (const expr of exprs) {
    if (isDefMacro(expr) && isList(expr)) {
      try {
        defineMacro(expr as SList, env, logger);
      } catch (error) {
        logger.error(`Error defining global macro: ${error.message}`);
      }
    }
  }
  
  // If we have a current file, also register module-level macros
  if (currentFile) {
    for (const expr of exprs) {
      if (isUserMacro(expr) && isList(expr)) {
        try {
          defineUserMacro(expr as SList, currentFile, env, logger);
        } catch (error) {
          logger.error(`Error defining user macro: ${error.message}`);
        }
      }
    }
  }

  // Multiple passes: Expand all macros until no more expansions occur
  let currentExprs = [...exprs];
  let expansionOccurred = true;
  let passCount = 0;
  
  while (expansionOccurred && passCount < maxPasses) {
    expansionOccurred = false;
    passCount++;
    
    logger.debug(`Macro expansion pass ${passCount}`);
    
    // Process each expression, expanding macros at all levels
    currentExprs = currentExprs.map(expr => {
      // Skip macro definitions in expansion phase
      if (isDefMacro(expr) || isUserMacro(expr)) {
        return expr;
      }
      
      try {
        const expanded = expandExpr(expr, env, logger, options);
        
        // Check if expansion occurred
        if (sexpToString(expanded) !== sexpToString(expr)) {
          logger.debug(`Expanded: ${sexpToString(expr)} => ${sexpToString(expanded)}`);
          expansionOccurred = true;
        }
        
        return expanded;
      } catch (error) {
        logger.error(`Error expanding expression: ${error.message}`);
        logger.error(`Problematic expression: ${sexpToString(expr)}`);
        return expr;
      }
    });
  }
  
  if (passCount >= maxPasses) {
    logger.warn(`Macro expansion reached maximum passes (${maxPasses}). Check for infinite recursion.`);
  }
  
  logger.debug(`Completed macro expansion after ${passCount} passes`);
  
  // Filter out macro definitions from the final result
  // They shouldn't be in the output JavaScript
  currentExprs = currentExprs.filter(expr => {
    // Remove user-level macro definitions
    if (isUserMacro(expr)) {
      logger.debug(`Filtering out user macro definition: ${sexpToString(expr)}`);
      return false;
    }
    
    // Optionally remove defmacro as well
    if (isDefMacro(expr)) {
      logger.debug(`Filtering out system macro definition: ${sexpToString(expr)}`);
      return false;
    }
    
    // Keep everything else
    return true;
  });
  
  // Clean up environment when done
  if (currentFile) {
    env.setCurrentFile(null);
  }
  
  return currentExprs;
}

/**
 * Recursively expand macros in an expression
 */
function expandExpr(
  expr: SExp,
  env: Environment,
  logger: Logger,
  options: MacroExpanderOptions = {},
  depth: number = 0
): SExp {
  const maxDepth = options.maxExpandDepth || 100;
  if (depth > maxDepth) {
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
      try {
        // Expand the macro
        const expanded = expandMacroCall(list, env, logger, options);
        
        // Recursively expand the result (with increased depth)
        return expandExpr(expanded, env, logger, options, depth + 1);
      } catch (error) {
        logger.error(`Error expanding macro ${op}: ${error.message}`);
        return expr; // Return original on error
      }
    }
  }
  
  // Not a macro call, expand each element recursively
  const expandedElements = list.elements.map(elem => expandExpr(elem, env, logger, options, depth + 1));
  
  // Create a new list with the expanded elements
  return createList(...expandedElements);
}

/**
 * Expand a macro call
 */
function expandMacroCall(
  list: SList,
  env: Environment,
  logger: Logger,
  options: MacroExpanderOptions
): SExp {
  const op = (list.elements[0] as SSymbol).name;
  const macroFn = env.getMacro(op);
  
  if (!macroFn) {
    return list; // Not a macro call after all
  }
  
  try {
    // Check if this is a user-level macro 
    const isUserLevel = Object.getOwnPropertyDescriptor(macroFn, 'isUserMacro')?.value === true;
    const sourceFile = Object.getOwnPropertyDescriptor(macroFn, 'sourceFile')?.value;
    
    // Log appropriate information based on macro type
    if (isUserLevel && sourceFile) {
      logger.debug(`Expanding user-level macro ${op} from ${sourceFile}`);
    } else {
      logger.debug(`Expanding global macro ${op}`);
    }
    
    // Get the macro arguments (don't expand them yet)
    const args = list.elements.slice(1)
    
    // Apply the macro to get the expanded form
    return macroFn(args, env);
  } catch (error) {
    logger.error(`Error expanding macro ${op}: ${error.message}`);
    throw error;
  }
}

/**
 * Expand a single S-expression and all its nested macros
 */
export function expandMacro(
  expr: SExp,
  env: Environment,
  logger: Logger,
  options: MacroExpanderOptions = {}
): SExp {
  return expandExpr(expr, env, logger, options);
}