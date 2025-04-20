/**
 * error-pipeline.ts
 * 
 * A consolidated error handling pipeline for HQL that provides:
 * 1. Standardized error collection, processing, and reporting
 * 2. Intuitive, concise error messages with clickable file paths
 * 3. Separation of core error info and debug details
 * 4. Easy extensibility for new error types
 */

import { basename } from "https://deno.land/std@0.170.0/path/mod.ts";

// ----- Error Configuration -----

export interface ErrorConfig {
  /** Whether to use colors in error output */
  useColors: boolean;
  /** Whether to make file paths clickable (terminal-dependent) */
  makePathsClickable: boolean;
  /** Whether to show full call stack (debug mode) */
  showCallStack: boolean;
  /** Whether to show verbose details about errors */
  verbose: boolean;
  /** Whether to show enhanced HQL-specific debugging info */
  enhancedDebug?: boolean;
}

export const DEFAULT_ERROR_CONFIG: ErrorConfig = {
  useColors: true,
  makePathsClickable: true,
  showCallStack: false,
  verbose: false,
  enhancedDebug: false,
};

// ----- Color Formatting -----

export type ColorFn = (s: string) => string;

export interface ColorConfig {
  red: ColorFn;
  yellow: ColorFn;
  gray: ColorFn;
  cyan: ColorFn;
  bold: ColorFn;
  green: ColorFn;
  blue: ColorFn;
}

export function createColorConfig(useColors: boolean): ColorConfig {
  const identity = (s: string) => s;
  return useColors
    ? {
        red: (s: string) => `\x1b[31m${s}\x1b[0m`,
        yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
        gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
        cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
        bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
        green: (s: string) => `\x1b[32m${s}\x1b[0m`,
        blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
      }
    : {
        red: identity,
        yellow: identity,
        gray: identity,
        cyan: identity,
        bold: identity,
        green: identity,
        blue: identity,
      };
}

// ----- Source File Registry -----

const sourceRegistry = new Map<string, string>();

export function registerSourceFile(filePath: string, source: string): void {
  sourceRegistry.set(filePath, source);
}

export function getSourceFile(filePath: string): string | undefined {
  return sourceRegistry.get(filePath);
}

// ----- Source Location -----

export interface SourceLocation {
  filePath?: string;
  line?: number;
  column?: number;
  source?: string;
}

// ----- Base Error Class -----

export class HQLError extends Error {
  public readonly errorType: string;
  public readonly sourceLocation: SourceLocation;
  public readonly originalError?: Error;
  public contextLines: string[] = [];
  public reported: boolean = false;

  constructor(
    message: string,
    options: {
      errorType?: string;
      sourceLocation?: SourceLocation;
      originalError?: Error;
    } = {}
  ) {
    super(message);
    this.name = options.errorType || "HQLError";
    this.errorType = options.errorType || "HQLError";
    this.sourceLocation = options.sourceLocation || {};
    this.originalError = options.originalError;
    
    // Try to load source and context
    this.extractSourceAndContext();
    
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Returns a concise one-line summary of the error
   */
  public getSummary(): string {
    const { filePath, line, column } = this.sourceLocation;
    const locationInfo = filePath 
      ? `${basename(filePath)}${line ? `:${line}${column ? `:${column}` : ""}` : ""}`
      : "";
      
    return locationInfo 
      ? `${this.errorType}: ${this.message} (${locationInfo})`
      : `${this.errorType}: ${this.message}`;
  }

  /**
   * Returns a helpful suggestion for fixing the error
   */
  public getSuggestion(): string {
    return "Check your code for syntax errors or incorrect types.";
  }
  
  /**
   * Check if this error relates to a circular dependency
   */
  protected isCircularDependencyError(): boolean {
    const msg = this.message.toLowerCase();
    return msg.includes("circular") && 
           (msg.includes("dependency") || msg.includes("reference") || msg.includes("import"));
  }

  /**
   * Loads source file content and extracts context lines for error
   */
  private extractSourceAndContext(): void {
    const { filePath, line, source: existingSource } = this.sourceLocation;
    
    // Skip if we already have all the context we need
    if (this.contextLines.length > 0) return;
    
    // Try to load source if we have a file path but no source
    let source = existingSource;
    if (filePath && !source) {
      try {
        source = getSourceFile(filePath);
        
        // Fallback to reading file directly if not in registry
        if (!source && typeof Deno !== 'undefined') {
          try {
            source = Deno.readTextFileSync(filePath);
            registerSourceFile(filePath, source);
          } catch {
            // Can't read file, continue without source
          }
        }
      } catch {
        // Failed to get source, continue without it
      }
    }
    
    // If we have source and line, extract context lines
    if (source && line) {
      this.extractContextLines(source, line);
    }
  }

  /**
   * Extracts context lines around the error position
   */
  private extractContextLines(source: string, errorLine: number): void {
    const lines = source.split('\n');
    
    // Check if line number is in range
    if (errorLine <= 0 || errorLine > lines.length) {
      // Line number out of range, show first few lines
      this.contextLines = lines.slice(0, Math.min(3, lines.length))
        .map((line, i) => `${i + 1} | ${line}`);
      
      if (errorLine > 0) {
        this.contextLines.push(`Note: Reported line ${errorLine} exceeds file length ${lines.length}`);
      }
      return;
    }
    
    // Calculate range for context (usually 1-2 lines before and after)
    const lineIndex = errorLine - 1;
    const contextSize = 2; // Show 2 lines before and after by default for better context
    const startLine = Math.max(0, lineIndex - contextSize);
    const endLine = Math.min(lines.length - 1, lineIndex + contextSize);
    
    // Add lines before error
    for (let i = startLine; i < lineIndex; i++) {
      this.contextLines.push(`${i + 1}| ${lines[i]}`);
    }
    
    // Add error line
    const currentLine = lines[lineIndex];
    this.contextLines.push(`${errorLine}| ${currentLine}`);
    
    // Add pointer line at column position
    if (this.sourceLocation.column && this.sourceLocation.column > 0) {
      let column = this.sourceLocation.column;
      
      // For unclosed list errors, adjust the column to point to the end of the line
      if (this.message.toLowerCase().includes("unclosed list") || 
          this.message.toLowerCase().includes("missing") && 
          this.message.toLowerCase().includes("closing")) {
        // Point to the end of the line for unclosed list errors
        // But if the line ends with whitespace, point to the last non-whitespace character
        const trimmedLine = currentLine.trimEnd();
        if (trimmedLine.length < currentLine.length) {
          column = trimmedLine.length + 1;
        } else {
          column = currentLine.length + 1;
        }
      }
      
      // Calculate pointer pad length (considering line number display)
      const lineNumLength = String(errorLine).length;
      const pointerPad = " ".repeat(lineNumLength + 2); // +2 for the "| " separator
      const pointerIndent = " ".repeat(column);
      
      // Add the pointer with "Error occurs here" label
      this.contextLines.push(`${pointerPad}${pointerIndent}^ Error occurs here`);
    }
    
    // Add lines after error
    for (let i = lineIndex + 1; i <= endLine; i++) {
      this.contextLines.push(`${i + 1}| ${lines[i]}`);
    }
  }
}

// ----- Specialized Error Types -----

export class ParseError extends HQLError {
  constructor(
    message: string,
    options: {
      line: number;
      column: number;
      filePath?: string;
      source?: string;
      originalError?: Error;
    }
  ) {
    super(message, {
      errorType: "Parse Error",
      sourceLocation: {
        line: options.line,
        column: options.column,
        filePath: options.filePath,
        source: options.source,
      },
      originalError: options.originalError,
    });
  }
  
  public override getSuggestion(): string {
    const msg = this.message.toLowerCase();
    
    // Provide specific suggestions based on common error patterns
    if (msg.includes("unclosed") || (msg.includes("missing") && msg.includes("closing"))) {
      return "Did you forget a closing parenthesis ')' or bracket ']' or brace '}'?";
    }
    
    if (msg.includes("missing opening")) {
      return "You have an extra closing delimiter without a matching opening one. Check the code structure around this location.";
    }
    
    if (msg.includes("unexpected ')'")) {
      return "Check for missing opening parenthesis '(' earlier in the code.";
    }
    
    if (msg.includes("unexpected ']'")) {
      return "Check for missing opening bracket '[' earlier in the code.";
    }
    
    if (msg.includes("unexpected '}'")) {
      return "Check for missing opening brace '{' earlier in the code.";
    }
    
    if (msg.includes("unexpected token") || msg.includes("unexpected ')'")) {
      return "Check for mismatched parentheses or incorrect syntax near this location.";
    }
    
    if (msg.includes("unexpected end of input")) {
      return "Your code ends unexpectedly. Check for unclosed blocks, missing closing delimiters, or incomplete expressions.";
    }
    
    if (msg.includes("unexpected identifier")) {
      return "There's an identifier or name in a position where it's not expected. Check the syntax around this area.";
    }
    
    if (msg.includes("enum")) {
      return "Check your enum syntax. Enums should be defined as (enum Name :Type [values...])";
    }
    
    if (msg.includes("import")) {
      return "Check your import syntax. Imports should be formatted as (import {symbols} \"path\")";
    }
    
    if (msg.includes("export")) {
      return "Check your export syntax. Exports should be formatted as (export symbol) or (export default symbol)";
    }
    
    // Look for specific character mentions
    if (msg.includes("expected") && msg.includes("but got")) {
      return "The syntax expected a different token or symbol than what was provided. Check the syntax requirements.";
    }
    
    // Mismatched bracket types
    if (msg.includes("mismatched brackets")) {
      return "You have mixed different types of brackets. Make sure each opening delimiter is closed with the matching type.";
    }
    
    // Default suggestion
    return "Check the syntax at this location. There may be a typo, incorrect indentation, or missing delimiter.";
  }
}

export class ImportError extends HQLError {
  public readonly importPath: string;
  
  constructor(
    message: string,
    importPath: string,
    options: {
      filePath?: string;
      line?: number;
      column?: number;
      source?: string;
      originalError?: Error;
    } = {}
  ) {
    super(message, {
      errorType: "Import Error",
      sourceLocation: {
        filePath: options.filePath,
        line: options.line,
        column: options.column,
        source: options.source,
      },
      originalError: options.originalError,
    });
    
    this.importPath = importPath;
  }
  
  public override getSuggestion(): string {
    if (this.isCircularDependencyError()) {
      return "Restructure your code to break the circular dependency chain, possibly by moving shared code to a separate module.";
    }
    
    if (this.message.toLowerCase().includes("cannot find") || this.message.toLowerCase().includes("not found")) {
      return `Check that the file "${this.importPath}" exists and the path is correct.`;
    }
    
    return `Check the import path and ensure the module "${this.importPath}" is accessible.`;
  }
}

export class ValidationError extends HQLError {
  public readonly context: string;
  public readonly expectedType?: string;
  public readonly actualType?: string;
  
  constructor(
    message: string,
    context: string,
    options: {
      expectedType?: string;
      actualType?: string;
      filePath?: string;
      line?: number;
      column?: number;
      source?: string;
      originalError?: Error;
    } = {}
  ) {
    super(message, {
      errorType: "Validation Error",
      sourceLocation: {
        filePath: options.filePath,
        line: options.line,
        column: options.column,
        source: options.source,
      },
      originalError: options.originalError,
    });
    
    this.context = context;
    this.expectedType = options.expectedType;
    this.actualType = options.actualType;
  }
  
  public override getSuggestion(): string {
    if (this.expectedType && this.actualType) {
      return `Expected a value of type ${this.expectedType} but got ${this.actualType}. Check the type of value you're using.`;
    }
    
    return "Ensure your code conforms to the expected type or structure.";
  }
}

export class MacroError extends HQLError {
  public readonly macroName: string;
  
  constructor(
    message: string,
    macroName: string,
    options: {
      filePath?: string;
      line?: number;
      column?: number;
      source?: string;
      originalError?: Error;
    } = {}
  ) {
    super(message, {
      errorType: "Macro Error",
      sourceLocation: {
        filePath: options.filePath,
        line: options.line,
        column: options.column,
        source: options.source,
      },
      originalError: options.originalError,
    });
    
    this.macroName = macroName;
  }
  
  public override getSuggestion(): string {
    return `Check the arguments and usage of the macro "${this.macroName}".`;
  }
}

export class TransformError extends HQLError {
  public readonly phase: string;
  
  constructor(
    message: string,
    phase: string,
    options: {
      filePath?: string;
      line?: number;
      column?: number;
      source?: string;
      originalError?: Error;
    } = {}
  ) {
    super(message, {
      errorType: "Transform Error",
      sourceLocation: {
        filePath: options.filePath,
        line: options.line,
        column: options.column,
        source: options.source,
      },
      originalError: options.originalError,
    });
    
    this.phase = phase;
  }
}

export class RuntimeError extends HQLError {
  constructor(
    message: string,
    options: {
      filePath?: string;
      line?: number;
      column?: number;
      source?: string;
      originalError?: Error;
    } = {}
  ) {
    super(message, {
      errorType: "Runtime Error",
      sourceLocation: {
        filePath: options.filePath,
        line: options.line,
        column: options.column,
        source: options.source,
      },
      originalError: options.originalError,
    });
  }
}

// ----- Error Pipeline Functions -----

/**
 * Make file paths in error messages clickable
 */
function makePathsClickable(text: string): string {
  // First pass: Format file paths with line and column numbers into a standardized clickable format
  // This regex looks for paths in formats like:
  // - filename.ext:line:col
  // - /path/to/file.ext:line
  // - ./relative/path.ext:line:col
  const formatted = text.replace(/([^\s"']+\.[a-zA-Z0-9]{1,5})(?::(\d+)(?::(\d+))?)?/g, (match, file, line, col) => {
    // Skip if already a file URL or if the path looks like an enum reference (e.g., Direction.north)
    if (match.startsWith("file://") || file.match(/^[A-Z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/)) {
      return match;
    }
    
    try {
      // Validate file path before processing
      if (!file || typeof file !== 'string' || file.includes('(') || file.includes(')')) {
        return match; // Return original match if path is invalid
      }
      
      // Skip module imports, enum references, and other non-filepath patterns
      if (file.includes('.') && !file.includes('/') && !file.includes('\\')) {
        // Check if this looks like a module or enum reference (MyModule.someFunction)
        const parts = file.split('.');
        if (parts.length === 2 && (
            // Skip if first part is capitalized (likely a class/enum)
            parts[0][0] === parts[0][0].toUpperCase() ||
            // Skip common module patterns
            ['module', 'exports', 'default', 'window', 'global'].includes(parts[0])
          )) {
          return match; // Likely an enum or class reference
        }
      }
      
      // For relative paths, keep them as-is but add proper file:// format
      if (file.startsWith('./') || file.startsWith('../')) {
        const location = line ? `:${line}${col ? `:${col}` : ""}` : "";
        return file + location;  // Return without file:// protocol for better IDE integration
      }
      
      // Check if this is likely a file path
      let isLikelyFile = false;
      let fullPath = file;
      
      try {
        // Check if the file exists and resolve its full path if possible
        const stat = Deno.statSync(file);
        if (stat.isFile) {
          isLikelyFile = true;
          try {
            fullPath = Deno.realPathSync(file);
          } catch {
            // If realpath fails, keep the original path
            fullPath = file;
          }
        }
      } catch {
        // If stat fails, check if it looks like a file path
        isLikelyFile = file.includes('/') || file.includes('\\') || 
                       file.match(/\.(js|ts|hql|json|md|txt)$/i) !== null;
        fullPath = file;
      }
      
      // Format the path in the IDE-clickable format (without file:// protocol for better compatibility)
      if (isLikelyFile) {
        const location = line ? `:${line}${col ? `:${col}` : ""}` : "";
        return fullPath + location;
      }
      
      return match;
    } catch (err) {
      // If any error occurs, keep the original match
      return match;
    }
  });
  
  return formatted;
}

/**
 * Format context lines with proper coloring
 */
function formatContextLines(
  lines: string[],
  config: ErrorConfig
): string {
  if (!lines.length) return "";
  
  const c = createColorConfig(config.useColors);
  let result = "";
  
  lines.forEach((line, i) => {
    // Check if this is the error pointer line (has a caret ^)
    const isPointerLine = line.includes("^");
    
    // Check if this is the error line (the line before the pointer)
    const isErrorLine = i > 0 && i+1 < lines.length && lines[i+1].includes("^");
    
    // Apply appropriate formatting based on line type
    if (isPointerLine) {
      // Make the pointer line stand out with bold red
      const formattedLine = config.useColors ? c.bold(c.red(line)) : line;
      result += `${formattedLine}\n`;
    } 
    else if (isErrorLine) {
      // Highlight the error line in yellow
      const formattedLine = config.useColors ? c.yellow(line) : line;
      result += `${formattedLine}\n`;
    } 
    else {
      // Regular context line in gray
      const formattedLine = config.useColors ? c.gray(line) : line;
      result += `${formattedLine}\n`;
    }
  });
  
  return result.trimEnd(); // Remove any trailing newline
}

/**
 * Enhance any error into an HQLError with source context
 */
export function enhanceError(
  error: unknown,
  options: {
    filePath?: string;
    line?: number;
    column?: number;
    source?: string;
  } = {}
): HQLError {
  // If it's already an HQLError, just update its source location if needed
  if (error instanceof HQLError) {
    const hqlError = error;
    
    // Merge source locations, preferring the provided options
    const sourceLocation: SourceLocation = {
      ...hqlError.sourceLocation,
      filePath: options.filePath || hqlError.sourceLocation.filePath,
      line: options.line || hqlError.sourceLocation.line,
      column: options.column || hqlError.sourceLocation.column,
      source: options.source || hqlError.sourceLocation.source,
    };
    
    // Create a new instance with the merged options
    const enhanced = new HQLError(hqlError.message, {
      errorType: hqlError.errorType,
      sourceLocation,
      originalError: hqlError.originalError,
    });
    
    // Preserve reported flag
    enhanced.reported = hqlError.reported;
    enhanced.contextLines = hqlError.contextLines;
    
    return enhanced;
  }
  
  // Convert non-Error objects to Error
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  // Extract source location from stack trace or error message
  let extractedLocation = extractLocationFromError(errorObj);
  
  // Merge extracted locations with provided options, prioritizing provided options
  const sourceLocation: SourceLocation = {
    ...extractedLocation,
    filePath: options.filePath || extractedLocation.filePath,
    line: options.line || extractedLocation.line,
    column: options.column || extractedLocation.column,
    source: options.source || extractedLocation.source,
  };
  
  // Ensure we have the source code if we have a file path but no source yet
  if (sourceLocation.filePath && !sourceLocation.source) {
    try {
      const registeredSource = getSourceFile(sourceLocation.filePath);
      if (registeredSource) {
        sourceLocation.source = registeredSource;
      } else {
        // Try to read directly from the file system if not in registry
        try {
          sourceLocation.source = Deno.readTextFileSync(sourceLocation.filePath);
          // Register for future use
          registerSourceFile(sourceLocation.filePath, sourceLocation.source);
        } catch {
          // Can't read file, continue without source
        }
      }
    } catch {
      // Failed to get source, continue without it
    }
  }

  // Determine the most appropriate error type based on the error message and context
  const msg = errorObj.message.toLowerCase();
  
  // Parse errors (syntax errors)
  if (
    msg.includes("parse error") || 
    msg.includes("syntax error") || 
    msg.includes("unexpected token") ||
    msg.includes("unclosed") ||
    msg.includes("unterminated") ||
    msg.includes("unexpected end of input") ||
    msg.includes("missing opening") ||
    msg.includes("mismatched brackets") ||
    (msg.includes("expected") && (msg.includes("but got") || msg.includes("found")))
  ) {
    if (sourceLocation.line && sourceLocation.column) {
      // Create a ParseError with improved message and context
      let enhancedMessage = errorObj.message;
      
      // Add more specific information for common syntax errors
      if (msg.includes("unclosed list")) {
        enhancedMessage = `Unclosed list declaration starting at line ${sourceLocation.line}. Check for a missing closing parenthesis ')'`;
      } else if (msg.includes("unexpected end of input")) {
        enhancedMessage = `Unexpected end of input at line ${sourceLocation.line}. Check for missing closing delimiters.`;
      } else if (msg.includes("unexpected token")) {
        enhancedMessage = `Syntax error at line ${sourceLocation.line}: ${errorObj.message}`;
      } else if (msg.includes("unexpected ')'") || msg.includes("unexpected ']'") || msg.includes("unexpected '}'")) {
        enhancedMessage = `${errorObj.message} at line ${sourceLocation.line}. This usually indicates a missing opening delimiter earlier in the code.`;
      } else if (msg.includes("missing opening")) {
        // Already has a good error message, just add line information
        enhancedMessage = `${errorObj.message} at line ${sourceLocation.line}`;
      }
      
      const parseErr = new ParseError(enhancedMessage, {
        line: sourceLocation.line,
        column: sourceLocation.column,
        filePath: sourceLocation.filePath,
        source: sourceLocation.source,
        originalError: errorObj,
      });
      
      return parseErr;
    }
  }
  
  // Import errors
  if (msg.includes("import") || msg.includes("cannot find module") || msg.includes("module not found")) {
    // Extract import path from error message
    const importPathMatch = msg.match(/['"]([^'"]+)['"]/);
    const importPath = importPathMatch ? importPathMatch[1] : "unknown";
    
    return new ImportError(`Error importing module: ${errorObj.message}`, importPath, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: errorObj,
    });
  }
  
  // Type errors and validation errors
  if (msg.includes("type") || msg.includes("expected") || msg.includes("invalid") || msg.includes("not a")) {
    // Extract expected vs actual type information if available
    const typeMatch = msg.match(/expected ([^,]+), got ([^.]+)/i);
    const expectedType = typeMatch ? typeMatch[1] : undefined;
    const actualType = typeMatch ? typeMatch[2] : undefined;
    
    return new ValidationError(errorObj.message, "type checking", {
      expectedType,
      actualType,
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: errorObj,
    });
  }
  
  // Fall back to general HQLError with source info
  return new HQLError(errorObj.message, {
    errorType: determineErrorType(errorObj),
    sourceLocation,
    originalError: errorObj,
  });
}

// Helper to determine a more specific error type when possible
function determineErrorType(error: Error): string {
  const msg = error.message.toLowerCase();
  
  if (msg.includes("syntax") || msg.includes("parse")) return "Syntax Error";
  if (msg.includes("type") || msg.includes("expected")) return "Type Error";
  if (msg.includes("import") || msg.includes("cannot find module")) return "Import Error";
  if (msg.includes("runtime")) return "Runtime Error";
  if (msg.includes("transform")) return "Transform Error";
  
  return "Error"; // Generic fallback
}

/**
 * Extract location information from an error's message and stack
 */
function extractLocationFromError(error: Error): SourceLocation {
  const sourceLocation: SourceLocation = {};
  
  // Try to extract from error message first
  if (error.message) {
    // Look for common patterns like "at line X" or "line X:Y"
    const lineMatches = [
      ...error.message.matchAll(/(?:at|on|in)?\s*line\s+(\d+)(?:[,:]\s*(?:column|col)?\s*(\d+))?/ig),
      ...error.message.matchAll(/(\d+):(\d+)(?:\s*-\s*\d+:\d+)?/g)
    ];

    if (lineMatches.length > 0) {
      const bestMatch = lineMatches[0];
      sourceLocation.line = parseInt(bestMatch[1], 10);
      if (bestMatch[2]) {
        sourceLocation.column = parseInt(bestMatch[2], 10);
      }
    }
    
    // Look for file paths
    const filePathMatches = error.message.match(/(?:in|at|from)\s+([^\s:]+\.[a-zA-Z0-9]{1,5})/i);
    if (filePathMatches) {
      sourceLocation.filePath = filePathMatches[1];
    }
  }
  
  // Try to extract from stack trace if no line/column was found
  if ((!sourceLocation.line || !sourceLocation.column) && error.stack) {
    const stackLines = error.stack.split('\n');
    for (const line of stackLines) {
      // Look for file paths with line/column info in stack traces
      const match = line.match(/\((.*):(\d+):(\d+)\)/) || line.match(/(.*):(\d+):(\d+)/);
      if (match) {
        const [_, filePath, lineNum, colNum] = match;
        // Skip node_modules, deno internal modules, etc.
        if (!filePath.includes("node_modules") && 
            !filePath.includes("deno:") &&
            !filePath.includes("ext:") &&
            !filePath.includes("<anonymous>")) {
          sourceLocation.filePath = sourceLocation.filePath || filePath;
          sourceLocation.line = sourceLocation.line || parseInt(lineNum, 10);
          sourceLocation.column = sourceLocation.column || parseInt(colNum, 10);
          break;
        }
      }
    }
  }
  
  return sourceLocation;
}

/**
 * Format an error for display
 */
export function formatError(
  error: Error | HQLError,
  config: ErrorConfig = DEFAULT_ERROR_CONFIG
): string {
  // Enhance the error if it's not already an HQLError
  const hqlError = error instanceof HQLError 
    ? error 
    : enhanceError(error);
  
  const c = createColorConfig(config.useColors);
  
  // Create a concise error header with clear type and location
  let result = "";
  
  // Format the location in a clickable way at the start of the message
  const { filePath, line, column } = hqlError.sourceLocation;
  
  // FILTER OUT non-HQL files completely
  if (filePath && !filePath.endsWith('.hql') && !filePath.includes('enum.hql') && !config.verbose) {
    // This is likely an internal file - show a generic message instead
    result += c.bold(c.red(`Error in your HQL code`));
    result += `\n  ${hqlError.message}`;
    
    // Add suggestion with clear heading
    const suggestion = typeof hqlError.getSuggestion === 'function' 
      ? hqlError.getSuggestion()
      : hqlError.getSuggestion;
    
    if (suggestion) {
      result += `\nSuggestion: ${suggestion}`;
    }
    
    // Let the user know we're hiding implementation details
    result += `\n\nFor more details, run with --verbose flag.`;
    
    return result;
  }
  
  // Create the header with error type and location
  const errorTypeText = c.bold(c.red(`${hqlError.errorType}`));
  
  if (filePath) {
    const locationText = line 
      ? `${filePath}:${line}${column ? `:${column}` : ""}` 
      : filePath;
    
    result += `${errorTypeText} in ${locationText}`;
  } else {
    result += errorTypeText;
  }
  
  // Add the main error message
  result += `\n  ${hqlError.message}`;
  
  // Add context (source code) with clear indication of error location
  if (hqlError.contextLines.length > 0) {
    result += `\n\nContext:\n${formatContextLines(hqlError.contextLines, config)}`;
  }
  
  // Add suggestion with clear heading
  const suggestion = typeof hqlError.getSuggestion === 'function' 
    ? hqlError.getSuggestion()
    : hqlError.getSuggestion;
  
  if (suggestion) {
    result += `\nSuggestion: ${suggestion}`;
  }
  
  // Add clickable paths notice if appropriate
  if (config.makePathsClickable && filePath && line) {
    result += `\nIn supported environments, ${filePath}:${line}${column ? `:${column}` : ""} will be clickable.`;
  }
  
  // Only show debug information if explicitly requested in verbose mode
  if (config.enhancedDebug && config.verbose) {
    // The rest of the debug code remains unchanged
    result += `\n\n${c.bold(c.blue("Debug Information:"))}`;
    
    // Add error type and inheritance information
    result += `\n${c.green("Error Type:")} ${hqlError.constructor.name}`;
    
    // Add error properties
    result += `\n${c.green("Error Properties:")}`;
    const props = Object.getOwnPropertyNames(hqlError)
      .filter(prop => !['stack', 'message', 'name', 'contextLines'].includes(prop));
      
    if (props.length) {
      for (const prop of props) {
        const value = (hqlError as any)[prop];
        if (typeof value === 'object' && value !== null) {
          result += `\n  ${c.yellow(prop)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}`;
        } else {
          result += `\n  ${c.yellow(prop)}: ${value}`;
        }
      }
    } else {
      result += `\n  (No custom properties)`;
    }
    
    // Add parser state information
    if (hqlError.originalError && 'parserState' in hqlError.originalError) {
      result += `\n${c.green("Parser State:")}`;
      try {
        const parserState = (hqlError.originalError as any).parserState;
        result += `\n  ${JSON.stringify(parserState, null, 2).replace(/\n/g, '\n  ')}`;
      } catch (e) {
        result += `\n  (Unable to display parser state)`;
      }
    }
    
    // Add original error information in debug mode
    if (config.verbose && hqlError.originalError && hqlError.originalError !== error) {
      result += `\n\n${c.gray("Original error:")} ${hqlError.originalError.message}`;
    }
    
    // Add stack trace in debug mode
    if (config.showCallStack) {
      if (hqlError.stack) {
        const stackLines = hqlError.stack.split('\n').slice(1); // Skip the first line which is the error message
        if (stackLines.length > 0) {
          result += `\n\n${c.gray("Stack trace:")}\n${stackLines.join('\n')}`;
        }
      }
      
      // Add original error stack if different and in debug mode
      if (hqlError.originalError && hqlError.originalError.stack && hqlError.originalError.stack !== hqlError.stack) {
        const originalStackLines = hqlError.originalError.stack.split('\n');
        result += `\n\n${c.gray("Original error stack:")}\n${originalStackLines.join('\n')}`;
      }
    }
  }
  
  // Make paths clickable if requested
  if (config.makePathsClickable) {
    result = makePathsClickable(result);
  }
  
  return result;
}

/**
 * Report an error to the console
 */
export function reportError(
  error: unknown,
  options: {
    filePath?: string;
    line?: number;
    column?: number;
    source?: string;
    verbose?: boolean;
    useColors?: boolean;
    makePathsClickable?: boolean;
    showCallStack?: boolean;
    enhancedDebug?: boolean;
    force?: boolean; // Force reporting even if already reported
  } = {}
): void {
  // Force hiding of internal details unless explicitly required in debug mode
  const isDebugMode = debugMode || options.verbose === true;
  
  // Create config from options
  const config: ErrorConfig = {
    useColors: options.useColors ?? DEFAULT_ERROR_CONFIG.useColors,
    makePathsClickable: options.makePathsClickable ?? DEFAULT_ERROR_CONFIG.makePathsClickable,
    showCallStack: isDebugMode && (options.showCallStack ?? false),
    verbose: isDebugMode,
    enhancedDebug: isDebugMode && (options.enhancedDebug ?? false),
  };
  
  // Enhance and format the error
  let hqlError = enhanceError(error, {
    filePath: options.filePath,
    line: options.line,
    column: options.column,
    source: options.source,
  });
  
  // Skip if already reported and not forced
  if (hqlError.reported && !options.force) {
    return;
  }
  
  // Mark as reported to prevent duplicate reporting
  hqlError.reported = true;
  
  // ONLY show HQL file errors - never internal implementation errors
  if (hqlError.sourceLocation.filePath && 
      !hqlError.sourceLocation.filePath.endsWith('.hql') && 
      !hqlError.sourceLocation.filePath.includes('enum.hql') && 
      !isDebugMode) {
    
    // Try to find an HQL file in the stack trace if this is not an HQL file error
    if (hqlError.originalError && hqlError.originalError.stack) {
      const hqlMatch = hqlError.originalError.stack.match(/([^"\s()]+\.hql):(\d+)(?::(\d+))?/);
      if (hqlMatch) {
        // Replace the source location with HQL file info
        hqlError = enhanceError(hqlError, {
          filePath: hqlMatch[1],
          line: hqlMatch[2] ? parseInt(hqlMatch[2], 10) : undefined,
          column: hqlMatch[3] ? parseInt(hqlMatch[3], 10) : undefined,
          // Don't override the source if we already have it
          source: hqlError.sourceLocation.source
        });
      } else {
        // Simplify the error for non-HQL files in non-debug mode
        console.error(`Error in your HQL code: ${hqlError.message}`);
        const suggestion = hqlError.getSuggestion();
        if (suggestion) {
          console.error(`Suggestion: ${suggestion}`);
        }
        console.error("For more details, run with --verbose flag.");
        return;
      }
    } else {
      // Simplify the error for non-HQL files in non-debug mode
      console.error(`Error in your HQL code: ${hqlError.message}`);
      const suggestion = hqlError.getSuggestion();
      if (suggestion) {
        console.error(`Suggestion: ${suggestion}`);
      }
      console.error("For more details, run with --verbose flag.");
      return;
    }
  }
  
  const formatted = formatError(hqlError, config);
  
  // Output to console
  console.error(formatted);
}

/**
 * Wrap a function with error handling
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T,
  options: {
    filePath?: string;
    source?: string;
    rethrow?: boolean;
    onError?: (error: HQLError) => void;
  } = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error: unknown) {
      // Enhance error with source context
      const hqlError = enhanceError(error, {
        filePath: options.filePath,
        source: options.source,
      });
      
      // Call error handler if provided
      if (options.onError) {
        // Only call if not already reported
        if (!hqlError.reported) {
          options.onError(hqlError);
        }
      } else {
        // Default error reporting
        reportError(hqlError);
      }
      
      // Rethrow by default unless explicitly set to false
      if (options.rethrow !== false) {
        throw hqlError;
      }
      
      return undefined as unknown as T;
    }
  };
}

// ----- Utility Functions -----

/**
 * Add a debug flag to control verbosity
 */
export let debugMode = false;

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

export function getDefaultErrorConfig(): ErrorConfig {
  return {
    ...DEFAULT_ERROR_CONFIG,
    showCallStack: debugMode,
    verbose: debugMode,
    enhancedDebug: debugMode,
  };
}

/**
 * Export a unified API for error handling
 */
export const ErrorPipeline = {
  // Configuration
  setDebugMode,
  getDefaultErrorConfig,
  
  // Core functionality
  enhanceError,
  formatError,
  reportError,
  withErrorHandling,
  
  // Error classes
  HQLError,
  ParseError,
  ImportError,
  ValidationError,
  MacroError,
  TransformError,
  RuntimeError,
  
  // Source registry
  registerSourceFile,
  getSourceFile,
};

export default ErrorPipeline; 