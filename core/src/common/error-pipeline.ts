/**
 * error-pipeline.ts
 * 
 * A unified error handling pipeline for HQL that provides:
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

// Centralized registry for source code content, source maps, and path mappings
class SourceRegistry {
  private sources = new Map<string, string>();
  private sourceMaps = new Map<string, Record<string, unknown>>();
  private pathMap = new Map<string, string>();

  /** Register source file for error reporting */
  registerSource(filePath: string, source: string): void {
    this.sources.set(filePath, source);
    logger.debug(`Registered source file: ${filePath} (${source.length} bytes)`);
  }

  /** Get source content for error reporting */
  getSource(filePath: string): string | undefined {
    return this.sources.get(filePath);
  }

  /** Load source file if not already in registry */
  loadSourceIfNeeded(filePath: string): string | undefined {
    let source = this.getSource(filePath);
    
    // Try to load the file if it's not in the registry
    if (!source && filePath && typeof Deno !== 'undefined') {
      try {
        source = Deno.readTextFileSync(filePath);
        this.registerSource(filePath, source);
      } catch {
        // Failed to read file, return undefined
      }
    }
    
    return source;
  }

  /** Register a source map with the registry */
  registerSourceMap(
    generatedPath: string,
    originalPath: string,
    sourceMapContent: string | object,
    originalSource?: string
  ): void {
    try {
      // Store the path mapping
      this.pathMap.set(generatedPath, originalPath);
      
      // Parse and store the source map
      const sourceMap = typeof sourceMapContent === 'string' 
        ? JSON.parse(sourceMapContent) 
        : sourceMapContent;
        
      this.sourceMaps.set(generatedPath, sourceMap);
      
      // Register source content if available
      if (originalSource) {
        this.registerSource(originalPath, originalSource);
      }
      
      logger.debug(`Registered source map: ${generatedPath} -> ${originalPath}`);
    } catch (error) {
      logger.warn(`Failed to register source map: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Get the original path for a generated path */
  getOriginalPath(generatedPath: string): string | undefined {
    return this.pathMap.get(generatedPath);
  }

  /** Get source map for a generated path */
  getSourceMap(generatedPath: string): Record<string, unknown> | undefined {
    return this.sourceMaps.get(generatedPath);
  }

  /** Clear all registries */
  clear(): void {
    this.sources.clear();
    this.sourceMaps.clear();
    this.pathMap.clear();
  }
}

// Global source registry instance
const registry = new SourceRegistry();

// ----- Source Location -----

export interface SourceLocation {
  filePath?: string;
  line?: number;
  column?: number;
  source?: string;
}

/**
 * Source location with utility methods for error reporting
 */
export class SourceLocationInfo implements SourceLocation {
  public filePath?: string;
  public line?: number;
  public column?: number;
  public source?: string;
  
  constructor(options: SourceLocation = {}) {
    this.filePath = options.filePath;
    this.line = options.line;
    this.column = options.column;
    this.source = options.source;
  }
  
  /**
   * Loads source content if available
   */
  loadSource(): string | undefined {
    if (this.source) return this.source;
    if (!this.filePath) return undefined;
    
    this.source = registry.loadSourceIfNeeded(this.filePath);
    return this.source;
  }
  
  /**
   * Returns a formatted location string (file:line:column)
   */
  toString(): string {
    if (!this.filePath) return "<unknown location>";
    
    const lineInfo = this.line ? `:${this.line}` : "";
    const colInfo = this.line && this.column ? `:${this.column}` : "";
    
    return `${this.filePath}${lineInfo}${colInfo}`;
  }
  
  /**
   * Creates a copy of this location
   */
  clone(): SourceLocationInfo {
    return new SourceLocationInfo(this);
  }
  
  /**
   * Extracts context lines from the source around the error position
   */
  extractContextLines(contextLineCount = 2): Array<{ line: number; content: string; isError: boolean; column?: number }> {
    const source = this.loadSource();
    if (!source || !this.line) return [];
    
    const errorLine = this.line;
    const errorColumn = this.column;
    const lines = source.split('\n');
    
    // Check if line number is in range
    if (errorLine <= 0 || errorLine > lines.length) {
      // Line number out of range, show first few lines
      return lines.slice(0, Math.min(3, lines.length))
        .map((content, i) => ({
          line: i + 1,
          content,
          isError: false
        }));
    }
    
    // Extract context lines around the error
    const startLine = Math.max(1, errorLine - contextLineCount);
    const endLine = Math.min(lines.length, errorLine + contextLineCount);
    
    const contextLines = [];
    for (let i = startLine; i <= endLine; i++) {
      contextLines.push({
        line: i,
        content: lines[i - 1],
        isError: i === errorLine,
        column: i === errorLine ? errorColumn : undefined
      });
    }
    
    return contextLines;
  }
}

// ----- Legacy API Compatibility -----

/**
 * Register source file for error reporting (legacy API)
 */
export function registerSourceFile(filePath: string, source: string): void {
  registry.registerSource(filePath, source);
}

/**
 * Get source content for error reporting (legacy API)
 */
export function getSourceFile(filePath: string): string | undefined {
  return registry.getSource(filePath);
}

/**
 * Register a source map with the registry (legacy API)
 */
export function registerSourceMap(
  generatedPath: string,
  originalPath: string,
  sourceMapContent: string | object,
  originalSource?: string
): void {
  registry.registerSourceMap(generatedPath, originalPath, sourceMapContent, originalSource);
}

// ----- Error Types -----

/**
 * Enumeration of supported error types for better type safety
 */
export enum ErrorType {
  GENERIC = "Error",
  PARSE = "Parse Error",
  IMPORT = "Import Error",
  VALIDATION = "Validation Error",
  MACRO = "Macro Error",
  TRANSFORM = "Transform Error",
  RUNTIME = "Runtime Error",
  CODEGEN = "Code Generation Error",
  TRANSPILER = "Transpiler Error", // Legacy type
}

// ----- Base Error Class -----

/**
 * Create a structured error report for diagnostics/logging.
 * @param error The error object (Error or HQLError)
 * @param context A string describing the context in which the error occurred
 * @param metadata Additional data to include in the error report
 * @param options Configuration options for error reporting
 */
export async function report(
  error: unknown,
  context: string,
  metadata: Record<string, unknown> = {},
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
  // Create a source location object from the options
  const sourceLocation = new SourceLocationInfo({
    filePath: options.filePath,
    line: options.line,
    column: options.column,
    source: options.source
  });
  
  // Wrap error in HQLError if needed, but preserve original
  const enhancedError = error instanceof HQLError
    ? error
    : new HQLError(String(error), { sourceLocation });
  
  // Add context if provided
  if (context) {
    enhancedError.message = `${context}: ${enhancedError.message}`;
  }
  
  // Combine with metadata if provided
  if (Object.keys(metadata).length > 0) {
    if (!enhancedError.metadata) {
      enhancedError.metadata = {};
    }
    Object.assign(enhancedError.metadata, metadata);
  }
  
  // Forward to standard error reporting
  await reportError(enhancedError, options);
}

export function createErrorReport(
  error: Error,
  context: string,
  metadata: Record<string, unknown> = {}
): Record<string, unknown> {
  // Basic error properties
  const report: Record<string, unknown> = {
    message: error.message,
    name: error.name,
    context,
    timestamp: new Date().toISOString(),
  };
  
  // Add stack trace if available
  if (error.stack) {
    report.stack = error.stack;
  }
  
  // Add source location for HQL errors
  if (error instanceof HQLError && error.sourceLocation) {
    report.location = {
      filePath: error.sourceLocation.filePath,
      line: error.sourceLocation.line,
      column: error.sourceLocation.column,
      formattedLocation: error.sourceLocation.toString()
    };
  }
  
  // Add metadata if provided
  if (Object.keys(metadata).length > 0) {
    report.metadata = metadata;
  }
  
  return report;
}

// ----- HQL Error Class -----

/**
 * Base error class for all HQL-related errors
 * Provides source location tracking, context extraction, and common error utilities
 */
export class HQLError extends Error {
  /** Type of error, used for categorization and helpful error messages */
  public readonly errorType: string;
  
  /** Location information for this error */
  public sourceLocation: SourceLocationInfo;
  
  /** The original error that caused this HQL error, if any */
  public readonly originalError?: Error;
  
  /** Context lines around the error location */
  public contextLines: { line: number; content: string; isError: boolean; column?: number }[] = [];
  
  /** Line number where the error occurred */
  public line: number | undefined;
  
  /** Column number where the error occurred */
  public column: number | undefined;
  
  /** Path to the file where the error occurred */
  public filePath: string | undefined;
  
  /** Source code content */
  public source: string | undefined;
  
  /** Alias for filePath to match TypeScript error format */
  public filename: string | undefined;
  
  /** Whether this error has been reported already (prevents duplicate reporting) */
  public reported = false;
  
  /** Additional metadata associated with this error */
  public metadata: Record<string, unknown> = {};

  /**
   * Create a new HQL Error
   * @param message The error message
   * @param options Configuration options
   */
  constructor(
    message: string,
    options: {
      errorType?: string | ErrorType;
      sourceLocation?: SourceLocation;
      originalError?: Error;
    } = {}
  ) {
    super(message);
    this.name = "HQLError";
    
    // Normalize error type (accept string or ErrorType enum)
    this.errorType = typeof options.errorType === 'string' 
      ? options.errorType 
      : options.errorType || ErrorType.GENERIC;
    
    // Create a SourceLocationInfo from the provided location
    this.sourceLocation = options.sourceLocation instanceof SourceLocationInfo
      ? options.sourceLocation
      : new SourceLocationInfo(options.sourceLocation || {});
    
    this.originalError = options.originalError;

    // Copy source location props to top level for easier access
    this.filePath = this.sourceLocation.filePath;
    this.line = this.sourceLocation.line;
    this.column = this.sourceLocation.column;
    this.source = this.sourceLocation.source;
    
    // Match TypeScript error format
    this.filename = this.filePath;

    // Extract source code context lines if we have location info
    if (this.line || this.filePath) {
      this.extractSourceAndContext();
    }

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
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
    // Provide a default suggestion based on the error type
    return "Check the documentation for more information.";
  }
  
  /**
   * Check if this error relates to a circular dependency
   */
  public isCircularDependencyError(): boolean {
    const msg = this.message.toLowerCase();
    return msg.includes("circular") && 
           (msg.includes("dependency") || msg.includes("reference") || msg.includes("import"));
  }

  /**
   * Loads source file content and extracts context lines for error
   * Made public to allow updates after source map resolution
   */
  public extractSourceAndContext(): void {
    // Skip if we already have all the context we need
    if (this.contextLines.length > 0) return;
    
    // Load source content if available
    const source = this.sourceLocation.loadSource();
    
    // If we have source and line, extract context lines
    if (source && this.sourceLocation.line) {
      this.contextLines = this.sourceLocation.extractContextLines();
    }
  }
}

// ----- Specialized Error Types -----
export class ParseError extends HQLError {
  public position?: { line: number; column: number; offset: number; filePath?: string };
  
  constructor(
    message: string,
    positionOrOptions: { line: number; column: number; offset?: number; filePath?: string } | any,
    inputOrSource?: string
  ) {
    // Handle both old and new signatures with proper super() first
    let sourceLocation: SourceLocation = {};
    let originalError: Error | undefined;
    
    if (positionOrOptions && typeof positionOrOptions === 'object') {
      if ('line' in positionOrOptions && 'column' in positionOrOptions) {
        // We have a position object
        sourceLocation = {
          line: positionOrOptions.line,
          column: positionOrOptions.column,
          filePath: positionOrOptions.filePath,
          source: inputOrSource
        };
      } else {
        // We have an options object like new signature
        sourceLocation = positionOrOptions;
        originalError = positionOrOptions.originalError;
      }
    }
    
    // Call super constructor first
    super(message, {
      errorType: "Parse Error",
      sourceLocation,
      originalError
    });
    
    // Now it's safe to access 'this'
    if (positionOrOptions && typeof positionOrOptions === 'object' && 
        'line' in positionOrOptions && 'column' in positionOrOptions) {
      this.position = {
        line: positionOrOptions.line,
        column: positionOrOptions.column,
        offset: positionOrOptions.offset || 0,
        filePath: positionOrOptions.filePath
      };
    }
    
    // Ensure backwards compatibility
    if (!this.position && this.sourceLocation) {
      this.position = {
        line: this.sourceLocation.line || 0,
        column: this.sourceLocation.column || 0,
        offset: 0,
        filePath: this.sourceLocation.filePath
      };
    }
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
    
    if (msg.includes("expected property name after")) {
      return "After a dot (.) operator, you must provide a valid property name.";
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
    
    if (msg.includes("cannot read property") && msg.includes("value")) {
      return "Check that 'user' contains the expected structure with a 'value' property before accessing it.\nTry adding a check: (if user (get user \"value\") null)";
    }
    
    if (msg.includes("is not a function")) {
      return "You're trying to call something that's not a function. Check the variable type and spelling.";
    }
    
    if (msg.includes("cannot read property")) {
      const propMatch = msg.match(/property ['"](.*?)['"]/i);
      const prop = propMatch ? propMatch[1] : "property";
      return `Ensure the object exists before accessing the '${prop}' property.\nTry using the get function: (get object "${prop}" fallback-value)`;
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
    const sourceMap = registry.getSourceMap(generatedPath);
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
  const originalPath = registry.getOriginalPath(generatedPath);
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
 * Transform an error stack using source maps to point to original source locations
 */
export async function transformErrorStack(error: Error): Promise<Error> {
  // Only transform if stack is available
  if (!error.stack) return error;
  
  const stackLines = error.stack.split('\n');
  const transformedLines = [];
  
  // Process each line of the stack trace
  for (const line of stackLines) {
    // Look for filename, line and column in stack trace
    // Format: at functionName (/path/to/file.js:line:column)
    const match = line.match(/at\s+(.+?)\s+\(?([^:]+):(\d+):(\d+)\)?/);
    
    if (match) {
      const [, fnName, filePath, lineStr, colStr] = match;
      const lineNum = parseInt(lineStr, 10);
      const colNum = parseInt(colStr, 10);
      
      // Try to map to original source position
      const originalPos = await mapToOriginalPosition(filePath, lineNum, colNum);
      
      if (originalPos) {
        // Replace with original source position
        const mappedLine = `at ${fnName} (${originalPos.source}:${originalPos.line}:${originalPos.column})`;
        transformedLines.push(mappedLine);
      } else {
        // Keep original line if mapping fails
        transformedLines.push(line);
      }
    } else {
      // Line doesn't contain file info, keep as is
      transformedLines.push(line);
    }
  }
  
  // Replace stack with transformed stack
  error.stack = transformedLines.join('\n');
  
  // If error is HQLError, try to update source location
  if (error instanceof HQLError && error.sourceLocation?.filePath) {
    const { filePath, line, column } = error.sourceLocation;
    
    if (filePath && line && column) {
      const originalPos = await mapToOriginalPosition(filePath, line, column);
      
      if (originalPos) {
        // Update error's source location with original position
        const newLocation = new SourceLocationInfo({
          filePath: originalPos.source,
          line: originalPos.line,
          column: originalPos.column,
          source: error.sourceLocation.source
        });
        
        error.sourceLocation = newLocation;
        
        // Also update the top-level properties
        error.filePath = newLocation.filePath;
        error.line = newLocation.line;
        error.column = newLocation.column;
        error.filename = newLocation.filePath;
        
        // Reload source context with new location
        error.extractSourceAndContext();
      }
    }
  }
  
  return error;
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
/**
 * Formats an HQLError for display in the console
 */
/**
 * Formats an HQLError for display in the console
 */
function formatHQLError(error: HQLError, config: ErrorConfig = DEFAULT_ERROR_CONFIG): string {
  // Create color configuration based on settings
  const colorConfig = createColorConfig(config.useColors);
  let output: string[] = [];
  
  // Format the error title with type and message
  const errorTitle = colorConfig.red(`${error.errorType}: ${error.message}`);
  
  // Add source location on a separate line if available
  if (error.sourceLocation?.filePath && error.sourceLocation?.line) {
    const locationInfo = `${error.sourceLocation.filePath}:${error.sourceLocation.line}:${error.sourceLocation.column || 0}`;
    output.push(`${errorTitle}\n    at ${error.filePath ? path.basename(error.filePath) : ""} (${locationInfo})`);
  } else {
    output.push(errorTitle);
  }
  
  // Add a clear error location line
  if (error.sourceLocation?.filePath && error.sourceLocation?.line) {
    const locationStr = `${path.basename(error.sourceLocation.filePath)}:${error.sourceLocation.line}:${error.sourceLocation.column || 0}`;
    output.push(""); // Empty line
    output.push(`Error in ${locationStr}`);
  }

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
      
      // Format the line prefix (add arrow for error line)
      const prefix = isError ? "-> " : "   ";
      
      // Format the line content
      const formattedLine = `${prefix}${lineNumStr} | ${text}`;
      
      if (isError) {
        output.push(formattedLine);
        
        // Add pointer to the exact error column if available
        if (column && column > 0) {
          // Calculate pointer position: prefix + line number + pipe + spaces
          const pointerPrefix = " ".repeat(prefix.length + lineNumberWidth + 3);
          const pointer = pointerPrefix + " ".repeat(column - 1) + "^";
          output.push(pointer);
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
      output.push(`Suggestion: ${suggestion}`);
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
/**
 * Report an error with proper formatting
 * 
 * This is the primary error reporting function for HQL errors.
 * It enhances the error with source information and formats it for display.
 */
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
  
  // Define filepath, line, and column for clickable link
  const filePath = hqlError.sourceLocation?.filePath || "";
  const line = hqlError.sourceLocation?.line || 1;
  const column = hqlError.sourceLocation?.column || 1;
  
  // First line: Error type and message
  console.error(`\x1b[31m${hqlError.errorType}: ${hqlError.message}\x1b[0m`);
  
  // Add suggestion directly (if available)
  if (hqlError.getSuggestion && typeof hqlError.getSuggestion === 'function') {
    const suggestion = hqlError.getSuggestion();
    if (suggestion) {
      console.error(`\x1b[36mSuggestion: ${suggestion}\x1b[0m`);
    }
  }
  
  // Add context section with proper formatting
  if (hqlError.contextLines && hqlError.contextLines.length > 0) {
    console.error(`\nContext:`);
    
    // Calculate padding for line numbers
    const maxLineNumber = Math.max(...hqlError.contextLines.map(item => item.line));
    const lineNumWidth = String(maxLineNumber).length;
    
    // Format each context line
    hqlError.contextLines.forEach(({line: lineNo, content: text, isError, column}) => {
      const lineNumStr = String(lineNo).padStart(lineNumWidth, ' ');
      const prefix = isError ? "->" : "  ";
      
      // Format the line
      console.error(`${prefix} ${lineNumStr} | ${text}`);
      
      // Add pointer for error line
      if (isError && column) {
        const pointer = ' '.repeat(prefix.length + lineNumWidth + 3 + column - 1) + '^';
        console.error(pointer);
      }
    });
  }
  
  // Add clickable location in VS Code format - THIS MUST BE ON A SEPARATE LINE
  console.error(`\nat ${filePath}:${line}:${column}`);
  
  // Only show the "Processing failed" message in verbose mode to avoid duplication
  if (!options.verbose) {
    return;
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
  errorType?: new (message: string, ...args: unknown[]) => HQLError,
  errorArgs?: unknown[],
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
  report,              // New structured reporting API
  createErrorReport,   // Create structured error data
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
  ErrorType,           // New enum for error types
  
  // Source registry
  registerSourceFile,
  getSourceFile,
  
  // Source location utilities
  SourceLocationInfo,  // New location helper class
};

export default ErrorPipeline;