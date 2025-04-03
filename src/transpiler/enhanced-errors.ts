// src/transpiler/enhanced-errors.ts
import { TranspilerError, ParseError, ValidationError, MacroError, ImportError, CodeGenError, TransformError } from "./errors.ts";

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

/**
 * Enhanced base error class that adds source context information
 * This extends the existing TranspilerError without changing its API
 */
export class EnhancedTranspilerError extends TranspilerError {
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
    }
    
    // Fix prototype chain
    Object.setPrototypeOf(this, EnhancedTranspilerError.prototype);
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
  public override formatMessage(): string {
    const c = this.colorConfig;
    
    // Start with basic message
    let result = c.red(c.bold(`Error: ${this.message}`));
    
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
      
      result += `\n${c.cyan("Location:")} ${locationPath}`;
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
            result += c.red(line) + '\n';
          } else if (i === this.contextLines.length - 3 || 
                    (this.contextLines.length <= 3 && i === this.contextLines.length - 2)) {
            // Error line
            result += c.yellow(line) + '\n';
          } else {
            // Context line
            result += c.gray(line) + '\n';
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
        result += c.gray(`${i + 1} │ ${lines[i]}`) + '\n';
      }
      if (lines.length > maxLines) {
        result += c.gray(`... (${lines.length - maxLines} more lines)`) + '\n';
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
  ): EnhancedTranspilerError {
    return new EnhancedTranspilerError(
      error.message,
      options
    );
  }
}

/**
 * Parse errors with enhanced formatting
 */
export class EnhancedParseError extends ParseError {
  // Declare as public to match the parent class
  override source?: string;
  private colorConfig: ColorConfig;
  
  constructor(
    message: string,
    position: { line: number; column: number; offset: number },
    source?: string,
    useColors: boolean = true
  ) {
    super(message, position, source);
    this.source = source;
    this.colorConfig = createColorConfig(useColors);
    
    // Fix prototype chain
    Object.setPrototypeOf(this, EnhancedParseError.prototype);
  }
  
  /**
   * Override message formatting for parse errors
   */
  override formatMessage(): string {
    const c = this.colorConfig;
    
    let result = c.red(c.bold(`Parse Error: ${this.message} at line ${this.position.line}, column ${this.position.column}`));
    
    // Add a snippet of source if available
    if (this.source) {
      const lines = this.source.split('\n');
      const lineText = lines[this.position.line - 1] || "";
      const pointer = " ".repeat(this.position.column - 1) + "^";
      
      result += '\n\n';
      
      // Add context before
      if (this.position.line > 1) {
        result += `${c.gray(`${this.position.line - 1} │ ${lines[this.position.line - 2]}`)}\n`;
      }
      
      // Add error line
      result += `${c.yellow(`${this.position.line} │ ${lineText}`)}\n`;
      
      // Add pointer
      result += `${c.red(`  │ ${pointer}`)}\n`;
      
      // Add context after
      if (this.position.line < lines.length) {
        result += `${c.gray(`${this.position.line + 1} │ ${lines[this.position.line]}`)}\n`;
      }
    }
    
    return result;
  }
}

/**
 * Helper function to wrap existing parse errors with enhanced formatting
 */
export function enhanceParseError(error: ParseError, useColors: boolean = true): EnhancedParseError {
  return new EnhancedParseError(
    error.message,
    error.position,
    error.source,
    useColors
  );
}

/**
 * Enhance errors by adding source context
 */
export function enhanceError(
  error: Error,
  options: {
    source?: string;
    filePath?: string;
    line?: number;
    column?: number;
    useColors?: boolean;
  } = {}
): Error {
  // If it's already an enhanced error, just return it
  if (error instanceof EnhancedTranspilerError) {
    return error;
  }
  
  // Handle specific error types
  if (error instanceof ParseError) {
    return enhanceParseError(error, options.useColors);
  }
  
  // For all other transpiler errors, create enhanced versions
  if (error instanceof TranspilerError) {
    return new EnhancedTranspilerError(
      error.message,
      options
    );
  }
  
  // For generic errors, wrap them
  return EnhancedTranspilerError.fromError(error, options);
}