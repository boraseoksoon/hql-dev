// src/transpiler/errors.ts - Enhanced error types for better diagnostics

/**
 * Base error class for all transpiler errors
 */
export class TranspilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranspilerError";
    // Fix the prototype chain so `instanceof` checks work properly
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Base version of a formatted message.
   * Derived classes can override this if needed.
   */
  public formatMessage(): string {
    return this.message;
  }
  
  /**
   * Get a suggestion based on this error
   */
  public getSuggestion(): string {
    return "Check your code for syntax errors or incorrect types.";
  }
}

/**
 * Parse error with source position information
 */
export class ParseError extends TranspilerError {
  public position: { line: number; column: number; offset: number };
  public source?: string;

  constructor(
    message: string,
    position: { line: number; column: number; offset: number },
    source?: string,
  ) {
    super(message);
    this.name = "ParseError";
    this.position = position;
    this.source = source;
    Object.setPrototypeOf(this, ParseError.prototype);
  }

  public override formatMessage(): string {
    let result =
      `${this.message} at line ${this.position.line}, column ${this.position.column}`;

    // Add a snippet of source if available
    if (this.source) {
      const lines = this.source.split("\n");
      const lineText = lines[this.position.line - 1] || "";
      const pointer = " ".repeat(this.position.column - 1) + "^";

      result += `\n\n${lineText}\n${pointer}\n`;
    }

    return result;
  }
  
  public override getSuggestion(): string {
    const msg = this.message.toLowerCase();
    
    if (msg.includes("unexpected ')'") || msg.includes("unexpected ']'") || msg.includes("unexpected '}'")) {
      return "Check for mismatched parentheses or brackets. You might have an extra closing delimiter or missing an opening one.";
    }
    if (msg.includes("unexpected end of input")) {
      return "Your expression is incomplete. Check for unclosed parentheses, brackets, or strings.";
    }
    
    return "Review your syntax carefully, paying attention to brackets, quotes, and other delimiters.";
  }
}

/**
 * Macro expansion error
 */
export class MacroError extends TranspilerError {
  public macroName: string;
  public sourceFile?: string;
  public originalError?: Error;

  constructor(
    message: string,
    macroName: string,
    sourceFile?: string,
    originalError?: Error,
  ) {
    super(message);
    this.name = "MacroError";
    this.macroName = macroName;
    this.sourceFile = sourceFile;
    this.originalError = originalError;
    Object.setPrototypeOf(this, MacroError.prototype);
  }

  public override formatMessage(): string {
    let result: string;

    if (this.sourceFile) {
      result =
        `Error expanding macro '${this.macroName}' (from ${this.sourceFile}): ${this.message}`;
    } else {
      result = `Error expanding macro '${this.macroName}': ${this.message}`;
    }

    // Include original error stack if available
    if (this.originalError?.stack) {
      result += `\n\nOriginal error:\n${this.originalError.stack}`;
    }

    return result;
  }
  
  public override getSuggestion(): string {
    const msg = this.message.toLowerCase();
    
    if (msg.includes("not found") || msg.includes("undefined") || msg.includes("does not exist")) {
      return "Make sure the macro is defined and imported correctly before using it.";
    }
    if (msg.includes("parameter") || msg.includes("argument")) {
      return "Check that you're passing the correct number and types of arguments to the macro.";
    }
    
    return "Review your macro definition and usage. Check for proper syntax and parameter types.";
  }
}

/**
 * Import processing error
 */
export class ImportError extends TranspilerError {
  public importPath: string;
  public sourceFile?: string;
  public originalError?: Error;

  constructor(
    message: string,
    importPath: string,
    sourceFile?: string,
    originalError?: Error,
  ) {
    super(message);
    this.name = "ImportError";
    this.importPath = importPath;
    this.sourceFile = sourceFile;
    this.originalError = originalError;
    Object.setPrototypeOf(this, ImportError.prototype);
  }

  public override formatMessage(): string {
    let result: string;

    if (this.sourceFile) {
      result =
        `Error importing '${this.importPath}' from '${this.sourceFile}': ${this.message}`;
    } else {
      result = `Error importing '${this.importPath}': ${this.message}`;
    }

    // Include original error stack if available
    if (this.originalError?.stack) {
      result += `\n\nOriginal error:\n${this.originalError.stack}`;
    }

    return result;
  }
}

/**
 * AST transformation error
 */
export class TransformError extends TranspilerError {
  public nodeSummary: string;
  public phase: string;
  public originalNode?: unknown;

  constructor(
    message: string,
    nodeSummary: string,
    phase: string,
    originalNode?: unknown,
  ) {
    super(message);
    this.name = "TransformError";
    this.nodeSummary = nodeSummary;
    this.phase = phase;
    this.originalNode = originalNode;
    Object.setPrototypeOf(this, TransformError.prototype);
  }

  public override formatMessage(): string {
    let result =
      `Error during ${this.phase} transformation: ${this.message}\nNode: ${this.nodeSummary}`;

    if (this.originalNode) {
      try {
        result += `\n\nFull node dump:\n${
          JSON.stringify(this.originalNode, null, 2)
        }`;
      } catch (e) {
        result += `\n\nCould not stringify original node: ${
          e instanceof Error ? e.message : String(e)
        }`;
      }
    }

    return result;
  }
}

/**
 * Code generation error
 */
export class CodeGenError extends TranspilerError {
  public nodeType: string;
  public originalNode?: unknown;

  constructor(message: string, nodeType: string, originalNode?: unknown) {
    super(message);
    this.name = "CodeGenError";
    this.nodeType = nodeType;
    this.originalNode = originalNode;
    Object.setPrototypeOf(this, CodeGenError.prototype);
  }

  public override formatMessage(): string {
    let result =
      `Error generating code for node type '${this.nodeType}': ${this.message}`;

    if (this.originalNode) {
      try {
        result += `\n\nFull node dump:\n${
          JSON.stringify(this.originalNode, null, 2)
        }`;
      } catch (e) {
        result += `\n\nCould not stringify original node: ${
          e instanceof Error ? e.message : String(e)
        }`;
      }
    }

    return result;
  }
}

/**
 * Error during type checking or validation
 */
export class ValidationError extends TranspilerError {
  public context: string;
  public expectedType?: string;
  public actualType?: string;

  constructor(
    message: string,
    context: string,
    expectedType?: string,
    actualType?: string,
  ) {
    super(message);
    this.name = "ValidationError";
    this.context = context;
    this.expectedType = expectedType;
    this.actualType = actualType;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  public override formatMessage(): string {
    let result = `Validation error in ${this.context}: ${this.message}`;

    if (this.expectedType && this.actualType) {
      result +=
        `\nExpected type: ${this.expectedType}\nActual type: ${this.actualType}`;
    }

    return result;
  }
}

/**
 * Create a descriptive summary of a node for error messages
 */
export function summarizeNode(node: unknown): string {
  if (!node) return "undefined";

  if (typeof node === "string") return `"${node}"`;

  if (typeof node !== "object") return String(node);

  // Handle array-like objects
  if (Array.isArray(node)) {
    if (node.length <= 3) {
      return `[${node.map(summarizeNode).join(", ")}]`;
    }
    return `[${summarizeNode(node[0])}, ${
      summarizeNode(node[1])
    }, ... (${node.length} items)]`;
  }

  // Handle node objects based on common properties
  if ("type" in node) {
    let summary = `${(node as { type: string }).type}`;

    // Add name for named nodes
    if ("name" in node) {
      summary += ` "${(node as { name: string }).name}"`;
    }

    // Add value for literals
    if ("value" in node) {
      const valueStr = typeof (node as { value: unknown }).value === "string"
        ? `"${(node as { value: string }).value}"`
        : String((node as { value: unknown }).value);
      summary += ` ${valueStr}`;
    }

    return summary;
  }

  // Fallback for other object types
  return Object.prototype.toString.call(node);
}

/**
 * Create detailed error report for diagnostics
 */
export function createErrorReport(
  error: Error,
  context: string,
  additionalInfo: Record<string, unknown> = {}
): string {
  let report = `Error in ${context}: ${error.message}\n`;
  
  // Add stack trace if available
  if (error.stack) {
    report += `\nStack trace:\n${error.stack.split('\n').slice(1).join('\n')}\n`;
  }
  
  // Add additional context information
  if (Object.keys(additionalInfo).length > 0) {
    report += "\nAdditional information:\n";
    for (const [key, value] of Object.entries(additionalInfo)) {
      if (value !== undefined) {
        report += `  ${key}: ${formatValue(value)}\n`;
      }
    }
  }
  
  return report;
}

/**
 * Format a value for error reporting
 */
function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  
  if (typeof value === "string") {
    // For long strings, truncate
    if (value.length > 100) {
      return `"${value.substring(0, 100)}..."`;
    }
    return `"${value}"`;
  }
  
  if (typeof value === "object") {
    try {
      // Limit the depth and length of stringified objects
      return JSON.stringify(value, null, 2).substring(0, 200) + (JSON.stringify(value).length > 200 ? "..." : "");
    } catch (e) {
      return String(value);
    }
  }
  
  return String(value);
}
