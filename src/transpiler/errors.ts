// src/transpiler/errors.ts - Enhanced error types for better diagnostics

/**
 * Base error class for all transpiler errors
 */
export class TranspilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranspilerError";
    // Ensure prototype chain works correctly
    Object.setPrototypeOf(this, TranspilerError.prototype);
  }
}

/**
 * Parse error with source position information
 */
export class ParseError extends TranspilerError {
  constructor(
    message: string, 
    public position: { 
      line: number; 
      column: number; 
      offset: number; 
    }
  ) {
    super(message);
    this.name = "ParseError";
    Object.setPrototypeOf(this, ParseError.prototype);
  }
  
  /**
   * Get a formatted message with position information
   */
  formatMessage(): string {
    return `${this.message} at line ${this.position.line}, column ${this.position.column}`;
  }
}

/**
 * Macro expansion error
 */
export class MacroError extends TranspilerError {
  constructor(
    message: string,
    public macroName: string,
    public sourceFile?: string
  ) {
    super(message);
    this.name = "MacroError";
    Object.setPrototypeOf(this, MacroError.prototype);
  }
  
  /**
   * Get a formatted message with macro information
   */
  formatMessage(): string {
    if (this.sourceFile) {
      return `Error expanding macro '${this.macroName}' (from ${this.sourceFile}): ${this.message}`;
    }
    return `Error expanding macro '${this.macroName}': ${this.message}`;
  }
}

/**
 * Import processing error
 */
export class ImportError extends TranspilerError {
  constructor(
    message: string,
    public importPath: string,
    public sourceFile?: string
  ) {
    super(message);
    this.name = "ImportError";
    Object.setPrototypeOf(this, ImportError.prototype);
  }
  
  /**
   * Get a formatted message with import information
   */
  formatMessage(): string {
    if (this.sourceFile) {
      return `Error importing '${this.importPath}' from '${this.sourceFile}': ${this.message}`;
    }
    return `Error importing '${this.importPath}': ${this.message}`;
  }
}

/**
 * AST transformation error
 */
export class TransformError extends TranspilerError {
  constructor(
    message: string,
    public nodeSummary: string,
    public phase: string
  ) {
    super(message);
    this.name = "TransformError";
    Object.setPrototypeOf(this, TransformError.prototype);
  }
  
  /**
   * Get a formatted message with transformation information
   */
  formatMessage(): string {
    return `Error during ${this.phase} transformation: ${this.message}\nNode: ${this.nodeSummary}`;
  }
}

/**
 * Code generation error
 */
export class CodeGenError extends TranspilerError {
  constructor(
    message: string,
    public nodeType: string
  ) {
    super(message);
    this.name = "CodeGenError";
    Object.setPrototypeOf(this, CodeGenError.prototype);
  }
  
  /**
   * Get a formatted message with code generation information
   */
  formatMessage(): string {
    return `Error generating code for node type '${this.nodeType}': ${this.message}`;
  }
}

/**
 * Helper function to wrap code with error handling that provides context
 */
export function withErrorContext<T>(
  fn: () => T,
  errorMessage: string,
  errorType: new (message: string, ...args: any[]) => TranspilerError,
  ...args: any[]
): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof TranspilerError) {
      // Pass through existing transpiler errors
      throw error;
    }
    
    // Wrap other errors with context
    const message = error instanceof Error ? error.message : String(error);
    throw new errorType(`${errorMessage}: ${message}`, ...args);
  }
}