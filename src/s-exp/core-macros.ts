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

  logger.debug('Core macros initialized');
}