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
    
    this.attemptLoadSourceAndContext();
    
    Object.setPrototypeOf(this, TranspilerError.prototype);
  }

  private attemptLoadSourceAndContext(): void {
    // Try to load source if we have a file path but no source
    if (this.filePath && !this.source) {
      try {
        this.source = getSourceFile(this.filePath);
      } catch (e) {
        // Failed to load source file, try synchronous read as fallback
        try {
          // This is a Deno-specific API but we'll try it as a fallback
          if (typeof Deno !== 'undefined') {
            this.source = Deno.readTextFileSync(this.filePath);
            registerSourceFile(this.filePath, this.source);
          }
        } catch {
          // We can't read the file, continue without source
        }
      }
    }

    // Try to extract line numbers from the error message if not provided directly
    if (!this.line && this.message) {
      // Look for common patterns like "at line X" or "line X:Y"
      const lineMatches = [
        ...this.message.matchAll(/(?:at|on|in)?\s*line\s+(\d+)(?:[,:]\s*(?:column|col)?\s*(\d+))?/ig),
        ...this.message.matchAll(/(\d+):(\d+)(?:\s*-\s*\d+:\d+)?/g)
      ];

      if (lineMatches.length > 0) {
        const bestMatch = lineMatches[0];
        this.line = parseInt(bestMatch[1], 10);
        if (bestMatch[2] && !this.column) {
          this.column = parseInt(bestMatch[2], 10);
        }
      }
    }
    
    // Extract context lines if we have enough information
    if (this.source && this.line !== undefined) {
      this.extractContextLines();
    } else if (this.source && !this.line) {
      const lineMatch = this.message.match(/line (\d+)/i);
      const columnMatch = this.message.match(/column (\d+)/i);
      
      if (lineMatch) {
        this.line = parseInt(lineMatch[1], 10);
        this.column = columnMatch ? parseInt(columnMatch[1], 10) : undefined;
        this.extractContextLines();
      }
    }
  }
  
  private extractContextLines(): void {
    if (!this.source || this.line === undefined) return;
    
    const lines = this.source.split('\n');
    if (this.line <= 0 || this.line > lines.length) {
      // Line number is out of range, show first few lines instead
      this.contextLines = lines.slice(0, Math.min(5, lines.length))
        .map((line, i) => `${i + 1} │ ${line}`);
      if (this.line > 0) {
        this.contextLines.push(`Note: Reported line ${this.line} exceeds file length ${lines.length}`);
      }
      return;
    }
    
    const lineIndex = this.line - 1;
    const contextSize = 2; // Show 2 lines before and after the error line
    
    // Calculate range ensuring we don't go out of bounds
    const startLine = Math.max(0, lineIndex - contextSize);
    const endLine = Math.min(lines.length - 1, lineIndex + contextSize);
    
    // Add lines before error
    for (let i = startLine; i < lineIndex; i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
    }
    
    // Add error line
    const errorLine = lines[lineIndex];
    this.contextLines.push(`${this.line} │ ${errorLine}`);
    
    // Add pointer line if we have column information
    if (this.column !== undefined && this.column > 0) {
      const column = Math.min(this.column, errorLine.length + 1);
      const pointerSpaces = " ".repeat(column);
      this.contextLines.push(`  │ ${pointerSpaces}^`);
    } else {
      // If we can't determine exact position, try to infer it from the error message
      if (this.message) {
        // Look for quoted text, function names, or variables mentioned in the error
        const quotedText = this.message.match(/['"]([^'"]+)['"]/);
        const errorTerm = quotedText ? quotedText[1] : null; 
        
        if (errorTerm && errorLine.includes(errorTerm)) {
          const termIndex = errorLine.indexOf(errorTerm);
          const pointerSpaces = " ".repeat(termIndex + 1);
          const pointerMarks = "^".repeat(errorTerm.length);
          this.contextLines.push(`  │ ${pointerSpaces}${pointerMarks}`);
        } else {
          // Just underline the whole line
          this.contextLines.push(`  │ ${"~".repeat(errorLine.length)}`);
        }
      } else {
        // Default case - underline the whole line
        this.contextLines.push(`  │ ${"~".repeat(errorLine.length)}`);
      }
    }
    
    // Add lines after error
    for (let i = lineIndex + 1; i <= endLine; i++) {
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
    
    // Include error type for more clarity
    result += `\n${useColors ? c.cyan("Type:") : "Type:"} ${this.name}`;
    
    // Try to analyze error and provide more context
    const errorAnalysis = this.analyzeError();
    if (errorAnalysis) {
      result += `\n${useColors ? c.cyan("Analysis:") : "Analysis:"} ${errorAnalysis}`;
    }
    
    // Include stack information for better debugging
    if (this.stack) {
      const relevantStackLines = this.stack
        .split('\n')
        .slice(1, 4) // Take a few relevant stack frames
        .filter(line => !line.includes('/deno/') && !line.includes('node_modules/'));
      
      if (relevantStackLines.length > 0) {
        result += `\n${useColors ? c.cyan("Call stack:") : "Call stack:"}`;
        for (const line of relevantStackLines) {
          const cleanLine = line.trim().replace(/^at /, '');
          result += `\n  ${cleanLine}`;
        }
      }
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
  
  private analyzeError(): string | null {
    const msg = this.message.toLowerCase();
    
    // Check for common patterns and provide targeted advice
    if (msg.includes("map is not defined")) {
      return "You might be trying to use Array methods on a non-array, or the array hasn't been properly defined or imported.";
    }
    
    if (msg.includes("cannot read property") || msg.includes("null") || msg.includes("undefined")) {
      return "You're trying to access a property on a value that doesn't exist. Check that variables are properly initialized before use.";
    }
    
    if (msg.includes("is not a function") || msg.includes("not callable")) {
      return "You're attempting to call something that isn't a function. Check that the function exists and is spelled correctly.";
    }
    
    if (msg.includes("unexpected token") || msg.includes("unexpected identifier")) {
      return "There's a syntax error in your code. Check for missing or extra brackets, parentheses, commas, or semicolons.";
    }
    
    if (msg.includes("is not defined") || msg.includes("reference error")) {
      return "You're trying to use a variable or function that hasn't been defined or imported in this scope.";
    }
    
    if (msg.includes("maximum call stack") || msg.includes("stack overflow")) {
      return "You have an infinite recursion or a loop that's too deep. Check functions that call themselves or cyclical references.";
    }
    
    if (msg.includes("type error") || msg.includes("cannot") || msg.includes("invalid")) {
      return "You're using a value in a way that's incompatible with its type. Check type conversions and method usage.";
    }
    
    return null;
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
    const varMatch = msg.match(/['"]([^'"]+)['"]/);
    const varName = varMatch ? varMatch[1] : "variable";
    return `The ${varName} is not defined in this scope. Check for typos, make sure it's properly declared or imported.`;
  }
  
  if (msg.includes("null") || msg.includes("undefined is not an object")) {
    return "You're trying to access a property on null or undefined. Add a check before accessing properties (e.g., use optional chaining with '?.' or add a nullish check).";
  }
  
  if (msg.includes("map") && msg.includes("not defined")) {
    return "If you're trying to use Array.map(), make sure your variable is an array. If it's coming from a function, verify the return value type.";
  }
  
  if (msg.includes("is not a function")) {
    const fnMatch = msg.match(/([\w.]+) is not a function/);
    const fnName = fnMatch ? fnMatch[1] : "The item";
    return `${fnName} is not callable. Check that it's properly defined as a function and is spelled correctly.`;
  }
  
  if (msg.includes("maximum call stack size exceeded")) {
    return "You have an infinite recursion. If you have a recursive function, check your base case or stopping condition.";
  }
  
  if (msg.includes("type error") || msg.includes("type mismatch")) {
    return "The data types you're working with don't match what the operation expects. Try checking the types with console.log(typeof variable).";
  }
  
  if (msg.includes("import") || msg.includes("require")) {
    return "There's an issue with an import statement. Check that the file path is correct and the module is available.";
  }
  
  if (msg.includes("syntax error") || msg.includes("unexpected token")) {
    return "There's a syntax error in your code. Common issues include missing semicolons, unmatched brackets, or invalid property names.";
  }
  
  // Generic suggestion
  return "Try simplifying your code to isolate the problem. Break complex expressions into smaller parts and use console.log to debug values.";
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
  error: unknown,
  options: {
    source?: string;
    filePath?: string;
    line?: number;
    column?: number;
    useColors?: boolean;
  } = {}
): Error {
  // Convert non-Error objects to Error
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  // Extract source location from stack trace if not provided
  if (!options.line && !options.column && errorObj.stack) {
    const stackLines = errorObj.stack.split('\n');
    for (const line of stackLines) {
      // Look for file paths with line/column info in stack traces
      const match = line.match(/\((.*):(\d+):(\d+)\)/) || line.match(/(.*):(\d+):(\d+)/);
      if (match) {
        const [_, filePath, lineNum, colNum] = match;
        // Only use this if it points to a source file and not a node module
        if (!filePath.includes("node_modules") && !filePath.includes("deno:")) {
          options.filePath = options.filePath || filePath;
          options.line = options.line || parseInt(lineNum, 10);
          options.column = options.column || parseInt(colNum, 10);
          break;
        }
      }
    }
  }

  // Also look for line/column information in the error message itself
  if (!options.line || !options.column) {
    const msg = errorObj.message;
    const lineColMatches = [
      ...msg.matchAll(/(?:at|on|in)?\s*line\s+(\d+)(?:[,:]\s*(?:column|col)?\s*(\d+))?/ig),
      ...msg.matchAll(/(?:^|[^\d])(\d+):(\d+)(?:\s*-\s*\d+:\d+)?/g)
    ];

    if (lineColMatches.length > 0) {
      const bestMatch = lineColMatches[0];
      if (!options.line) options.line = parseInt(bestMatch[1], 10);
      if (!options.column && bestMatch[2]) options.column = parseInt(bestMatch[2], 10);
    }
  }

  // Handle specific error types
  if (errorObj instanceof BaseParseError) {
    return new ParseError(
      errorObj.message,
      errorObj.position,
      options.source || errorObj.source,
      options.useColors ?? true
    );
  }
  
  // For any transpiler error, ensure the options are set
  if (errorObj instanceof TranspilerError) {
    // Create a new instance with merged options
    return TranspilerError.fromError(errorObj, {
      source: options.source || errorObj.source,
      filePath: options.filePath || errorObj.filePath,
      line: options.line ?? errorObj.line,
      column: options.column ?? errorObj.column,
      useColors: options.useColors ?? true
    });
  }
  
  // Enhance generic errors with better classification and messages
  if (!(errorObj instanceof BaseError)) {
    const msg = errorObj.message.toLowerCase();
    
    // Common JavaScript runtime errors with better messages
    if (msg.includes("is not a function") || msg.includes("is not callable")) {
      const fnMatch = msg.match(/(?:^|[\s.,;])([\w.]+) is not a function/i);
      const fnName = fnMatch ? fnMatch[1] : "Unknown method";
      return new TranspilerError(
        `Runtime Error: Attempted to call something that is not a function. The method "${fnName}" either doesn't exist or is not a callable function.`,
        options
      );
    }
    
    if (msg.includes("cannot read property") || 
        msg.includes("cannot read") || 
        msg.includes("is null") || 
        msg.includes("is undefined")) {
      
      // Try to extract the property name and the null/undefined object
      const propMatch = msg.match(/property ['"](.*?)['"] of/i) || 
                       msg.match(/cannot read ['"](.*?)['"]/i);
      const objMatch = msg.match(/of (undefined|null)/i) ||
                      msg.match(/(undefined|null) has no/i);
      
      const propName = propMatch ? propMatch[1] : "unknown property";
      const objType = objMatch ? objMatch[1] : "null or undefined";
      
      return new TranspilerError(
        `Runtime Error: Cannot access property "${propName}" on ${objType}. Check that the object exists before accessing its properties.`,
        options
      );
    }
    
    if (msg.includes("maximum call stack") || msg.includes("stack overflow")) {
      return new TranspilerError(
        `Runtime Error: Maximum call stack size exceeded. This is likely caused by infinite recursion. Check for functions that call themselves without a termination condition.`,
        options
      );
    }
    
    if (msg.includes("map is not defined") || msg.includes("map is not a function")) {
      return new TranspilerError(
        `Runtime Error: The "map" method was called on something that is not an array. Check that your variable is an array before calling map().`,
        options
      );
    }
    
    // Improve handling of array method errors
    if (msg.includes("filter is not a function") || 
        msg.includes("reduce is not a function") ||
        msg.includes("join is not a function") ||
        msg.includes("flat is not a function") ||
        msg.includes("sort is not a function") ||
        msg.includes("forEach is not a function")) {
      
      const methodMatch = msg.match(/([\w.]+) is not a function/i);
      const methodName = methodMatch ? methodMatch[1] : "method";
      
      return new TranspilerError(
        `Runtime Error: The "${methodName}" method was called on something that is not an array or doesn't support this operation. Check that your variable has the correct type before calling "${methodName}()".`,
        options
      );
    }
    
    // Type errors
    if (msg.includes("is not assignable to") || msg.includes("is not of type")) {
      const expectedTypeMatch = msg.match(/expected [^\s,.:;]+/i) || msg.match(/type [^\s,.:;]+/i);
      const gotTypeMatch = msg.match(/got [^\s,.:;]+/i) || msg.match(/but was [^\s,.:;]+/i);
      
      const expectedType = expectedTypeMatch 
        ? expectedTypeMatch[0].replace(/^expected /i, "").replace(/^type /i, "") 
        : "unknown";
      const actualType = gotTypeMatch 
        ? gotTypeMatch[0].replace(/^got /i, "").replace(/^but was /i, "") 
        : "unknown";
      
      return new ValidationError(
        `Type mismatch: ${errorObj.message}`,
        "type checking",
        {
          ...options,
          expectedType,
          actualType
        }
      );
    }
    
    // Syntax errors 
    if (msg.includes("unexpected token") || 
        msg.includes("unexpected identifier") || 
        msg.includes("expected")) {
      
      // Try to extract the unexpected token
      const tokenMatch = msg.match(/unexpected token ['"](.+?)['"]/i) ||
                        msg.match(/unexpected (.+?)(?:\s|$)/i);
      const expectedMatch = msg.match(/expected (.+?)(?:\s|$)/i);
      
      const unexpected = tokenMatch ? tokenMatch[1] : "token";
      const expected = expectedMatch ? expectedMatch[1] : "different syntax";
      
      const errorMessage = `Syntax Error: Found unexpected ${unexpected}${expected ? `, expected ${expected}` : ''}.`;
      
      // If we have source and line info, create a proper ParseError
      if (options.source && options.line) {
        return new ParseError(
          errorMessage,
          { 
            line: options.line, 
            column: options.column || 1, 
            offset: 0 
          },
          options.source,
          options.useColors ?? true
        );
      }
      
      return new TranspilerError(errorMessage, options);
    }
    
    // Binding and scope errors
    if (msg.includes("is not defined") || 
        msg.includes("undefined variable") || 
        msg.includes("cannot find")) {
      
      const varMatch = msg.match(/['"]([^'"]+)['"]/);
      const varName = varMatch ? varMatch[1] : 
                     msg.match(/(\w+) is not defined/i)?.[1] || "unknown";
      
      return new TranspilerError(
        `Reference Error: The variable or function "${varName}" does not exist in this scope. Check spelling, imports, or add a declaration.`,
        options
      );
    }
    
    // Import errors
    if (msg.includes("failed to resolve") || 
        msg.includes("cannot find module") || 
        msg.includes("import") && (msg.includes("error") || msg.includes("failed"))) {
      
      const moduleMatch = msg.match(/['"]([^'"]+)['"]/);
      const modulePath = moduleMatch ? moduleMatch[1] : "unknown module";
      
      return new ImportError(
        `Failed to import module "${modulePath}"`,
        modulePath,
        {
          sourceFile: options.filePath,
          source: options.source,
          line: options.line,
          column: options.column
        }
      );
    }
  }
  
  // For generic errors, wrap them
  return TranspilerError.fromError(errorObj, options);
}

/**
 * Print an error to the console
 */
export function reportError(
  error: unknown,
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
    } catch (error: unknown) {
      if (options.logErrors !== false) {
        reportError(error, {
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