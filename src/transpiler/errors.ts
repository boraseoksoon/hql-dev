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

  /**
   * Get a formatted message for display
   */
  formatMessage(): string {
    return this.message;
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
    },
    public source?: string
  ) {
    super(message);
    this.name = "ParseError";
    Object.setPrototypeOf(this, ParseError.prototype);
  }
  
  /**
   * Get a formatted message with position information
   */
  formatMessage(): string {
    let result = `${this.message} at line ${this.position.line}, column ${this.position.column}`;
    
    // Add source snippet if available
    if (this.source) {
      const lines = this.source.split('\n');
      const line = lines[this.position.line - 1] || '';
      
      // Create a pointer to the exact position
      const pointer = ' '.repeat(this.position.column - 1) + '^';
      result += `\n\n${line}\n${pointer}\n`;
    }
    
    return result;
  }
}

/**
 * Macro expansion error
 */
export class MacroError extends TranspilerError {
  constructor(
    message: string,
    public macroName: string,
    public sourceFile?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = "MacroError";
    Object.setPrototypeOf(this, MacroError.prototype);
  }
  
  /**
   * Get a formatted message with macro information
   */
  formatMessage(): string {
    let result = '';
    if (this.sourceFile) {
      result = `Error expanding macro '${this.macroName}' (from ${this.sourceFile}): ${this.message}`;
    } else {
      result = `Error expanding macro '${this.macroName}': ${this.message}`;
    }
    
    // Include original error stack if available
    if (this.originalError && this.originalError.stack) {
      result += `\n\nOriginal error:\n${this.originalError.stack}`;
    }
    
    return result;
  }
}

/**
 * Import processing error
 */
export class ImportError extends TranspilerError {
  constructor(
    message: string,
    public importPath: string,
    public sourceFile?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = "ImportError";
    Object.setPrototypeOf(this, ImportError.prototype);
  }
  
  /**
   * Get a formatted message with import information
   */
  formatMessage(): string {
    let result = '';
    if (this.sourceFile) {
      result = `Error importing '${this.importPath}' from '${this.sourceFile}': ${this.message}`;
    } else {
      result = `Error importing '${this.importPath}': ${this.message}`;
    }
    
    // Include original error stack if available
    if (this.originalError && this.originalError.stack) {
      result += `\n\nOriginal error:\n${this.originalError.stack}`;
    }
    
    return result;
  }
}

/**
 * AST transformation error
 */
export class TransformError extends TranspilerError {
  constructor(
    message: string,
    public nodeSummary: string,
    public phase: string,
    public originalNode?: any
  ) {
    super(message);
    this.name = "TransformError";
    Object.setPrototypeOf(this, TransformError.prototype);
  }
  
  /**
   * Get a formatted message with transformation information
   */
  formatMessage(): string {
    let result = `Error during ${this.phase} transformation: ${this.message}\nNode: ${this.nodeSummary}`;
    
    // Add more detail about the original node if available
    if (this.originalNode) {
      try {
        result += `\n\nFull node dump:\n${JSON.stringify(this.originalNode, null, 2)}`;
      } catch (e) {
        result += `\n\nCould not stringify original node: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    
    return result;
  }
}

/**
 * Code generation error
 */
export class CodeGenError extends TranspilerError {
  constructor(
    message: string,
    public nodeType: string,
    public originalNode?: any
  ) {
    super(message);
    this.name = "CodeGenError";
    Object.setPrototypeOf(this, CodeGenError.prototype);
  }
  
  /**
   * Get a formatted message with code generation information
   */
  formatMessage(): string {
    let result = `Error generating code for node type '${this.nodeType}': ${this.message}`;
    
    // Add more detail about the original node if available
    if (this.originalNode) {
      try {
        result += `\n\nFull node dump:\n${JSON.stringify(this.originalNode, null, 2)}`;
      } catch (e) {
        result += `\n\nCould not stringify original node: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    
    return result;
  }
}

/**
 * Error during type checking or validation
 */
export class ValidationError extends TranspilerError {
  constructor(
    message: string,
    public context: string,
    public expectedType?: string,
    public actualType?: string
  ) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
  
  /**
   * Get a formatted message with validation information
   */
  formatMessage(): string {
    let result = `Validation error in ${this.context}: ${this.message}`;
    
    if (this.expectedType && this.actualType) {
      result += `\nExpected type: ${this.expectedType}\nActual type: ${this.actualType}`;
    }
    
    return result;
  }
}

/**
 * Create a descriptive summary of a node for error messages
 */
export function summarizeNode(node: any): string {
  if (!node) return 'undefined';
  
  if (typeof node === 'string') return `"${node}"`;
  
  if (typeof node !== 'object') return String(node);
  
  // Handle array-like objects
  if (Array.isArray(node)) {
    if (node.length <= 3) {
      return `[${node.map(summarizeNode).join(', ')}]`;
    }
    return `[${summarizeNode(node[0])}, ${summarizeNode(node[1])}, ... (${node.length} items)]`;
  }
  
  // Handle node objects based on common properties
  if ('type' in node) {
    let summary = `${node.type}`;
    
    // Add name for named nodes
    if ('name' in node) {
      summary += ` "${node.name}"`;
    }
    
    // Add value for literals
    if ('value' in node) {
      const valueStr = typeof node.value === 'string' ? `"${node.value}"` : String(node.value);
      summary += ` ${valueStr}`;
    }
    
    return summary;
  }
  
  // Fallback for other object types
  return Object.prototype.toString.call(node);
}

/**
 * Creates a detailed error report for a process stage
 */
export function createErrorReport(error: Error, stageName: string, context: any = {}): string {
  let report = `Error in ${stageName}:\n${error.message}\n`;
  
  // Add formatted message for TranspilerErrors
  if (error instanceof TranspilerError) {
    report += `\nDetails: ${error.formatMessage()}\n`;
  }
  
  // Add context information if available
  if (Object.keys(context).length > 0) {
    try {
      const contextStr = JSON.stringify(context, null, 2);
      report += `\nContext:\n${contextStr}\n`;
    } catch (e) {
      report += `\nContext: [Could not stringify context: ${e instanceof Error ? e.message : String(e)}]\n`;
    }
  }
  
  // Add stack trace
  if (error.stack) {
    report += `\nStack trace:\n${error.stack}\n`;
  }
  
  return report;
}