/**
 * error-pipeline.ts
 * 
 * A consolidated error handling pipeline for HQL that provides:
 * 1. Standardized error collection, processing, and reporting
 * 2. Intuitive, concise error messages with clickable file paths
 * 3. Separation of core error info and debug details
 * 4. Easy extensibility for new error types
 */

import * as colors from "./colors.ts";
import { basename } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transformErrorStack as sourceMapTransform, mapToOriginalPosition } from "./error-source-map-registry.ts";
import { globalLogger } from "../logger.ts";
import { withErrorHandling as commonWithErrorHandling } from "./common-errors.ts";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { SourceMapConsumer } from "npm:source-map@0.7.3";

// Use the logger directly  
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
  public sourceLocation: SourceLocation; // Made mutable to allow source map updates
  public readonly originalError?: Error;
  public contextLines: { line: number; content: string; isError: boolean }[] = [];
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
   * Made public to allow updates after source map resolution
   */
  public extractSourceAndContext(): void {
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
    
    // Calculate range for context (usually 1-2 lines before and after)
    const lineIndex = errorLine - 1;
    const startLine = Math.max(0, lineIndex - 2);
    const endLine = Math.min(lines.length - 1, lineIndex + 2);
    
    // Extract the relevant lines with metadata
    this.contextLines = [];
    for (let i = startLine; i <= endLine; i++) {
      this.contextLines.push({
        line: i + 1,
        content: lines[i],
        isError: i === lineIndex
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
 * Formats an HQLError for display in the console
 */
export function formatHQLError(error: HQLError, config: ErrorConfig = DEFAULT_ERROR_CONFIG): string {
  // Create color configuration based on settings
  const colorConfig = createColorConfig(config.useColors);
  let output: string[] = [];
  
  // Format the error title with file location if available
  let errorTitle = colorConfig.red(colorConfig.bold(`Error: ${error.message}`));
  if (error.sourceLocation?.filePath) {
    // Use VS Code compatible pattern: filepath:line:column (no makePathsClickable needed)
    // VS Code will automatically detect this pattern and make it clickable
    const location = `${error.sourceLocation.filePath}:${error.sourceLocation.line || 1}:${error.sourceLocation.column || 1}`;
    errorTitle += `\n${colorConfig.gray(`Location: ${location}`)}`;
  }
  output.push(errorTitle);

  // Add context lines if available
  if (error.contextLines && error.contextLines.length > 0) {
    output.push(''); // Empty line before context
    
    // Extract line numbers and identify error line
    const contextLinesArray = Array.from(error.contextLines);
    const errorLineItem = contextLinesArray.find(item => item.isError);
    const errorLineNumber = errorLineItem?.line || 1;
    const maxDigits = Math.max(...contextLinesArray.map(item => String(item.line).length));
    
    // Format each context line
    contextLinesArray.forEach(({line: lineNo, content: text, isError}) => {
      const lineNumStr = String(lineNo).padStart(maxDigits, ' ');
      
      // Format the line number
      const formattedLineNo = isError 
        ? colorConfig.red(colorConfig.bold(lineNumStr)) 
        : colorConfig.gray(lineNumStr);
      
      // Format the line content
      let formattedLine = ` ${formattedLineNo} │ ${text}`;
      if (isError) {
        formattedLine = colorConfig.red(formattedLine);
        
        // Add pointer to the error column if available
        if (error.sourceLocation?.column && error.sourceLocation.column > 0) {
          const pointer = ' '.repeat(maxDigits + 3 + error.sourceLocation.column) + colorConfig.red(colorConfig.bold('^'));
          output.push(formattedLine);
          output.push(pointer);
        } else {
          output.push(formattedLine);
        }
      } else {
        output.push(formattedLine);
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
  if (config.showCallStack && error.originalError instanceof Error && error.originalError.stack) {
    output.push('');
    output.push(colorConfig.gray('Stack trace:'));
    
    // Get the original stack trace
    const stack = error.originalError.stack;
    output.push(colorConfig.gray(stack.split('\n').slice(1).join('\n')));
  }
  
  return output.join('\n');
}

/**
 * Makes file paths clickable in terminals that support hyperlinks
 */
export function makePathsClickable(fileLocation: string): string {
  // For VS Code and Cursor, we'll just return the file location directly
  // VS Code has built-in pattern recognition for file paths with line:column format
  
  // This approach relies on the IDE's ability to recognize patterns like:
  // /path/to/file.js:10:5 or file.js:10:5
  
  return fileLocation;
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
  
  // Special handling for "X is not defined" errors
  if (errorObj.message.includes("is not defined")) {
    const match = errorObj.message.match(/([a-zA-Z0-9_$]+) is not defined/);
    if (match && match[1]) {
      const undefinedTerm = match[1];
      
      // Get the file path - either from provided options, extracted location, or stack
      const filePath = options.filePath || sourceLocation.filePath || extractFilePathFromStack(errorObj.stack);
      
      if (filePath) {
        // Look for the term in the source file
        const source = options.source || sourceLocation.source || getSourceFile(filePath);
        
        if (source) {
          // Find the term in the source
          const position = findTermInSource(source, undefinedTerm);
          if (position) {
            // Update source location with the found position
            sourceLocation = {
              ...sourceLocation,
              filePath,
              line: position.line,
              column: position.column,
              source,
            };
          }
        }
      }
    }
  }
  
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
      // Create a ParseError with improved message and context
      let enhancedMessage = error.message;
      
      return new ParseError(enhancedMessage, {
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
  
  // Fall back to general HQLError with source info
  return new HQLError(error.message, {
    errorType: determineErrorType(error),
    sourceLocation,
    originalError: error,
  });
}

function findTermInSource(
  source: string,
  term: string
): { line: number; column: number } | null {
  const lines = source.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const column = lines[i].indexOf(term);
    if (column !== -1) {
      return { line: i + 1, column: column + 1 };
    }
  }
  
  return null;
}

function extractFilePathFromStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  
  // Look for .hql files in stack trace
  const match = stack.match(/\(([^:]+\.hql):[0-9]+:[0-9]+\)/);
  if (match) {
    return match[1];
  }
  
  return undefined;
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
 * Transform an error stack using source maps if available
 */
function transformErrorStack(error: Error, useSourceMaps: boolean = true): Error {
  if (!useSourceMaps) return error;
  
  try {
    // Use the source map transformation function if it exists
    if (sourceMapTransform && typeof sourceMapTransform === 'function') {
      const transformed = sourceMapTransform(error);
      // Handle case where the transform returns a Promise
      if (transformed instanceof Promise) {
        // Can't do async handling here, so we'll return the original error
        logger.debug("Source map transformation returned a Promise, can't use async result");
        return error;
      }
      return transformed;
    }
  } catch (e) {
    // Silently fail if source map transformation fails
    logger.debug(`Error transforming stack trace: ${e}`);
  }
  
  return error;
}

/**
 * Report an error with proper formatting
 */
export function reportError(
  error: unknown,
  options: {
    filePath?: string;
    line?: number;
    column?: number;
    source?: string;
    force?: boolean;
    useSourceMaps?: boolean;
  } = {}
): void {
  // Apply source map transformation if needed
  if (options.useSourceMaps !== false && error instanceof Error) {
    error = transformErrorStack(error, options.useSourceMaps);
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
  
  // Get config with proper source map setting
  const config = getDefaultErrorConfig();
  if (options.useSourceMaps !== undefined) {
    config.useSourceMaps = options.useSourceMaps;
  }
  
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
    useSourceMaps: true,
  };
}

/**
 * Wrap a function with error handling, enhanced with source maps
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T,
  options: {
    filePath?: string;
    source?: string;
    rethrow?: boolean;
    onError?: (error: HQLError) => Promise<void> | void;
    useSourceMaps?: boolean;
  } = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error: unknown) {
      // Transform error stack using source maps if needed
      if (options.useSourceMaps !== false && error instanceof Error) {
        error = transformErrorStack(error, options.useSourceMaps);
      }
      
      // Enhance error with source context
      const hqlError = error instanceof HQLError ? error : enhanceError(error, {
        filePath: options.filePath,
        source: options.source,
      });
      
      // Call error handler if provided
      if (options.onError) {
        // Only call if not already reported
        if (!hqlError.reported) {
          const result = options.onError(hqlError);
          if (result instanceof Promise) {
            await result;
          }
        }
      } else {
        // Default error reporting
        reportError(hqlError, {
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
