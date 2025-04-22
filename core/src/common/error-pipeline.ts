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
import { getCurrentBundlePath } from "./bundle-registry.ts";
import { mapStackTraceToHql } from "./consumer.ts";

// Direct access to logger
const logger = globalLogger;

// ----- Color Formatting -----

export type ColorFn = (s: string) => string;
export const colorConfig = createColorConfig();

// ----- Color Utilities -----
export interface ColorConfig {
  purple: (s: string) => string;
  red: (s: string) => string;
  black: (s: string) => string;
  gray: (s: string) => string;
  bold: (s: string) => string;
  white: (s: string) => string;
  cyan: (s: string) => string;
}

export function createColorConfig(): ColorConfig {
  return {
    purple: (s: string) => `\x1b[35m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    black: (s: string) => `\x1b[30m${s}\x1b[0m`,
    gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    white: (s: string) => `\x1b[37m${s}\x1b[0m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  };
}

/**
 * Format HQL error with proper error message display
 */
function formatHQLError(error: HQLError, isDebug = false): string {
  const colors = createColorConfig();
  const output: string[] = [];
  
  // ALWAYS show the error message at the top - not just in debug mode
  const errorType = error.errorType || "Error";
  const message = error.message || "An unknown error occurred";
  output.push(`${colors.red(colors.bold(`${errorType}:`))} ${message}`);
  
  // Display code context with line numbers and column pointer
  if (error.contextLines?.length > 0) {
    const maxLineNumber = Math.max(...error.contextLines.map(item => item.line));
    const lineNumPadding = String(maxLineNumber).length;
    
    // Format each context line
    error.contextLines.forEach(({line: lineNo, content: text, isError, column}) => {
      const lineNumStr = String(lineNo).padStart(lineNumPadding, ' ');
      
      if (isError) {
        // Error line (purple for SICP style)
        output.push(` ${colors.purple(lineNumStr)} │ ${text}`);
        
        // Add pointer to the opening parenthesis for unclosed parenthesis errors
        // Use the correct column position from error.column
        if (column && column > 0) {
          const pointer = ' '.repeat(lineNumPadding + 3 + column - 1) + colors.red(colors.bold('^'));
          output.push(pointer);
        }
      } else {
        // Context line
        output.push(` ${colors.gray(lineNumStr)} │ ${colors.gray(text)}`);
      }
    });
  }
  
  // Add empty line before location
  output.push('');
  
  // Add IDE-friendly location with "Where:" prefix (no question mark as requested)
  if (error.sourceLocation?.filePath) {
    const filepath = error.sourceLocation.filePath;
    const line = error.sourceLocation.line || 1;
    const column = error.sourceLocation.column || 1;
    output.push(`${colors.purple(colors.bold("Where:"))} ${colors.white(`${filepath}:${line}:${column}`)}`);
  }
  
  // Add suggestion if available
  if (error.getSuggestion && typeof error.getSuggestion === 'function') {
    const suggestion = error.getSuggestion();
    if (suggestion) {
      output.push(`${colors.cyan(`Suggestion: ${suggestion}`)}`);
    }
  }
  
  // Add stack trace only in debug mode
  if (isDebug && error.originalError?.stack) {
    output.push('');
    output.push(colors.gray('Stack trace:'));
    
    const stack = error.originalError.stack;
    const stackLines = stack.split('\n').slice(1); // Skip error message
    
    // Format and filter stack trace
    stackLines
      .filter(line => !line.includes('node_modules'))
      .forEach(line => {
        output.push(colors.gray(line));
      });
  }
  
  return output.join('\n');
}

/**
 * Main error reporting function
 * @param error The error to report
 * @param isDebug Whether to show debug info
 * @param bundlePath Optional path to the running bundle (for source map remapping)
 */
export async function reportError(error: unknown, isDebug = false): Promise<void> {
  const bundlePath = getCurrentBundlePath();
  console.log("[reportError] bundlePath:", bundlePath);
  // console.log("[reportError] Received error:", error);
  if (error instanceof Error) {
    console.log("[reportError] Error stack (pre-remap):", error.stack);
  }

  // Apply source map transformation if possible
  if (error instanceof Error && error.stack && bundlePath) {
    try {
      // console.log(`[reportError] Attempting to remap stack trace using bundle: ${bundlePath}`);
      const remapped = await mapStackTraceToHql(error, bundlePath);
      error.stack = remapped;
      // console.log("[reportError] Stack trace remapped:", remapped);
    } catch (e) {
      // console.log("[reportError] Stack trace remapping failed:", e);
      // Fallback to original stack if remapping fails
    }
  }

  // Convert to HQLError type if needed
  let hqlError: HQLError;
  if (error instanceof HQLError) {
    hqlError = error;
    // console.log("[reportError] Error is already HQLError, stack:", hqlError.stack);
  } else {
    hqlError = new HQLError(error instanceof Error ? error.message : String(error));
    // Preserve stack trace if possible
    if (error instanceof Error && error.stack) {
      hqlError.stack = error.stack;
      // console.log("[reportError] Copied stack trace to HQLError:", hqlError.stack);
    }
  }

  // Format and display
  const formatted = formatHQLError(hqlError, isDebug);
  // console.log("[reportError] Final formatted error:", formatted);
  console.error(formatted);
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
  
  /**
   * Static helper to extract source location from an error
   */
  static fromError(error: Error): SourceLocationInfo | undefined {
    // Check if error has stack trace
    if (!error.stack) {
      return undefined;
    }

    // Common stack trace patterns: 
    // - at functionName (file:line:column)
    // - at file:line:column
    const stackLines = error.stack.split('\n');
    
    // Look for first line with file information (usually after the error message lines)
    for (const line of stackLines) {
      // Match file path, line and column information
      const fileMatch = line.match(/\s+at\s+(?:[\w<>.$]+\s+)?\(?((?:\/|[a-zA-Z]:\\|file:\/\/)[^:)]+):(\d+):(\d+)/);
      if (fileMatch) {
        const [, filePath, lineStr, columnStr] = fileMatch;
        const lineNum = parseInt(lineStr, 10);
        const column = parseInt(columnStr, 10);
        
        if (!isNaN(lineNum) && !isNaN(column)) {
          return new SourceLocationInfo({
            filePath,
            line: lineNum,
            column,
            source: error.stack // Include the stack trace as source initially
          });
        }
      }
    }

    return undefined;
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

// ----- HQL Error Class -----

/**
 * Base error class for all HQL-related errors
 * Provides source location tracking, context extraction, and common error utilities
 */
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
    
    // Determine original error (if any)
    this.originalError = options.originalError;

    // Source location extraction logic
    let locationInfo: SourceLocationInfo | undefined;
    
    // Priority 1: Use provided sourceLocation if available
    if (options.sourceLocation) {
      locationInfo = options.sourceLocation instanceof SourceLocationInfo
        ? options.sourceLocation
        : new SourceLocationInfo(options.sourceLocation);
    }
    // Priority 2: If originalError is provided and no sourceLocation, try to extract from it
    else if (options.originalError) {
      locationInfo = SourceLocationInfo.fromError(options.originalError);
    }
    // Priority 3: If neither sourceLocation nor originalError provided, try to extract from this error
    else {
      // Capture stack trace for this error first to ensure it's available
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
      locationInfo = SourceLocationInfo.fromError(this);
    }
    
    // Ensure we always have a sourceLocation object, even if empty
    this.sourceLocation = locationInfo || new SourceLocationInfo();

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

    // Capture stack trace if not already done
    if (!options.originalError && Error.captureStackTrace) {
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

export class TranspilerError extends HQLError {
  constructor(message: string, options: { [key: string]: unknown } = {}) {
    super(message, { ...options, errorType: (options as { errorType?: string }).errorType || "TranspilerError" });
    this.name = "TranspilerError";
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

    // Try to extract source context from the error if not provided
    let locationInfo: SourceLocationInfo | undefined;
    
    if (sourceContext) {
      // Use provided source context
      locationInfo = new SourceLocationInfo(sourceContext);
    } else if (error instanceof Error) {
      // Try to extract from error
      locationInfo = SourceLocationInfo.fromError(error);
    }

    // If an error type is specified, create a new error of that type
    if (errorType) {
      if (locationInfo) {
        throw new errorType(msg, locationInfo);
      } else {
        throw new errorType(msg, ...(errorArgs || []));
      }
    }

    // Otherwise, use a generic HQLError with source context if available
    if (locationInfo) {
      throw new HQLError(msg, { sourceLocation: locationInfo });
    } else {
      throw new HQLError(msg);
    }
  }
}

/**
 * Export a unified API for error handling
 */
export const ErrorPipeline = {
  reportError,
  registerSourceMap,
  mapToOriginalPosition,
  transformErrorStack,
  perform,
  // Error classes
  HQLError,
  ParseError,
  ImportError,
  ValidationError,
  MacroError,
  TransformError,
  RuntimeError,
  CodeGenError,
  ErrorType,
  
  // Source registry
  registerSourceFile,
  getSourceFile,
  
  // Source location utilities
  SourceLocationInfo,
};

export default ErrorPipeline;