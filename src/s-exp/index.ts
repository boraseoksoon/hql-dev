// src/s-exp/index.ts - Entry point for the S-expression layer

// Export types and functions
export * from './types';
export { parse } from './parser';
export { SEnv, MacroFn, initializeGlobalEnv } from './environment';
export { initializeCoreMacros } from './core-macros';
export { expandMacros, expandMacro, evaluateForMacro } from './macro';
export { processImports } from './imports';
export { convertToHqlAst, convertFromHqlAst } from './connector';
export { processHql, transpileHql } from './main';
export { main as runCli } from './cli';

// Main module description
/**
 * HQL S-Expression Layer
 * 
 * This module provides a Lisp-style S-expression frontend for HQL,
 * allowing for proper macros and a cleaner, more functional syntax.
 * 
 * Key components:
 * 
 * - parser: Parses HQL source into S-expressions
 * - environment: Manages variables and macros
 * - macro: Handles macro expansion
 * - imports: Processes module imports
 * - connector: Bridges with the existing HQL transpiler
 * - main: Main entry point for processing HQL code
 * - cli: Command-line interface
 * 
 * This layer can be used as a standalone frontend or integrated with
 * the existing HQL transpiler to produce JavaScript output.
 */