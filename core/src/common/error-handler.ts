// core/src/common/error-handler.ts
// Enhanced error handling system for HQL

import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { Logger, globalLogger as logger } from "../logger.ts";
import { 
  HQLError, 
  ParseError, 
  ValidationError, 
  MacroError, 
  TransformError, 
  RuntimeError,
  CodeGenError,
  TranspilerError
} from "./error.ts";

/**
 * Color utilities for error formatting
 */
export interface ColorConfig {
  purple: (s: string) => string;
  red: (s: string) => string;
  black: (s: string) => string;
  gray: (s: string) => string;
  bold: (s: string) => string;
  white: (s: string) => string;
  cyan: (s: string) => string;
  blue: (s: string) => string;
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
    blue: (s) => `\x1b[34m${s}\x1b[0m`,
  };
}

const colors = createColorConfig();

/**
 * Interface for the contextual source code lines
 */
export interface ContextLine {
  line: number;
  content: string;
  isError: boolean;
  column?: number;
}

/**
 * Enhanced error formatter that provides better context and suggestions
 */
export class ErrorFormatter {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger(false);
  }

  /**
   * Format an error with detailed context and suggestions
   */
  async formatError(error: Error | HQLError, isDebug = false): Promise<string> {
    // Convert standard Error to HQLError if needed
    const hqlError = this.ensureHQLError(error);
    
    // Build output with proper formatting
    const output: string[] = [];
    
    // Error title and message
    const errorType = hqlError.errorType || "Error";
    const message = hqlError.message || "An unknown error occurred";
    output.push(`${colors.red(colors.bold(`${errorType}:`))} ${message}`);
    
    // Add empty line for spacing
    output.push('');
    
    // Get context lines if not already populated
    if (hqlError.contextLines?.length === 0 && hqlError.sourceLocation) {
      await this.enhanceErrorWithContext(hqlError);
    }
    
    // Display code context with line numbers and column pointer
    if (hqlError.contextLines?.length > 0) {
      const maxLineNumber = Math.max(...hqlError.contextLines.map(item => item.line));
      const lineNumPadding = String(maxLineNumber).length;
      
      // Format each context line
      hqlError.contextLines.forEach(({line: lineNo, content: text, isError, column}) => {
        const lineNumStr = String(lineNo).padStart(lineNumPadding, ' ');
        
        if (isError) {
          // Error line (purple for line number)
          output.push(` ${colors.purple(lineNumStr)} | ${text}`);
          
          // Add pointer to the column position
          if (column && column > 0) {
            const pointerSpacing = ' '.repeat(lineNumPadding + 3 + Math.max(0, column - 1));
            output.push(`${pointerSpacing}${colors.red(colors.bold('^'))}`);
          }
        } else {
          // Context line (gray)
          output.push(` ${colors.gray(lineNumStr)} | ${colors.gray(text)}`);
        }
      });
      
      // Add empty line after context
      output.push('');
    }
    
    // Add location information
    if (hqlError.sourceLocation?.filePath) {
      const filepath = hqlError.sourceLocation.filePath;
      const line = hqlError.sourceLocation.line || 1;
      const column = hqlError.sourceLocation.column || 1;
      
      const locationStr = `${filepath}:${line}:${column}`;
      output.push(`${colors.purple(colors.bold("Location:"))} ${colors.white(locationStr)}`);
    }
    
    // Add suggestion if available
    if (hqlError.getSuggestion && typeof hqlError.getSuggestion === 'function') {
      const suggestion = hqlError.getSuggestion();
      if (suggestion) {
        output.push(`${colors.cyan(`Suggestion: ${suggestion}`)}`);
      }
    }
    
    // Add stack trace only in debug mode
    if (isDebug && error.stack) {
      output.push('');
      output.push(colors.gray('Stack trace:'));
      output.push(colors.gray(error.stack));
    }
    
    return output.join('\n');
  }
  
  /**
   * Ensure we're dealing with an HQLError by converting standard Error if needed
   */
  private ensureHQLError(error: Error | HQLError): HQLError {
    if (error instanceof HQLError) {
      return error;
    }
    
    // Convert standard Error to HQLError
    return new HQLError(error.message, { 
      errorType: "Runtime Error", 
      originalError: error
    });
  }
  
  /**
   * Enhance an error with source context if possible
   */
  private async enhanceErrorWithContext(error: HQLError): Promise<void> {
    try {
      if (!error.sourceLocation?.filePath || !error.sourceLocation.line) {
        return;
      }
      
      const filePath = error.sourceLocation.filePath;
      const errorLine = error.sourceLocation.line;
      const errorColumn = error.sourceLocation.column;
      
      // Try to read the file content
      try {
        const fileContent = await Deno.readTextFile(filePath);
        const lines = fileContent.split(/\r?\n/);
        
        // Extract context lines (1 before, error line, 1 after)
        const contextLines: ContextLine[] = [];
        const startLine = Math.max(0, errorLine - 2);
        const endLine = Math.min(lines.length - 1, errorLine + 2);
        
        for (let i = startLine; i <= endLine; i++) {
          contextLines.push({
            line: i + 1, // 1-based line numbers
            content: lines[i] || "",
            isError: i + 1 === errorLine,
            column: i + 1 === errorLine ? errorColumn : undefined
          });
        }
        
        error.contextLines = contextLines;
      } catch (readError) {
        // If file can't be read, log it but don't fail
        logger.debug(`Could not read source file for context: ${filePath}`);
      }
    } catch (enhanceError) {
      logger.debug(`Error while enhancing error context: ${enhanceError}`);
    }
  }
}

/**
 * Global error reporter for consistent error handling
 */
export class ErrorReporter {
  private formatter: ErrorFormatter;
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || new Logger(false);
    this.formatter = new ErrorFormatter(this.logger);
  }
  
  /**
   * Report an error with proper formatting
   */
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
  
  /**
   * Create a parse error with proper source location
   */
  createParseError(
    message: string, 
    line: number, 
    column: number, 
    filePath: string, 
    source?: string
  ): ParseError {
    return new ParseError(message, { line, column, filePath, source });
  }
  
  /**
   * Create a validation error with type information
   */
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
      column 
    });
  }
  
  /**
   * Create a runtime error with source location
   */
  createRuntimeError(
    message: string,
    filePath?: string,
    line?: number,
    column?: number
  ): RuntimeError {
    return new RuntimeError(message, { filePath, line, column });
  }
}

// Export a global instance for convenience
export const globalErrorReporter = new ErrorReporter(logger);

// Replacement for the original reportError function
export async function reportError(error: Error | HQLError, isDebug = false): Promise<void> {
  await globalErrorReporter.reportError(error, isDebug);
}