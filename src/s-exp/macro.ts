// src/s-exp/macro.ts
import { 
  SExp, SSymbol, SList, 
  isSymbol, isList, isLiteral, isDefMacro,
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
}

/**
 * Register a macro definition in the environment
 */
export function defineMacro(macroForm: SList, env: Environment, logger: Logger): void {
  // Parse macro definition: (defmacro name [params...] body...)
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
  const params = processParamList(paramsExp, logger);

  // Get macro body (all remaining forms)
  const body = macroForm.elements.slice(3);

  // Create macro function
  const macroFn = (args: SExp[], callEnv: Environment): SExp => {
    logger.debug(`Expanding macro ${macroName} with ${args.length} args`);
    
    // Create new environment for macro expansion
    const macroEnv = createMacroEnv(callEnv, params, args, logger);

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
  logger.debug(`Registered macro: ${macroName}`);
}

/**
 * Process a parameter list, handling rest parameters
 */
function processParamList(paramsExp: SList, logger: Logger): { params: string[], restParam: string | null } {
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
 * IMPROVED version with better rest parameter handling
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

  // Bind rest parameter if present - FIXED version
  if (restParam !== null) {
    // Get the rest arguments
    const restArgs = args.slice(params.length);
    logger.debug(`Creating rest parameter '${restParam}' with ${restArgs.length} elements`);
    
    // Special handling: Create a proper SList for the rest arguments
    const restList = createList(...restArgs);
    
    // Define special properties to identify it as a rest parameter
    Object.defineProperty(restList, 'isRestParameter', { value: true });
    
    // Define the rest parameter
    env.define(restParam, restList);
  }

  return env;
}

/**
 * Evaluate an S-expression for macro expansion
 * IMPROVED with better error handling and logging
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
    else if (isList(expr)) {
      const list = expr as SList;
      
      // Empty list
      if (list.elements.length === 0) {
        return list;
      }
      
      const first = list.elements[0];
      
      // Handle special forms
      if (isSymbol(first)) {
        const op = (first as SSymbol).name;
        
        // Handle quote
        if (op === 'quote') {
          if (list.elements.length !== 2) {
            throw new Error('quote requires exactly one argument');
          }
          return list.elements[1];
        }
        
        // Handle quasiquote
        if (op === 'quasiquote') {
          if (list.elements.length !== 2) {
            throw new Error('quasiquote requires exactly one argument');
          }
          return evaluateQuasiquote(list.elements[1], env, logger);
        }
        
        // Handle unquote and unquote-splicing (error outside of quasiquote)
        if (op === 'unquote' || op === 'unquote-splicing') {
          throw new Error(`${op} not in quasiquote context`);
        }
        
        // Handle if
        if (op === 'if') {
          return evaluateIf(list, env, logger);
        }
        
        // Handle def
        if (op === 'def') {
          return evaluateDef(list, env, logger);
        }
        
        // Handle do
        if (op === 'do') {
          return evaluateDo(list, env, logger);
        }
        
        // Handle first, second access functions for lists
        if (op === 'first' || op === 'second') {
          const argExpr = list.elements[1];
          const arg = evaluateForMacro(argExpr, env, logger);
          
          // Handle access to list items
          if (isList(arg)) {
            const index = op === 'first' ? 0 : 1;
            if ((arg as SList).elements.length > index) {
              return (arg as SList).elements[index];
            }
            return createNilLiteral();
          }
          
          // Handle string representation cases
          if (isLiteral(arg) && typeof (arg as SLiteral).value === 'string') {
            const str = (arg as SLiteral).value as string;
            logger.warn(`Trying to access ${op} of a string: "${str}"`);
          }
          
          return createNilLiteral();
        }
        
        // Check for macro call
        if (env.hasMacro(op)) {
          const macroFn = env.getMacro(op);
          if (macroFn) {
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
        }
        
        // Look up regular functions defined with defn
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
              
              // Convert result back to S-expression
              if (result === null || result === undefined) {
                return createNilLiteral();
              } else if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
                return createLiteral(result);
              } else if (Array.isArray(result)) {
                return createList(...result.map(item => {
                  if (item === null || item === undefined) return createNilLiteral();
                  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
                    return createLiteral(item);
                  }
                  if (typeof item === 'object' && 'type' in item) {
                    return item as SExp;
                  }
                  return createSymbol(String(item));
                }));
              } else if (typeof result === 'object' && result !== null && 'type' in result) {
                // Already an S-expression
                return result as SExp;
              } else {
                return createLiteral(String(result));
              }
            } catch (callError) {
              logger.warn(`Error calling function ${op} during macro expansion: ${callError.message}`);
              // Fall through to return unevaluated list
            }
          }
        } catch (lookupError) {
          // Function not found, continue with normal evaluation
        }
      }
      
      // For other cases, evaluate all elements
      return createList(
        ...list.elements.map(elem => evaluateForMacro(elem, env, logger))
      );
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
 * Evaluate an if expression
 */
function evaluateIf(expr: SList, env: Environment, logger: Logger): SExp {
  if (expr.elements.length < 3 || expr.elements.length > 4) {
    throw new Error('if requires 2 or 3 arguments');
  }

  // Evaluate the test condition
  const test = evaluateForMacro(expr.elements[1], env, logger);

  // Determine which branch to take
  let isTruthy = false;
  
  if (isLiteral(test)) {
    const value = (test as SLiteral).value;
    isTruthy = value !== false && value !== null && value !== undefined;
  } else {
    // Non-literals (lists, symbols) are considered truthy
    isTruthy = true;
  }

  if (isTruthy) {
    // Evaluate "then" branch
    return evaluateForMacro(expr.elements[2], env, logger);
  } else if (expr.elements.length > 3) {
    // Evaluate "else" branch if present
    return evaluateForMacro(expr.elements[3], env, logger);
  } else {
    // No else branch, return nil
    return createNilLiteral();
  }
}

/**
 * Evaluate a def expression
 */
function evaluateDef(expr: SList, env: Environment, logger: Logger): SExp {
  if (expr.elements.length !== 3) {
    throw new Error('def requires exactly 2 arguments');
  }

  const nameExp = expr.elements[1];
  if (!isSymbol(nameExp)) {
    throw new Error('First argument to def must be a symbol');
  }

  const name = nameExp.name;
  const valueExp = expr.elements[2];

  // Evaluate the value
  const value = evaluateForMacro(valueExp, env, logger);

  // Define in the environment so it's accessible to other macros
  if (isLiteral(value)) {
    env.define(name, value.value);
    logger.debug(`Defined variable: ${name} = ${value.value}`);
  } else {
    env.define(name, value);
    logger.debug(`Defined variable: ${name} = <complex value>`);
  }

  // Return the value
  return value;
}

/**
 * Evaluate a do expression
 */
function evaluateDo(expr: SList, env: Environment, logger: Logger): SExp {
  // (do expr1 expr2 ... exprN)
  let result: SExp = createNilLiteral();

  // Evaluate each expression in sequence
  for (let i = 1; i < expr.elements.length; i++) {
    result = evaluateForMacro(expr.elements[i], env, logger);
  }

  return result;
}

/**
 * COMPLETELY REWRITTEN quasiquote evaluation
 * This version handles unquote and unquote-splicing with robust structure preservation
 */
function evaluateQuasiquote(expr: SExp, env: Environment, logger: Logger): SExp {
  logger.debug(`Evaluating quasiquote: ${sexpToString(expr)}`);

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

  // Handle unquote
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

    // Handle unquote-splicing
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
      
      // Check if we got a list
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
      const processed = evaluateQuasiquote(element, env, logger);
      processedElements.push(processed);
    }
  }

  // Create a new list with the processed elements
  return createList(...processedElements);
}

/**
 * Expand macros in a list of S-expressions
 * IMPROVED with better phase separation and error handling
 */
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  options: MacroExpanderOptions = {}
): SExp[] {
  const logger = new Logger(options.verbose || false);
  const maxPasses = options.maxPasses || 20; // Increased to handle complex expansions
  
  logger.debug(`Starting macro expansion on ${exprs.length} expressions`);

  // First pass: register all macro definitions
  for (const expr of exprs) {
    if (isDefMacro(expr) && isList(expr)) {
      try {
        defineMacro(expr as SList, env, logger);
      } catch (error) {
        logger.error(`Error defining macro: ${error.message}`);
      }
    }
  }

  // Phase 1: Expand all macros in multiple passes until no more expansions occur
  let currentExprs = [...exprs];
  let expansionOccurred = true;
  let passCount = 0;
  
  while (expansionOccurred && passCount < maxPasses) {
    expansionOccurred = false;
    passCount++;
    
    logger.debug(`Macro expansion pass ${passCount}`);
    
    // Process each expression, expanding macros at all levels
    currentExprs = currentExprs.map(expr => {
      if (isDefMacro(expr)) {
        // Skip macro definitions in expansion phase
        return expr;
      }
      
      try {
        const expanded = expandExpr(expr, env, logger, options);
        
        // Check if expansion occurred (using string comparison is not ideal but works in practice)
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
    logger.warn(`Macro expansion reached maximum number of passes (${maxPasses}). Check for infinite recursion.`);
  }
  
  logger.debug(`Completed macro expansion after ${passCount} passes`);
  return currentExprs;
}

/**
 * Recursively expand macros in an expression
 */
function expandExpr(
  expr: SExp,
  env: Environment,
  logger: Logger,
  options: MacroExpanderOptions = {}
): SExp {
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
    
    // Skip defmacro forms during expansion
    if (op === 'defmacro') {
      return expr;
    }
    
    // Check if this is a macro call
    if (env.hasMacro(op)) {
      const macroFn = env.getMacro(op);
      
      if (macroFn) {
        try {
          // Get the macro arguments (don't expand them yet)
          const args = list.elements.slice(1);
          
          // Apply the macro to get the expanded form
          const expanded = macroFn(args, env);
          
          // Recursively expand the result to handle nested macros
          return expandExpr(expanded, env, logger, options);
        } catch (error) {
          logger.error(`Error expanding macro ${op}: ${error.message}`);
          throw error;
        }
      }
    }
  }
  
  // Not a macro call, expand each element recursively
  const expandedElements = list.elements.map(elem => expandExpr(elem, env, logger, options));
  
  // Create a new list with the expanded elements
  return createList(...expandedElements);
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