// core/src/error/parser-integration.ts

import { SourceLocation, ParseError } from './error-types.ts';
import { errorManager } from './error-manager.ts';
import { sourceMapper } from './source-mapper.ts';

/**
 * Enhance a token with source location information
 */
export function enhanceToken(token: any, filePath: string): any {
  if (!token) return token;
  
  // Add source location to token if not already present
  if (!token._sourceLocation && token.line && token.column) {
    token._sourceLocation = {
      filePath,
      line: token.line,
      column: token.column
    };
  }
  
  return token;
}

/**
 * Enhance an AST node with source location information
 */
export function enhanceNode(
  node: any, 
  filePath: string, 
  line: number, 
  column: number, 
  length: number = 1
): any {
  if (!node) return node;
  
  // Add source location to node if not already present
  if (!node._sourceLocation) {
    node._sourceLocation = {
      filePath,
      line,
      column,
      length
    };
  }
  
  return node;
}

/**
 * Track a node's source location throughout the compilation pipeline
 */
export function trackNode(node: any, targetNode: any): any {
  if (!node || !targetNode) return targetNode;
  
  // Copy source location from source node to target node
  if (node._sourceLocation) {
    targetNode._sourceLocation = { ...node._sourceLocation };
  }
  
  return targetNode;
}

/**
 * Get the source location from a node, or create a default one
 */
export function getNodeLocation(node: any, defaultFilePath: string = "unknown"): SourceLocation {
  if (node && node._sourceLocation) {
    return node._sourceLocation;
  }
  
  return {
    filePath: defaultFilePath,
    line: 1,
    column: 1
  };
}

/**
 * Create a parse error from a token
 */
export function createParseErrorFromToken(
  token: any, 
  message: string, 
  filePath: string,
  suggestion?: string
): ParseError {
  const location: SourceLocation = token && token._sourceLocation 
    ? token._sourceLocation 
    : {
        filePath,
        line: token?.line || 1,
        column: token?.column || 1
      };
  
  return errorManager.createParseError(message, location, suggestion);
}

/**
 * Enhances the parser with source tracking and error reporting
 */
export function enhanceParser(parser: any): any {
  const originalParse = parser.parse;
  
  parser.parse = function(input: string, filePath: string = "unknown"): any {
    try {
      // Register the source file with the source mapper
      sourceMapper.registerSourceFile(filePath, input);
      
      // Call the original parse function
      const result = originalParse.call(this, input, filePath);
      
      // Process the parse result to add source locations
      return enhanceParseResult(result, filePath);
    } catch (error: unknown) {
      // Handle the error
      if (error instanceof ParseError) {
        // Already a parse error, just report it
        errorManager.reportError(error);
        throw error;
      } else {
        // Convert to a parse error with better information
        const location: SourceLocation = {
          filePath,
          line: (error as any)?.line || 1,
          column: (error as any)?.column || 1
        };
        
        const parseError = errorManager.createParseError(
          (error instanceof Error) ? error.message : String(error),
          location
        );
        
        errorManager.reportError(parseError);
        throw parseError;
      }
    }
  };
  
  return parser;
}

/**
 * Recursively enhance all nodes in a parse result with source locations
 */
function enhanceParseResult(result: any, filePath: string): any {
  if (!result) return result;
  
  // If result is an array, process each item
  if (Array.isArray(result)) {
    return result.map(item => enhanceParseResult(item, filePath));
  }
  
  // If result has a type property, it's likely an AST node
  if (result && typeof result === 'object' && 'type' in result) {
    // Add source location if available from token
    if (result.token && result.token.line && result.token.column) {
      enhanceNode(result, filePath, result.token.line, result.token.column);
    }
    
    // Process all properties recursively
    for (const key in result) {
      if (result.hasOwnProperty(key) && key !== '_sourceLocation') {
        result[key] = enhanceParseResult(result[key], filePath);
      }
    }
  }
  
  return result;
}

/**
 * Extract source location information from a node
 */
export function extractSourceLocation(node: any): SourceLocation | undefined {
  if (!node) return undefined;
  
  // Direct source location
  if (node._sourceLocation) {
    return node._sourceLocation;
  }
  
  // Token source location
  if (node.token && node.token._sourceLocation) {
    return node.token._sourceLocation;
  }
  
  // Location from line/column
  if (node.line !== undefined && node.column !== undefined) {
    return {
      filePath: node.filename || "unknown",
      line: node.line,
      column: node.column
    };
  }
  
  // Check for position object
  if (node.position && node.position.line !== undefined && node.position.column !== undefined) {
    return {
      filePath: node.filename || "unknown",
      line: node.position.line,
      column: node.position.column
    };
  }
  
  return undefined;
}