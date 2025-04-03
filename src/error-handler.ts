// src/error-handler.ts
import { TranspilerError, ParseError, MacroError, ImportError, ValidationError } from "./transpiler/errors.ts";
import { Logger } from "./logger.ts";
import * as colors from "https://deno.land/std@0.224.0/fmt/colors.ts";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

// Store source files for error context
const sourceRegistry = new Map<string, string>();

/**
 * Register a source file for error enhancement
 */
export function registerSource(filePath: string, source: string): void {
  sourceRegistry.set(filePath, source);
}

/**
 * Get source for a file path
 */
export function getSource(filePath: string): string | undefined {
  return sourceRegistry.get(filePath);
}

/**
 * Format an error with enhanced context and suggestions
 */
export function formatEnhancedError(
  error: Error,
  options: {
    filePath?: string;
    useColors?: boolean;
  } = {}
): string {
  const useColors = options.useColors !== false;
  const c = useColors ? colors : { red: (s: string) => s, yellow: (s: string) => s, cyan: (s: string) => s, gray: (s: string) => s, bold: (s: string) => s };
  
  let result = '';
  
  // Handle specific error types
  if (error instanceof ParseError) {
    result = handleParseError(error, c);
  } else if (error instanceof MacroError) {
    result = handleMacroError(error, c);
  } else if (error instanceof ImportError) {
    result = handleImportError(error, c, options.filePath);
  } else if (error instanceof ValidationError) {
    result = handleValidationError(error, c);
  } else if (error instanceof TranspilerError) {
    result = handleTranspilerError(error, c, options.filePath);
  } else {
    // Generic error
    result = `${c.red(c.bold('Error:'))} ${error.message}`;
  }
  
  // Add suggestion based on error type
  result += '\n\n' + getErrorSuggestion(error);
  
  return result;
}

/**
 * Handle parse errors with line context
 */
function handleParseError(error: ParseError, c: any): string {
  let result = `${c.red(c.bold('Parse Error:'))} ${error.message}`;
  result += `\n${c.cyan('Location:')} line ${error.position.line}, column ${error.position.column}`;
  
  // Add source context if available
  if (error.source) {
    const lines = error.source.split('\n');
    const lineIndex = error.position.line - 1;
    
    if (lineIndex >= 0 && lineIndex < lines.length) {
      result += '\n\n';
      
      // Add line before for context if available
      if (lineIndex > 0) {
        result += `${c.gray(`${error.position.line - 1} | ${lines[lineIndex - 1]}`)}\n`;
      }
      
      // Add the error line
      result += `${c.yellow(`${error.position.line} | ${lines[lineIndex]}`)}\n`;
      
      // Add pointer to the column
      result += `${c.red(`  | ${' '.repeat(error.position.column - 1)}^`)}\n`;
      
      // Add line after for context if available
      if (lineIndex < lines.length - 1) {
        result += `${c.gray(`${error.position.line + 1} | ${lines[lineIndex + 1]}`)}\n`;
      }
    }
  }
  
  return result;
}

/**
 * Handle macro errors with context
 */
function handleMacroError(error: MacroError, c: any): string {
  let result = `${c.red(c.bold('Macro Error:'))} ${error.message}`;
  
  if (error.macroName) {
    result += `\n${c.cyan('Macro:')} ${error.macroName}`;
  }
  
  if (error.sourceFile) {
    result += `\n${c.cyan('Source:')} ${error.sourceFile}`;
    
    // Try to get source context if available
    const source = sourceRegistry.get(error.sourceFile);
    if (source) {
      // Try to extract line number from error message
      const lineMatch = error.message.match(/line (\d+)/i);
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1], 10);
        const lines = source.split('\n');
        
        if (lineNum > 0 && lineNum <= lines.length) {
          const lineIndex = lineNum - 1;
          result += '\n\n';
          
          // Add context
          if (lineIndex > 0) {
            result += `${c.gray(`${lineNum - 1} | ${lines[lineIndex - 1]}`)}\n`;
          }
          
          result += `${c.yellow(`${lineNum} | ${lines[lineIndex]}`)}\n`;
          
          if (lineIndex < lines.length - 1) {
            result += `${c.gray(`${lineNum + 1} | ${lines[lineIndex + 1]}`)}\n`;
          }
        }
      }
    }
  }
  
  return result;
}

/**
 * Handle import errors with context
 */
function handleImportError(error: ImportError, c: any, currentFile?: string): string {
  let result = `${c.red(c.bold('Import Error:'))} ${error.message}`;
  
  if (error.importPath) {
    result += `\n${c.cyan('Import Path:')} ${error.importPath}`;
  }
  
  if (error.sourceFile) {
    result += `\n${c.cyan('Source File:')} ${error.sourceFile}`;
  } else if (currentFile) {
    result += `\n${c.cyan('Source File:')} ${currentFile}`;
  }
  
  return result;
}

/**
 * Handle validation errors with context
 */
function handleValidationError(error: ValidationError, c: any): string {
  let result = `${c.red(c.bold('Validation Error:'))} ${error.message}`;
  
  if (error.context) {
    result += `\n${c.cyan('Context:')} ${error.context}`;
  }
  
  if (error.expectedType && error.actualType) {
    result += `\n${c.cyan('Expected:')} ${error.expectedType}`;
    result += `\n${c.cyan('Actual:')} ${error.actualType}`;
  }
  
  return result;
}

/**
 * Handle generic transpiler errors
 */
function handleTranspilerError(error: TranspilerError, c: any, filePath?: string): string {
  let result = `${c.red(c.bold('Error:'))} ${error.message}`;
  
  if (filePath) {
    result += `\n${c.cyan('File:')} ${filePath}`;
    
    // Try to get source context if available
    const source = sourceRegistry.get(filePath);
    if (source) {
      // Try to extract line number from error message
      const lineMatch = error.message.match(/line (\d+)/i);
      if (lineMatch) {
        const lineNum = parseInt(lineMatch[1], 10);
        const lines = source.split('\n');
        
        if (lineNum > 0 && lineNum <= lines.length) {
          const lineIndex = lineNum - 1;
          result += '\n\n';
          
          // Add context
          if (lineIndex > 0) {
            result += `${c.gray(`${lineNum - 1} | ${lines[lineIndex - 1]}`)}\n`;
          }
          
          result += `${c.yellow(`${lineNum} | ${lines[lineIndex]}`)}\n`;
          
          if (lineIndex < lines.length - 1) {
            result += `${c.gray(`${lineNum + 1} | ${lines[lineIndex + 1]}`)}\n`;
          }
        }
      }
    }
  }
  
  return result;
}

/**
 * Get error suggestions based on error type and content
 */
function getErrorSuggestion(error: Error): string {
  // Check error message for common patterns
  const msg = error.message.toLowerCase();
  
  if (error instanceof ParseError) {
    if (msg.includes("unexpected ')'")) {
      return "Check for mismatched parentheses. You might have an extra closing parenthesis or missing an opening one.";
    }
    if (msg.includes("unexpected end of input")) {
      return "Your expression is incomplete. Check for unclosed parentheses, brackets, or strings.";
    }
    return "Check your syntax for errors like mismatched delimiters or invalid tokens.";
  }
  
  if (error instanceof MacroError) {
    if (msg.includes("not found") || msg.includes("undefined")) {
      return "Make sure the macro is defined and imported correctly before using it.";
    }
    return "Review your macro definition and usage. Check parameter counts and types.";
  }
  
  if (error instanceof ImportError) {
    if (msg.includes("not found") || msg.includes("could not find")) {
      return "Verify that the file exists at the specified path. Check for typos in the path.";
    }
    if (msg.includes("circular")) {
      return "You have a circular dependency. Review your import structure to break the cycle.";
    }
    return "Check your import statements. Ensure all imported files exist and are accessible.";
  }
  
  if (error instanceof ValidationError) {
    if (msg.includes("type")) {
      return "Make sure your values match the expected types. Check function argument types.";
    }
    return "Verify that your code meets all validation requirements.";
  }
  
  // Generic suggestions based on keywords
  if (msg.includes("undefined") || msg.includes("not found")) {
    return "Check that all variables, functions, and modules are defined before use.";
  }
  
  if (msg.includes("unexpected token")) {
    return "Look for syntax errors like missing commas, brackets, or parentheses.";
  }
  
  return "Try simplifying your code to isolate the issue.";
}

/**
 * Handle error in a standardized way
 */
export function handleError(
  error: Error, 
  options: {
    filePath?: string;
    exitProcess?: boolean;
    useColors?: boolean;
  } = {}
): void {
  // Format the error with enhanced context
  const formattedError = formatEnhancedError(error, options);
  
  // Log the formatted error
  console.error(formattedError);
  
  // Exit process if requested
  if (options.exitProcess) {
    Deno.exit(1);
  }
}