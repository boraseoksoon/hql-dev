// core/src/error/error-types.ts
// Core error types for the HQL error reporting system

/**
 * Represents a location in source code
 */
export interface SourceLocation {
    filePath: string;
    line: number;
    column: number;
    offset?: number;  // Character offset from start of file
    length?: number;  // Length of the problematic code
  }
  
  /**
   * Base class for all HQL errors
   */
  export class HQLError extends Error {
    readonly errorType: string;
    readonly location: SourceLocation;
    readonly suggestion?: string;
    readonly sourceCode?: string[];
    readonly originalError?: Error;
  
    constructor(
      message: string,
      errorType: string,
      location: SourceLocation,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message);
      this.name = 'HQLError';
      this.errorType = errorType;
      this.location = location;
      this.suggestion = suggestion;
      this.sourceCode = sourceCode;
      this.originalError = originalError;
  
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, HQLError.prototype);
    }
  }
  
  /**
   * Error thrown during parsing of HQL code
   */
  export class ParseError extends HQLError {
    constructor(
      message: string, 
      location: SourceLocation,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message, 'SyntaxError', location, suggestion, sourceCode, originalError);
      this.name = 'ParseError';
      
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, ParseError.prototype);
    }
  }
  
  /**
   * Error thrown during macro expansion
   */
  export class MacroError extends HQLError {
    readonly macroName: string;
  
    constructor(
      message: string,
      location: SourceLocation,
      macroName: string,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message, 'MacroError', location, suggestion, sourceCode, originalError);
      this.name = 'MacroError';
      this.macroName = macroName;
      
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, MacroError.prototype);
    }
  }
  
  /**
   * Error thrown during AST transformation
   */
  export class TransformError extends HQLError {
    constructor(
      message: string,
      location: SourceLocation,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message, 'TransformError', location, suggestion, sourceCode, originalError);
      this.name = 'TransformError';
      
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, TransformError.prototype);
    }
  }
  
  /**
   * Error thrown during type checking
   */
  export class TypeError extends HQLError {
    readonly expectedType?: string;
    readonly actualType?: string;
  
    constructor(
      message: string,
      location: SourceLocation,
      expectedType?: string,
      actualType?: string,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message, 'TypeError', location, suggestion, sourceCode, originalError);
      this.name = 'TypeError';
      this.expectedType = expectedType;
      this.actualType = actualType;
      
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, TypeError.prototype);
    }
  }
  
  /**
   * Error thrown during code generation
   */
  export class CodeGenError extends HQLError {
    constructor(
      message: string,
      location: SourceLocation,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message, 'CodeGenError', location, suggestion, sourceCode, originalError);
      this.name = 'CodeGenError';
      
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, CodeGenError.prototype);
    }
  }
  
  /**
   * Error thrown during import/module resolution
   */
  export class ImportError extends HQLError {
    readonly importPath: string;
  
    constructor(
      message: string, 
      location: SourceLocation,
      importPath: string,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message, 'ImportError', location, suggestion, sourceCode, originalError);
      this.name = 'ImportError';
      this.importPath = importPath;
      
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, ImportError.prototype);
    }
  }
  
  /**
   * Error thrown during runtime execution
   */
  export class RuntimeError extends HQLError {
    constructor(
      message: string,
      location: SourceLocation,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message, 'RuntimeError', location, suggestion, sourceCode, originalError);
      this.name = 'RuntimeError';
      
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, RuntimeError.prototype);
    }
  }
  
  /**
   * Error thrown for general validation failures
   */
  export class ValidationError extends HQLError {
    readonly expected?: string;
    readonly received?: string;
  
    constructor(
      message: string,
      location: SourceLocation,
      expected?: string,
      received?: string,
      suggestion?: string,
      sourceCode?: string[],
      originalError?: Error
    ) {
      super(message, 'ValidationError', location, suggestion, sourceCode, originalError);
      this.name = 'ValidationError';
      this.expected = expected;
      this.received = received;
      
      // Ensure proper prototype chain for instanceof checks
      Object.setPrototypeOf(this, ValidationError.prototype);
    }
  }