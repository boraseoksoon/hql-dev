// src/s-exp/macro.ts - Optimized with improved error handling

import { 
  SExp, SSymbol, SList, 
  isSymbol, isList, isLiteral, isDefMacro, isUserMacro,
  createList, createLiteral, createNilLiteral, sexpToString
} from './types.ts';
import { Environment } from '../environment.ts';
import { Logger } from '../logger.ts';
import { MacroFn } from '../environment.ts';
import { MacroError } from '../transpiler/errors.ts';

// Caching system for macro expansion
const macroExpansionCache = new Map<string, SExp>();
const maxCacheSize = 5000; // Prevent unbounded growth

/**
 * Options for macro expansion
 */
interface MacroExpanderOptions {
  verbose?: boolean;
  maxExpandDepth?: number;
  maxPasses?: number; // Maximum number of expansion passes
  currentFile?: string; // Track the current file being processed
  useCache?: boolean; // Toggle caching for testing or special cases
}

/**
 * Define a user-level macro in the module scope
 * Enhanced with MacroError for better diagnostics
 */
export function defineUserMacro(macroForm: SList, filePath: string, env: Environment, logger: Logger): void {
  try {
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
    try {
      const { params, restParam } = processParamList(paramsExp, logger);

      // Get macro body (all remaining forms)
      const body = macroForm.elements.slice(3);

      // Create macro function (same as in defineMacro)
      const macroFn = createMacroFunction(macroName, params, restParam, body, logger, filePath);

      // Register the macro in the module's registry
      env.defineModuleMacro(filePath, macroName, macroFn);
      logger.debug(`Defined user-level macro ${macroName} in ${filePath}`);
    } catch (error) {
      throw new MacroError(
        `Error processing parameters for macro ${macroName}: ${error instanceof Error ? error.message : String(error)}`,
        macroName,
        filePath,
        error instanceof Error ? error : undefined
      );
    }
  } catch (error) {
    // Convert generic errors to MacroError if needed
    if (!(error instanceof MacroError)) {
      throw new MacroError(
        `Failed to define macro: ${error instanceof Error ? error.message : String(error)}`,
        macroForm.elements[1]?.type === 'symbol' ? (macroForm.elements[1] as SSymbol).name : 'unknown',
        filePath,
        error instanceof Error ? error : undefined
      );
    }
    throw error;
  }
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
  const macroFn = (args: SExp[], callEnv: Environment): SExp => {
    const source = sourceFile ? ` from ${sourceFile}` : '';
    logger.debug(`Expanding ${sourceFile ? 'module ' : ''}macro ${macroName}${source} with ${args.length} args`);
    
    try {
      // Create new environment for macro expansion
      const macroEnv = createMacroEnv(callEnv, params, restParam, args, logger);

      // Evaluate body expressions with error handling
      let result: SExp = createNilLiteral();
      
      for (const expr of body) {
        try {
          result = evaluateForMacro(expr, macroEnv, logger);
        } catch (error) {
          // Provide rich error context for macro expansion failures
          throw new MacroError(
            `Error evaluating macro body expression: ${error instanceof Error ? error.message : String(error)}`,
            macroName,
            sourceFile,
            error instanceof Error ? error : undefined
          );
        }
      }

      logger.debug(`Macro ${macroName} expanded to: ${sexpToString(result)}`);
      return result;
    } catch (error) {
      if (error instanceof MacroError) {
        throw error;
      }
      
      throw new MacroError(
        `Error in macro ${macroName}: ${error instanceof Error ? error.message : String(error)}`,
        macroName,
        sourceFile,
        error instanceof Error ? error : undefined
      );
    }
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
}

/**
 * Register a macro definition in the environment
 */
export function defineMacro(macroForm: SList, env: Environment, logger: Logger): void {
  try {
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

    try {
      // Process parameter list, handling rest parameters
      const { params, restParam } = processParamList(paramsExp, logger);

      // Get macro body (all remaining forms)
      const body = macroForm.elements.slice(3);

      // Create macro function
      const macroFn = createMacroFunction(macroName, params, restParam, body, logger);

      // Register the macro in the environment
      env.defineMacro(macroName, macroFn);
      logger.debug(`Registered global macro: ${macroName}`);
    } catch (error) {
      throw new MacroError(
        `Error processing parameters for macro ${macroName}: ${error instanceof Error ? error.message : String(error)}`,
        macroName,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  } catch (error) {
    // Convert generic errors to MacroError if needed
    if (!(error instanceof MacroError)) {
      throw new MacroError(
        `Failed to define macro: ${error instanceof Error ? error.message : String(error)}`,
        macroForm.elements[1]?.type === 'symbol' ? (macroForm.elements[1] as SSymbol).name : 'unknown',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
    throw error;
  }
}

/**
 * Process a parameter list, handling rest parameters
 */
export function processParamList(paramsExp: SList, logger: Logger): { params: string[], restParam: string | null } {
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
}

/**
 * Create a new environment for macro expansion with parameter bindings
 */
function createMacroEnv(
  parent: Environment, 
  params: string[], 
  restParam: string | null, 
  args: SExp[], 
  logger: Logger
): Environment {
  try {
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
  } catch (error) {
    throw new Error(`Error creating macro environment: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    logger.error(`Error evaluating expression for macro: ${error instanceof Error ? error.message : String(error)}`);
    logger.error(`Problematic expression: ${sexpToString(expr)}`);
    
    // Add more context to the error
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Error in macro expression: ${message}\nExpression: ${sexpToString(expr)}`);
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
    // For symbol lookup failures, provide more context in debug mode
    logger.debug(`Symbol lookup failed for '${expr.name}' during macro evaluation`);
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
        try {
          return evaluateQuote(expr, env, logger);
        } catch (error) {
          throw new MacroError(
            `Error evaluating 'quote': ${error instanceof Error ? error.message : String(error)}`,
            "quote",
            undefined,
            error instanceof Error ? error : undefined
          );
        }
      case 'quasiquote':
        try {
          return evaluateQuasiquote(expr, env, logger);
        } catch (error) {
          throw new MacroError(
            `Error evaluating 'quasiquote': ${error instanceof Error ? error.message : String(error)}`,
            "quasiquote",
            undefined,
            error instanceof Error ? error : undefined
          );
        }
      case 'unquote':
      case 'unquote-splicing':
        throw new MacroError(
          `${op} not in quasiquote context`,
          op
        );
      case 'if':
        try {
          return evaluateIf(expr, env, logger);
        } catch (error) {
          throw new MacroError(
            `Error evaluating 'if': ${error instanceof Error ? error.message : String(error)}`,
            "if",
            undefined,
            error instanceof Error ? error : undefined
          );
        }
      case 'cond':
        try {
          return evaluateCond(expr, env, logger);
        } catch (error) {
          throw new MacroError(
            `Error evaluating 'cond': ${error instanceof Error ? error.message : String(error)}`,
            "cond",
            undefined,
            error instanceof Error ? error : undefined
          );
        }
      case 'let':
        try {
          return evaluateLet(expr, env, logger);
        } catch (error) {
          throw new MacroError(
            `Error evaluating 'let': ${error instanceof Error ? error.message : String(error)}`,
            "let",
            undefined,
            error instanceof Error ? error : undefined
          );
        }
      case 'def':
      case 'defn':
      case 'fn':
        return createNilLiteral(); // Ignored during macro evaluation
    }
    
    // Check for macro call
    if (env.hasMacro(op)) {
      try {
        return evaluateMacroCall(expr, env, logger);
      } catch (error) {
        throw new MacroError(
          `Error evaluating macro '${op}': ${error instanceof Error ? error.message : String(error)}`,
          op,
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    }
    
    // Try to look up as a function
    try {
      return evaluateFunctionCall(expr, env, logger);
    } catch (error) {
      throw new MacroError(
        `Error evaluating function call '${op}': ${error instanceof Error ? error.message : String(error)}`,
        op,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
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
    throw new MacroError('quote requires exactly one argument', 'quote');
  }
  return list.elements[1];
}

/**
 * Evaluate a conditional (if) expression
 */
function evaluateIf(list: SList, env: Environment, logger: Logger): SExp {
  if (list.elements.length < 3 || list.elements.length > 4) {
    throw new MacroError(
      `'if' requires 2 or 3 arguments, got ${list.elements.length - 1}`,
      'if'
    );
  }

  // Evaluate the test condition
  try {
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
      try {
        return evaluateForMacro(list.elements[2], env, logger);
      } catch (error) {
        throw new MacroError(
          `Error evaluating 'if' then-branch: ${error instanceof Error ? error.message : String(error)}`,
          "if",
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    } else if (list.elements.length > 3) {
      // Evaluate "else" branch if present
      try {
        return evaluateForMacro(list.elements[3], env, logger);
      } catch (error) {
        throw new MacroError(
          `Error evaluating 'if' else-branch: ${error instanceof Error ? error.message : String(error)}`,
          "if",
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    } else {
      // No else branch, return nil
      return createNilLiteral();
    }
  } catch (error) {
    throw new MacroError(
      `Error evaluating 'if' condition: ${error instanceof Error ? error.message : String(error)}`,
      "if",
      undefined,
      error instanceof Error ? error : undefined
    );
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
      throw new MacroError('cond clauses must be lists', 'cond');
    }
    
    const clauseList = clause as SList;
    if (clauseList.elements.length < 2) {
      throw new MacroError('cond clauses must have a test and a result', 'cond');
    }
    
    try {
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
        try {
          return evaluateForMacro(clauseList.elements[1], env, logger);
        } catch (error) {
          throw new MacroError(
            `Error evaluating cond clause result: ${error instanceof Error ? error.message : String(error)}`,
            'cond',
            undefined,
            error instanceof Error ? error : undefined
          );
        }
      }
    } catch (error) {
      throw new MacroError(
        `Error evaluating cond clause test: ${error instanceof Error ? error.message : String(error)}`,
        'cond',
        undefined,
        error instanceof Error ? error : undefined
      );
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
  
  try {
    // Create a new environment for let bindings
    const letEnv = env.extend();
    
    // Evaluate bindings
    for (let i = 0; i < bindingsList.elements.length; i += 2) {
      const name = bindingsList.elements[i];
      const value = bindingsList.elements[i + 1];
      
      if (!isSymbol(name)) {
        throw new MacroError('let binding names must be symbols', 'let');
      }
      
      try {
        const evalValue = evaluateForMacro(value, letEnv, logger);
        letEnv.define((name as SSymbol).name, evalValue);
      } catch (error) {
        throw new MacroError(
          `Error evaluating binding value for '${(name as SSymbol).name}': ${error instanceof Error ? error.message : String(error)}`,
          'let',
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    }
    
    // Evaluate body in the new environment
    let result: SExp = createNilLiteral();
    for (let i = 2; i < list.elements.length; i++) {
      try {
        result = evaluateForMacro(list.elements[i], letEnv, logger);
      } catch (error) {
        throw new MacroError(
          `Error evaluating let body form #${i-1}: ${error instanceof Error ? error.message : String(error)}`,
          'let',
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    }
    
    return result;
  } catch (error) {
    if (error instanceof MacroError) {
      throw error;
    }
    throw new MacroError(
      `Error in let: ${error instanceof Error ? error.message : String(error)}`,
      'let',
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Evaluate a macro call
 */
function evaluateMacroCall(list: SList, env: Environment, logger: Logger): SExp {
  const op = (list.elements[0] as SSymbol).name;
  const macroFn = env.getMacro(op);
  
  if (!macroFn) {
    throw new MacroError(`Macro not found: ${op}`, op);
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
    logger.error(`Error expanding macro ${op}: ${error instanceof Error ? error.message : String(error)}`);
    
    if (error instanceof MacroError) {
      throw error;
    }
    
    // Add more context about the macro call
    throw new MacroError(
      `Error expanding macro '${op}': ${error instanceof Error ? error.message : String(error)}`,
      op,
      undefined,
      error instanceof Error ? error : undefined
    );
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
        try {
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
        } catch (error) {
          throw new Error(`Error evaluating argument: ${error instanceof Error ? error.message : String(error)}`);
        }
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
    throw new MacroError('quasiquote requires exactly one argument', 'quasiquote');
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
  } catch (error) {
    if (error instanceof MacroError) {
      throw error;
    }
    throw new MacroError(
      `Error processing quasiquote: ${error instanceof Error ? error.message : String(error)}`,
      'quasiquote',
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Expand all macros in a list of S-expressions
 * Improved version that avoids redundant processing
 */
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  options: MacroExpanderOptions = {}
): SExp[] {
  const logger = new Logger(options.verbose || false);
  const maxPasses = options.maxPasses || 20; // Reasonable limit to prevent infinite expansion
  const currentFile = options.currentFile;
  const useCache = options.useCache !== false; // Default to using cache
  
  logger.debug(`Starting macro expansion on ${exprs.length} expressions${currentFile ? ` in ${currentFile}` : ''}`);

  try {
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

    // Multiple passes: Expand all macros until no more expansions occur
    let currentExprs = [...exprs];
    let expansionOccurred = true;
    let passCount = 0;
    
    while (expansionOccurred && passCount < maxPasses) {
      expansionOccurred = false;
      passCount++;
      
      logger.debug(`Macro expansion pass ${passCount}`);
      
      // Process each expression, expanding macros at all levels
      const newExprs: SExp[] = [];
      
      for (let i = 0; i < currentExprs.length; i++) {
        const expr = currentExprs[i];
        
        // Skip macro definitions in expansion phase
        if (isDefMacro(expr) || isUserMacro(expr)) {
          newExprs.push(expr);
          continue;
        }
        
        try {
          // Check cache for this expression if caching is enabled
          let expanded: SExp;
          if (useCache) {
            const exprStr = sexpToString(expr);
            if (macroExpansionCache.has(exprStr)) {
              expanded = macroExpansionCache.get(exprStr)!;
            } else {
              expanded = expandExpr(expr, env, logger, options);
              
              // Cache the result
              macroExpansionCache.set(exprStr, expanded);
              
              // Prevent unbounded growth of the cache
              if (macroExpansionCache.size > maxCacheSize) {
                // Simple strategy: clear half the cache when it gets too large
                const keys = [...macroExpansionCache.keys()];
                for (let i = 0; i < keys.length / 2; i++) {
                  macroExpansionCache.delete(keys[i]);
                }
              }
            }
          } else {
            expanded = expandExpr(expr, env, logger, options);
          }
          
          // Check if expansion occurred
          if (sexpToString(expanded) !== sexpToString(expr)) {
            logger.debug(`Expanded: ${sexpToString(expr)} => ${sexpToString(expanded)}`);
            expansionOccurred = true;
          }
          
          newExprs.push(expanded);
        } catch (error) {
          // Enhance error with context about which expression failed
          let macroName = '';
          if (isList(expr) && expr.elements.length > 0 && isSymbol(expr.elements[0])) {
            macroName = (expr.elements[0] as SSymbol).name;
          }
          
          logger.error(`Error expanding expression #${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
          logger.error(`Problematic expression: ${sexpToString(expr)}`);
          
          if (error instanceof MacroError) {
            throw error;
          }
          
          throw new MacroError(
            `Expansion failed: ${error instanceof Error ? error.message : String(error)}`,
            macroName,
            currentFile,
            error instanceof Error ? error : undefined
          );
        }
      }
      
      currentExprs = newExprs;
    }
    
    if (passCount >= maxPasses) {
      logger.warn(`Macro expansion reached maximum passes (${maxPasses}). Check for infinite recursion.`);
    }
    
    logger.debug(`Completed macro expansion after ${passCount} passes`);
    
    // Filter out macro definitions from the final result
    currentExprs = filterMacroDefinitions(currentExprs, logger);
    
    // Clean up environment when done
    if (currentFile) {
      env.setCurrentFile(null);
      logger.debug(`Clearing current file`);
    }
    
    return currentExprs;
  } catch (error) {
    // Clean up environment even if there's an error
    if (currentFile) {
      env.setCurrentFile(null);
    }
    
    // Enhance error message
    if (!(error instanceof MacroError)) {
      throw new MacroError(
        `Macro expansion failed: ${error instanceof Error ? error.message : String(error)}`,
        '',
        currentFile,
        error instanceof Error ? error : undefined
      );
    }
    
    throw error;
  }
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
}

/**
 * Filter out macro definitions (both system and user-level)
 */
function filterMacroDefinitions(exprs: SExp[], logger: Logger): SExp[] {
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
        logger.error(`Error expanding macro ${op}: ${error instanceof Error ? error.message : String(error)}`);
        
        if (error instanceof MacroError) {
          throw error;
        }
        
        throw new MacroError(
          `Error expanding macro '${op}': ${error instanceof Error ? error.message : String(error)}`,
          op,
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    }
  }
  
  // Not a macro call, expand each element recursively
  try {
    const expandedElements = list.elements.map(elem => 
      expandExpr(elem, env, logger, options, depth + 1)
    );
    
    // Create a new list with the expanded elements
    return createList(...expandedElements);
  } catch (error) {
    if (error instanceof MacroError) {
      throw error;
    }
    
    throw new MacroError(
      `Error expanding expression: ${error instanceof Error ? error.message : String(error)}`,
      "",
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Expand a macro call, correctly handling aliases
 */
function expandMacroCall(
  list: SList,
  env: Environment,
  logger: Logger,
  options: MacroExpanderOptions
): SExp {
  const op = (list.elements[0] as SSymbol).name;
  
  // Get the macro function, correctly resolving aliases
  const macroFn = env.getMacro(op);
  
  if (!macroFn) {
    throw new MacroError(`Macro not found: ${op}`, op);
  }
  
  try {
    // Check if this is a user-level macro from metadata
    if (Object.getOwnPropertyDescriptor(macroFn, 'isUserMacro')?.value === true) {
      const sourceFile = Object.getOwnPropertyDescriptor(macroFn, 'sourceFile')?.value;
      logger.debug(`Expanding user-level macro ${op} from ${sourceFile}`);
    } else {
      logger.debug(`Expanding global macro ${op}`);
    }
    
    // Get the macro arguments (don't expand them yet)
    const args = list.elements.slice(1);
    
    // Apply the macro
    return macroFn(args, env);
  } catch (error) {
    if (error instanceof MacroError) {
      throw error;
    }
    
    throw new MacroError(
      `Error expanding macro ${op}: ${error instanceof Error ? error.message : String(error)}`,
      op,
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}