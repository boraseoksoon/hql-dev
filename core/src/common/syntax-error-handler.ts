// core/src/common/syntax-error-handler.ts
// A centralized file for handling all syntax-related errors

import { dirname, readTextFile } from "../platform/platform.ts";
import { ValidationError, ImportError, RuntimeError, MacroError, TransformError } from "./error.ts";
import { SourceLocationInfo } from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { enrichErrorWithContext } from "./error-system.ts";

/**
 * Information about a source code location
 */
export interface SourceLocation {
  filePath: string;
  line?: number;
  column?: number;
}

/**
 * Create a validation error with enhanced source location information
 */
export function createValidationError(
  message: string,
  context: string,
  expectedType: string,
  actualType: string,
  sourceLocation: SourceLocation,
): ValidationError {
  const error = new ValidationError(
    message,
    context,
    {
      expectedType,
      actualType,
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    }
  );
  
  return error;
}

/**
 * Create an import error with enhanced source location information
 */
export function createImportError(
  message: string,
  importPath: string,
  sourceLocation: SourceLocation,
): ImportError {
  const error = new ImportError(
    message,
    importPath,
    {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    }
  );
  
  return error;
}

/**
 * Create a runtime error with enhanced source location information
 */
export function createRuntimeError(
  message: string,
  sourceLocation: SourceLocation,
): RuntimeError {
  const error = new RuntimeError(
    message,
    {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    }
  );
  
  return error;
}

/**
 * Create a macro error with enhanced source location information
 */
export function createMacroError(
  message: string,
  macroName: string,
  sourceLocation: SourceLocation,
): MacroError {
  const error = new MacroError(
    message,
    macroName,
    {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    }
  );
  
  return error;
}

/**
 * Create a transform error with enhanced source location information
 */
export function createTransformError(
  message: string,
  phase: string,
  sourceLocation: SourceLocation,
): TransformError {
  const error = new TransformError(
    message,
    phase,
    {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    }
  );
  
  return error;
}

/**
 * Find source location information in a given HQL node
 */
export function findSourceLocation(node: any, filePath: string): SourceLocation {
  const location: SourceLocation = {
    filePath
  };

  // Try to extract line and column from different node formats
  
  // Node with position property (most AST nodes)
  if (node && node.position && typeof node.position === 'object') {
    if (node.position.line !== undefined) {
      location.line = node.position.line;
    }
    if (node.position.column !== undefined) {
      location.column = node.position.column;
    }
  }
  // S-expression with metadata
  else if (node && node._meta && typeof node._meta === 'object') {
    if (node._meta.line !== undefined) {
      location.line = node._meta.line;
    }
    if (node._meta.column !== undefined) {
      location.column = node._meta.column;
    }
  }
  // For list-based S-expressions
  else if (node && node.type === 'list' && node.elements && node.elements.length > 0) {
    // Try to get metadata from first element
    const firstElem = node.elements[0];
    if (firstElem && firstElem._meta) {
      if (firstElem._meta.line !== undefined) {
        location.line = firstElem._meta.line;
      }
      if (firstElem._meta.column !== undefined) {
        location.column = firstElem._meta.column;
      }
    }
  }
  
  return location;
}

/**
 * Attach source location information to an S-expression node
 */
export function attachSourceLocation(
  node: any, 
  filePath: string, 
  line?: number, 
  column?: number
): void {
  if (!node) return;
  
  // Create metadata object if it doesn't exist
  if (!node._meta) {
    node._meta = {};
  }
  
  // Set file path
  node._meta.filePath = filePath;
  
  // Set line and column if provided
  if (line !== undefined) {
    node._meta.line = line;
  }
  if (column !== undefined) {
    node._meta.column = column;
  }
}

/**
 * Extract line and column information from a syntax error message
 */
export function extractLineColumnFromError(error: string): { line?: number; column?: number } {
  // Try to extract line:column pattern (e.g., "at line 10, column 5" or "file.hql:10:5")
  const lineColMatch = error.match(/(?:at\s+line\s+(\d+),\s+column\s+(\d+))|(?::(\d+):(\d+))/);
  
  if (lineColMatch) {
    // If it matches the "at line x, column y" format
    if (lineColMatch[1] && lineColMatch[2]) {
      return {
        line: parseInt(lineColMatch[1], 10),
        column: parseInt(lineColMatch[2], 10)
      };
    }
    // If it matches the "file:line:column" format
    else if (lineColMatch[3] && lineColMatch[4]) {
      return {
        line: parseInt(lineColMatch[3], 10),
        column: parseInt(lineColMatch[4], 10)
      };
    }
  }
  
  return {};
}

/**
 * Find the source location for a symbol in a file
 */
export async function findSymbolLocation(
  symbolName: string,
  filePath: string
): Promise<SourceLocation> {
  const location: SourceLocation = {
    filePath
  };
  
  try {
    const content = await readTextFile(filePath);
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const column = lines[i].indexOf(symbolName);
      if (column >= 0) {
        // Make sure it's a whole word, not part of another word
        const prevChar = column > 0 ? lines[i][column - 1] : ' ';
        const nextChar = column + symbolName.length < lines[i].length ? 
          lines[i][column + symbolName.length] : ' ';
        
        if (!/[a-zA-Z0-9_-]/.test(prevChar) && !/[a-zA-Z0-9_-]/.test(nextChar)) {
          location.line = i + 1;  // 1-based line numbers
          location.column = column + 1;  // 1-based column numbers
          break;
        }
      }
    }
  } catch (error) {
    logger.debug(`Error finding symbol location for ${symbolName}: ${error.message}`);
  }
  
  return location;
}

/**
 * Handle a function call error with detailed source information
 */
export async function handleFunctionCallError(
  fnName: string,
  error: Error,
  args: any[],
  filePath: string,
  position?: { line?: number; column?: number }
): Promise<Error> {
  // Create a source location
  const location: SourceLocation = {
    filePath,
    ...position
  };
  
  // If we don't have position info, try to find it
  if (!location.line || !location.column) {
    const symbolLocation = await findSymbolLocation(fnName, filePath);
    if (symbolLocation.line && symbolLocation.column) {
      location.line = symbolLocation.line;
      location.column = symbolLocation.column;
    }
  }
  
  // Create an enhanced error message
  let message = `Error calling function '${fnName}': ${error.message}`;
  
  // Add argument information for better context
  if (args.length > 0) {
    message += `\nWith arguments: ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(', ')}`;
  }
  
  const runtimeError = new RuntimeError(message, location);
  
  // Enrich with context and return
  return await enrichErrorWithContext(runtimeError, filePath);
}

/**
 * Handle a property access error with detailed source information
 */
export async function handlePropertyAccessError(
  objName: string,
  propName: string,
  filePath: string,
  position?: { line?: number; column?: number }
): Promise<Error> {
  // Create a source location
  const location: SourceLocation = {
    filePath,
    ...position
  };
  
  // If we don't have position info, try to find the property access pattern
  if (!location.line || !location.column) {
    try {
      const content = await readTextFile(filePath);
      const lines = content.split('\n');
      const pattern = `${objName}.${propName}`;
      
      for (let i = 0; i < lines.length; i++) {
        const column = lines[i].indexOf(pattern);
        if (column >= 0) {
          location.line = i + 1;
          location.column = column + objName.length + 1; // Position at the '.' character
          break;
        }
      }
    } catch (error) {
      logger.debug(`Error finding property access location: ${error.message}`);
    }
  }
  
  // Create an enhanced error message
  const message = `Property '${propName}' not found in object '${objName}'`;
  
  const validationError = new ValidationError(
    message,
    "property access",
    "defined property",
    "undefined property",
    location
  );
  
  // Enrich with context and return
  return await enrichErrorWithContext(validationError, filePath);
}

/**
 * Handle a variable not found error with detailed source information
 */
export async function handleVariableNotFoundError(
  varName: string,
  filePath: string,
  position?: { line?: number; column?: number }
): Promise<Error> {
  // Create a source location
  const location: SourceLocation = {
    filePath,
    ...position
  };
  
  // If we don't have position info, try to find it
  if (!location.line || !location.column) {
    const symbolLocation = await findSymbolLocation(varName, filePath);
    if (symbolLocation.line && symbolLocation.column) {
      location.line = symbolLocation.line;
      location.column = symbolLocation.column;
    }
  }
  
  // Create an enhanced error message
  const message = `Variable '${varName}' is not defined`;
  
  const validationError = new ValidationError(
    message,
    "variable reference",
    "defined variable",
    "undefined variable",
    location
  );
  
  // Enrich with context and return
  return await enrichErrorWithContext(validationError, filePath);
}

/**
 * Handle a type error with detailed source information
 */
export async function handleTypeError(
  expression: string,
  expectedType: string,
  actualType: string,
  filePath: string,
  position?: { line?: number; column?: number }
): Promise<Error> {
  // Create a source location
  const location: SourceLocation = {
    filePath,
    ...position
  };
  
  // If we don't have position info, try to find the expression
  if (!location.line || !location.column) {
    try {
      const content = await readTextFile(filePath);
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const column = lines[i].indexOf(expression);
        if (column >= 0) {
          location.line = i + 1;
          location.column = column + 1;
          break;
        }
      }
    } catch (error) {
      logger.debug(`Error finding expression location: ${error.message}`);
    }
  }
  
  // Create an enhanced error message
  const message = `Type error: Expected ${expectedType} but got ${actualType} for expression '${expression}'`;
  
  const validationError = new ValidationError(
    message,
    "type checking",
    expectedType,
    actualType,
    location
  );
  
  // Enrich with context and return
  return await enrichErrorWithContext(validationError, filePath);
}