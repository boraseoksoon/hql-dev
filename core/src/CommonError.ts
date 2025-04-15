// CommonError.ts - Centralized error handling utilities

/**
 * Colorizer function for terminal output
 */
export type ColorFn = (s: string) => string;

/**
 * Color configuration for error formatting
 */
export interface ColorConfig {
  red: ColorFn;
  yellow: ColorFn;
  gray: ColorFn;
  cyan: ColorFn;
  bold: ColorFn;
}

/**
 * Create a color configuration based on whether colors are enabled
 */
export function createColorConfig(useColors: boolean): ColorConfig {
  return useColors ? 
    { 
      red: (s: string) => `\x1b[31m${s}\x1b[0m`, 
      yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, 
      gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
      cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
      bold: (s: string) => `\x1b[1m${s}\x1b[0m` 
    } : 
    { 
      red: (s: string) => s, 
      yellow: (s: string) => s, 
      gray: (s: string) => s, 
      cyan: (s: string) => s,
      bold: (s: string) => s 
    };
}

// ---- Source Registry for Error Context ----

/**
 * Registry to store source files for error context
 */
const sourceRegistry = new Map<string, string>();

/**
 * Register a source file for error context
 */
export function registerSourceFile(filePath: string, source: string): void {
  sourceRegistry.set(filePath, source);
}

/**
 * Get a source file from the registry
 */
export function getSourceFile(filePath: string): string | undefined {
  return sourceRegistry.get(filePath);
}

// ---- Base Error Classes ----

/**
 * Base error class for all transpiler errors
 */
export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Base version of a formatted message.
   * Derived classes can override this if needed.
   */
  public formatMessage(useColors: boolean = true): string {
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
 * Base parse error with position information
 */
export class BaseParseError extends BaseError {
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
    Object.setPrototypeOf(this, BaseParseError.prototype);
  }

  public override formatMessage(useColors: boolean = true): string {
    const colorConfig = createColorConfig(useColors);
    const c = colorConfig;
    
    let result = useColors 
      ? c.red(c.bold(`Parse Error: ${this.message} at line ${this.position.line}, column ${this.position.column}`))
      : `Parse Error: ${this.message} at line ${this.position.line}, column ${this.position.column}`;
    
    // Add a snippet of source if available
    if (this.source) {
      const lines = this.source.split('\n');
      const lineText = lines[this.position.line - 1] || "";
      const pointer = " ".repeat(this.position.column - 1) + "^";
      
      result += '\n\n';
      
      // Add context before
      if (this.position.line > 1) {
        const prevLineText = lines[this.position.line - 2] || "";
        const prevLineFormatted = useColors
          ? c.gray(`${this.position.line - 1} │ ${prevLineText}`)
          : `${this.position.line - 1} │ ${prevLineText}`;
        result += `${prevLineFormatted}\n`;
      }
      
      // Add error line
      const errorLineFormatted = useColors
        ? c.yellow(`${this.position.line} │ ${lineText}`)
        : `${this.position.line} │ ${lineText}`;
      result += `${errorLineFormatted}\n`;
      
      // Add pointer
      const pointerFormatted = useColors
        ? c.red(`  │ ${pointer}`)
        : `  │ ${pointer}`;
      result += `${pointerFormatted}\n`;
      
      // Add context after
      if (this.position.line < lines.length) {
        const nextLineText = lines[this.position.line] || "";
        const nextLineFormatted = useColors
          ? c.gray(`${this.position.line + 1} │ ${nextLineText}`)
          : `${this.position.line + 1} │ ${nextLineText}`;
        result += `${nextLineFormatted}\n`;
      }
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
 * Main error class for all transpiler errors with source context
 */
export class TranspilerError extends BaseError {
  public source?: string;
  public filePath?: string;
  public line?: number;
  public column?: number;
  public contextLines: string[] = [];
  private colorConfig: ColorConfig;

  constructor(
    message: string,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "TranspilerError";
    this.source = options.source;
    this.filePath = options.filePath;
    this.line = options.line;
    this.column = options.column;
    this.colorConfig = createColorConfig(options.useColors ?? true);
    
    // Extract context lines if we have all the location information
    if (this.source && this.line !== undefined) {
      this.extractContextLines();
    } else if (this.source) {
      // If we have source but no line, try to extract from message
      const lineMatch = message.match(/line (\d+)/i);
      const columnMatch = message.match(/column (\d+)/i);
      
      if (lineMatch) {
        this.line = parseInt(lineMatch[1], 10);
        if (columnMatch) {
          this.column = parseInt(columnMatch[1], 10);
        }
        this.extractContextLines();
      }
    } else if (options.filePath && !this.source) {
      // Try to load source from registry if filePath is available
      const registeredSource = getSourceFile(options.filePath);
      if (registeredSource) {
        this.source = registeredSource;
        if (this.line !== undefined) {
          this.extractContextLines();
        }
      }
    }
    
    // Fix prototype chain
    Object.setPrototypeOf(this, TranspilerError.prototype);
  }
  
  /**
   * Extract context lines from the source
   */
  private extractContextLines(): void {
    if (!this.source || this.line === undefined) return;
    
    const lines = this.source.split('\n');
    const lineIndex = this.line - 1;
    
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    
    // Clear any existing context lines
    this.contextLines = [];
    
    // Add lines before for context (up to 2)
    for (let i = Math.max(0, lineIndex - 2); i < lineIndex; i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
    }
    
    // Add the error line
    this.contextLines.push(`${lineIndex + 1} │ ${lines[lineIndex]}`);
    
    // Add pointer to the column
    if (this.column !== undefined) {
      this.contextLines.push(`  │ ${' '.repeat(Math.max(0, this.column - 1))}^`);
    }
    
    // Add lines after for context (up to 2)
    for (let i = lineIndex + 1; i < Math.min(lines.length, lineIndex + 3); i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
    }
  }
  
  /**
   * Generate an enhanced error message with source context
   */
  public override formatMessage(useColors: boolean = true): string {
    const c = useColors ? this.colorConfig : createColorConfig(false);
    
    // Start with basic message
    let result = useColors
      ? c.red(c.bold(`Error: ${this.message}`))
      : `Error: ${this.message}`;
    
    // Add file location if available
    if (this.filePath) {
      let locationPath = this.filePath;
      
      // Add line and column if available (creates clickable paths in editors)
      if (this.line !== undefined) {
        locationPath += `:${this.line}`;
        if (this.column !== undefined) {
          locationPath += `:${this.column}`;
        }
      }
      
      result += `\n${useColors ? c.cyan("Location:") : "Location:"} ${locationPath}`;
    }
    
    // Add source context if available
    if (this.contextLines.length > 0) {
      result += '\n\n';
      
      for (let i = 0; i < this.contextLines.length; i++) {
        const line = this.contextLines[i];
        
        // Format the lines with different colors
        if (line.includes(" │ ")) {
          if (line.startsWith("  │ ")) {
            // Error pointer
            result += useColors ? c.red(line) : line;
            result += '\n';
          } else if (i === this.contextLines.length - 3 || 
                    (this.contextLines.length <= 3 && i === this.contextLines.length - 2)) {
            // Error line
            result += useColors ? c.yellow(line) : line;
            result += '\n';
          } else {
            // Context line
            result += useColors ? c.gray(line) : line;
            result += '\n';
          }
        } else {
          result += line + '\n';
        }
      }
    } else if (this.source) {
      // If we have source but extraction failed, show the first few lines
      const lines = this.source.split('\n');
      const maxLines = Math.min(5, lines.length);
      
      result += '\n\n';
      for (let i = 0; i < maxLines; i++) {
        result += useColors ? c.gray(`${i + 1} │ ${lines[i]}`) : `${i + 1} │ ${lines[i]}`;
        result += '\n';
      }
      if (lines.length > maxLines) {
        result += useColors ? c.gray(`... (${lines.length - maxLines} more lines)`) : `... (${lines.length - maxLines} more lines)`;
        result += '\n';
      }
    }
    
    return result;
  }
  
  /**
   * Create an enhanced error from a basic error
   */
  static fromError(
    error: Error,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ): TranspilerError {
    return new TranspilerError(
      error.message,
      options
    );
  }
}

// ---- Specialized Error Classes ----

/**
 * Parse errors with enhanced formatting
 */
export class ParseError extends BaseParseError {
  constructor(
    message: string,
    position: { line: number; column: number; offset: number },
    source?: string,
    useColors: boolean = true
  ) {
    super(message, position, source);
    this.name = "ParseError";
    
    // Fix prototype chain
    Object.setPrototypeOf(this, ParseError.prototype);
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
    options: {
      sourceFile?: string;
      originalError?: Error;
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ) {
    super(message, {
      source: options.source,
      filePath: options.filePath || options.sourceFile,
      line: options.line,
      column: options.column,
      useColors: options.useColors
    });
    this.name = "MacroError";
    this.macroName = macroName;
    this.sourceFile = options.sourceFile;
    this.originalError = options.originalError;
    Object.setPrototypeOf(this, MacroError.prototype);
  }

  public override formatMessage(useColors: boolean = true): string {
    const c = createColorConfig(useColors);
    
    let result: string;
    
    if (this.sourceFile) {
      result = useColors
        ? c.red(c.bold(`Error expanding macro '${this.macroName}' (from ${this.sourceFile}): ${this.message}`))
        : `Error expanding macro '${this.macroName}' (from ${this.sourceFile}): ${this.message}`;
    } else {
      result = useColors
        ? c.red(c.bold(`Error expanding macro '${this.macroName}': ${this.message}`))
        : `Error expanding macro '${this.macroName}': ${this.message}`;
    }
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    if (baseFormatting.length > result.length) {
      result = baseFormatting;
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
    options: {
      sourceFile?: string;
      originalError?: Error;
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ) {
    super(message, {
      source: options.source,
      filePath: options.filePath || options.sourceFile,
      line: options.line,
      column: options.column,
      useColors: options.useColors
    });
    this.name = "ImportError";
    this.importPath = importPath;
    this.sourceFile = options.sourceFile;
    this.originalError = options.originalError;
    Object.setPrototypeOf(this, ImportError.prototype);
  }

  public override formatMessage(useColors: boolean = true): string {
    const c = createColorConfig(useColors);
    
    let result: string;

    if (this.sourceFile) {
      result = useColors
        ? c.red(c.bold(`Error importing '${this.importPath}' from '${this.sourceFile}': ${this.message}`))
        : `Error importing '${this.importPath}' from '${this.sourceFile}': ${this.message}`;
    } else {
      result = useColors
        ? c.red(c.bold(`Error importing '${this.importPath}': ${this.message}`))
        : `Error importing '${this.importPath}': ${this.message}`;
    }
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    if (baseFormatting.length > result.length) {
      result = baseFormatting;
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
    options: {
      originalNode?: unknown;
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ) {
    super(message, {
      source: options.source,
      filePath: options.filePath,
      line: options.line,
      column: options.column,
      useColors: options.useColors
    });
    this.name = "TransformError";
    this.nodeSummary = nodeSummary;
    this.phase = phase;
    this.originalNode = options.originalNode;
    Object.setPrototypeOf(this, TransformError.prototype);
  }

  public override formatMessage(useColors: boolean = true): string {
    const c = createColorConfig(useColors);
    
    let result = useColors
      ? c.red(c.bold(`Error during ${this.phase} transformation: ${this.message}\nNode: ${this.nodeSummary}`))
      : `Error during ${this.phase} transformation: ${this.message}\nNode: ${this.nodeSummary}`;
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    if (baseFormatting.length > result.length) {
      result = baseFormatting;
    }

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

  constructor(
    message: string,
    nodeType: string,
    options: {
      originalNode?: unknown;
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ) {
    super(message, {
      source: options.source,
      filePath: options.filePath,
      line: options.line,
      column: options.column,
      useColors: options.useColors
    });
    this.name = "CodeGenError";
    this.nodeType = nodeType;
    this.originalNode = options.originalNode;
    Object.setPrototypeOf(this, CodeGenError.prototype);
  }

  public override formatMessage(useColors: boolean = true): string {
    const c = createColorConfig(useColors);
    
    let result = useColors
      ? c.red(c.bold(`Error generating code for node type '${this.nodeType}': ${this.message}`))
      : `Error generating code for node type '${this.nodeType}': ${this.message}`;
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    if (baseFormatting.length > result.length) {
      result = baseFormatting;
    }

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
    options: {
      expectedType?: string;
      actualType?: string;
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ) {
    super(message, {
      source: options.source,
      filePath: options.filePath,
      line: options.line,
      column: options.column,
      useColors: options.useColors
    });
    this.name = "ValidationError";
    this.context = context;
    this.expectedType = options.expectedType;
    this.actualType = options.actualType;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  public override formatMessage(useColors: boolean = true): string {
    const c = createColorConfig(useColors);
    
    let result = useColors
      ? c.red(c.bold(`Validation error in ${this.context}: ${this.message}`))
      : `Validation error in ${this.context}: ${this.message}`;
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    if (baseFormatting.length > result.length) {
      result = baseFormatting;
    }

    if (this.expectedType && this.actualType) {
      result +=
        `\nExpected type: ${this.expectedType}\nActual type: ${this.actualType}`;
    }

    return result;
  }
}

// ---- Helper Functions ----

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
 * Format a value for error reporting
 */
export function formatValue(value: unknown): string {
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
 * Helper function to wrap existing parse errors with enhanced formatting
 */
export function parseError(error: ParseError | Error, options: {
  source?: string;
  useColors?: boolean;
} = {}): Error {
  if (error instanceof ParseError) {
    return new ParseError(
      error.message,
      error.position,
      options.source || error.source,
      options.useColors ?? true
    );
  }
  
  // If it's not a ParseError, wrap it in a TranspilerError
  return TranspilerError.fromError(error, {
    source: options.source,
    useColors: options.useColors
  });
}

/**
 * Add intelligent suggestions based on the error
 */
export function getSuggestion(error: Error): string {
  // Check error message for common patterns
  const msg = error.message.toLowerCase();
  
  if (error instanceof ParseError) {
    if (msg.includes("unexpected ')'") || msg.includes("unexpected ']'") || msg.includes("unexpected '}'")) {
      return "Check for mismatched parentheses or brackets. You might have an extra closing delimiter or missing an opening one.";
    }
    if (msg.includes("unexpected end of input")) {
      return "Your expression is incomplete. Check for unclosed parentheses, brackets, or strings.";
    }
    return "Review your syntax for errors like mismatched delimiters or invalid tokens.";
  }
  
  if (error instanceof MacroError) {
    if (msg.includes("not found") || msg.includes("undefined") || msg.includes("does not exist")) {
      return "Make sure the macro is defined and imported correctly before using it.";
    }
    if (msg.includes("parameter") || msg.includes("argument")) {
      return "Check that you're passing the correct number and types of arguments to the macro.";
    }
    return "Review your macro definition and usage. Ensure parameters match expected types.";
  }
  
  if (error instanceof ImportError) {
    if (msg.includes("not found") || msg.includes("could not find") || msg.includes("no such file")) {
      return "Verify that the file exists at the specified path. Check for typos in the path.";
    }
    if (msg.includes("circular")) {
      return "You have a circular dependency. Review your import structure to break the cycle.";
    }
    return "Check that the imported file exists and is accessible. Verify import paths are correct.";
  }
  
  if (error instanceof ValidationError) {
    if (msg.includes("type") || msg.includes("expected")) {
      return "The value doesn't match the expected type. Check the type annotations and values passed.";
    }
    return "Review your code for type errors and ensure values match their expected types.";
  }
  
  if (msg.includes("undefined") || msg.includes("not defined")) {
    return "The referenced variable or function doesn't exist. Check for typos or add a definition.";
  }
  
  if (msg.includes("null") || msg.includes("undefined is not an object")) {
    return "You're trying to access a property on null or undefined. Add a check before accessing properties.";
  }
  
  // Generic suggestion
  return "Try simplifying your code to isolate the problem. Break complex expressions into smaller parts.";
}

/**
 * Format an error for display
 */
export function formatError(
  error: Error,
  options: {
    source?: string;
    filePath?: string;
    line?: number;
    column?: number;
    useColors?: boolean;
    includeStack?: boolean;
    makePathsClickable?: boolean;
  } = {}
): string {
  // If it's already an enhanced error that can format itself, use that
  if (error instanceof BaseError) {
    let result = error.formatMessage(options.useColors ?? true);
    
    // Add stack trace if requested
    if (options.includeStack && error.stack) {
      result += `\n\nStack trace:\n${error.stack.split('\n').slice(1).join('\n')}`;
    }
    
    // Add suggestion if available
    const suggestion = error.getSuggestion();
    if (suggestion) {
      const colorConfig = createColorConfig(options.useColors ?? true);
      result += `\n\nSuggestion: ${options.useColors ? colorConfig.cyan(suggestion) : suggestion}`;
    }
    
    return result;
  }
  
  // Otherwise, create and format a TranspilerError from this error
  const enhancedError = TranspilerError.fromError(error, {
    source: options.source,
    filePath: options.filePath,
    line: options.line, 
    column: options.column,
    useColors: options.useColors
  });
  
  let result = enhancedError.formatMessage(options.useColors ?? true);
  
  // Add stack trace if requested
  if (options.includeStack && error.stack) {
    result += `\n\nStack trace:\n${error.stack.split('\n').slice(1).join('\n')}`;
  }
  
  return result;
}

/**
 * Enhance errors by adding source context and choosing the right error type
 */
export function report(
  error: Error,
  options: {
    source?: string;
    filePath?: string;
    line?: number;
    column?: number;
    useColors?: boolean;
  } = {}
): Error {
  // Handle specific error types
  if (error instanceof BaseParseError) {
    return new ParseError(
      error.message,
      error.position,
      options.source || error.source,
      options.useColors ?? true
    );
  }
  
  // For any transpiler error, just ensure the options are set
  if (error instanceof TranspilerError) {
    // Copy existing properties
    const mergedOptions = {
      source: options.source || error.source,
      filePath: options.filePath || error.filePath,
      line: options.line ?? error.line,
      column: options.column ?? error.column,
      useColors: options.useColors ?? true
    };
    
    // Create a new instance with merged options
    return TranspilerError.fromError(error, mergedOptions);
  }
  
  // For generic errors, wrap them
  return TranspilerError.fromError(error, options);
}

/**
 * Print an error to the console
 */
export function reportError(
  error: Error,
  options: {
    source?: string;
    filePath?: string;
    line?: number;
    column?: number;
    verbose?: boolean;
    useColors?: boolean;
    useClickablePaths?: boolean;
    includeStack?: boolean;
  } = {}
): void {
  // Enhance the error first
  const enhancedError = report(error, {
    source: options.source,
    filePath: options.filePath,
    line: options.line,
    column: options.column,
    useColors: options.useColors ?? true
  });
  
  // Format it
  const formatted = formatError(enhancedError, {
    useColors: options.useColors ?? true,
    includeStack: options.includeStack ?? options.verbose ?? false,
    makePathsClickable: options.useClickablePaths ?? true
  });
  
  // Print to the console
  if (options.verbose) {
    console.error("\x1b[31m[VERBOSE ERROR]\x1b[0m", formatted);
  } else {
    console.error("\x1b[31m[ERROR]\x1b[0m", formatted);
  }
}

/**
 * Set up global error handlers
 */
export function initializeErrorHandling(opts: {
  enableGlobalHandlers?: boolean;
  enableReplEnhancement?: boolean;
} = {}): void {
  if (opts.enableGlobalHandlers) {
    // For browsers
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
        reportError(e.reason instanceof Error ? e.reason : new Error(String(e.reason)), { 
          includeStack: true 
        });
      });
      
      globalThis.addEventListener("error", (e: ErrorEvent) => {
        reportError(e.error instanceof Error ? e.error : new Error(String(e.error || e.message)), { 
          includeStack: true 
        });
      });
    }
  }
}

/**
 * Error handling wrapper for async functions
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T,
  options: {
    source?: string;
    filePath?: string;
    context?: string;
    rethrow?: boolean;
    logErrors?: boolean;
  } = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (options.logErrors !== false) {
        reportError(error instanceof Error ? error : new Error(String(error)), {
          filePath: options.filePath,
          source: options.source, 
          verbose: true,
          includeStack: true,
        });
      }
      
      if (options.rethrow !== false) throw error;
      return undefined as unknown as T;
    }
  };
}

/**
 * Apply TypeScript error translation to a function
 */
export function withTypeScriptErrorTranslation<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes("TS")) {
        // Use translateTypeScriptError if available in this file, otherwise implement or import
        if (typeof translateTypeScriptError === 'function') {
          throw translateTypeScriptError(error);
        }
      }
      throw error;
    }
  };
}


/**
 * Translates a TypeScript error into a more user-friendly error.
 * This function can be extended to provide richer translations for common TS errors.
 */
export function translateTypeScriptError(error: Error): Error {
  // Example: Translate TS error codes/messages to more actionable advice
  if (error.message.includes('TS2304')) {
    // Cannot find name '...'.
    return new TranspilerError(
      `TypeScript could not find a variable or type name. Did you forget to declare or import it?\n\nOriginal: ${error.message}`
    );
  }
  if (error.message.includes('TS1005')) {
    // ';' expected.
    return new TranspilerError(
      `TypeScript expected a semicolon or found unexpected syntax.\n\nOriginal: ${error.message}`
    );
  }
  // Add more TS error code translations as needed

  // Default: wrap in TranspilerError for consistent formatting
  return new TranspilerError(`TypeScript Error: ${error.message}`);
}

// Combine all into a single namespace for easy importing
const CommonError = {
  // Error classes
  BaseError,
  BaseParseError,
  TranspilerError,
  ParseError,
  MacroError,
  ImportError,
  TransformError,
  CodeGenError,
  ValidationError,
  
  // Utility functions
  createColorConfig,
  summarizeNode,
  formatValue,
  createErrorReport,
  parseError,
  formatError,
  report,
  reportError,
  translateTypeScriptError,
  
  // Error context utilities
  registerSourceFile,
  getSourceFile,
  
  // Global error handling
  initializeErrorHandling,
  withErrorHandling,
  withTypeScriptErrorTranslation
};

export default CommonError;