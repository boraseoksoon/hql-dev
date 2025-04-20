/**
 * error-source-map-registry.ts
 * 
 * A simplified but effective approach to map JavaScript errors back to HQL source positions.
 * Focuses on the immediate issue with error position mapping without complex parsing.
 */

import { globalLogger as logger } from "../logger.ts";

// Store source content by file path
const sourceContentRegistry = new Map<string, string>();

// Cache for term searches to avoid repeated scans
const termLocationCache = new Map<string, { line: number; column: number }>();

/**
 * Register a source map and the original source content
 */
export function registerSourceMapData(
  generatedPath: string,
  originalPath: string,
  sourceMapContent: string,
  originalSourceContent?: string
): void {
  try {
    // We don't need to parse the source map for our simplified approach
    // Just store the original source content which we'll use for direct term search
    if (originalSourceContent) {
      sourceContentRegistry.set(originalPath, originalSourceContent);
      logger.debug(`Registered source content for ${originalPath} (${originalSourceContent.length} bytes)`);
    }
  } catch (error) {
    logger.error(`Failed to register source map for ${generatedPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Find an exact term in source content and return its position
 * This directly addresses the "prit" vs "print" issue
 */
function findTermInSource(
  filePath: string,
  term: string
): { line: number; column: number } | null {
  // Check cache first
  const cacheKey = `${filePath}:${term}`;
  const cached = termLocationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Get source content
  const content = sourceContentRegistry.get(filePath);
  if (!content) {
    return null;
  }

  // Split content into lines and search for term
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const column = lines[i].indexOf(term);
    if (column !== -1) {
      // Found the term - calculate exact position (1-based)
      const result = { line: i + 1, column: column + 1 };
      
      // Cache the result
      termLocationCache.set(cacheKey, result);
      
      logger.debug(`Found term "${term}" at ${filePath}:${result.line}:${result.column}`);
      return result;
    }
  }

  return null;
}

/**
 * Map a generated position to original source position
 * Uses direct term search for undefined identifiers
 */
export function mapToOriginalPosition(
  filePath: string,
  line: number,
  column: number,
  errorMessage?: string
): { source: string; line: number; column: number; name?: string } | null {
  try {
    // For undefined variable errors, search for the undefined term
    if (errorMessage && errorMessage.includes("is not defined")) {
      // Extract the undefined term
      const match = errorMessage.match(/([a-zA-Z0-9_$]+) is not defined/);
      if (match && match[1]) {
        const term = match[1];
        logger.debug(`Looking for undefined term "${term}" in ${filePath}`);
        
        // Search for the term in source content
        const position = findTermInSource(filePath, term);
        if (position) {
          return {
            source: filePath,
            line: position.line,
            column: position.column,
            name: term
          };
        }
      }
    }
    
    // Default to returning the input position if we can't find a better mapping
    return {
      source: filePath,
      line,
      column,
    };
  } catch (error) {
    logger.error(`Error mapping position: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Transform an error stack to use original HQL source locations
 * This uses the direct term search for improved accuracy
 */
export async function transformErrorStack(error: Error): Promise<Error> {
  if (!error.stack) {
    return error;
  }
  
  try {
    // Parse the stack trace
    const lines = error.stack.split('\n');
    const transformedLines = [];
    
    // Keep the error message line
    transformedLines.push(lines[0]);
    
    // Look for error terms we can directly locate
    let foundUndefinedTerm = false;
    if (error.message.includes("is not defined")) {
      const match = error.message.match(/([a-zA-Z0-9_$]+) is not defined/);
      if (match && match[1]) {
        const term = match[1];
        
        // Find the file path from the stack
        let filePath = "";
        for (const line of lines) {
          const fileMatch = line.match(/\(([^:]+):\d+:\d+\)/);
          if (fileMatch && fileMatch[1].endsWith('.hql')) {
            filePath = fileMatch[1];
            break;
          }
        }
        
        if (filePath) {
          const position = findTermInSource(filePath, term);
          if (position) {
            // Create a transformed line with the correct position
            transformedLines.push(`    at Object.execute (${filePath}:${position.line}:${position.column})`);
            foundUndefinedTerm = true;
          }
        }
      }
    }
    
    // If we couldn't find by term, process the stack normally
    if (!foundUndefinedTerm) {
      // Add the remaining stack lines (starting from index 1)
      transformedLines.push(...lines.slice(1));
    }
    
    // Create a new error with the transformed stack
    const transformedError = new Error(error.message);
    transformedError.stack = transformedLines.join('\n');
    transformedError.name = error.name;
    
    // Copy any other properties
    for (const prop in error) {
      if (Object.prototype.hasOwnProperty.call(error, prop) && 
          prop !== 'stack' && prop !== 'message' && prop !== 'name') {
        (transformedError as any)[prop] = (error as any)[prop];
      }
    }
    
    return transformedError;
  } catch (err) {
    logger.error(`Failed to transform error stack: ${err instanceof Error ? err.message : String(err)}`);
    return error;
  }
}

/**
 * Clear all registered source content
 */
export function clearSourceMapRegistry(): void {
  sourceContentRegistry.clear();
  termLocationCache.clear();
  logger.debug('Source map registry cleared');
}