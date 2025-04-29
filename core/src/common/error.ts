/*
 * error.ts
 *
 * A unified error handling pipeline for HQL that provides:
 * 1. Standardized error collection, processing, and reporting
 * 2. Error messages with file path, line, and column information
 * 3. Separation of core error info and debug details
 * 4. Support for specialized error types (Parse, Import, Validation, etc.)
 * 5. Source map support for accurate error reporting in HQL code
 * 
 * All logic from error-handler.ts has been merged into error.ts. See below for details.
 */

import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { Logger, globalLogger as logger } from "../logger.ts";

// -----------------------------------------------------------------------------
// Color utilities
// -----------------------------------------------------------------------------

export type ColorFn = (s: string) => string;

export interface ColorConfig {
  purple: ColorFn;
  red: ColorFn;
  black: ColorFn;
  gray: ColorFn;
  bold: ColorFn;
  white: ColorFn;
  cyan: ColorFn;
}

export function createColorConfig(): ColorConfig {
  return {
    purple: (s) => `\x1b[35m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    black: (s) => `\x1b[30m${s}\x1b[0m`,
    gray: (s) => `\x1b[90m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    white: (s) => `\x1b[37m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  };
}

export const colorConfig = createColorConfig();

// -----------------------------------------------------------------------------
// Simple helpers
// -----------------------------------------------------------------------------

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) return JSON.stringify(error);
  return String(error);
}

/**
 * Format HQL error with proper error message display
 * Now async to allow for file existence checks (Deno.stat).
 */
export async function formatHQLError(error: HQLError, isDebug = false): Promise<string> {
  console.log("error : ", error);
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
  const contextLines: { line: number; content: string; isError: boolean; column?: number }[] = [];
  if (error.sourceLocation?.filePath) {
    let filepath = error.sourceLocation.filePath;
    const line = error.sourceLocation.line || 1;
    const column = error.sourceLocation.column || 1;

    const projectRoot = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), '../../../');
    const resolved = await (await import("./utils.ts")).resolveSourcePath(filepath, projectRoot);
    filepath = resolved;

    // --- CONTEXT LINES FROM FILE ---
    const fileContent = await Deno.readTextFile(filepath);
    const fileLines = fileContent.split(/\r?\n/);
    const errorIdx = line - 1;

    for (let i = Math.max(0, errorIdx - 1); i <= Math.min(fileLines.length - 1, errorIdx + 1); i++) {
      contextLines.push({
        line: i + 1,
        content: fileLines[i],
        isError: i === errorIdx,
        column: i === errorIdx ? column : undefined,
      });
    }

    if (contextLines.length > 0) {
      const maxLineNumber = Math.max(...contextLines.map(item => item.line));
      const lineNumPadding = String(maxLineNumber).length;
      contextLines.forEach(({line: lineNo, content: text, isError, column}) => {
        const lineNumStr = String(lineNo).padStart(lineNumPadding, ' ');
        if (isError) {
          output.push(` ${colors.purple(lineNumStr)} │ ${text}`);
          if (column && column > 0) {
            const pointer = ' '.repeat(lineNumPadding + 3 + column - 1) + colors.red(colors.bold('^'));
            output.push(pointer);
          }
        } else {
          output.push(` ${colors.gray(lineNumStr)} │ ${colors.gray(text)}`);
        }
      });
    }

    const whereStr = `${filepath}:${line}:${column}`;
    output.push(`${colors.purple(colors.bold("Where:"))} ${colors.white(whereStr)}`);
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
  }
  
  return output.join('\n');
}

// -----------------------------------------------------------------------------
// Simple wrappers (flattened – no special logging)
// -----------------------------------------------------------------------------

export function wrapError(
  _context: string,
  error: unknown,
  _resource: string,
  _currentFile?: string,
): never {
  // Simply rethrow for now – customization can be added later.
  throw error
}

export function perform<T>(fn: () => T): T {
  return fn();
}

// -----------------------------------------------------------------------------
// Error base + enums
// -----------------------------------------------------------------------------

enum ErrorType {
  GENERIC = "Error",
  PARSE = "Parse Error",
  IMPORT = "Import Error",
  VALIDATION = "Validation Error",
  MACRO = "Macro Error",
  TRANSFORM = "Transform Error",
  RUNTIME = "Runtime Error",
  CODEGEN = "Code Generation Error",
  TRANSPILER = "Transpiler Error",
}

export class HQLError extends Error {
  readonly errorType: string;
  sourceLocation: SourceLocationInfo;
  readonly originalError?: Error;
  contextLines: { line: number; content: string; isError: boolean; column?: number }[] = [];
  filename?: string;
  metadata: Record<string, unknown> = {};

  constructor(
    msg: string,
    opts: { errorType?: string | ErrorType; sourceLocation?: SourceLocation; originalError?: Error } = {},
  ) {
    super(msg);

    this.errorType = typeof opts.errorType === "string" ? opts.errorType : opts.errorType ?? ErrorType.GENERIC;
    this.originalError = opts.originalError;

    let loc: SourceLocationInfo | undefined;
    if (opts.sourceLocation) loc = opts.sourceLocation instanceof SourceLocationInfo ? opts.sourceLocation : new SourceLocationInfo(opts.sourceLocation);
    else if (opts.originalError) loc = SourceLocationInfo.fromError(opts.originalError);
    else loc = SourceLocationInfo.fromError(this);

    this.sourceLocation = loc ?? new SourceLocationInfo();
    this.filename = this.sourceLocation.filePath;

    if (this.sourceLocation.line || this.sourceLocation.filePath) {
      this.extractSourceAndContext();
    }

    if (!opts.originalError && Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }

  getSummary(): string {
    const { filePath, line, column } = this.sourceLocation;
    const loc = filePath ? `${path.basename(filePath)}${line ? `:${line}${column ? `:${column}` : ""}` : ""}` : "";
    return loc ? `${this.errorType}: ${this.message} (${loc})` : `${this.errorType}: ${this.message}`;
  }

  getSuggestion(): string {
    return "Check the documentation for more information.";
  }

  isCircularDependencyError(): boolean {
    const msg = this.message.toLowerCase();
    return msg.includes("circular") && (msg.includes("dependency") || msg.includes("reference") || msg.includes("import"));
  }

  extractSourceAndContext(): void {
    if (this.contextLines.length) return;
    const src = this.sourceLocation.loadSource();
    if (src && this.sourceLocation.line) {
      this.contextLines = this.sourceLocation.extractContextLines();
    }
  }
}

// -----------------------------------------------------------------------------
// Error classes
// -----------------------------------------------------------------------------

export class ParseError extends HQLError {
  constructor(msg: string, opts: { line: number; column: number; filePath?: string; source?: string; originalError?: Error }) {
    super(msg, { errorType: ErrorType.PARSE, sourceLocation: opts, originalError: opts.originalError });
  }

  override getSuggestion(): string {
    const m = this.message.toLowerCase();
    if (m.includes("unclosed") || (m.includes("missing") && m.includes("closing"))) return "Add a closing parenthesis ')' to complete the expression.";
    if (m.includes("unexpected ')'")) return "Check for missing opening parenthesis '(' earlier in the code.";
    if (m.includes("unexpected end of input")) return "Your code ends unexpectedly. Check for unclosed blocks or incomplete expressions.";
    return "Check the syntax near this location.";
  }
}

export class ImportError extends HQLError {
  readonly importPath: string;
  constructor(msg: string, importPath: string, opts: { filePath?: string; line?: number; column?: number; source?: string; originalError?: Error } = {}) {
    super(msg, { errorType: ErrorType.IMPORT, sourceLocation: opts, originalError: opts.originalError });
    this.importPath = importPath;
  }

  override getSuggestion(): string {
    if (this.isCircularDependencyError()) return "Restructure code to break the circular dependency chain.";
    if (this.message.toLowerCase().includes("cannot find") || this.message.toLowerCase().includes("not found")) return `Check that the file \"${this.importPath}\" exists and the path is correct.`;
    return `Verify the import path for \"${this.importPath}\".`;
  }
}

export class ValidationError extends HQLError {
  readonly context: string;
  readonly expectedType?: string;
  readonly actualType?: string;
  constructor(msg: string, context: string, opts: { expectedType?: string; actualType?: string; filePath?: string; line?: number; column?: number; source?: string; originalError?: Error } = {}) {
    super(msg, { errorType: ErrorType.VALIDATION, sourceLocation: opts, originalError: opts.originalError });
    this.context = context;
    this.expectedType = opts.expectedType;
    this.actualType = opts.actualType;
  }

  override getSuggestion(): string {
    if (this.expectedType && this.actualType) return `Expected ${this.expectedType} but got ${this.actualType}.`;
    return "Ensure the value conforms to the expected type.";
  }
}

export class MacroError extends HQLError {
  readonly macroName: string;
  constructor(msg: string, macroName: string, opts: { filePath?: string; line?: number; column?: number; source?: string; originalError?: Error } = {}) {
    super(msg, { errorType: ErrorType.MACRO, sourceLocation: opts, originalError: opts.originalError });
    this.macroName = macroName;
  }

  override getSuggestion(): string {
    return `Check usage and arguments of the macro \"${this.macroName}\".`;
  }
}

export class TransformError extends HQLError {
  readonly phase: string;
  constructor(msg: string, phase: string, opts: { filePath?: string; line?: number; column?: number; source?: string; originalError?: Error } = {}) {
    super(msg, { errorType: ErrorType.TRANSFORM, sourceLocation: opts, originalError: opts.originalError });
    this.phase = phase;
  }

  override getSuggestion(): string {
    if (this.phase.toLowerCase().includes("ast")) return "Check AST structure around this construct.";
    if (this.phase.toLowerCase().includes("ir")) return "Check IR generation for unsupported constructs.";
    return `Issue occurred during ${this.phase} phase.`;
  }
}

export class RuntimeError extends HQLError {
  constructor(msg: string, opts: { filePath?: string; line?: number; column?: number; source?: string; originalError?: Error } = {}) {
    super(msg, { errorType: ErrorType.RUNTIME, sourceLocation: opts, originalError: opts.originalError });
  }

  override getSuggestion(): string {
    const m = this.message.toLowerCase();
    if (m.includes("undefined") && m.includes("not defined")) return "Ensure variables are defined before use.";
    if (m.includes("null") || m.includes("undefined is not an object")) return "Add checks before accessing properties on possibly null/undefined values.";
    if (m.includes("is not a function")) return "Verify the value is a function before invoking it.";
    return "Check runtime type mismatches or invalid operations.";
  }
}

export class CodeGenError extends HQLError {
  readonly nodeType?: string;
  constructor(msg: string, opts: { nodeType?: string; filePath?: string; line?: number; column?: number; source?: string; originalError?: Error } = {}) {
    super(msg, { errorType: ErrorType.CODEGEN, sourceLocation: opts, originalError: opts.originalError });
    this.nodeType = opts.nodeType;
  }

  override getSuggestion(): string {
    return this.nodeType ? `Problem generating code for ${this.nodeType} node.` : "Review complex patterns that might break code generation.";
  }
}

export class TranspilerError extends HQLError {
  constructor(msg: string, opts: Record<string, unknown> = {}) {
    super(msg, { ...opts, errorType: ErrorType.TRANSPILER });
    this.name = "TranspilerError";
  }
}

// -----------------------------------------------------------------------------
// Source‑location helpers
// -----------------------------------------------------------------------------

export interface SourceLocation {
  filePath?: string;
  line?: number;
  column?: number;
  source?: string;
}

export class SourceLocationInfo implements SourceLocation {
  filePath?: string;
  line?: number;
  column?: number;
  source?: string;

  constructor(opts: SourceLocation = {}) {
    Object.assign(this, opts);
  }

  loadSource(): string | undefined {
    return this.source;
  }

  toString(): string {
    if (!this.filePath) return "<unknown location>";
    const l = this.line ? `:${this.line}` : "";
    const c = this.line && this.column ? `:${this.column}` : "";
    return `${this.filePath}${l}${c}`;
  }

  clone(): SourceLocationInfo {
    return new SourceLocationInfo(this);
  }

  extractContextLines(count = 2): { line: number; content: string; isError: boolean; column?: number }[] {
    const src = this.loadSource();
    if (!src || !this.line) return [];

    const lines = src.split(/\n/);
    const start = Math.max(1, this.line - count);
    const end = Math.min(lines.length, this.line + count);
    const ctx: { line: number; content: string; isError: boolean; column?: number }[] = [];

    for (let i = start; i <= end; i++) {
      ctx.push({
        line: i,
        content: lines[i - 1],
        isError: i === this.line,
        column: i === this.line ? this.column : undefined,
      });
    }
    return ctx;
  }

  static fromError(err: Error): SourceLocationInfo | undefined {
    if (!err.stack) return undefined;
    const match = err.stack.match(/\(?((?:\/|[a-zA-Z]:\\|file:\/\/)[^:)]+):(\d+):(\d+)\)?/);
    if (!match) return undefined;
    const [, filePath, lineStr, colStr] = match;
    const line = Number(lineStr);
    const column = Number(colStr);
    if (isNaN(line) || isNaN(column)) return undefined;
    return new SourceLocationInfo({ filePath, line, column, source: err.stack });
  }
}

// -----------------------------------------------------------------------------
// Error reporter
// -----------------------------------------------------------------------------

class ErrorFormatter {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async formatError(error: Error | HQLError, isDebug = false): Promise<string> {
    if (error instanceof HQLError) {
      return await formatHQLError(error, isDebug);
    } else {
      return formatErrorMessage(error);
    }
  }
}

export class ErrorReporter {
  private formatter: ErrorFormatter;
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger(false);
    this.formatter = new ErrorFormatter(this.logger);
  }

  async reportError(error: Error | HQLError, isDebug = false): Promise<void> {
    try {
      const formattedError = await this.formatter.formatError(error, isDebug);
      console.error(formattedError);
    } catch (formatError) {
      // Fallback in case formatting itself fails
      console.error(`Error: ${error.message}`);
      if (isDebug) {
        console.error(error.stack);
      }
    }
  }

  createParseError(
    message: string,
    line: number,
    column: number,
    filePath: string,
    source?: string
  ): ParseError {
    return new ParseError(message, { line, column, filePath, source });
  }

  createValidationError(
    message: string,
    context: string,
    expectedType?: string,
    actualType?: string,
    filePath?: string,
    line?: number,
    column?: number
  ): ValidationError {
    return new ValidationError(message, context, {
      expectedType,
      actualType,
      filePath,
      line,
      column,
    });
  }

  createRuntimeError(
    message: string,
    filePath?: string,
    line?: number,
    column?: number
  ): RuntimeError {
    return new RuntimeError(message, { filePath, line, column });
  }
}

export const globalErrorReporter = new ErrorReporter(logger);

export async function reportError(error: Error | HQLError, isDebug = false): Promise<void> {
  await globalErrorReporter.reportError(error, isDebug);
}

export const ErrorPipeline = {
  reportError,
  perform,
  wrapError,
  // classes
  HQLError,
  ParseError,
  ImportError,
  ValidationError,
  MacroError,
  TransformError,
  RuntimeError,
  CodeGenError,
  TranspilerError,
  ErrorType,
  SourceLocationInfo,
};

export default ErrorPipeline;
