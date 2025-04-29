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
 * Improved to find exact object property access patterns
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
      
      // Try different forms of property access patterns
      const patterns = [
        `${objName}.${propName}`,                  // Standard object.prop
        `(${objName}.${propName}`,                 // Method call (object.method
        `(${objName} "${propName}")`,              // Get with string (object "prop")
        `(get ${objName} "${propName}")`,          // Explicit get form
        `(${objName} .${propName}`                 // Dot notation method call
      ];
      
      // Check each pattern in each line
      let found = false;
      for (let i = 0; i < lines.length && !found; i++) {
        for (const pattern of patterns) {
          const index = lines[i].indexOf(pattern);
          if (index >= 0) {
            // For normal patterns, point to the dot or space before property
            let columnPos = index + objName.length;
            
            // Adjust based on pattern
            if (pattern.startsWith('(')) {
              // For patterns starting with '(', add 1 to account for the parenthesis
              columnPos += 1;
            }
            
            // Point to the dot or space before the property
            columnPos += 1;
            
            location.line = i + 1;
            location.column = columnPos;
            found = true;
            break;
          }
        }
      }
      
      // If not found with direct patterns, try scanning for the object name only
      if (!found) {
        for (let i = 0; i < lines.length; i++) {
          // Look for the object name with appropriate boundaries
          const regex = new RegExp(`\\b${objName}\\b`);
          const match = lines[i].match(regex);
          
          if (match) {
            location.line = i + 1;
            location.column = match.index + 1;
            break;
          }
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
 * Improved to accurately find variable references in the code
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
    try {
      const content = await readTextFile(filePath);
      const lines = content.split('\n');
      
      // Look for patterns where the variable might be used
      const patterns = [
        // Variable as function: (varName args...)
        new RegExp(`\\(\\s*${varName}\\s`),
        
        // Object property access: (varName.prop)
        new RegExp(`\\(\\s*${varName}\\.`),
        
        // Let binding or assignment: (let varName...) or (set! varName...)
        new RegExp(`\\(\\s*(let|set!)\\s+${varName}\\b`),
        
        // Simple reference: varName (surrounded by spaces, brackets, or other delimiters)
        new RegExp(`[\\s\\(\\[{]${varName}[\\s\\)\\]}]`)
      ];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Try each pattern
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            // Find the actual position of the variable in this line
            const startPos = match.index || 0;
            // Adjust for any characters before the actual variable
            const varPos = line.indexOf(varName, startPos);
            
            if (varPos >= 0) {
              location.line = i + 1;
              location.column = varPos + 1; // 1-based indexing
              break;
            }
          }
        }
        
        // If we found a location, break the outer loop too
        if (location.line && location.column) {
          break;
        }
      }
      
      // If still not found, do a less precise search
      if (!location.line || !location.column) {
        for (let i = 0; i < lines.length; i++) {
          const varPos = lines[i].indexOf(varName);
          if (varPos >= 0) {
            location.line = i + 1;
            location.column = varPos + 1;
            break;
          }
        }
      }
    } catch (error) {
      logger.debug(`Error finding variable location: ${error.message}`);
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

/**
 * Find the accurate source location for a syntax error
 * Improved to use context before and after the error
 */
export async function findSyntaxErrorLocation(
  errorMessage: string,
  filePath: string,
  approximateLine?: number
): Promise<SourceLocation> {
  const location: SourceLocation = {
    filePath
  };
  
  // First try extracting line/column from the error message
  const { line, column } = extractLineColumnFromError(errorMessage);
  if (line) {
    location.line = line;
    location.column = column;
    
    // If we have that, we're done
    return location;
  }
  
  // Otherwise, try to find syntax elements mentioned in the error
  try {
    const content = await readTextFile(filePath);
    const lines = content.split('\n');
    
    // Extract common error patterns
    const unclosedMatch = errorMessage.match(/Unclosed\s+([a-z]+)/i);
    const unexpectedMatch = errorMessage.match(/Unexpected\s+([^\s]+)/i);
    const expectedMatch = errorMessage.match(/Expected\s+([^\s]+)/i);
    
    // Unexpected token/symbol errors
    if (unexpectedMatch) {
      const unexpected = unexpectedMatch[1].replace(/['"(),.:;]/g, '');
      
      let searchStartLine = 0;
      let searchEndLine = lines.length;
      
      // If we have an approximate line, search nearby
      if (approximateLine) {
        searchStartLine = Math.max(0, approximateLine - 5);
        searchEndLine = Math.min(lines.length, approximateLine + 5);
      }
      
      // Search in the vicinity of the approximate line
      for (let i = searchStartLine; i < searchEndLine; i++) {
        const line = lines[i];
        const pos = line.indexOf(unexpected);
        
        if (pos >= 0) {
          location.line = i + 1;
          location.column = pos + 1;
          return location;
        }
      }
    }
    
    // Unclosed/missing delimiter errors (parens, brackets, quotes)
    else if (unclosedMatch) {
      const type = unclosedMatch[1].toLowerCase();
      let startChar = '(';
      let endChar = ')';
      
      switch(type) {
        case 'list':
          startChar = '(';
          endChar = ')';
          break;
        case 'vector':
          startChar = '[';
          endChar = ']';
          break;
        case 'map':
        case 'object':
          startChar = '{';
          endChar = '}';
          break;
        case 'string':
          startChar = '"';
          endChar = '"';
          break;
      }
      
      // Count nesting levels to find unbalanced delimiters
      let maxNestLine = 0;
      let maxNestCol = 0;
      let maxNest = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let nestLevel = 0;
        
        for (let j = 0; j < line.length; j++) {
          if (line[j] === startChar) {
            nestLevel++;
            if (nestLevel > maxNest) {
              maxNest = nestLevel;
              maxNestLine = i;
              maxNestCol = j;
            }
          } else if (line[j] === endChar) {
            nestLevel--;
          }
        }
      }
      
      // If we found significant nesting, use the deepest point
      if (maxNest > 0) {
        location.line = maxNestLine + 1;
        location.column = maxNestCol + 1;
        return location;
      }
    }
    
    // If still nothing, look for common syntax keywords near approximate line
    const syntaxKeywords = [
      'let', 'if', 'cond', 'fn', 'lambda', 'loop', 'recur', 'import',
      'export', 'class', 'enum', 'set!', 'quote'
    ];
    
    if (approximateLine) {
      const searchStartLine = Math.max(0, approximateLine - 3);
      const searchEndLine = Math.min(lines.length, approximateLine + 3);
      
      for (let i = searchStartLine; i < searchEndLine; i++) {
        const line = lines[i];
        
        for (const keyword of syntaxKeywords) {
          const keywordMatch = line.match(new RegExp(`\\(\\s*${keyword}\\b`));
          if (keywordMatch) {
            location.line = i + 1;
            location.column = keywordMatch.index ? keywordMatch.index + keyword.length + 2 : 1;
            return location;
          }
        }
      }
    }
    
    // Last resort: if we have an approximate line, just use it
    if (approximateLine) {
      location.line = approximateLine;
      
      // Try to find a non-whitespace character on that line
      const lineContent = lines[approximateLine - 1] || "";
      const firstNonWs = lineContent.search(/\S/);
      location.column = firstNonWs >= 0 ? firstNonWs + 1 : 1;
      
      return location;
    }
  } catch (e) {
    logger.debug(`Error finding syntax error location: ${e.message}`);
  }
  
  // If all else fails, default to first line
  location.line = 1;
  location.column = 1;
  
  return location;
}