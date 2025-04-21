/**
 * error-pipeline.ts
 * 
 * A consolidated error handling pipeline for HQL that provides:
 * 1. Standardized error collection, processing, and reporting
 * 2. Error messages with file path, line, and column information
 * 3. Separation of core error info and debug details
 * 4. Support for specialized error types (Parse, Import, Validation, etc.)
 * 5. Source map support for accurate error reporting in HQL code
 */

import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { SourceMapConsumer } from "npm:source-map@0.7.3";
import { globalLogger } from "../logger.ts";

// Direct access to logger
const logger = globalLogger;

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
  /** Whether to use source maps for error location mapping */
  useSourceMaps?: boolean;
}

export const DEFAULT_ERROR_CONFIG: ErrorConfig = {
  useColors: true,
  makePathsClickable: true,
  showCallStack: false,
  verbose: false,
  enhancedDebug: false,
  useSourceMaps: true,
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
  white: ColorFn;
  magenta: ColorFn;
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
        white: (s: string) => `\x1b[37m${s}\x1b[0m`,
        magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
      }
    : {
        red: identity,
        yellow: identity,
        gray: identity,
        cyan: identity,
        bold: identity,
        green: identity,
        blue: identity,
        white: identity,
        magenta: identity,
      };
}

// ----- Source Registry -----

// Store source content by file path
const sourceRegistry = new Map<string, string>();

// Store source maps
const sourceMapRegistry = new Map<string, any>();

// Map of generated paths to original paths
const pathMappings = new Map<string, string>();

/**
 * Register source file for error reporting
 */
export function registerSourceFile(filePath: string, source: string): void {
  sourceRegistry.set(filePath, source);
  logger.debug(`Registered source file: ${filePath} (${source.length} bytes)`);
}

/**
 * Get source content for error reporting
 */
export function getSourceFile(filePath: string): string | undefined {
  return sourceRegistry.get(filePath);
}

/**
 * Register a source map with the registry
 */
export function registerSourceMap(
  generatedPath: string,
  originalPath: string,
  sourceMapContent: string | object,
  originalSource?: string
): void {
  try {
    // Store the path mapping
    pathMappings.set(generatedPath, originalPath);
    
    // Parse and store the source map
    const sourceMap = typeof sourceMapContent === 'string' 
      ? JSON.parse(sourceMapContent) 
      : sourceMapContent;
      
    sourceMapRegistry.set(generatedPath, sourceMap);
    
    // Register source content if available
    if (originalSource) {
      registerSourceFile(originalPath, originalSource);
    }
    
    logger.debug(`Registered source map: ${generatedPath} -> ${originalPath}`);
  } catch (error) {
    logger.error(`Failed to register source map: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ----- Source Location -----

export interface SourceLocation {
  filePath?: string;
  line?: number;
  column?: number;
  source?: string;
}

// ----- Base Error Class -----

/**
 * Create a structured error report for diagnostics/logging.
 * @param error The error object (Error or HQLError)
 * @param context A string describing the context in which the error occurred
 * @param metadata Optional additional metadata to include in the report
 */
export async function report(
  error: unknown,
  options: {
    filePath?: string;
    line?: number;
    column?: number;
    source?: string;
    verbose?: boolean;
    showCallStack?: boolean;
    makePathsClickable?: boolean;
    enhancedDebug?: boolean;
    force?: boolean;
    useSourceMaps?: boolean;
  } = {}
): Promise<void> {
  // Legacy alias for reportError
  return reportError(error, options);
}

export function createErrorReport(
  error: Error,
  context: string,
  metadata: Record<string, unknown> = {}
): Record<string, unknown> {
  const report: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    context,
    ...metadata,
  };
  // If the error is an HQLError, add more context
  if (typeof (error as any).sourceLocation === 'object') {
    report.sourceLocation = (error as any).sourceLocation;
  }
  if (typeof (error as any).errorType === 'string') {
    report.errorType = (error as any).errorType;
  }
  if (typeof (error as any).originalError === 'object' && (error as any).originalError !== error) {
    report.originalError = {
      name: (error as any).originalError.name,
      message: (error as any).originalError.message,
      stack: (error as any).originalError.stack,
    };
  }
  return report;
}

// ... rest of the error pipeline code ...

// Place TranspilerError after HQLError definition

/**
 * Transitional: TranspilerError for backward compatibility
 * This is an alias for HQLError, used to avoid breaking legacy imports.
 */

export class HQLError extends Error {
  public readonly errorType: string;
  public sourceLocation: SourceLocation; // Made mutable to allow source map updates
  public readonly originalError?: Error;
  public contextLines: { line: number; content: string; isError: boolean; column?: number }[] = [];
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
      ? `${path.basename(filePath)}${line ? `:${line}${column ? `:${column}` : ""}` : ""}`
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
   * Made public to allow updates after source map resolution
   */
  public extractSourceAndContext(): void {
    const { filePath, line, column, source: existingSource } = this.sourceLocation;
    
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
      this.extractContextLines(source, line, column);
    }
  }

  /**
   * Extracts context lines around the error position
   */
  private extractContextLines(source: string, errorLine: number, errorColumn?: number): void {
    const lines = source.split('\n');
    
    // Check if line number is in range
    if (errorLine <= 0 || errorLine > lines.length) {
      // Line number out of range, show first few lines
      this.contextLines = lines.slice(0, Math.min(3, lines.length))
        .map((content, i) => ({
          line: i + 1,
          content,
          isError: false
        }));
      
      if (errorLine > 0) {
        this.contextLines.push({
          line: errorLine,
          content: `Note: Reported line ${errorLine} exceeds file length ${lines.length}`,
          isError: true
        });
      }
      return;
    }
    
    // Calculate range for context (usually 2 lines before and after)
    const lineIndex = errorLine - 1;
    const startLine = Math.max(0, lineIndex - 2);
    const endLine = Math.min(lines.length - 1, lineIndex + 2);
    
    // Extract the relevant lines with metadata
    this.contextLines = [];
    for (let i = startLine; i <= endLine; i++) {
      this.contextLines.push({
        line: i + 1,
        content: lines[i],
        isError: i === lineIndex,
        column: i === lineIndex ? errorColumn : undefined
      });
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
      return "Add a closing parenthesis ')' to complete the expression.";
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
  
  public override getSuggestion(): string {
    if (this.phase.toLowerCase().includes("ast")) {
      return "There's an issue with the AST structure. Check your HQL syntax for valid expression forms.";
    }
    
    if (this.phase.toLowerCase().includes("ir")) {
      return "There's an issue with the intermediate representation. Check for invalid or unsupported HQL constructs.";
    }
    
    return `An error occurred during the ${this.phase} phase. Check your code for complex constructs that might not be supported.`;
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
  
  public override getSuggestion(): string {
    const msg = this.message.toLowerCase();
    
    if (msg.includes("undefined") || msg.includes("not defined")) {
      return "Check that all variables are properly defined before use, and verify import statements.";
    }
    
    if (msg.includes("null") || msg.includes("undefined is not an object")) {
      return "You're trying to access properties on a null or undefined value. Add a check before accessing properties.";
    }
    
    if (msg.includes("is not a function")) {
      return "You're trying to call something that's not a function. Check the variable type and spelling.";
    }
    
    if (msg.includes("cannot read property")) {
      const propMatch = msg.match(/property ['"](.*?)['"]/i);
      const prop = propMatch ? propMatch[1] : "property";
      return `Ensure the object exists before accessing the '${prop}' property.`;
    }
    
    return "Check for runtime type mismatches, undefined variables, or invalid operations.";
  }
}

export class CodeGenError extends HQLError {
  public readonly nodeType?: string;
  
  constructor(
    message: string,
    options: {
      nodeType?: string;
      filePath?: string;
      line?: number;
      column?: number;
      source?: string;
      originalError?: Error;
    } = {}
  ) {
    super(message, {
      errorType: "Code Generation Error",
      sourceLocation: {
        filePath: options.filePath,
        line: options.line,
        column: options.column,
        source: options.source,
      },
      originalError: options.originalError,
    });
    
    this.nodeType = options.nodeType;
  }
  
  public override getSuggestion(): string {
    if (this.nodeType) {
      return `There was a problem generating code for a ${this.nodeType} node. This might indicate an unsupported feature.`;
    }
    
    return "Check for complex or unsupported code patterns that might be causing code generation issues.";
  }
}

// ----- Source Map Utilities -----

/**
 * Map a position in generated code to the original source position
 */
export async function mapToOriginalPosition(
  generatedPath: string,
  line: number,
  column: number
): Promise<{ source: string; line: number; column: number } | null> {
  try {
    // Check if we have a source map for this file
    const sourceMap = sourceMapRegistry.get(generatedPath);
    if (!sourceMap) {
      return null;
    }
    
    // Initialize source map consumer
    const consumer = await new SourceMapConsumer(sourceMap);
    
    try {
      // Use the consumer to get original position
      const originalPosition = consumer.originalPositionFor({
        line,
        column
      });
      
      if (originalPosition.source && originalPosition.line !== null) {
        return {
          source: originalPosition.source,
          line: originalPosition.line,
          column: originalPosition.column || 0
        };
      }
    } finally {
      // Always destroy the consumer to free memory
      consumer.destroy();
    }
  } catch (error) {
    logger.debug(`Error mapping position: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // If we don't have a source map but we do have path mapping, return an approximation
  const originalPath = pathMappings.get(generatedPath);
  if (originalPath) {
    return {
      source: originalPath,
      line: line,
      column: column
    };
  }
  
  return null;
}

/**
 * Transform an error stack using source maps
 */
export async function transformErrorStack(error: Error): Promise<Error> {
  if (!error.stack) {
    return error;
  }
  
  try {
    // Parse the stack trace
    const lines = error.stack.split('\n');
    const transformedLines = [];
    
    // Keep the error message line
    transformedLines.push(lines[0]);
    
    // Process each stack frame
    let foundHqlPosition = false;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for position information in the stack frame
      const frameMatch = line.match(/at\s+(.+?)\s+\(?(.+):(\d+):(\d+)\)?/);
      if (frameMatch) {
        const [, functionName, filePath, lineStr, columnStr] = frameMatch;
        const lineNum = parseInt(lineStr, 10);
        const columnNum = parseInt(columnStr, 10);
        
        // Check if this is a generated file that we have source mapping for
        const originalPosition = await mapToOriginalPosition(filePath, lineNum, columnNum);
        
        if (originalPosition && originalPosition.source.endsWith('.hql')) {
          // We found a mapping to an HQL file
          transformedLines.push(
            `    at ${functionName || 'Object.execute'} (${originalPosition.source}:${originalPosition.line}:${originalPosition.column})`
          );
          foundHqlPosition = true;
        } else {
          // No mapping found, keep the original line
          transformedLines.push(line);
        }
      } else {
        // Line doesn't contain position info, keep it as is
        transformedLines.push(line);
      }
    }
    
    // Create a new error with the transformed stack
    const transformedError = new Error(error.message);
    transformedError.stack = transformedLines.join('\n');
    transformedError.name = error.name;
    
    return transformedError;
  } catch (transformError) {
    logger.error(`Error transforming stack trace: ${transformError instanceof Error ? transformError.message : String(transformError)}`);
    return error;
  }
}

// ----- Error Formatting -----

/**
 * Consistently format error messages regardless of error type
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch (e) {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Standardized error wrapper that preserves the original error
 * and adds context information
 * 
 * @param context Description of what was happening when the error occurred
 * @param error The original error
 * @param resource The file or resource being processed
 * @param currentFile The current file context (useful for import errors)
 * @param ErrorClass Optional custom error class to use
 * @returns Never returns - always throws an error
 */
export function wrapError<T extends ErrorConstructor = ErrorConstructor>(
  context: string,
  error: unknown,
  resource: string,
  currentFile?: string,
  ErrorClass?: T
): never {
  const errorMsg = `${context}: ${formatErrorMessage(error)}`;
  const ErrorConstructor = ErrorClass || Error;
  
  // Create the error with the formatted message
  const wrappedError = new ErrorConstructor(errorMsg);
  
  // Attach additional properties
  Object.assign(wrappedError, {
    resource,
    currentFile,
    cause: error instanceof Error ? error : undefined,
  });
  
  throw wrappedError;
}

/**
 * Formats an HQLError for display in the console
 */
export function formatHQLError(error: HQLError, config: ErrorConfig = DEFAULT_ERROR_CONFIG): string {
  // Create color configuration based on settings
  const colorConfig = createColorConfig(config.useColors);
  let output: string[] = [];
  
  // Format the error title with file location if available
  let errorTitle = colorConfig.red(colorConfig.bold(`${error.errorType}: ${error.message}`));
  if (error.sourceLocation?.filePath) {
    // Use VS Code compatible pattern: filepath:line:column
    const filepath = error.sourceLocation.filePath;
    const line = error.sourceLocation.line || 1;
    const column = error.sourceLocation.column || 1;
    
    if (config.makePathsClickable) {
      // Format in a way VSCode/Deno terminal will make clickable
      errorTitle += `\n${colorConfig.gray(`Location: ${filepath}:${line}:${column}`)}`;
    } else {
      errorTitle += `\n${colorConfig.gray(`Location: ${filepath}, line ${line}, column ${column}`)}`;
    }
  }
  output.push(errorTitle);

  // Add context lines if available
  if (error.contextLines && error.contextLines.length > 0) {
    output.push(''); // Empty line before context
    
    // Calculate the width needed for line numbers
    const maxLineNumber = Math.max(
      ...error.contextLines.map(item => item.line)
    );
    const lineNumberWidth = String(maxLineNumber).length;
    
    // Format each context line
    error.contextLines.forEach(({line: lineNo, content: text, isError, column}) => {
      const lineNumStr = String(lineNo).padStart(lineNumberWidth, ' ');
      
      // Format the line number
      const formattedLineNo = isError 
        ? colorConfig.red(colorConfig.bold(lineNumStr)) 
        : colorConfig.gray(lineNumStr);
      
      // Format the line content
      let formattedLine = ` ${formattedLineNo} │ ${text}`;
      if (isError) {
        formattedLine = colorConfig.yellow(formattedLine);
        
        // Add pointer to the error column if available
        if (column && column > 0) {
          const pointer = ' '.repeat(lineNumberWidth + 3 + column) + colorConfig.red(colorConfig.bold('^'));
          output.push(formattedLine);
          output.push(pointer);
        } else {
          output.push(formattedLine);
        }
      } else {
        output.push(colorConfig.gray(formattedLine));
      }
    });
  }
  
  // Add suggestion if available
  if (error.getSuggestion && typeof error.getSuggestion === 'function') {
    const suggestion = error.getSuggestion();
    if (suggestion) {
      output.push('');
      output.push(colorConfig.cyan(`Suggestion: ${suggestion}`));
    }
  }
  
  // Add call stack if requested
  if (config.showCallStack && error.originalError?.stack) {
    output.push('');
    output.push(colorConfig.gray('Stack trace:'));
    
    // Get the original stack trace and format it
    const stack = error.originalError.stack;
    const stackLines = stack.split('\n').slice(1); // Skip the first line (error message)
    
    // Format each line of the stack
    const formattedStack = stackLines
      .filter(line => !line.includes('node_modules'))
      .map(line => {
        // Make file paths stand out
        return line.replace(/\((.+?)(:(\d+):(\d+))?\)/g, (match, filePath, _, line, col) => {
          if (line && col) {
            return `(${colorConfig.cyan(filePath)}:${colorConfig.yellow(line)}:${colorConfig.yellow(col)})`;
          }
          return `(${colorConfig.cyan(filePath)})`;
        });
      })
      .join('\n');
      
    output.push(colorConfig.gray(formattedStack));
  }
  
  // Add debug info if requested
  if (config.enhancedDebug) {
    output.push('');
    output.push(colorConfig.magenta(colorConfig.bold('Debug Information:')));
    
    // Add error type and name
    output.push(colorConfig.magenta(`Error Type: ${error.errorType}`));
    output.push(colorConfig.magenta(`Error Name: ${error.name}`));
    
    // Add source location details
    if (error.sourceLocation) {
      output.push(colorConfig.magenta('Source Location:'));
      for (const [key, value] of Object.entries(error.sourceLocation)) {
        if (key !== 'source' && value !== undefined) { // Don't print the entire source
          output.push(colorConfig.magenta(`  ${key}: ${value}`));
        }
      }
    }
    
    // Add original error if available
    if (error.originalError) {
      output.push(colorConfig.magenta(`Original Error: ${error.originalError.name}: ${error.originalError.message}`));
    }
  }
  
  return output.join('\n');
}

export class TranspilerError extends HQLError {
  constructor(message: string, options: { [key: string]: unknown } = {}) {
    super(message, { ...options, errorType: (options as { errorType?: string }).errorType || "TranspilerError" });
    this.name = "TranspilerError";
  }
}

// ----- Error Pipeline Functions -----

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
    useSourceMaps: true,
  };
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
  
  // Extract location from error message or stack trace
  let sourceLocation = extractLocationFromError(errorObj);
  
  // Merge extracted locations with provided options, prioritizing provided options
  sourceLocation = {
    ...sourceLocation,
    filePath: options.filePath || sourceLocation.filePath,
    line: options.line || sourceLocation.line,
    column: options.column || sourceLocation.column,
    source: options.source || sourceLocation.source,
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

  // Determine the most appropriate error type and create the appropriate HQLError
  return createAppropriateErrorType(errorObj, sourceLocation);
}

/**
 * Create the most appropriate error type based on the error message and context
 */
function createAppropriateErrorType(
  error: Error, 
  sourceLocation: SourceLocation
): HQLError {
  const msg = error.message.toLowerCase();
  
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
      return new ParseError(error.message, {
        line: sourceLocation.line,
        column: sourceLocation.column,
        filePath: sourceLocation.filePath,
        source: sourceLocation.source,
        originalError: error,
      });
    }
  }
  
  // Import errors
  if (msg.includes("import") || msg.includes("cannot find module") || msg.includes("module not found")) {
    // Extract import path from error message
    const importPathMatch = msg.match(/['"]([^'"]+)['"]/);
    const importPath = importPathMatch ? importPathMatch[1] : "unknown";
    
    return new ImportError(`Error importing module: ${error.message}`, importPath, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: error,
    });
  }
  
  // Type errors and validation errors
  if (msg.includes("type") || msg.includes("expected") || msg.includes("invalid") || msg.includes("not a")) {
    // Extract expected vs actual type information if available
    const typeMatch = msg.match(/expected ([^,]+), got ([^.]+)/i);
    const expectedType = typeMatch ? typeMatch[1] : undefined;
    const actualType = typeMatch ? typeMatch[2] : undefined;
    
    return new ValidationError(error.message, "type checking", {
      expectedType,
      actualType,
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: error,
    });
  }
  
  // Runtime errors
  if (
    msg.includes("cannot read") || 
    msg.includes("is not defined") || 
    msg.includes("is not a function") || 
    msg.includes("null") || 
    msg.includes("undefined") ||
    msg.includes("runtime")
  ) {
    return new RuntimeError(error.message, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: error,
    });
  }
  
  // Transform errors
  if (msg.includes("transform") || msg.includes("ast") || msg.includes("ir")) {
    const phase = msg.includes("ast") ? "AST transformation" : 
                  msg.includes("ir") ? "IR generation" : "transformation";
    
    return new TransformError(error.message, phase, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: error,
    });
  }
  
  // Code generation errors
  if (msg.includes("code gen") || msg.includes("generation") || msg.includes("typescript")) {
    return new CodeGenError(error.message, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: error,
    });
  }
  
  // Fall back to general HQLError with source info
  return new HQLError(error.message, {
    errorType: determineErrorType(error),
    sourceLocation,
    originalError: error,
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
 * Report an error with proper formatting
 */
export async function reportError(
  error: unknown,
  options: {
    filePath?: string;
    line?: number;
    column?: number;
    source?: string;
    verbose?: boolean;
    showCallStack?: boolean;
    makePathsClickable?: boolean;
    enhancedDebug?: boolean;
    force?: boolean;
    useSourceMaps?: boolean;
  } = {}
): Promise<void> {
  // Apply source map transformation if needed
  if (options.useSourceMaps !== false && error instanceof Error && error.stack) {
    error = await transformErrorStack(error);
  }
  
  // Convert to HQLError if needed
  const hqlError = error instanceof HQLError ? error : enhanceError(error, {
    filePath: options.filePath,
    line: options.line,
    column: options.column,
    source: options.source
  });
  
  // Prevent double-reporting the same error
  if (hqlError.reported && !options.force) {
    return;
  }
  
  // Mark as reported to prevent duplicate reporting
  hqlError.reported = true;
  
  // Create config for this error report
  const config: ErrorConfig = {
    useColors: options.useColors ?? DEFAULT_ERROR_CONFIG.useColors,
    makePathsClickable: options.makePathsClickable ?? DEFAULT_ERROR_CONFIG.makePathsClickable,
    showCallStack: options.showCallStack ?? options.verbose ?? DEFAULT_ERROR_CONFIG.showCallStack,
    verbose: options.verbose ?? DEFAULT_ERROR_CONFIG.verbose,
    enhancedDebug: options.enhancedDebug ?? DEFAULT_ERROR_CONFIG.enhancedDebug,
    useSourceMaps: options.useSourceMaps ?? DEFAULT_ERROR_CONFIG.useSourceMaps,
  };
  
  // Format and output the error
  const formatted = formatHQLError(hqlError, config);
  console.error(formatted);
  
  // Add a separate line with the location in a VS Code-friendly format
  if (hqlError.sourceLocation?.filePath) {
    const { filePath, line, column } = hqlError.sourceLocation;
    if (filePath && line) {
      // Print location on its own line for VS Code to detect
      // Format: Location: /path/to/file.ts:10:5
      console.error(`Location: ${filePath}:${line}:${column || 1}`);
    }
  }
}

/**
 * Wrap a function with error handling
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T,
  options: {
    filePath?: string;
    source?: string;
    context?: string;
    rethrow?: boolean;
    onError?: (error: HQLError) => Promise<void> | void;
    useSourceMaps?: boolean;
  } = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error: unknown) {
      // Enhance error with source context
      const hqlError = error instanceof HQLError ? error : enhanceError(error, {
        filePath: options.filePath,
        source: options.source,
      });
      
      // Add context information if provided
      if (options.context) {
        hqlError.message = `${options.context}: ${hqlError.message}`;
      }
      
      // Apply source map transformation if needed
      if (options.useSourceMaps !== false && error instanceof Error && error.stack) {
        await transformErrorStack(error);
      }
      
      // Call error handler if provided
      if (options.onError) {
        const result = options.onError(hqlError);
        if (result instanceof Promise) {
          await result;
        }
      } else {
        // Default error reporting
        await reportError(hqlError, {
          useSourceMaps: options.useSourceMaps
        });
      }
      
      // Rethrow by default unless explicitly set to false
      if (options.rethrow !== false) {
        throw hqlError;
      }
      
      return undefined as unknown as T;
    }
  };
}

/**
 * Perform an operation with error handling
 * Synchronous version suitable for direct use in code
 */
export function perform<T>(
  fn: () => T,
  context?: string,
  errorType?: new (message: string, ...args: any[]) => HQLError,
  errorArgs?: any[],
  sourceContext?: SourceLocation
): T {
  try {
    return fn();
  } catch (error) {
    // If error is already of the expected type, just return it
    if (errorType && error instanceof errorType) {
      throw error;
    }

    // Prepare the message with context
    const msg = context
      ? `${context}: ${error instanceof Error ? error.message : String(error)}`
      : error instanceof Error
        ? error.message
        : String(error);

    // If an error type is specified, create a new error of that type
    if (errorType) {
      if (sourceContext) {
        throw new errorType(msg, {
          ...sourceContext,
          ...(Array.isArray(errorArgs) && errorArgs.length > 0 ? errorArgs[0] : {})
        });
      } else {
        throw new errorType(msg, ...(errorArgs || []));
      }
    }

    // Otherwise, use a generic HQLError with source context if available
    if (sourceContext) {
      throw new HQLError(msg, { sourceLocation: sourceContext });
    } else {
      throw new HQLError(msg);
    }
  }
}

/**
 * Perform an async operation with error handling
 */
export async function performAsync<T>(
  fn: () => Promise<T>,
  options: {
    context?: string;
    filePath?: string;
    source?: string;
    line?: number;
    column?: number;
    errorType?: new (message: string, ...args: any[]) => HQLError;
    errorArgs?: any[];
  } = {}
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Build context object for error reporting
    const sourceLocation: SourceLocation = {
      filePath: options.filePath,
      line: options.line,
      column: options.column,
      source: options.source
    };
    
    // If error is already of the expected type, just enhance it
    if (options.errorType && error instanceof options.errorType) {
      throw error;
    }

    // Prepare the message with context
    const msg = options.context
      ? `${options.context}: ${error instanceof Error ? error.message : String(error)}`
      : error instanceof Error
        ? error.message
        : String(error);

    // If an error type is specified, create a new error of that type
    if (options.errorType) {
      throw new options.errorType(msg, ...(options.errorArgs || []));
    }

    // Create a better error with source context
    throw new HQLError(msg, { sourceLocation });
  }
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
  formatHQLError,
  reportError,
  withErrorHandling,
  perform,
  performAsync,
  
  // Source map utilities
  registerSourceMap,
  mapToOriginalPosition,
  transformErrorStack,
  
  // Error classes
  HQLError,
  ParseError,
  ImportError,
  ValidationError,
  MacroError,
  TransformError,
  RuntimeError,
  CodeGenError,
  
  // Source registry
  registerSourceFile,
  getSourceFile,
};

export default ErrorPipeline;