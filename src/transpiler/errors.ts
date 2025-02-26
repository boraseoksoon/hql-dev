// src/transpiler/errors.ts
/**
 * Enhanced error class for parsing with position information
 */
export class ParseError extends Error {
    constructor(
      message: string,
      public position: { line: number; column: number; offset: number; }
    ) {
      super(`${message} at line ${position.line}, column ${position.column}`);
      this.name = "ParseError";
    }
  }