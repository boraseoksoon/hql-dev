// src/macroTypes.ts

/**
 * Type definition for a macro function.
 * A macro function takes an array of HQL AST nodes (arguments) and an environment,
 * and returns an HQL AST node (or a transformed value).
 */
export type MacroFunction = (args: any[], env: any) => any;
