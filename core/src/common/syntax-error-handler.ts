// core/src/common/syntax-error-handler.ts
// A comprehensive system for handling syntax errors with accurate source locations

import { dirname, readTextFile, exists } from "../platform/platform.ts";
import { 
  ValidationError, ImportError, RuntimeError, 
  MacroError, TransformError, ParseError, HQLError,
  SourceLocationInfo
} from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { enrichErrorWithContext } from "./error-system.ts";
import { ERROR_PATTERNS, ERROR_REGEX } from "./error-constants.ts";

/**
 * Information about a source code location
 */
export interface SourceLocation {
  filePath: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * Attach source location information to an S-expression or other node
 */
export function attachSourceLocation(
  node: any, 
  filePath: string, 
  line?: number, 
  column?: number,
  endLine?: number,
  endColumn?: number
): void {
  if (!node) return;
  
  // Create metadata object if it doesn't exist
  if (!node._meta) {
    node._meta = {};
  }
  
  // Set file path (only if provided)
  if (filePath) {
    node._meta.filePath = filePath;
  }
  
  // Set line and column if provided
  if (line !== undefined) {
    node._meta.line = line;
  }
  if (column !== undefined) {
    node._meta.column = column;
  }
  if (endLine !== undefined) {
    node._meta.endLine = endLine;
  }
  if (endColumn !== undefined) {
    node._meta.endColumn = endColumn;
  }
}

/**
 * Copy source location from one node to another
 */
export function copySourceLocation(
  source: any,
  target: any
): void {
  if (!source || !source._meta || !target) return;
  
  // Create metadata object if it doesn't exist
  if (!target._meta) {
    target._meta = {};
  }
  
  // Copy all location fields
  if (source._meta.filePath) {
    target._meta.filePath = source._meta.filePath;
  }
  if (source._meta.line !== undefined) {
    target._meta.line = source._meta.line;
  }
  if (source._meta.column !== undefined) {
    target._meta.column = source._meta.column;
  }
  if (source._meta.endLine !== undefined) {
    target._meta.endLine = source._meta.endLine;
  }
  if (source._meta.endColumn !== undefined) {
    target._meta.endColumn = source._meta.endColumn;
  }
}

/**
 * Get source location information from a node
 */
export function getSourceLocation(node: any): SourceLocation {
  const location: SourceLocation = {
    filePath: ""
  };
  
  if (!node) return location;
  
  // Extract from _meta if it exists
  if (node._meta) {
    if (node._meta.filePath) {
      location.filePath = node._meta.filePath;
    }
    if (node._meta.line !== undefined) {
      location.line = node._meta.line;
    }
    if (node._meta.column !== undefined) {
      location.column = node._meta.column;
    }
    if (node._meta.endLine !== undefined) {
      location.endLine = node._meta.endLine;
    }
    if (node._meta.endColumn !== undefined) {
      location.endColumn = node._meta.endColumn;
    }
  }
  // Try to extract from position property (for AST nodes)
  else if (node.position && typeof node.position === 'object') {
    if (node.position.filePath) {
      location.filePath = node.position.filePath;
    }
    if (node.position.line !== undefined) {
      location.line = node.position.line;
    }
    if (node.position.column !== undefined) {
      location.column = node.position.column;
    }
    if (node.position.endLine !== undefined) {
      location.endLine = node.position.endLine;
    }
    if (node.position.endColumn !== undefined) {
      location.endColumn = node.position.endColumn;
    }
  }
  // For list-based expressions, try the first element
  else if (node.type === 'list' && node.elements && node.elements.length > 0) {
    return getSourceLocation(node.elements[0]);
  }
  
  return location;
}

/**
 * Convert a SourceLocation to a SourceLocationInfo
 */
export function toSourceLocationInfo(location: SourceLocation): SourceLocationInfo {
  return new SourceLocationInfo({
    filePath: location.filePath,
    line: location.line,
    column: location.column
  });
}

/**
 * Create a validation error with enhanced source location
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
 * Create an import error with enhanced source location
 */
export function createImportError(
  message: string,
  importPath: string,
  sourceLocation: SourceLocation,
  originalError?: Error
): ImportError {
  const error = new ImportError(
    message,
    importPath,
    {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    },
    originalError
  );
  
  return error;
}

/**
 * Create a runtime error with enhanced source location
 */
export function createRuntimeError(
  message: string,
  sourceLocation: SourceLocation,
  originalError?: Error
): RuntimeError {
  const error = new RuntimeError(
    message,
    {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    },
    originalError
  );
  
  return error;
}

/**
 * Create a macro error with enhanced source location
 */
export function createMacroError(
  message: string,
  macroName: string,
  sourceLocation: SourceLocation,
  originalError?: Error
): MacroError {
  const error = new MacroError(
    message,
    macroName,
    {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    },
    originalError
  );
  
  return error;
}

/**
 * Create a transform error with enhanced source location
 */
export function createTransformError(
  message: string,
  phase: string,
  sourceLocation: SourceLocation,
  originalError?: Error
): TransformError {
  const error = new TransformError(
    message,
    phase,
    {
      filePath: sourceLocation.filePath,
      line: sourceLocation.line,
      column: sourceLocation.column
    },
    originalError
  );
  
  return error;
}

/**
 * Create a parse error with enhanced source location
 */
export function createParseError(
  message: string,
  sourceLocation: SourceLocation,
  originalError?: Error
): ParseError {
  const error = new ParseError(
    message,
    {
      line: sourceLocation.line || 1,
      column: sourceLocation.column || 1,
      filePath: sourceLocation.filePath,
      originalError
    }
  );
  
  return error;
}

/**
 * Load context lines from a source file
 */
export async function loadContextLines(
  filePath: string,
  errorLine: number,
  contextSize: number = 2
): Promise<{ line: number; content: string; isError: boolean; column?: number }[] | null> {
  try {
    // Check if file exists before trying to read it
    if (!await exists(filePath)) {
      logger.debug(`Cannot load context: File does not exist: ${filePath}`);
      return null;
    }
    
    const content = await readTextFile(filePath);
    const lines = content.split(/\r?\n/);
    const result = [];
    
    // Ensure line number is within range
    if (errorLine < 1 || errorLine > lines.length) {
      logger.debug(`Cannot load context: Line number ${errorLine} out of range (1-${lines.length})`);
      return null;
    }
    
    // Add lines before error
    for (let i = Math.max(0, errorLine - contextSize - 1); i < errorLine - 1; i++) {
      result.push({
        line: i + 1,
        content: lines[i] || "",
        isError: false
      });
    }
    
    // Add error line 
    result.push({
      line: errorLine,
      content: lines[errorLine - 1] || "",
      isError: true
    });
    
    // Add lines after error
    for (let i = errorLine; i < Math.min(lines.length, errorLine + contextSize); i++) {
      result.push({
        line: i + 1,
        content: lines[i] || "",
        isError: false
      });
    }
    
    return result;
  } catch (error) {
    logger.debug(`Error loading context lines from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Add context lines to an error
 */
export async function addContextLinesToError(
  error: HQLError,
  contextSize: number = 2
): Promise<HQLError> {
  // Skip if error already has context or no source location
  if (error.contextLines?.length > 0 || !error.sourceLocation?.filePath || !error.sourceLocation.line) {
    return error;
  }
  
  try {
    const filePath = error.sourceLocation.filePath;
    const errorLine = error.sourceLocation.line;
    const errorColumn = error.sourceLocation.column;
    
    const contextLines = await loadContextLines(filePath, errorLine, contextSize);
    if (contextLines) {
      error.contextLines = contextLines;
      
      // Add column to the error line if it exists
      if (errorColumn) {
        const errorLineObj = error.contextLines.find(line => line.line === errorLine && line.isError);
        if (errorLineObj) {
          errorLineObj.column = errorColumn;
        }
      }
    }
  } catch (e) {
    logger.debug(`Failed to add context lines to error: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return error;
}

/**
 * Extract line and column information from an error message
 */
export function extractLineColumnFromError(error: string): { line?: number; column?: number } {
  // Patterns to match:
  // - line X, column Y
  // - line X:Y
  // - file:X:Y
  // - at position X:Y
  
  const patterns = [
    /(?:at\s+)?line\s+(\d+),\s*column\s+(\d+)/i,
    /(?:at\s+)?line\s+(\d+):(\d+)/i,
    /(?:at\s+position\s+)(\d+):(\d+)/i,
    /:(\d+):(\d+)(?!\d)/
  ];
  
  for (const pattern of patterns) {
    const match = error.match(pattern);
    if (match && match.length >= 3) {
      return {
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10)
      };
    }
  }
  
  // If only line number is available
  const lineOnlyMatch = error.match(/(?:at\s+)?line\s+(\d+)/i);
  if (lineOnlyMatch && lineOnlyMatch.length >= 2) {
    return {
      line: parseInt(lineOnlyMatch[1], 10)
    };
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
    if (!await exists(filePath)) {
      logger.debug(`Cannot find symbol location: File does not exist: ${filePath}`);
      return location;
    }
    
    const content = await readTextFile(filePath);
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      // Look for the symbol as a whole word
      const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`);
      const match = lines[i].match(regex);
      
      if (match) {
        location.line = i + 1;  // 1-based line numbers
        location.column = match.index ? match.index + 1 : 1;  // 1-based column numbers
        break;
      }
    }
  } catch (error) {
    logger.debug(`Error finding symbol location for ${symbolName}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return location;
}

/**
 * Handle an error from a function call with detailed source information
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
      if (!await exists(filePath)) {
        logger.debug(`Cannot find property access: File does not exist: ${filePath}`);
        return new ValidationError(
          `Property '${propName}' not found in object '${objName}'`,
          "property access",
          "defined property",
          "undefined property",
          {
            filePath,
            line: 1,
            column: 1
          }
        );
      }
      
      const content = await readTextFile(filePath);
      const lines = content.split('\n');
      
      // Try different forms of property access patterns
      const patterns = [
        new RegExp(`\\b${escapeRegExp(objName)}\\.${escapeRegExp(propName)}\\b`),
        new RegExp(`\\(\\s*${escapeRegExp(objName)}\\.${escapeRegExp(propName)}`),
        new RegExp(`\\(\\s*${escapeRegExp(objName)}\\s+"${escapeRegExp(propName)}"`),
        new RegExp(`\\(\\s*get\\s+${escapeRegExp(objName)}\\s+"${escapeRegExp(propName)}"`),
        new RegExp(`\\(\\s*${escapeRegExp(objName)}\\s+\\.${escapeRegExp(propName)}`)
      ];
      
      // Check each pattern in each line
      let found = false;
      for (let i = 0; i < lines.length && !found; i++) {
        for (const pattern of patterns) {
          const match = lines[i].match(pattern);
          if (match) {
            // Get the position within the match where the property name should be
            const matchText = match[0];
            const propPos = matchText.indexOf(propName);
            
            if (propPos >= 0) {
              location.line = i + 1;
              location.column = (match.index || 0) + propPos + 1;
              found = true;
              break;
            } else {
              // If property name not found in match (should be rare), use the dot position
              const dotPos = matchText.indexOf('.');
              if (dotPos >= 0) {
                location.line = i + 1;
                location.column = (match.index || 0) + dotPos + 1;
                found = true;
                break;
              } else {
                // Last resort: just use match position
                location.line = i + 1;
                location.column = (match.index || 0) + 1;
                found = true;
                break;
              }
            }
          }
        }
      }
      
      // If not found, look for just the object name
      if (!found) {
        const objPattern = new RegExp(`\\b${escapeRegExp(objName)}\\b`);
        
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(objPattern);
          if (match) {
            location.line = i + 1;
            location.column = (match.index || 0) + 1;
            break;
          }
        }
      }
    } catch (error) {
      logger.debug(`Error finding property access location: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Create an enhanced error message
  const message = `Property '${propName}' not found in object '${objName}'`;
  
  const validationError = new ValidationError(
    message,
    "property access",
    "defined property",
    "undefined property",
    {
      filePath: location.filePath,
      line: location.line,
      column: location.column
    }
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
    try {
      if (!await exists(filePath)) {
        logger.debug(`Cannot find variable: File does not exist: ${filePath}`);
        return new ValidationError(
          `Variable '${varName}' is not defined`,
          "variable reference",
          "defined variable",
          "undefined variable",
          { filePath }
        );
      }
      
      const content = await readTextFile(filePath);
      const lines = content.split('\n');
      
      // Look for patterns where the variable might be used
      const patterns = [
        // Variable as function: (varName args...)
        new RegExp(`\\(\\s*${escapeRegExp(varName)}\\s`),
        
        // Object property access: (varName.prop)
        new RegExp(`\\(\\s*${escapeRegExp(varName)}\\.`),
        
        // Let binding or assignment: (let varName...) or (set! varName...)
        new RegExp(`\\(\\s*(let|set!)\\s+${escapeRegExp(varName)}\\b`),
        
        // Simple reference: varName (surrounded by spaces, brackets, or other delimiters)
        new RegExp(`[\\s\\(\\[{]${escapeRegExp(varName)}[\\s\\)\\]}]`)
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
      logger.debug(`Error finding variable location: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Create an enhanced error message
  const message = `Variable '${varName}' is not defined`;
  
  const validationError = new ValidationError(
    message,
    "variable reference",
    "defined variable",
    "undefined variable",
    {
      filePath: location.filePath,
      line: location.line,
      column: location.column
    }
  );
  
  // Enrich with context and return
  return await enrichErrorWithContext(validationError, filePath);
}

/**
 * Find the accurate source location for a syntax error
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
    if (!await exists(filePath)) {
      logger.debug(`Cannot find syntax error location: File does not exist: ${filePath}`);
      return location;
    }
    
    const content = await readTextFile(filePath);
    const lines = content.split('\n');
    
    // Extract common error patterns
    const unclosedMatch = errorMessage.match(/Unclosed\s+([a-z]+)/i);
    const unexpectedMatch = errorMessage.match(/Unexpected\s+([^\s]+)/i);
    const expectedMatch = errorMessage.match(/Expected\s+([^\s]+)/i);
    const missingMatch = errorMessage.match(/Missing\s+([^\s]+)/i);
    
    // Unexpected token/symbol errors
    if (unexpectedMatch) {
      const unexpected = unexpectedMatch[1].replace(/['"(),.:;]/g, '');
      
      let searchStartLine = 0;
      let searchEndLine = lines.length;
      
      // If we have an approximate line, search nearby
      if (approximateLine !== undefined) {
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
    
    // Missing token errors
    else if (missingMatch || expectedMatch) {
      const token = (missingMatch?.[1] || expectedMatch?.[1] || "").replace(/['"(),.:;]/g, '');
      
      // Common missing tokens
      const tokens = {
        "closing": [")", "]", "}", '"'],
        "opening": ["(", "[", "{", '"'],
        "parenthesis": ["(", ")"],
        "bracket": ["[", "]"],
        "brace": ["{", "}"],
        "quote": ['"'],
        "identifier": ["identifier", "name", "symbol"],
        "expression": ["expression", "value"]
      };
      
      // Determine what kind of token is missing
      let tokenType = token.toLowerCase();
      let searchTokens: string[] = [];
      
      if (tokens[tokenType as keyof typeof tokens]) {
        searchTokens = tokens[tokenType as keyof typeof tokens];
      } else if (tokenType.includes("paren")) {
        searchTokens = tokens["parenthesis"];
      } else if (tokenType.includes("bracket")) {
        searchTokens = tokens["bracket"];
      } else if (tokenType.includes("brace")) {
        searchTokens = tokens["brace"];
      } else if (tokenType.includes("quote")) {
        searchTokens = tokens["quote"];
      }
      
      // Search for imbalanced delimiters
      if (searchTokens.length > 0 && (
          searchTokens.includes("(") || 
          searchTokens.includes("[") || 
          searchTokens.includes("{") || 
          searchTokens.includes('"'))) {
        
        // Track delimiter balancing
        const stacks: Record<string, number[][]> = {
          "(": [], ")": [],
          "[": [], "]": [],
          "{": [], "}": [],
          '"': []
        };
        
        // Scan the file for imbalanced delimiters
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let inString = false;
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            
            // Handle strings specially
            if (char === '"' && (j === 0 || line[j - 1] !== '\\')) {
              inString = !inString;
              
              if (inString) {
                stacks['"'].push([i, j]);
              } else if (stacks['"'].length > 0) {
                stacks['"'].pop();
              }
              continue;
            }
            
            // Skip chars inside strings except quotes
            if (inString && char !== '"') continue;
            
            // Track opening delimiters
            if (char === '(' || char === '[' || char === '{') {
              stacks[char].push([i, j]);
            }
            // Track closing delimiters
            else if (char === ')' || char === ']' || char === '}') {
              const matchingOpen = char === ')' ? '(' : (char === ']' ? '[' : '{');
              if (stacks[matchingOpen].length > 0) {
                stacks[matchingOpen].pop();
              } else {
                // Unmatched closing delimiter
                location.line = i + 1;
                location.column = j + 1;
                return location;
              }
            }
          }
        }
        
        // Check for unclosed delimiters
        for (const token of searchTokens) {
          if (stacks[token] && stacks[token].length > 0) {
            // Use the position of the last unclosed delimiter
            const [lineIdx, colIdx] = stacks[token][stacks[token].length - 1];
            location.line = lineIdx + 1;
            location.column = colIdx + 1;
            return location;
          }
        }
      }
      
      // If we have an approximate line, use it
      if (approximateLine !== undefined) {
        location.line = approximateLine;
        
        // Try to find syntax elements near the line
        const lineContent = lines[approximateLine - 1] || "";
        for (const token of ["(", ")", "[", "]", "{", "}", "\"", "let", "if", "fn"]) {
          const pos = lineContent.indexOf(token);
          if (pos >= 0) {
            location.column = pos + 1;
            return location;
          }
        }
        
        // If no syntax elements found, use first non-whitespace
        const firstNonWs = lineContent.search(/\S/);
        location.column = firstNonWs >= 0 ? firstNonWs + 1 : 1;
      }
    }
    
    // Unclosed delimiter errors
    else if (unclosedMatch) {
      const type = unclosedMatch[1].toLowerCase();
      let openChar = '(';
      
      switch(type) {
        case 'list':
          openChar = '(';
          break;
        case 'vector':
          openChar = '[';
          break;
        case 'map':
        case 'object':
          openChar = '{';
          break;
        case 'string':
          openChar = '"';
          break;
      }
      
      // Track nesting levels to find unbalanced delimiters
      const openPositions: [number, number][] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let inString = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          
          // Handle strings specially
          if (char === '"' && (j === 0 || line[j - 1] !== '\\')) {
            inString = !inString;
          }
          
          // Skip chars inside strings except for string errors
          if (inString && openChar !== '"') continue;
          
          if (char === openChar) {
            openPositions.push([i, j]);
          } else if (
            (openChar === '(' && char === ')') ||
            (openChar === '[' && char === ']') ||
            (openChar === '{' && char === '}') ||
            (openChar === '"' && char === '"' && (j === 0 || line[j - 1] !== '\\'))
          ) {
            if (openPositions.length > 0) {
              openPositions.pop();
            }
          }
        }
      }
      
      // If we have unclosed delimiters, use the last one's position
      if (openPositions.length > 0) {
        const [lineIdx, colIdx] = openPositions[openPositions.length - 1];
        location.line = lineIdx + 1;
        location.column = colIdx + 1;
        return location;
      }
    }
    
    // If nothing else worked and we have an approximate line, use it
    if (approximateLine !== undefined) {
      location.line = approximateLine;
      
      // Try to find a non-whitespace character on that line
      const lineContent = lines[approximateLine - 1] || "";
      const firstNonWs = lineContent.search(/\S/);
      location.column = firstNonWs >= 0 ? firstNonWs + 1 : 1;
      
      return location;
    }
  } catch (e) {
    logger.debug(`Error finding syntax error location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // If all else fails, default to first line
  location.line = 1;
  location.column = 1;
  
  return location;
}

/**
 * Create an error with appropriate context from a node
 */
export async function createErrorFromNode(
  node: any,
  message: string,
  errorType: string,
  filePath: string
): Promise<HQLError> {
  const location = getSourceLocation(node);
  
  // Use provided filePath if location doesn't have one
  if (!location.filePath) {
    location.filePath = filePath;
  }
  
  const error = new HQLError(
    message,
    {
      errorType,
      sourceLocation: {
        filePath: location.filePath,
        line: location.line,
        column: location.column
      }
    }
  );
  
  // Add context lines if possible
  if (location.line && location.filePath) {
    const contextLines = await loadContextLines(location.filePath, location.line);
    if (contextLines) {
      error.contextLines = contextLines;
      
      // Update column in error line if available
      if (location.column) {
        const errorLine = error.contextLines.find(line => line.line === location.line && line.isError);
        if (errorLine) {
          errorLine.column = location.column;
        }
      }
    }
  }
  
  return error;
}

// Helper to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}