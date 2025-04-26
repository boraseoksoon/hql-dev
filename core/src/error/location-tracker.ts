// core/src/error/location-tracker.ts
// Tracks source locations throughout the compilation pipeline

import { SourceLocation } from './error-types.ts';

/**
 * Represents a mapping between generated code and original source
 */
export interface LocationMapping {
  // Generated location
  genFilePath: string;
  genLine: number;
  genColumn: number;
  
  // Original source location
  srcLocation: SourceLocation;
}

/**
 * Represents a location table that maps from generated code back to original source
 */
export class LocationTable {
  private mappings: LocationMapping[] = [];
  
  /**
   * Adds a new mapping to the table
   */
  addMapping(mapping: LocationMapping): void {
    this.mappings.push(mapping);
  }
  
  /**
   * Looks up the original source location for a generated position
   */
  lookup(genFilePath: string, genLine: number, genColumn: number): SourceLocation | undefined {
    // Find the closest mapping
    const mapping = this.mappings.find(m => 
      m.genFilePath === genFilePath && 
      m.genLine === genLine && 
      m.genColumn <= genColumn
    );
    
    return mapping?.srcLocation;
  }
  
  /**
   * Serializes the location table to JSON string
   */
  serialize(): string {
    return JSON.stringify(this.mappings);
  }
  
  /**
   * Deserializes a location table from JSON string
   */
  static deserialize(json: string): LocationTable {
    const table = new LocationTable();
    table.mappings = JSON.parse(json);
    return table;
  }
}

/**
 * Tracks source locations through the compilation pipeline
 */
export class LocationTracker {
  private tables: Map<string, LocationTable> = new Map();
  
  /**
   * Gets or creates a location table for a specific file
   */
  getTable(filePath: string): LocationTable {
    if (!this.tables.has(filePath)) {
      this.tables.set(filePath, new LocationTable());
    }
    return this.tables.get(filePath)!;
  }
  
  /**
   * Adds a mapping between generated and source locations
   */
  addMapping(
    genFilePath: string, 
    genLine: number, 
    genColumn: number,
    srcLocation: SourceLocation
  ): void {
    const table = this.getTable(genFilePath);
    table.addMapping({
      genFilePath,
      genLine,
      genColumn,
      srcLocation
    });
  }
  
  /**
   * Looks up the original source location for a generated position
   */
  lookup(genFilePath: string, genLine: number, genColumn: number): SourceLocation | undefined {
    const table = this.tables.get(genFilePath);
    if (!table) return undefined;
    
    return table.lookup(genFilePath, genLine, genColumn);
  }
  
  /**
   * Creates source map comment to be included in generated code
   */
  createSourceMapComment(filePath: string): string {
    const table = this.tables.get(filePath);
    if (!table) return '';
    
    // Generate a unique key for the table
    const tableKey = btoa(table.serialize()).replace(/=/g, '');
    
    // Generate the comment with embedded data
    return `\n//# hqlSourceMap=${tableKey}\n`;
  }
  
  /**
   * Embeds a location table into a JavaScript file
   */
  embedLocationTable(jsCode: string, filePath: string): string {
    const comment = this.createSourceMapComment(filePath);
    return jsCode + comment;
  }
  
  /**
   * Extracts a location table from a JavaScript file
   */
  static extractLocationTable(jsCode: string): LocationTable | undefined {
    const match = jsCode.match(/\/\/# hqlSourceMap=([^\s]+)/);
    if (!match) return undefined;
    
    try {
      // Decode the base64 data
      const tableJson = atob(match[1]);
      return LocationTable.deserialize(tableJson);
    } catch (error) {
      console.warn('Failed to extract location table from code', error);
      return undefined;
    }
  }
}

/**
 * Global singleton instance of the location tracker
 */
export const globalLocationTracker = new LocationTracker();

/**
 * Utility function to create runtime location tracking in generated code
 */
export function generateRuntimeLocationTracker(filePath: string): string {
  // Create the runtime error handler function
  return `
// Runtime error handler for HQL source mapping
function __hqlHandleError(error) {
  // Only process if it's our error or a regular Error
  if (!(error instanceof Error)) {
    throw error;
  }
  
  // Get the stack trace
  const stack = error.stack || '';
  
  // Parse the stack to find the location
  const stackLines = stack.split('\\n');
  const callerLine = stackLines[1] || '';
  
  // Try to extract file, line, column information
  const locationMatch = callerLine.match(/at\\s+(?:\\w+\\s+\\()?(.+?):(\\d+):(\\d+)/);
  if (!locationMatch) {
    throw error;
  }
  
  const [, jsFile, jsLine, jsColumn] = locationMatch;
  
  // Try to map back to HQL source
  // In a real implementation, this would use the embedded source map
  const errorInfo = {
    message: error.message,
    jsFile,
    jsLine: parseInt(jsLine, 10),
    jsColumn: parseInt(jsColumn, 10),
    type: error.name,
    originalError: error,
    sourcePath: "${filePath}"
  };
  
  // Add source info to make it a better error
  error.hqlSourceInfo = errorInfo;
  
  // Rethrow the enhanced error
  throw error;
}

// Wrap top-level code in try/catch with our handler
try {
`;
}

/**
 * Generates the closing part of the runtime location tracker
 */
export function generateRuntimeLocationTrackerEnd(): string {
  return `
} catch (e) {
  __hqlHandleError(e);
}
`;
}