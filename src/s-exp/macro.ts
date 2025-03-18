// src/s-exp/macro.ts - Macro expansion system for S-expressions

import { 
  SExp, SSymbol, SList, 
  isSymbol, isList, isLiteral, isDefMacro,
  createSymbol, createList, createLiteral, createNilLiteral, sexpToString 
} from './types.ts';
import { Environment } from '../environment.ts';
import { Logger } from '../logger.ts';

/**
* Options for macro expansion
*/
interface MacroExpanderOptions {
  verbose?: boolean;
  maxExpandDepth?: number;
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
    // Create new environment for macro expansion
    const macroEnv = createMacroEnv(callEnv, params, args, logger);

    // Evaluate body expressions
    let result: SExp = createNilLiteral();
    for (const expr of body) {
      result = evaluateForMacro(expr, macroEnv, logger);
    }

    return result;
  };

  // Tag as a macro function
  Object.defineProperty(macroFn, 'isMacro', { value: true });

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
*/
function createMacroEnv(parent: Environment, 
    { params, restParam }: { params: string[], restParam: string | null }, args: SExp[], 
    logger: Logger): Environment {
  const env = new Environment(parent, logger); // Using unified environment

  // Bind positional parameters
  for (let i = 0; i < params.length; i++) {
    env.define(params[i], i < args.length ? args[i] : createNilLiteral());
  }

  // Bind rest parameter if present
  if (restParam !== null) {
    const restArgs = args.slice(params.length);
    env.define(restParam, createList(...restArgs));
  }

  return env;
}

/**
* Evaluate an S-expression for macro expansion
*/
export function evaluateForMacro(expr: SExp, env: Environment, logger: Logger): SExp {
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
    } catch (error) {
      return expr;
    }
  }

  // Handle lists
  if (isList(expr)) {
    // Empty list
    if (expr.elements.length === 0) {
      return expr;
    }

    const first = expr.elements[0];

    // Handle special forms
    if (isSymbol(first)) {
      const op = first.name;
      
      // Handle quote
      if (op === 'quote') {
        if (expr.elements.length !== 2) {
          throw new Error('quote requires exactly one argument');
        }
        return expr.elements[1];
      }
      
      // Handle quasiquote
      if (op === 'quasiquote') {
        if (expr.elements.length !== 2) {
          throw new Error('quasiquote requires exactly one argument');
        }
        return evaluateQuasiquote(expr.elements[1], env, logger);
      }
      
      // Handle unquote and unquote-splicing (error outside of quasiquote)
      if (op === 'unquote' || op === 'unquote-splicing') {
        throw new Error(`${op} not in quasiquote context`);
      }
      
      // Handle if form
      if (op === 'if') {
        return evaluateIf(expr, env, logger);
      }
      
      // Handle def form
      if (op === 'def') {
        return evaluateDef(expr, env, logger);
      }
      
      // Handle cond form
      if (op === 'cond') {
        return evaluateCond(expr, env, logger);
      }
      
      // Handle do form
      if (op === 'do') {
        return evaluateDo(expr, env, logger);
      }
      
      // Check for macro call
      if (env.hasMacro(op)) {
        const macroFn = env.getMacro(op);
        if (macroFn) {
          // Get macro arguments (don't evaluate them)
          const args = expr.elements.slice(1);
          
          // Apply the macro
          try {
            const expanded = macroFn(args, env);
            logger.debug(`Macro ${op} expanded to: ${sexpToString(expanded)}`);
            
            // Recursively expand the result
            return evaluateForMacro(expanded, env, logger);
          } catch (error) {
            throw new Error(`Error expanding macro ${op}: ${error.message}`);
          }
        }
      }
      
      // Check for dot notation in the operator
      if (op.includes('.') && !op.startsWith('.')) {
        return evaluateDotNotation(expr, env, logger);
      }
    }

    // Return list as is for other cases
    return expr;
  }

  // Unknown expression type
  return expr;
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
  const isTruthy = isLiteral(test) 
    ? test.value !== false && test.value !== null 
    : true;

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

  // Define in the environment
  env.define(name, value);

  // Return the value
  return value;
}

/**
* Evaluate a cond expression
*/
function evaluateCond(expr: SList, env: Environment, logger: Logger): SExp {
  // Format: (cond (test1 expr1) (test2 expr2) ...)
  for (let i = 1; i < expr.elements.length; i++) {
    const clause = expr.elements[i];

    if (!isList(clause) || clause.elements.length !== 2) {
      throw new Error('cond clauses must be lists with two elements');
    }

    const test = clause.elements[0];
    const result = clause.elements[1];

    // Evaluate the test condition
    const testValue = evaluateForMacro(test, env, logger);

    // Check if truthy
    const isTruthy = isLiteral(testValue) 
      ? testValue.value !== false && testValue.value !== null
      : true;

    if (isTruthy) {
      // Evaluate the result expression and return it
      return evaluateForMacro(result, env, logger);
    }
  }

  // No matching clause, return nil
  return createNilLiteral();
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
* Evaluate a dot notation expression (obj.method or obj.property)
*/
function evaluateDotNotation(expr: SList, env: Environment, logger: Logger): SExp {
  const op = (expr.elements[0] as SSymbol).name;
  const [objectName, propName] = op.split('.');

  // Check if this is a method call or a property access
  if (expr.elements.length > 1) {
    // Method call: (obj.method arg1 arg2 ...)
    const args = expr.elements.slice(1).map(arg => evaluateForMacro(arg, env, logger));

    return createList(
      createSymbol('js-call'),
      createSymbol(objectName),
      createLiteral(propName),
      ...args
    );
  } else {
    // Property access: (obj.property)
    return createList(
      createSymbol('js-get'),
      createSymbol(objectName),
      createLiteral(propName)
    );
  }
}

/**
* Evaluate a quasiquoted expression
*/
function evaluateQuasiquote(expr: SExp, env: Environment, logger: Logger): SExp {
  logger.debug(`Evaluating quasiquote: ${sexpToString(expr)}`);

  // Base case: not a list
  if (!isList(expr)) {
    return expr;
  }

  // Empty list
  if (expr.elements.length === 0) {
    return expr;
  }

  const first = expr.elements[0];

  // Handle unquote
  if (isSymbol(first) && first.name === 'unquote') {
    if (expr.elements.length !== 2) {
      throw new Error('unquote requires exactly one argument');
    }
    return evaluateForMacro(expr.elements[1], env, logger);
  }

  // Handle unquote-splicing (error if not inside a list)
  if (isSymbol(first) && first.name === 'unquote-splicing') {
    throw new Error('unquote-splicing not in list context');
  }

  // Process list contents
  const processedElements: SExp[] = [];

  for (let i = 0; i < expr.elements.length; i++) {
    const element = expr.elements[i];

    // Handle unquote-splicing inside a list
    if (isList(element) && 
      element.elements.length > 0 && 
      isSymbol(element.elements[0]) && 
      element.elements[0].name === 'unquote-splicing') {
      
      if (element.elements.length !== 2) {
        throw new Error('unquote-splicing requires exactly one argument');
      }
      
      // Evaluate the spliced expression
      const spliced = evaluateForMacro(element.elements[1], env, logger);
      
      // The result should be a list that we can splice in
      if (isList(spliced)) {
        processedElements.push(...spliced.elements);
      } else {
        throw new Error('unquote-splicing requires a list result');
      }
    } else {
      // Recursively process the element
      processedElements.push(evaluateQuasiquote(element, env, logger));
    }
  }

  return createList(...processedElements);
}

/**
 * Post-process a macro expansion result to correctly handle quoted operations
 * This is critical for macros that expand to operations like (+ x 1)
 */
function postProcessMacroResult(sexp: SExp, env: Environment, logger: Logger): SExp {
  // Handle the special case of (list 'op arg1 arg2 ...) -> (op arg1 arg2 ...)
  if (isList(sexp)) {
    const list = sexp as SList;
    
    // Check for the pattern: (list 'op arg1 arg2 ...)
    if (list.elements.length >= 3 && 
        isSymbol(list.elements[0]) && 
        list.elements[0].name === 'list') {
      
      // Check if the first argument is a quoted symbol
      const firstArg = list.elements[1];
      if (isList(firstArg) && 
          firstArg.elements.length === 2 && 
          isSymbol(firstArg.elements[0]) && 
          firstArg.elements[0].name === 'quote' && 
          isSymbol(firstArg.elements[1])) {
        
        // Extract the operation name from 'op
        const opName = (firstArg.elements[1] as SSymbol).name;
        logger.debug(`Converting list construction to direct operation: ${opName}`);
        
        // Create a new list with the operation in first position
        return createList(
          createSymbol(opName),
          ...list.elements.slice(2).map(arg => postProcessMacroResult(arg, env, logger))
        );
      }
    }
    
    // Recursively process all elements in the list
    return createList(
      ...list.elements.map(elem => postProcessMacroResult(elem, env, logger))
    );
  }
  
  // For other types, return as is
  return sexp;
}

/**
* Expand all macros in a list of S-expressions
*/
export function expandMacros(exprs: SExp[], env: Environment, options: MacroExpanderOptions = {}): SExp[] {
  const logger = new Logger(options.verbose || false);
  logger.debug(`Expanding macros in ${exprs.length} expressions`);

  // First pass: register macro definitions
  for (const expr of exprs) {
    if (isDefMacro(expr) && isList(expr)) {
      try {
        defineMacro(expr as SList, env, logger);
      } catch (error) {
        logger.error(`Error defining macro: ${error.message}`);
      }
    }
  }

  // Second pass: expand all macros
  return exprs.map(expr => expandMacro(expr, env, logger, options));
}

/**
* Expand a single S-expression, including any nested macros
*/
export function expandMacro(expr: SExp, env: Environment, logger: Logger, 
                    options: MacroExpanderOptions = {}, depth: number = 0): SExp {
  const maxDepth = options.maxExpandDepth || 100;

  if (depth > maxDepth) {
    throw new Error(`Macro expansion exceeded maximum depth of ${maxDepth}`);
  }

  // Skip macro definitions
  if (isDefMacro(expr)) {
    return expr;
  }

  // Expand lists
  if (isList(expr)) {
    const list = expr as SList;

    // Empty list
    if (list.elements.length === 0) {
      return list;
    }

    const first = list.elements[0];

    // Check for macro call
    if (isSymbol(first)) {
      const macroName = first.name;
      logger.debug(`Checking if ${macroName} is a macro`);
      
      if (env.hasMacro(macroName)) {
        const macroFn = env.getMacro(macroName);
        
        if (macroFn) {
          logger.debug(`Expanding macro ${macroName} at depth ${depth}`);
          
          const macroArgs = list.elements.slice(1);
          
          try {
            // Apply the macro
            const expanded = macroFn(macroArgs, env);
            logger.debug(`Macro expansion result: ${sexpToString(expanded)}`);
            
            // Recursively expand the result
            return expandMacro(expanded, env, logger, options, depth + 1);
          } catch (error) {
            logger.error(`Error expanding macro ${macroName}: ${error.message}`);
            throw error;
          }
        }
      }
      
      // Try sanitized name if original not found
      const sanitizedMacroName = macroName.replace(/-/g, '_');
      if (sanitizedMacroName !== macroName && env.hasMacro(sanitizedMacroName)) {
        const macroFn = env.getMacro(sanitizedMacroName);
        
        if (macroFn) {
          logger.debug(`Expanding macro with sanitized name ${sanitizedMacroName} at depth ${depth}`);
          
          const macroArgs = list.elements.slice(1);
          
          try {
            // Apply the macro
            const expanded = macroFn(macroArgs, env);
            logger.debug(`Macro expansion result: ${sexpToString(expanded)}`);
            
            // Recursively expand the result
            return expandMacro(expanded, env, logger, options, depth + 1);
          } catch (error) {
            logger.error(`Error expanding macro ${sanitizedMacroName}: ${error.message}`);
            throw error;
          }
        }
      }
    }

    // Expand each element
    return createList(
      ...list.elements.map(elem => expandMacro(elem, env, logger, options, depth + 1))
    );
  }

  // Non-list expressions stay the same
  return expr;
}