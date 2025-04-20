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

// ----- Debug Mode Configuration -----

/**
 * Global debug mode flag - when enabled:
 * - Shows detailed error messages with full call stacks
 * - Includes enhanced debugging information
 * - Shows more verbose output
 */
export let debugMode = false;

/**
 * Enable or disable debug mode globally for all error handling
 */
export function setDebugMode(enabled: boolean): void {
  console.log(`Debug mode ${enabled ? 'enabled' : 'disabled'} - showing extended error information`); 
  debugMode = enabled;
  
  // When debug mode is enabled, set up Deno-specific error handling improvements
  if (enabled && typeof Deno !== 'undefined') {
    // Configure Deno for better debugging experience
    try {
      // Enable source maps for better error locations
      // @ts-ignore: Using Deno-specific API
      if (Deno.setRuntimeOptions) {
        // @ts-ignore: Using Deno-specific API
        Deno.setRuntimeOptions({
          sourceMaps: true,
          showColors: true
        });
      }
      
      // Listen for uncaught errors to format them nicely
      // @ts-ignore: Using Deno-specific API
      if (Deno.core && Deno.core.setUncaughtExceptionCallback) {
        // @ts-ignore: Using Deno-specific API
        Deno.core.setUncaughtExceptionCallback((error: Error) => {
          // Format the error using our pipeline and print it
          reportError(error, {
            showCallStack: true,
            verbose: true,
            enhancedDebug: true,
            makePathsClickable: true,
            useColors: true
          });
          return true; // Signal we handled the error
        });
      }
      
      // Set up a more detailed error formatter
      // This helps translate low-level Deno errors into more readable formats
      // Use explicit type check to avoid TS errors
      const denoAny = Deno as any;
      if (denoAny.formatError && typeof denoAny.formatError === 'function') {
        const originalFormatError = denoAny.formatError;
        denoAny.formatError = (error: Error) => {
          try {
            // Try our formatter first
            const formatted = formatError(error, {
              showCallStack: true,
              verbose: true,
              enhancedDebug: true,
              makePathsClickable: true,
              useColors: true
            });
            return formatted;
          } catch (e) {
            // Fall back to Deno's formatter if ours fails
            return originalFormatError(error);
          }
        };
      }
    } catch (e) {
      // Ignore if not available - these are experimental APIs
      console.log("Note: Some advanced Deno debugging features are not available in this version");
    }
  }
}

/**
 * Get default error config with current debug settings applied
 */
export function getDefaultErrorConfig(): ErrorConfig {
  return {
    ...DEFAULT_ERROR_CONFIG,
    showCallStack: debugMode,
    verbose: debugMode,
    enhancedDebug: debugMode,
  };
}

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
   * Extracts context lines from source around the error line
   */
  private extractContextLines(source: string, errorLine: number): void {
    const lines = source.split('\n');
    
    // Check if line number is in range
    if (errorLine <= 0 || errorLine > lines.length) {
      // Line number out of range, show first few lines
      this.contextLines = lines.slice(0, Math.min(3, lines.length))
        .map((line, i) => `${i + 1} │ ${line}`);
      
      if (errorLine > 0) {
        this.contextLines.push(`Note: Reported line ${errorLine} exceeds file length ${lines.length}`);
      }
      return;
    }
    
    // Calculate range for context (usually 1-2 lines before and after)
    const lineIndex = errorLine - 1;
    const contextSize = 1; // Show just 1 line before and after by default for conciseness
    const startLine = Math.max(0, lineIndex - contextSize);
    const endLine = Math.min(lines.length - 1, lineIndex + contextSize);
    
    // Add lines before error
    for (let i = startLine; i < lineIndex; i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
    }
    
    // Add error line
    this.contextLines.push(`${errorLine} │ ${lines[lineIndex]}`);
    
    // Add pointer line at column position
    if (this.sourceLocation.column && this.sourceLocation.column > 0) {
      const pointerIndent = " ".repeat(this.sourceLocation.column - 1);
      this.contextLines.push(`  │ ${pointerIndent}^`);
    }
    
    // Add lines after error
    for (let i = lineIndex + 1; i <= endLine; i++) {
      this.contextLines.push(`${i + 1} │ ${lines[i]}`);
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
    const message = this.message.toLowerCase();
    
    // Handle export statement errors
    if (message.includes("missing closing parenthesis in export statement") ||
        (message.includes("export") && message.includes("missing closing parenthesis"))) {
      return "Add a closing parenthesis ')' to the end of your export statement.";
    }
    
    // Check if it's an export-related error from the error message
    if (message.includes("export") && message.includes("missing closing parenthesis")) {
      return "Add a closing parenthesis ')' to the end of your export statement.";
    }
    
    // Check if it's an import-related error from the error message
    if (message.includes("import") && message.includes("missing closing parenthesis")) {
      return "Add a closing parenthesis ')' to the end of your import statement.";
    }
    
    // Provide more specific suggestions based on error message
    if (message.includes("unclosed list")) {
      // Check if we can identify context from the source code
      if (this.sourceLocation.source && this.sourceLocation.line) {
        const lines = this.sourceLocation.source.split('\n');
        const lineIndex = this.sourceLocation.line - 1;
        
        if (lineIndex >= 0 && lineIndex < lines.length) {
          const currentLine = lines[lineIndex];
          
          // Check if it's an export statement
          if (currentLine.trim().startsWith('(export')) {
            return "Add a closing parenthesis ')' to the end of your export statement.";
          }
          
          // Check if it's an import statement
          if (currentLine.trim().startsWith('(import')) {
            return "Add a closing parenthesis ')' to the end of your import statement.";
          }
          
          // Check if it's a function declaration
          if (currentLine.trim().startsWith('(fn') || currentLine.trim().startsWith('(defn')) {
            return "Add a closing parenthesis ')' to complete your function declaration.";
          }
        }
      }
      
      return "Check for missing closing parenthesis ')' in your code.";
    } else if (message.includes("unclosed vector")) {
      return "Check for missing closing bracket ']' in your code.";
    } else if (message.includes("unclosed map")) {
      return "Check for missing closing brace '}' in your code.";
    } else if (message.includes("unclosed set")) {
      return "Check for missing closing bracket ']' after '#' in your set literal.";
    } else if (message.includes("unexpected ')'")) {
      return "There is an extra closing parenthesis ')' that doesn't match with an opening one.";
    } else if (message.includes("unexpected ']'")) {
      return "There is an extra closing bracket ']' that doesn't match with an opening one.";
    } else if (message.includes("unexpected '}'")) {
      return "There is an extra closing brace '}' that doesn't match with an opening one.";
    } else if (message.includes("expected ':'")) {
      return "In map literals, each key must be followed by a colon and a value.";
    } else if (message.includes("unterminated string")) {
      return "Check for a missing closing quote in your string.";
    }
    
    return "Check your HQL syntax. Look for mismatched brackets, unclosed strings, or invalid expressions.";
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
  // Process stack trace lines differently to ensure they're clickable
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // Check if this is a stack trace line
    const stackMatch = line.match(/^\s+\d+\.\s+.*\((.*):(\d+):(\d+)\)$/);
    if (stackMatch) {
      const [_, file, line, col] = stackMatch;
      // Make it a clickable link using the full file path
      try {
        return line.replace(`(${file}:${line}:${col})`, `(file://${file}:${line}:${col})`);
      } catch (e) {
        return line;
      }
    }
    
    // Otherwise apply the general path clickable logic
    return line.replace(/([^\s"']+\.[a-zA-Z0-9]{1,5})(?::(\d+)(?::(\d+))?)?/g, (match, file, line, col) => {
      if (file.startsWith("file://")) return match;
      
      try {
        // Validate file path before using realPathSync
        if (!file || typeof file !== 'string' || file.includes('(') || file.includes(')')) {
          return match; // Return original match if path is invalid
        }
        
        // For import paths that are relative, don't try to resolve them since they might not exist yet
        if (file.startsWith('./') || file.startsWith('../')) {
          const location = line ? `:${line}${col ? `:${col}` : ""}` : "";
          return `file://${file}${location}`;
        }
        
        const fullPath = Deno.realPathSync(file);
        const location = line ? `:${line}${col ? `:${col}` : ""}` : "";
        return `file://${fullPath}${location}`;
      } catch (err) {
        // Don't log warning messages for non-existent paths when making paths clickable
        // These are often false positives from code snippets, examples, etc.
        const location = line ? `:${line}${col ? `:${col}` : ""}` : "";
        return `file://${file}${location}`;
      }
    });
  });
  
  return processedLines.join('\n');
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
    // Pointer line
    if (line.includes("  │ ") && line.includes("^")) {
      result += config.useColors ? c.red(line) : line;
    }
    // Error line (usually the line before the pointer)
    else if (i > 0 && lines[i + 1]?.includes("^")) {
      result += config.useColors ? c.yellow(line) : line;
    }
    // Normal context line
    else {
      result += config.useColors ? c.gray(line) : line;
    }
    
    result += "\n";
  });
  
  return result;
}

/**
 * Extract the most useful debugging information from an error
 */
function extractUsefulDebugInfo(error: HQLError): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  // Include essential error information
  if (error.originalError) {
    // Original error type
    if (error.originalError.name && error.originalError.name !== 'Error' && error.originalError.name !== error.name) {
      result['Original Error Type'] = error.originalError.name;
    }
    
    // Include any custom properties from the original error that might be useful
    const customProps = extractCustomErrorProperties(error.originalError);
    if (Object.keys(customProps).length > 0) {
      // Remove verbose source if present
      if (customProps.source && typeof customProps.source === 'string') {
        delete customProps.source;
      }
      
      // Format position data for better readability
      if (customProps.position && typeof customProps.position === 'object') {
        const pos = customProps.position as any;
        if (pos.line && pos.column) {
          result['Position'] = `Line ${pos.line}, Column ${pos.column}`;
          delete customProps.position;
        }
      }
      
      // Format node type and location for better readability
      if (customProps.node && typeof customProps.node === 'object') {
        try {
          const node = customProps.node as any;
          if (node.type) {
            result['Node Type'] = node.type;
          }
          if (node.loc) {
            result['Node Location'] = `${node.loc.start?.line || '?'}:${node.loc.start?.column || '?'} - ${node.loc.end?.line || '?'}:${node.loc.end?.column || '?'}`;
          }
          delete customProps.node;
        } catch (e) {
          // Ignore errors extracting node info
        }
      }
      
      // Keep specific compiler information
      if (customProps.compilationPhase) {
        result['Compilation Phase'] = customProps.compilationPhase;
        delete customProps.compilationPhase;
      }
      
      if (customProps.hqlLine && customProps.hqlColumn) {
        result['HQL Location'] = `Line ${customProps.hqlLine}, Column ${customProps.hqlColumn}`;
        delete customProps.hqlLine;
        delete customProps.hqlColumn;
      }
      
      if (Object.keys(customProps).length > 0) {
        // Only include the remaining properties if we have any left
        result['Error Details'] = customProps;
      }
    }
  }
  
  return result;
}

/**
 * Extract custom properties from an error that might be useful for debugging
 */
function extractCustomErrorProperties(error: Error): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const standardProps = ['name', 'message', 'stack', 'reported'];
  
  // Extract custom properties not in the standard list
  for (const prop of Object.getOwnPropertyNames(error)) {
    if (!standardProps.includes(prop) && prop !== '__proto__') {
      const value = (error as any)[prop];
      
      // Skip functions and complex objects
      if (typeof value !== 'function' && 
          (typeof value !== 'object' || value === null || Array.isArray(value) || 
           Object.getPrototypeOf(value) === Object.prototype)) {
        result[prop] = value;
      }
    }
  }
  
  return result;
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
  
  // Start with the error header
  let result = "";
  
  // Create a concise header with error type and message
  const errorPrefix = config.useColors 
    ? c.bold(c.red(`${hqlError.errorType}:`)) 
    : `${hqlError.errorType}:`;
  
  // Main error message
  result += `${errorPrefix} ${hqlError.message}`;
  
  // Add location info
  const { filePath, line, column } = hqlError.sourceLocation;
  if (filePath) {
    const location = line 
      ? `${filePath}:${line}${column ? `:${column}` : ""}` 
      : filePath;
    
    result += `\n${config.useColors ? c.gray("Location:") : "Location:"} ${location}`;
  }
  
  // Add context (source code)
  if (hqlError.contextLines.length > 0) {
    result += `\n\n${formatContextLines(hqlError.contextLines, config)}`;
  }
  
  // Add suggestion
  const suggestion = typeof hqlError.getSuggestion === 'function' 
    ? hqlError.getSuggestion()
    : hqlError.getSuggestion;
  if (suggestion) {
    result += `\n${config.useColors ? c.cyan("Suggestion:") : "Suggestion:"} ${suggestion}`;
  }
  
  // Enhanced debug information - only show if explicitly requested and in a more user-friendly format
  if (config.enhancedDebug) {
    // In debug mode, only show the most useful information
    const debugInfo = extractUsefulDebugInfo(hqlError);
    
    if (Object.keys(debugInfo).length > 0) {
      result += `\n\n${config.useColors ? c.bold(c.blue("Debug Information:")) : "Debug Information:"}`;
      
      // Format debug info in a more readable way
      for (const [key, value] of Object.entries(debugInfo)) {
        if (typeof value === 'string') {
          result += `\n• ${config.useColors ? c.green(key) : key}: ${value}`;
        } else if (value !== null && typeof value === 'object') {
          result += `\n• ${config.useColors ? c.green(key) : key}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}`;
        }
      }
    }
    
    // ALWAYS add call stack in debug mode (make this unconditional)
    const formattedStack = formatBeautifulCallStack(hqlError, config.useColors);
    if (formattedStack) {
      result += `\n\n${config.useColors ? c.bold(c.blue("Call Stack:")) : "Call Stack:"}`;
      result += `\n${formattedStack}`;
    }
    
    // Add Deno-specific error information if available
    if (typeof Deno !== 'undefined') {
      const denoInfo = extractDenoSpecificInfo(hqlError);
      if (Object.keys(denoInfo).length > 0) {
        result += `\n\n${config.useColors ? c.bold(c.blue("Deno Error Details:")) : "Deno Error Details:"}`;
        
        // Format Deno-specific info
        for (const [key, value] of Object.entries(denoInfo)) {
          if (typeof value === 'string') {
            result += `\n• ${config.useColors ? c.green(key) : key}: ${value}`;
          } else if (Array.isArray(value)) {
            result += `\n• ${config.useColors ? c.green(key) : key}:`;
            value.forEach((item, i) => {
              result += `\n  ${i+1}. ${JSON.stringify(item)}`;
            });
          } else if (value !== null && typeof value === 'object') {
            result += `\n• ${config.useColors ? c.green(key) : key}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}`;
          }
        }
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
 * Extract Deno-specific error information
 */
function extractDenoSpecificInfo(error: HQLError): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const originalError = error.originalError || error;
  
  try {
    // Try to get resource info if available
    if (typeof Deno !== 'undefined') {
      // Check for Deno error properties
      if ('code' in (originalError as any)) {
        result['Error Code'] = (originalError as any).code;
      }
      
      // Get source map info if available
      // @ts-ignore: Using Deno-specific APIs
      if (Deno.core && Deno.core.getSourceMapData) {
        try {
          // @ts-ignore: Using Deno-specific APIs
          const sourceMapData = Deno.core.getSourceMapData(originalError);
          if (sourceMapData) {
            if (sourceMapData.sourcePath) {
              result['Original Source'] = sourceMapData.sourcePath;
            }
            if (sourceMapData.line) {
              result['Source Line'] = sourceMapData.line;
            }
            if (sourceMapData.column) {
              result['Source Column'] = sourceMapData.column;
            }
          }
        } catch (e) {
          // Ignore errors accessing source map data
        }
      }
      
      // Try to get error cause chain
      const causes: string[] = [];
      let currentCause = (originalError as any).cause;
      while (currentCause) {
        causes.push(typeof currentCause === 'string' 
          ? currentCause 
          : `${currentCause.name || 'Error'}: ${currentCause.message}`);
        currentCause = currentCause.cause;
      }
      
      if (causes.length > 0) {
        result['Error Causes'] = causes;
      }
      
      // Try to access resource information
      if ('rid' in (originalError as any)) {
        const rid = (originalError as any).rid;
        try {
          // @ts-ignore: Using Deno-specific APIs
          if (Deno.resources && typeof rid === 'number') {
            // @ts-ignore: Using Deno-specific APIs
            const resources = Deno.resources();
            if (resources[rid]) {
              result['Resource'] = `${resources[rid]} (ID: ${rid})`;
            }
          }
        } catch (e) {
          // Ignore errors accessing resource info
        }
      }
    }
  } catch (e) {
    // Ignore any errors trying to extract Deno info
  }
  
  return result;
}

/**
 * Create a beautifully formatted call stack with clickable links
 */
function formatBeautifulCallStack(error: HQLError, useColors: boolean): string {
  // Use the original stack if available, otherwise use the current stack
  const stackToFormat = error.originalError?.stack || error.stack;
  if (!stackToFormat) return '';
  
  const c = createColorConfig(useColors);
  
  // Split stack by lines and filter out noise
  const stackLines = stackToFormat.split('\n')
    // First, filter out the first line if it contains the error message (which we display separately)
    .filter((line, index) => {
      if (index === 0 && line.includes(error.message)) return false;
      return true;
    })
    // Then filter out noise
    .filter(line => {
      return !line.includes('node_modules/') && 
             !line.includes('internal/') &&
             !line.includes('<anonymous>') &&
             !line.includes('deno:internal');
    })
    .slice(0, 15); // Limit to first 15 lines to avoid overwhelming the user
  
  if (stackLines.length === 0) {
    // If no stack lines remain after filtering, return some of the original stack
    return "No detailed stack trace available. Original stack trace:\n" +
           stackToFormat.split('\n').slice(0, 5).map(line => `  ${line}`).join('\n');
  }
  
  // Format each stack line to be clickable and visually appealing
  return stackLines.map((line, index) => {
    // Try to extract file, line, and column information using various formats
    const match = line.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) || 
                  line.match(/at\s+(.*):(\d+):(\d+)/) ||
                  line.match(/at\s+(.*)/);
    
    if (!match) return useColors ? c.gray(`  ${line}`) : `  ${line}`;
    
    // Extract components based on the regex match format
    let callSite, file, lineNum, colNum;
    
    if (match[2] && match[3] && match[4]) {
      // Format: at functionName (file:line:column)
      callSite = match[1];
      file = match[2];
      lineNum = match[3];
      colNum = match[4];
    } else if (match[1] && match[2] && match[3]) {
      // Format: at file:line:column
      callSite = '';
      file = match[1];
      lineNum = match[2];
      colNum = match[3];
    } else {
      // Just a function name without location
      callSite = match[1];
      file = '';
      lineNum = '';
      colNum = '';
    }
    
    // Make file locations clickable but show clean paths
    let formattedLine;
    if (file && lineNum && colNum) {
      // Show only the filename, not the full path, for cleaner output
      const fileName = file.split('/').pop() || file;
      
      // Special case for HQL files to highlight them
      const isHqlFile = file.endsWith('.hql');
      
      formattedLine = useColors
        ? `  ${index + 1}. ${c.cyan(callSite || '')} `
          + `(${isHqlFile ? c.bold(c.yellow(fileName)) : c.yellow(fileName)}:${c.green(lineNum)}:${c.green(colNum)})`
        : `  ${index + 1}. ${callSite || ''} (${fileName}:${lineNum}:${colNum})`;
      
      // Replace the filename in the line with the full path to make it clickable
      // (We'll make it clickable later with makePathsClickable)
      formattedLine = formattedLine.replace(fileName, file);
    } else {
      // Just a function name without location
      formattedLine = useColors
        ? `  ${index + 1}. ${c.cyan(callSite || '')}`
        : `  ${index + 1}. ${callSite || ''}`;
    }
    
    return formattedLine;
  }).join('\n');
}

/**
 * Extract HQL-specific error information from transpiler errors
 * This helps translate cryptic JS errors into more meaningful HQL errors
 */
function extractHqlErrorInfo(error: Error): Record<string, any> {
  const result: Record<string, any> = {};
  
  // Look for HQL AST nodes in error
  if ('node' in (error as any)) {
    const node = (error as any).node;
    if (node && typeof node === 'object') {
      if (node.type) {
        result.nodeType = node.type;
      }
      if (node.loc) {
        result.location = node.loc;
      }
    }
  }
  
  // Check for HQL-specific error properties
  const hqlProperties = [
    'syntaxError', 'parseError', 'semanticError', 'compilationPhase',
    'hqlSource', 'hqlLine', 'hqlColumn', 'macroName', 'importPath'
  ];
  
  for (const prop of hqlProperties) {
    if (prop in (error as any)) {
      result[prop] = (error as any)[prop];
    }
  }
  
  return result;
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
  
  // Extract source location info from stack trace if not provided
  const sourceLocation: SourceLocation = {
    ...extractLocationFromError(errorObj),
    ...options,
  };
  
  // Try to classify the error by examining message patterns
  const msg = errorObj.message.toLowerCase();
  
  // Attempt to extract HQL-specific info
  const hqlInfo = extractHqlErrorInfo(errorObj);
  
  // Parse errors with better context
  if (
    msg.includes("parse error") || 
    msg.includes("syntax error") || 
    msg.includes("unexpected token") ||
    msg.includes("unclosed") ||
    msg.includes("unterminated") ||
    'syntaxError' in hqlInfo
  ) {
    if (sourceLocation.line && sourceLocation.column) {
      // Read the source code line if available to provide better context
      if (sourceLocation.source && sourceLocation.line > 0) {
        const lines = sourceLocation.source.split('\n');
        
        if (sourceLocation.line <= lines.length) {
          const lineContent = lines[sourceLocation.line - 1];
          
          // Check for specific patterns to provide better error messages
          if (lineContent && msg.includes("unclosed list")) {
            if (lineContent.trim().startsWith('(export')) {
              const parseErr = new ParseError(`${errorObj.message} - Missing closing parenthesis in export statement`, {
                line: sourceLocation.line,
                column: sourceLocation.column,
                filePath: sourceLocation.filePath,
                source: sourceLocation.source,
                originalError: errorObj,
              });
              // Preserve reported flag if the original error was an HQLError
              if (error instanceof HQLError) {
                parseErr.reported = error.reported;
              }
              return parseErr;
            }
            
            if (lineContent.trim().startsWith('(import')) {
              const parseErr = new ParseError(`${errorObj.message} - Missing closing parenthesis in import statement`, {
                line: sourceLocation.line,
                column: sourceLocation.column,
                filePath: sourceLocation.filePath,
                source: sourceLocation.source,
                originalError: errorObj,
              });
              // Preserve reported flag if the original error was an HQLError
              if (error instanceof HQLError) {
                parseErr.reported = error.reported;
              }
              return parseErr;
            }
          }
        }
      }
      
      const parseErr = new ParseError(errorObj.message, {
        line: sourceLocation.line,
        column: sourceLocation.column,
        filePath: sourceLocation.filePath,
        source: sourceLocation.source,
        originalError: errorObj,
      });
      // Preserve reported flag if the original error was an HQLError
      if (error instanceof HQLError) {
        parseErr.reported = error.reported;
      }
      return parseErr;
    }
  }
  
  // Import errors
  if (
    msg.includes("import") || 
    msg.includes("require") ||
    msg.includes("module not found") ||
    msg.includes("cannot find module") ||
    msg.includes("failed to resolve") ||
    'importPath' in hqlInfo
  ) {
    // Try to extract the import path
    const importMatch = errorObj.message.match(/['"]([^'"]+)['"]/);
    const importPath = hqlInfo.importPath || (importMatch ? importMatch[1] : "unknown");
    
    return new ImportError(errorObj.message, importPath, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: errorObj,
    });
  }
  
  // Type/validation errors
  if (
    msg.includes("type") || 
    msg.includes("expected") ||
    msg.includes("got") ||
    msg.includes("invalid") ||
    msg.includes("not assignable") ||
    'semanticError' in hqlInfo
  ) {
    return new ValidationError(errorObj.message, "type validation", {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: errorObj,
    });
  }
  
  // Macro errors
  if (
    msg.includes("macro") ||
    'macroName' in hqlInfo
  ) {
    const macroName = hqlInfo.macroName || "unknown";
    return new MacroError(errorObj.message, macroName, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: errorObj,
    });
  }
  
  // Transform errors
  if (
    msg.includes("transform") ||
    'compilationPhase' in hqlInfo
  ) {
    const phase = hqlInfo.compilationPhase || "unknown";
    return new TransformError(errorObj.message, phase, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: errorObj,
    });
  }
  
  // Runtime errors
  if (
    msg.includes("is not a function") ||
    msg.includes("cannot read") ||
    msg.includes("undefined") ||
    msg.includes("null") ||
    msg.includes("is not iterable") ||
    msg.includes("is not constructable")
  ) {
    return new RuntimeError(errorObj.message, {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column,
      source: sourceLocation.source,
      originalError: errorObj,
    });
  }
  
  // Default to generic HQLError
  return new HQLError(errorObj.message, {
    errorType: errorObj.name || "Error",
    sourceLocation,
    originalError: errorObj,
  });
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
 * Global registry to track reported errors by message and location
 * This helps prevent duplicated error messages across different components
 */
const reportedErrorRegistry = new Set<string>();

/**
 * Generate a unique key for an error based on its message and location
 */
function getErrorKey(error: HQLError): string {
  const { filePath, line, column } = error.sourceLocation;
  return `${error.errorType}:${error.message}:${filePath || ''}:${line || ''}:${column || ''}`;
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
  // Apply debug mode to options if not explicitly set
  const withDebugApplied = {
    ...options,
    verbose: options.verbose ?? debugMode,
    showCallStack: options.showCallStack ?? debugMode,
    enhancedDebug: options.enhancedDebug ?? debugMode,
  };
  
  // Create config from options
  const config: ErrorConfig = {
    useColors: withDebugApplied.useColors ?? DEFAULT_ERROR_CONFIG.useColors,
    makePathsClickable: withDebugApplied.makePathsClickable ?? DEFAULT_ERROR_CONFIG.makePathsClickable,
    showCallStack: withDebugApplied.showCallStack ?? withDebugApplied.verbose ?? DEFAULT_ERROR_CONFIG.showCallStack,
    verbose: withDebugApplied.verbose ?? DEFAULT_ERROR_CONFIG.verbose,
    enhancedDebug: withDebugApplied.enhancedDebug ?? DEFAULT_ERROR_CONFIG.enhancedDebug,
  };
  
  // Enhance and format the error
  const hqlError = enhanceError(error, {
    filePath: withDebugApplied.filePath,
    line: withDebugApplied.line,
    column: withDebugApplied.column,
    source: withDebugApplied.source,
  });
  
  // Generate a unique key for this error
  const errorKey = getErrorKey(hqlError);
  
  // Skip if already reported globally and not forced
  if (reportedErrorRegistry.has(errorKey) && !withDebugApplied.force) {
    return;
  }
  
  // Skip if marked as reported internally and not forced
  if (hqlError.reported && !withDebugApplied.force) {
    return;
  }
  
  // Mark as reported to prevent duplicate reporting
  hqlError.reported = true;
  reportedErrorRegistry.add(errorKey);
  
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