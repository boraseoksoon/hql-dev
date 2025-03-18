// src/s-exp/core-macros.ts - Core macros for the S-expression layer with unified environment

import { 
  SExp, SList,
  isSymbol, isList,
  createSymbol, createList, createLiteral, createNilLiteral
 } from './types.ts';
import { Environment } from '../environment.ts';
import { Logger } from '../logger.ts';

/**
* Initialize core macros in an environment
*/
export function initializeCoreMacros(env: Environment, logger: Logger): void {
  logger.debug('Initializing core macros');

  // defn: Define a function
  // (defn name [params...] body...)
  // Expands to: (def name (fn [params...] body...))
  env.defineMacro('defn', (args: SExp[], env: Environment): SExp => {
    if (args.length < 2) {
      throw new Error('defn requires a name, parameter list, and body');
    }

    const fnName = args[0];
    const params = args[1];
    const body = args.slice(2);

    if (!isSymbol(fnName)) {
      throw new Error('Function name must be a symbol');
    }

    if (!isList(params)) {
      throw new Error('Function parameters must be a list');
    }

    return createList(
      createSymbol('def'),
      fnName,
      createList(
        createSymbol('fn'),
        params,
        ...body
      )
    );
  });
  logger.debug('Defined defn macro');

  // or: Logical OR
  // (or expr1 expr2)
  // Expands to: (if expr1 expr1 expr2)
  env.defineMacro('or', (args: SExp[], env: Environment): SExp => {
    if (args.length === 0) {
      return createLiteral(false);
    }

    if (args.length === 1) {
      return args[0];
    }

    // Generate a unique symbol for the result
    const sym = createSymbol('or_result');

    // (let [sym expr1] (if sym sym expr2))
    return createList(
      createSymbol('let'),
      createList(sym, args[0]),
      createList(
        createSymbol('if'),
        sym,
        sym,
        args.length === 2 ? args[1] : createList(createSymbol('or'), ...args.slice(1))
      )
    );
  });
  logger.debug('Defined or macro');

  // and: Logical AND
  // (and expr1 expr2)
  // Expands to: (if expr1 expr2 expr1)
  env.defineMacro('and', (args: SExp[], env: Environment): SExp => {
    if (args.length === 0) {
      return createLiteral(true);
    }

    if (args.length === 1) {
      return args[0];
    }

    // (if expr1 (and expr2 expr3...) expr1)
    return createList(
      createSymbol('if'),
      args[0],
      args.length === 2 ? args[1] : createList(createSymbol('and'), ...args.slice(1)),
      args[0]
    );
  });
  logger.debug('Defined and macro');

  // not: Logical NOT
  // (not expr)
  // Expands to: (if expr 0 1)
  env.defineMacro('not', (args: SExp[], env: Environment): SExp => {
    if (args.length !== 1) {
      throw new Error('not requires exactly one argument');
    }

    return createList(
      createSymbol('if'),
      args[0],
      createLiteral(false),
      createLiteral(true)
    );
  });
  logger.debug('Defined not macro');

  // do: Execute multiple expressions and return the last one
  // (do expr1 expr2 expr3...)
  // Expands to: ((fn [] expr1 expr2 expr3...))
  env.defineMacro('do', (args: SExp[], env: Environment): SExp => {
    if (args.length === 0) {
      return createNilLiteral();
    }

    if (args.length === 1) {
      return args[0];
    }

    return createList(
      createList(
        createSymbol('fn'),
        createList(),
        ...args
      )
    );
  });

  logger.debug('Defined do macro');

  // cond: Conditional with multiple branches
  // (cond (test1 result1) (test2 result2) ... (else resultN))
  // Expands to nested if expressions
  env.defineMacro('cond', (args: SExp[], env: Environment): SExp => {
    if (args.length === 0) {
      return createNilLiteral();
    }

    if (!isList(args[0])) {
      throw new Error('cond clauses must be lists');
    }

    const clause = args[0] as SList;

    if (clause.elements.length !== 2) {
      throw new Error('cond clauses must have a test and a result');
    }

    const test = clause.elements[0];
    const result = clause.elements[1];

    if (args.length === 1) {
      // Last clause
      return createList(
        createSymbol('if'),
        test,
        result,
        createNilLiteral()
      );
    } else {
      // More clauses to process
      return createList(
        createSymbol('if'),
        test,
        result,
        createList(createSymbol('cond'), ...args.slice(1))
      );
    }
  });
  logger.debug('Defined cond macro');

  // when: Conditional execution when test is true
  // (when test expr1 expr2...)
  // Expands to: (if test (do expr1 expr2...) nil)
  env.defineMacro('when', (args: SExp[], env: Environment): SExp => {
    if (args.length < 1) {
      throw new Error('when requires a test and at least one body expression');
    }

    const test = args[0];
    const body = args.slice(1);

    if (body.length === 0) {
      return createList(
        createSymbol('if'),
        test,
        createNilLiteral(),
        createNilLiteral()
      );
    } else if (body.length === 1) {
      return createList(
        createSymbol('if'),
        test,
        body[0],
        createNilLiteral()
      );
    } else {
      return createList(
        createSymbol('if'),
        test,
        createList(createSymbol('do'), ...body),
        createNilLiteral()
      );
    }
  });
  logger.debug('Defined when macro');

  // unless: Conditional execution when test is false
  // (unless test expr1 expr2...)
  // Expands to: (if test nil (do expr1 expr2...))
  env.defineMacro('unless', (args: SExp[], env: Environment): SExp => {
    if (args.length < 1) {
      throw new Error('unless requires a test and at least one body expression');
    }

    const test = args[0];
    const body = args.slice(1);

    if (body.length === 0) {
      return createList(
        createSymbol('if'),
        test,
        createNilLiteral(),
        createNilLiteral()
      );
    } else if (body.length === 1) {
      return createList(
        createSymbol('if'),
        test,
        createNilLiteral(),
        body[0]
      );
    } else {
      return createList(
        createSymbol('if'),
        test,
        createNilLiteral(),
        createList(createSymbol('do'), ...body)
      );
    }
  });
  logger.debug('Defined unless macro');

  // inc: Increment by 1
  // (inc x)
  // Expands to: (+ x 1)
  env.defineMacro('inc', (args: SExp[], env: Environment): SExp => {
    if (args.length !== 1) {
      throw new Error('inc requires exactly one argument');
    }

    return createList(
      createSymbol('+'),
      args[0],
      createLiteral(1)
    );
  });
  logger.debug('Defined inc macro');

  // dec: Decrement by 1
  // (dec x)
  // Expands to: (- x 1)
  env.defineMacro('dec', (args: SExp[], env: Environment): SExp => {
    if (args.length !== 1) {
      throw new Error('dec requires exactly one argument');
    }

    return createList(
      createSymbol('-'),
      args[0],
      createLiteral(1)
    );
  });

  logger.debug('Defined dec macro');

  // let: Bind values to names in a scope
  // (let [x expr1 y expr2] body1 body2...)
  // Expands to: ((fn [x] body) expr1)
  env.defineMacro('let', (args: SExp[], env: Environment): SExp => {
    if (args.length < 1) {
      throw new Error('let requires a binding vector and body expressions');
    }

    const bindings = args[0];
    const body = args.slice(1);

    if (!isList(bindings)) {
      throw new Error('let bindings must be a list');
    }

    const bindingsList = bindings as SList;

    if (bindingsList.elements.length % 2 !== 0) {
      throw new Error('let bindings must have an even number of forms');
    }

    if (bindingsList.elements.length === 0) {
      // No bindings, just wrap in a do
      return body.length === 1 ? body[0] : createList(createSymbol('do'), ...body);
    }

    // Process the first binding
    const name = bindingsList.elements[0];
    const value = bindingsList.elements[1];

    if (!isSymbol(name)) {
      throw new Error('let binding names must be symbols');
    }

    // If there are more bindings, recursively process them
    if (bindingsList.elements.length > 2) {
      const restBindings = createList(...bindingsList.elements.slice(2));
      const innerLet = createList(
        createSymbol('let'),
        restBindings,
        ...body
      );
      
      return createList(
        createList(
          createSymbol('fn'),
          createList(name),
          innerLet
        ),
        value
      );
    } else {
      // Last binding
      return createList(
        createList(
          createSymbol('fn'),
          createList(name),
          ...(body.length === 1 ? body : [createList(createSymbol('do'), ...body)])
        ),
        value
      );
    }
  });
  logger.debug('Defined let macro');

  // if-let: Bind a value and conditionally execute based on its truthiness
  // (if-let [x test] then else)
  // Expands to: (let [x test] (if x then else))
  env.defineMacro('if-let', (args: SExp[], env: Environment): SExp => {
    if (args.length < 2 || args.length > 3) {
      throw new Error('if-let requires a binding, then expression, and optional else expression');
    }

    const binding = args[0];
    const thenExpr = args[1];
    const elseExpr = args.length > 2 ? args[2] : createNilLiteral();

    if (!isList(binding)) {
      throw new Error('if-let binding must be a list');
    }

    const bindingList = binding as SList;

    if (bindingList.elements.length !== 2) {
      throw new Error('if-let binding must have exactly one name and one value');
    }

    const name = bindingList.elements[0];
    const test = bindingList.elements[1];

    if (!isSymbol(name)) {
      throw new Error('if-let binding name must be a symbol');
    }

    return createList(
      createSymbol('let'),
      createList(name, test),
      createList(
        createSymbol('if'),
        name,
        thenExpr,
        elseExpr
      )
    );
  });
  logger.debug('Defined if-let macro');

  env.defineMacro('nth', (args: SExp[], env: Environment): SExp => {
    if (args.length !== 2) {
      throw new Error('nth requires exactly two arguments');
    }

    return createList(
      createSymbol('get'),
      args[0],
      args[1]
    );
  });
  logger.debug('Defined nth macro');

  // str: String concatenation
  // (str expr1 expr2...)
  // Expands to: (+ expr1 expr2...)
  env.defineMacro('str', (args: SExp[], env: Environment): SExp => {
    if (args.length === 0) {
      return createLiteral('');
    }

    if (args.length === 1) {
      return createList(
        createSymbol('+'),
        createLiteral(''),
        args[0]
      );
    }

    return createList(
      createSymbol('+'),
      ...args
    );
  });
  logger.debug('Defined str macro');

  // print: Print to console (alias for console.log)
  // (print expr1 expr2...)
  // Expands to: (console.log expr1 expr2...)
  env.defineMacro('print', (args: SExp[], env: Environment): SExp => {
    return createList(
      createSymbol('console.log'),
      ...args
    );
  });
  logger.debug('Defined print macro');

  // contains?: Check if an element is in a collection
  // (contains? coll key)
  // Expands to: (js-call coll "has" key)
  env.defineMacro('contains?', (args: SExp[], env: Environment): SExp => {
    if (args.length !== 2) {
      throw new Error('contains? requires exactly two arguments');
    }

    return createList(
      createSymbol('js-call'),
      args[0],
      createLiteral('has'),
      args[1]
    );
  });

  logger.debug('Core macros initialized');
}