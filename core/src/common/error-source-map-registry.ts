/**
 * error-source-map-registry.ts
 * 
 * Enhanced source map registry for mapping JavaScript errors back to HQL source positions.
 * Provides robust error position mapping with caching and context awareness.
 */

import { globalLogger as logger } from "../logger.ts";

// Store source content by file path
const sourceContentRegistry = new Map<string, string>();

// Store source maps by generated file path
const sourceMapRegistry = new Map<string, any>();

// Map of generated paths to original paths
const pathMappings = new Map<string, string>();

// Cache for term searches to avoid repeated scans
const termLocationCache = new Map<string, Map<string, { line: number; column: number }>>();

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
    // Store the path mapping
    pathMappings.set(generatedPath, originalPath);
    
    // Parse and store the source map if provided
    if (sourceMapContent) {
      try {
        const sourceMap = JSON.parse(sourceMapContent);
        sourceMapRegistry.set(generatedPath, sourceMap);
        logger.debug(`Registered source map for ${generatedPath} -> ${originalPath}`);
      } catch (parseError) {
        logger.error(`Failed to parse source map for ${generatedPath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    }

    // Store the original source content
    if (originalSourceContent) {
      sourceContentRegistry.set(originalPath, originalSourceContent);
      
      // Initialize term location cache for this file
      if (!termLocationCache.has(originalPath)) {
        termLocationCache.set(originalPath, new Map());
      }
      
      logger.debug(`Registered source content for ${originalPath} (${originalSourceContent.length} bytes)`);
    }
  } catch (error) {
    logger.error(`Failed to register source map data for ${generatedPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get the original path for a generated path
 */
export function getOriginalPath(generatedPath: string): string | undefined {
  return pathMappings.get(generatedPath);
}

/**
 * Get source content for a file path
 */
export function getSourceContent(filePath: string): string | undefined {
  return sourceContentRegistry.get(filePath);
}

/**
 * Map a position in generated code to the original source position
 */
export function mapToOriginalPosition(
  generatedPath: string,
  generatedLine: number,
  generatedColumn: number,
  errorMessage?: string
): { source: string; line: number; column: number } | null {
  try {
    // First check if we have a source map for this file
    const sourceMap = sourceMapRegistry.get(generatedPath);
    if (sourceMap && sourceMap.mappings) {
      // Use source map to find the original position
      try {
        // This would require a full source map consumer library
        // For now, we'll use our approximation-based approach
        
        // Get the original path for this generated path
        const originalPath = pathMappings.get(generatedPath);
        if (!originalPath) {
          return null;
        }
        
        // If we have an error message and it contains a useful term, try to find it
        if (errorMessage) {
          // Extract terms from the error message that would be useful to search for
          const terms = extractSearchTermsFromError(errorMessage);
          
          // Try to find each term in the source
          for (const term of terms) {
            const position = findTermInSource(originalPath, term);
            if (position) {
              return {
                source: originalPath,
                line: position.line,
                column: position.column
              };
            }
          }
        }
        
        // Fallback: use line number approximation
        // This is an oversimplification but better than nothing
        return {
          source: originalPath,
          line: generatedLine,
          column: generatedColumn
        };
      } catch (mapError) {
        logger.debug(`Error mapping position: ${mapError instanceof Error ? mapError.message : String(mapError)}`);
      }
    }
    
    // If we don't have a source map but we do have path mapping, return an approximation
    const originalPath = pathMappings.get(generatedPath);
    if (originalPath) {
      return {
        source: originalPath,
        line: generatedLine,
        column: generatedColumn
      };
    }
    
    return null;
  } catch (error) {
    logger.error(`Error in mapToOriginalPosition: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Extract search terms from an error message that are likely to be in the source code
 */
function extractSearchTermsFromError(errorMessage: string): string[] {
  const terms: string[] = [];
  
  // Handle common error patterns
  
  // "X is not defined" errors - extract the undefined variable
  const undefinedMatch = errorMessage.match(/([a-zA-Z0-9_$]+) is not defined/);
  if (undefinedMatch && undefinedMatch[1]) {
    terms.push(undefinedMatch[1]);
  }
  
  // "Cannot read property 'X' of undefined/null" errors
  const propMatch = errorMessage.match(/property '([^']+)' of (undefined|null)/);
  if (propMatch && propMatch[1]) {
    terms.push(propMatch[1]);
  }
  
  // Type errors
  const typeMatch = errorMessage.match(/type '([^']+)' is not assignable to type '([^']+)'/i);
  if (typeMatch) {
    if (typeMatch[1]) terms.push(typeMatch[1]);
    if (typeMatch[2]) terms.push(typeMatch[2]);
  }
  
  // Function call errors - extract function name
  const callMatch = errorMessage.match(/call '([^']+)'/);
  if (callMatch && callMatch[1]) {
    terms.push(callMatch[1]);
  }
  
  // Parse errors - extract any quoted strings
  const quotes = errorMessage.match(/'([^']+)'/g);
  if (quotes) {
    for (const quote of quotes) {
      // Extract the content between quotes
      const content = quote.substring(1, quote.length - 1);
      if (content.length > 2 && !terms.includes(content)) {
        terms.push(content);
      }
    }
  }
  
  return terms;
}

/**
 * Find the position of a term in the source code
 */
export function findTermInSource(
  filePath: string,
  term: string
): { line: number; column: number } | null {
  try {
    // Check cache first
    const fileCache = termLocationCache.get(filePath);
    if (fileCache && fileCache.has(term)) {
      return fileCache.get(term) || null;
    }
    
    // Get the source content
    const source = sourceContentRegistry.get(filePath);
    if (!source) {
      return null;
    }
    
    // Split into lines for better searching
    const lines = source.split('\n');
    
    // Search each line for the term
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const columnIdx = line.indexOf(term);
      
      if (columnIdx >= 0) {
        // Found the term
        const position = { line: lineIdx + 1, column: columnIdx + 1 };
        
        // Cache the result
        if (fileCache) {
          fileCache.set(term, position);
        }
        
        return position;
      }
    }
    
    // Term not found
    return null;
  } catch (error) {
    logger.error(`Error finding term in source: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Transform an error stack to use original HQL source locations
 * This uses source maps and direct term search for improved accuracy
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
    
    // Process each stack frame
    let foundHqlPosition = false;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for position information in the stack frame
      const frameMatch = line.match(/at\s+(.+?)\s+\(?(.+):(\d+):(\d+)\)?/);
      if (frameMatch) {
        const [, functionName, filePath, lineStr, columnStr] = frameMatch;
        const lineNum = parseInt(lineStr, 10);
        const columnNum = parseInt(columnStr, 10);
        
        // Check if this is a generated file that we have source mapping for
        const originalPosition = mapToOriginalPosition(
          filePath,
          lineNum,
          columnNum,
          error.message
        );
        
        if (originalPosition && originalPosition.source.endsWith('.hql')) {
          // We found a mapping to an HQL file
          transformedLines.push(
            `    at ${functionName || 'Object.execute'} (${originalPosition.source}:${originalPosition.line}:${originalPosition.column})`
          );
          foundHqlPosition = true;
        } else {
          // No mapping found, keep the original line
          transformedLines.push(line);
        }
      } else {
        // Line doesn't contain position info, keep it as is
        transformedLines.push(line);
      }
    }
    
    // If we couldn't find an HQL position but we have an error message,
    // try to locate the error directly in HQL files
    if (!foundHqlPosition && error.message) {
      const terms = extractSearchTermsFromError(error.message);
      
      // Search all registered HQL files for these terms
      for (const [filePath, _] of sourceContentRegistry.entries()) {
        if (filePath.endsWith('.hql')) {
          for (const term of terms) {
            const position = findTermInSource(filePath, term);
            if (position) {
              // Insert a new line at the beginning of the stack with the HQL position
              transformedLines.splice(
                1, 0,
                `    at Object.execute (${filePath}:${position.line}:${position.column})`
              );
              foundHqlPosition = true;
              break;
            }
          }
          if (foundHqlPosition) break;
        }
      }
    }
    
    // Create a new error with the transformed stack
    const transformedError = new Error(error.message);
    transformedError.stack = transformedLines.join('\n');
    transformedError.name = error.name;
    
    return transformedError;
  } catch (transformError) {
    logger.error(`Error transforming stack trace: ${transformError instanceof Error ? transformError.message : String(transformError)}`);
    return error;
  }
}

/**
 * Clear all registered source content
 */
export function clearSourceMapRegistry(): void {
  sourceContentRegistry.clear();
  sourceMapRegistry.clear();
  pathMappings.clear();
  termLocationCache.clear();
  logger.debug('Source map registry cleared');
}