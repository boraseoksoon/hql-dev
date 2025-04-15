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
  const identity = (s: string) => s;
  return useColors ? 
    { 
      red: (s: string) => `\x1b[31m${s}\x1b[0m`, 
      yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, 
      gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
      cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
      bold: (s: string) => `\x1b[1m${s}\x1b[0m` 
    } : 
    { red: identity, yellow: identity, gray: identity, cyan: identity, bold: identity };
}

// ---- Source Registry for Error Context ----
const sourceRegistry = new Map<string, string>();

export function registerSourceFile(filePath: string, source: string): void {
  sourceRegistry.set(filePath, source);
}

export function getSourceFile(filePath: string): string | undefined {
  return sourceRegistry.get(filePath);
}

// ---- Base Error Classes ----
export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public formatMessage(useColors: boolean = true): string {
    return this.message;
  }
  
  public getSuggestion(): string {
    return "Check your code for syntax errors or incorrect types.";
  }
}

/**
 * Format error context lines with proper coloring
 */
function formatContextLines(lines: string[], errorLineIndex: number, useColors: boolean): string {
  const c = createColorConfig(useColors);
  return lines.map((line, i) => {
    if (line.startsWith("  │ ")) {
      return useColors ? c.red(line) : line; // Error pointer
    } else if (i === errorLineIndex) {
      return useColors ? c.yellow(line) : line; // Error line
    } else {
      return useColors ? c.gray(line) : line; // Context line
    }
  }).join('\n');
}

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
    const c = createColorConfig(useColors);
    
    let result = useColors 
      ? c.red(c.bold(`Parse Error: ${this.message} at line ${this.position.line}, column ${this.position.column}`))
      : `Parse Error: ${this.message} at line ${this.position.line}, column ${this.position.column}`;
    
    if (this.source) {
      const lines = this.source.split('\n');
      const lineText = lines[this.position.line - 1] || "";
      const pointer = " ".repeat(this.position.column - 1) + "^";
      
      result += '\n\n';
      
      const contextLines = [];
      
      if (this.position.line > 1) {
        contextLines.push(`${this.position.line - 1} │ ${lines[this.position.line - 2] || ""}`);
      }
      
      contextLines.push(`${this.position.line} │ ${lineText}`);
      contextLines.push(`  │ ${pointer}`);
      
      if (this.position.line < lines.length) {
        contextLines.push(`${this.position.line + 1} │ ${lines[this.position.line] || ""}`);
      }
      
      result += formatContextLines(contextLines, 1, useColors);
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

export class TranspilerError extends BaseError {
  public source?: string;
  public filePath?: string;
  public line?: number;
  public column?: number;
  public contextLines: string[] = [];

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
    
    // Extract context lines if we have location information
    if (this.source && this.line !== undefined) {
      this.extractContextLines();
    } else if (this.source && !this.line) {
      const lineMatch = message.match(/line (\d+)/i);
      const columnMatch = message.match(/column (\d+)/i);
      
      if (lineMatch) {
        this.line = parseInt(lineMatch[1], 10);
        this.column = columnMatch ? parseInt(columnMatch[1], 10) : undefined;
        this.extractContextLines();
      }
    } else if (options.filePath && !this.source) {
      this.source = getSourceFile(options.filePath);
      if (this.source && this.line !== undefined) {
        this.extractContextLines();
      }
    }
    
    Object.setPrototypeOf(this, TranspilerError.prototype);
  }
  
  private extractContextLines(): void {
    if (!this.source || this.line === undefined) return;
    
    const lines = this.source.split('\n');
    const lineIndex = this.line - 1;
    
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    
    this.contextLines = [];
    
    // Add context lines - before, error line, pointer, after
    for (let i = Math.max(0, lineIndex - 2); i < lineIndex; i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
    }
    
    this.contextLines.push(`${lineIndex + 1} │ ${lines[lineIndex]}`);
    
    if (this.column !== undefined) {
      this.contextLines.push(`  │ ${' '.repeat(Math.max(0, this.column - 1))}^`);
    }
    
    for (let i = lineIndex + 1; i < Math.min(lines.length, lineIndex + 3); i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
    }
  }
  
  public override formatMessage(useColors: boolean = true): string {
    const c = createColorConfig(useColors);
    
    let result = useColors
      ? c.red(c.bold(`Error: ${this.message}`))
      : `Error: ${this.message}`;
    
    if (this.filePath) {
      let locationPath = this.filePath;
      
      if (this.line !== undefined) {
        locationPath += `:${this.line}`;
        if (this.column !== undefined) {
          locationPath += `:${this.column}`;
        }
      }
      
      result += `\n${useColors ? c.cyan("Location:") : "Location:"} ${locationPath}`;
    }
    
    if (this.contextLines.length > 0) {
      result += '\n\n';
      // Find index of the error line (the one before the pointer)
      const errorLineIndex = this.contextLines.findIndex(line => line.includes(" │ ")) + 1;
      result += formatContextLines(this.contextLines, errorLineIndex, useColors);
    } else if (this.source) {
      // If extraction failed, show the first few lines
      const lines = this.source.split('\n');
      const maxLines = Math.min(5, lines.length);
      
      result += '\n\n';
      for (let i = 0; i < maxLines; i++) {
        result += `${useColors ? c.gray(`${i + 1} │ ${lines[i]}`) : `${i + 1} │ ${lines[i]}`}\n`;
      }
      if (lines.length > maxLines) {
        result += useColors ? c.gray(`... (${lines.length - maxLines} more lines)`) : `... (${lines.length - maxLines} more lines)`;
      }
    }
    
    return result;
  }
  
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
    return new TranspilerError(error.message, options);
  }
}

// ---- Specialized Error Classes ----
export class ParseError extends BaseParseError {
  constructor(
    message: string,
    position: { line: number; column: number; offset: number },
    source?: string,
    useColors: boolean = true
  ) {
    super(message, position, source);
    this.name = "ParseError";
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

/**
 * Base class for specialized error types that include original error
 */
export class SpecializedError extends TranspilerError {
  protected appendOriginalError(formatted: string, originalError?: Error): string {
    return originalError?.stack 
      ? `${formatted}\n\nOriginal error:\n${originalError.stack}`
      : formatted;
  }
}

/**
 * Macro expansion error
 */
export class MacroError extends SpecializedError {
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
    
    const message = this.sourceFile
      ? `Error expanding macro '${this.macroName}' (from ${this.sourceFile}): ${this.message}`
      : `Error expanding macro '${this.macroName}': ${this.message}`;
    
    const result = useColors
      ? c.red(c.bold(message))
      : message;
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    
    return this.appendOriginalError(
      baseFormatting.length > result.length ? baseFormatting : result,
      this.originalError
    );
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
export class ImportError extends SpecializedError {
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
    
    const message = this.sourceFile
      ? `Error importing '${this.importPath}' from '${this.sourceFile}': ${this.message}`
      : `Error importing '${this.importPath}': ${this.message}`;
    
    const result = useColors
      ? c.red(c.bold(message))
      : message;
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    
    return this.appendOriginalError(
      baseFormatting.length > result.length ? baseFormatting : result,
      this.originalError
    );
  }
}

/**
 * Helper function to dump node information
 */
function dumpNode(result: string, originalNode?: unknown): string {
  if (!originalNode) return result;
  
  try {
    return `${result}\n\nFull node dump:\n${JSON.stringify(originalNode, null, 2)}`;
  } catch (e) {
    return `${result}\n\nCould not stringify original node: ${e instanceof Error ? e.message : String(e)}`;
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
    
    const result = useColors
      ? c.red(c.bold(`Error during ${this.phase} transformation: ${this.message}\nNode: ${this.nodeSummary}`))
      : `Error during ${this.phase} transformation: ${this.message}\nNode: ${this.nodeSummary}`;
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    
    return dumpNode(
      baseFormatting.length > result.length ? baseFormatting : result,
      this.originalNode
    );
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
    
    const result = useColors
      ? c.red(c.bold(`Error generating code for node type '${this.nodeType}': ${this.message}`))
      : `Error generating code for node type '${this.nodeType}': ${this.message}`;
    
    // Add base class formatting
    const baseFormatting = super.formatMessage(useColors);
    
    return dumpNode(
      baseFormatting.length > result.length ? baseFormatting : result,
      this.originalNode
    );
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
      result += `\nExpected type: ${this.expectedType}\nActual type: ${this.actualType}`;
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
    return node.length <= 3
      ? `[${node.map(summarizeNode).join(", ")}]`
      : `[${summarizeNode(node[0])}, ${summarizeNode(node[1])}, ... (${node.length} items)]`;
  }

  // Handle node objects based on common properties
  if ("type" in node) {
    let summary = `${(node as { type: string }).type}`;
    if ("name" in node) summary += ` "${(node as { name: string }).name}"`;
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
    return value.length > 100 ? `"${value.substring(0, 100)}..."` : `"${value}"`;
  }
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      return json.length > 200 
        ? JSON.stringify(value, null, 2).substring(0, 200) + "..." 
        : JSON.stringify(value, null, 2);
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
  
  if (error.stack) {
    report += `\nStack trace:\n${error.stack.split('\n').slice(1).join('\n')}\n`;
  }
  
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
  const msg = error.message.toLowerCase();
  
  // Use class-specific suggestions if available
  if (error instanceof BaseError) {
    return error.getSuggestion();
  }
  
  // Common error patterns
  if (msg.includes("unexpected ')'") || msg.includes("unexpected ']'") || msg.includes("unexpected '}'")) {
    return "Check for mismatched parentheses or brackets. You might have an extra closing delimiter or missing an opening one.";
  }
  if (msg.includes("unexpected end of input")) {
    return "Your expression is incomplete. Check for unclosed parentheses, brackets, or strings.";
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
    
    // Add suggestion
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
  
  // Add suggestion
  const suggestion = getSuggestion(error);
  if (suggestion) {
    const colorConfig = createColorConfig(options.useColors ?? true);
    result += `\n\nSuggestion: ${options.useColors ? colorConfig.cyan(suggestion) : suggestion}`;
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
  
  // For any transpiler error, ensure the options are set
  if (error instanceof TranspilerError) {
    // Create a new instance with merged options
    return TranspilerError.fromError(error, {
      source: options.source || error.source,
      filePath: options.filePath || error.filePath,
      line: options.line ?? error.line,
      column: options.column ?? error.column,
      useColors: options.useColors ?? true
    });
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
  const enhancedError = report(error, {
    source: options.source,
    filePath: options.filePath,
    line: options.line,
    column: options.column,
    useColors: options.useColors ?? true
  });
  
  const formatted = formatError(enhancedError, {
    useColors: options.useColors ?? true,
    includeStack: options.includeStack ?? options.verbose ?? false,
    makePathsClickable: options.useClickablePaths ?? true
  });
  
  console.error(options.verbose ? "\x1b[31m[VERBOSE ERROR]\x1b[0m" : "\x1b[31m[ERROR]\x1b[0m", formatted);
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
 * Translates a TypeScript error into a more user-friendly error.
 */
export function translateTypeScriptError(error: Error): Error {
  // Handle common TS error codes
  if (error.message.includes('TS2304')) {
    return new TranspilerError(
      `TypeScript could not find a variable or type name. Did you forget to declare or import it?\n\nOriginal: ${error.message}`
    );
  }
  if (error.message.includes('TS1005')) {
    return new TranspilerError(
      `TypeScript expected a semicolon or found unexpected syntax.\n\nOriginal: ${error.message}`
    );
  }
  
  // Default: wrap in TranspilerError for consistent formatting
  return new TranspilerError(`TypeScript Error: ${error.message}`);
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
        throw translateTypeScriptError(error);
      }
      throw error;
    }
  };
}

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
  registerSourceFile,
  getSourceFile,
  withErrorHandling,
  withTypeScriptErrorTranslation
};

export default CommonError;