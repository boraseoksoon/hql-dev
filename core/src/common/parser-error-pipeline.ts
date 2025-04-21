// src/common/parser-error-pipeline.ts
// Enhanced error handling integration for parser errors

import { ErrorPipeline, ParseError as ErrorPipelineParseError } from './error-pipeline.ts';
import { ParseError as TranspilerParseError } from '../transpiler/error/errors.ts';
import { globalLogger as logger } from '../logger.ts';

/**
 * Convert ParseError from transpiler error module to ErrorPipeline's ParseError
 * This ensures consistent error reporting with the new pipeline
 */
export function convertParseError(error: TranspilerParseError): ErrorPipelineParseError {
  return new ErrorPipelineParseError(
    error.message,
    {
      line: error.position.line,
      column: error.position.column,
      filePath: error.position.filePath,
      source: error.source,
      originalError: error
    }
  );
}

/**
 * Report a parser error using the enhanced error pipeline
 */
export function reportParseError(error: TranspilerParseError): void {
  // Convert the error if needed
  const pipelineError = error instanceof ErrorPipelineParseError 
    ? error 
    : convertParseError(error);
    
  // Report the error using the pipeline
  ErrorPipeline.reportError(pipelineError);
}

/**
 * A wrapper function for parse operations that enhances error handling
 */
export function withEnhancedErrorHandling<T>(
  fn: () => T,
  options: {
    filePath?: string;
    source?: string;
    errorContext?: string;
    rethrow?: boolean;
  } = {}
): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof TranspilerParseError) {
      // Convert and report the parse error
      const pipelineError = convertParseError(error);
      
      // Add file path context if available
      if (options.filePath && !pipelineError.sourceLocation.filePath) {
        pipelineError.sourceLocation.filePath = options.filePath;
      }
      
      // Add source content if available
      if (options.source && !pipelineError.sourceLocation.source) {
        pipelineError.sourceLocation.source = options.source;
        
        // Register the source for future error reporting
        ErrorPipeline.registerSourceFile(
          options.filePath || 'input.hql',
          options.source
        );
      }
      
      // Log additional context if provided
      if (options.errorContext) {
        logger.error(`Error in ${options.errorContext}: ${error.message}`);
      }
      
      // Report the error
      ErrorPipeline.reportError(pipelineError);
      
      // Rethrow by default unless explicitly set to false
      if (options.rethrow !== false) {
        throw pipelineError;
      }
      
      return undefined as unknown as T;
    } else {
      // For non-parse errors, use the standard error pipeline
      if (options.rethrow !== false) {
        throw ErrorPipeline.enhanceError(error, {
          filePath: options.filePath,
          source: options.source
        });
      }
      
      return undefined as unknown as T;
    }
  }
}

/**
 * Parse with better error handling
 * A wrapper around the parse function that provides improved error context
 */
export function safelyParse<T>(
  parseFunction: (input: string, filePath: string) => T,
  input: string,
  filePath: string
): T {
  try {
    // Register the source for error reporting
    ErrorPipeline.registerSourceFile(filePath, input);
    
    return withEnhancedErrorHandling(
      () => parseFunction(input, filePath),
      {
        filePath,
        source: input,
        errorContext: `parsing ${filePath}`
      }
    );
  } catch (error) {
    // Convert any error to appropriate type and throw
    throw ErrorPipeline.enhanceError(error, {
      filePath,
      source: input
    });
  }
}

/**
 * Enhanced suggestions for common HQL parser errors
 */
export function getParserErrorSuggestion(error: TranspilerParseError | ErrorPipelineParseError): string {
  const errorMsg = error.message.toLowerCase();
  
  // Check for common error patterns
  if (errorMsg.includes("unexpected ')'")) {
    return "Check for a missing opening parenthesis '(' earlier in your code.";
  }
  
  if (errorMsg.includes("unexpected ']'")) {
    return "Check for a missing opening bracket '[' earlier in your code.";
  }
  
  if (errorMsg.includes("unexpected '}'")) {
    return "Check for a missing opening brace '{' earlier in your code.";
  }
  
  if (errorMsg.includes("unclosed")) {
    const what = errorMsg.includes("list") ? "list expression" : 
                 errorMsg.includes("vector") ? "vector" :
                 errorMsg.includes("map") ? "map" :
                 errorMsg.includes("set") ? "set" : "expression";
    return `Your code has an unclosed ${what}. Add the appropriate closing delimiter.`;
  }
  
  if (errorMsg.includes("unterminated string")) {
    return "Your string is missing a closing quote. Add a double quote (\") at the end of the string.";
  }
  
  if (errorMsg.includes("end of input")) {
    return "Your expression is incomplete. Check for unclosed parentheses or missing syntax elements.";
  }
  
  if (errorMsg.includes("mismatched")) {
    return "You have opening and closing delimiters that don't match. Make sure each opening delimiter is paired with the correct type of closing delimiter.";
  }
  
  // For common HQL forms
  if (errorMsg.includes("fn")) {
    return "Check your function syntax. Functions should be defined as (fn name [params] body).";
  }
  
  if (errorMsg.includes("let")) {
    return "Check your let binding syntax. Let statements should be (let name value) or (let (name1 value1 name2 value2) body).";
  }
  
  if (errorMsg.includes("if")) {
    return "Check your if statement syntax. If statements should be (if condition then-expr else-expr).";
  }
  
  if (errorMsg.includes("cond")) {
    return "Check your cond statement syntax. Cond should be (cond (test1 expr1) (test2 expr2) ...).";
  }
  
  if (errorMsg.includes("import")) {
    return "Check your import statement syntax. Imports should be (import {symbols} from \"path\") or (import name from \"path\").";
  }
  
  if (errorMsg.includes("export")) {
    return "Check your export statement syntax. Exports should be (export name) or (export default name).";
  }
  
  return "Check your syntax for balanced parentheses, brackets, and braces, and ensure proper HQL expression structure.";
}

/**
 * Initialize parser error handlers
 * Sets up the error pipeline to handle parser errors specially
 */
export function initializeParserErrorHandling(): void {
  // Register custom error suggestion handler for parse errors
  const originalGetSuggestion = ErrorPipelineParseError.prototype.getSuggestion;
  
  // Override the getSuggestion method for ParseError
  ErrorPipelineParseError.prototype.getSuggestion = function(this: ErrorPipelineParseError): string {
    // First try our enhanced suggestions
    const suggestion = getParserErrorSuggestion(this);
    
    // Fall back to original if needed
    return suggestion || originalGetSuggestion.call(this);
  };
  
  logger.debug('Enhanced parser error handling initialized');
}