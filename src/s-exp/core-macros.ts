// src/s-exp/core-macros.ts - Core macros for the S-expression layer with unified environment

import { SExp, SList, isSymbol, isList, createSymbol, createList, createNilLiteral } from './types.ts';
import { Environment } from '../environment.ts';
import { Logger } from '../logger.ts';

/**
* Initialize core macros in an environment
*/
export function initializeCoreMacros(env: Environment, logger: Logger): void {
  logger.debug('Initializing core macros');

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

  logger.debug('Core macros initialized');
}