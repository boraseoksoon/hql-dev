// core/src/error/error-formatter.ts
// Formats errors with code frames and suggestions

import { HQLError, SourceLocation } from './error-types.ts';
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";

// Cache for file contents to avoid repeated disk reads
const fileCache = new Map<string, string[]>();

/**
 * Formats an HQL error with source code context and suggestions
 */
export function formatError(error: HQLError): string {
  // Format the error header
  let output = formatErrorHeader(error);
  
  // Get file content for the code frame
  let sourceCode = error.sourceCode;
  if (!sourceCode) {
    sourceCode = getFileLines(error.location.filePath);
  }

  if (sourceCode && sourceCode.length > 0) {
    // Add blank line for readability
    output += '\n\n';
    
    // Add the code frame
    output += formatCodeFrame(sourceCode, error.location);
    
    // Add suggestion if available
    if (error.suggestion) {
      output += '\n\nSuggestion: ' + error.suggestion;
    }
  }
  
  return output;
}

/**
 * Formats the error header with type, message, and location
 */
function formatErrorHeader(error: HQLError): string {
  return `${error.errorType}: ${error.message} in ${error.location.filePath}:${error.location.line}:${error.location.column}`;
}

/**
 * Formats the code frame showing the error location with context
 */
/**
 * Formats the code frame showing the error location with context
 */
function formatCodeFrame(sourceLines: string[], location: SourceLocation): string {
    const contextLines = 2; // Number of lines to show before and after error line
    
    // Ensure line number is valid
    if (location.line < 1 || location.line > sourceLines.length) {
      // If line number is invalid, try to find context in the file
      let closestLine = 1;
      if (location.line > sourceLines.length) {
        closestLine = sourceLines.length;
      }
      
      // Adjust location to a valid line
      location = {
        ...location,
        line: closestLine
      };
    }
    
    // Adjust to 0-based for array indexing
    const lineIndex = location.line - 1;
    
    // Calculate line range to display
    const startLine = Math.max(0, lineIndex - contextLines);
    const endLine = Math.min(sourceLines.length - 1, lineIndex + contextLines);
    
    // Calculate padding for line numbers
    const lineNumWidth = String(endLine + 1).length;
    
    // Build the code frame
    let codeFrame = '';
    
    for (let i = startLine; i <= endLine; i++) {
      const lineNum = i + 1; // Convert to 1-based line numbers
      const isErrorLine = lineNum === location.line;
      const lineContent = sourceLines[i] || '';
      
      // Format line prefix (line number + indicator)
      const linePrefix = isErrorLine 
        ? `-> ${lineNum.toString().padStart(lineNumWidth)} | `
        : `   ${lineNum.toString().padStart(lineNumWidth)} | `;
      
      // Add the line content
      codeFrame += linePrefix + lineContent + '\n';
      
      // Add caret indicator for the error line
      if (isErrorLine) {
        // Ensure column number is sensible
        const actualColumn = Math.min(location.column, lineContent.length + 1);
        
        const padLength = linePrefix.length + actualColumn - 1;
        codeFrame += ' '.repeat(padLength) + '^' + '\n';
      }
    }
    
    return codeFrame.trimEnd();
  }

/**
 * Gets the lines of a file, using cache when possible
 */
function getFileLines(filePath: string): string[] | undefined {
  // Check cache first
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath);
  }
  
  try {
    // Read the file and split into lines
    const content = Deno.readTextFileSync(filePath);
    const lines = content.split(/\r?\n/);
    
    // Cache the content
    fileCache.set(filePath, lines);
    
    return lines;
  } catch (error) {
    // Failed to read the file
    console.warn(`Failed to read file for error context: ${filePath}`);
    return undefined;
  }
}

/**
 * Clears the file cache
 */
export function clearFileCache(): void {
  fileCache.clear();
}

/**
 * Creates a JSON representation of the error for editor integration
 */
export function formatErrorAsJson(error: HQLError): string {
  const json = {
    type: error.errorType,
    message: error.message,
    file: error.location.filePath,
    line: error.location.line,
    column: error.location.column,
    suggestion: error.suggestion,
    name: error.name
  };
  
  return JSON.stringify(json);
}