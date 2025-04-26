// core/src/error/source-mapper.ts
// Enhanced with methods to support runtime error mapping

import { SourceLocation } from './error-types.ts';

/**
 * Represents a mapping between generated code and original source
 */
export interface SourceMapping {
  // Generated location
  generated: {
    file: string;
    line: number;
    column: number;
  };
  
  // Original source location
  original: SourceLocation;
}

/**
 * Tracks source locations throughout the compilation pipeline
 */
export class SourceMapper {
  private mappings: Map<string, SourceMapping[]> = new Map();
  private sourceFiles: Map<string, string[]> = new Map();
  
  private static instance: SourceMapper | null = null;
  
  private constructor() {}
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): SourceMapper {
    if (!SourceMapper.instance) {
      SourceMapper.instance = new SourceMapper();
    }
    return SourceMapper.instance;
  }
  
  /**
   * Register source file content
   */
  registerSourceFile(filePath: string, content: string): void {
    const lines = content.split(/\r?\n/);
    this.sourceFiles.set(filePath, lines);
  }
  
  /**
   * Get source file content by path
   */
  getSourceFileContent(filePath: string): string[] | undefined {
    return this.sourceFiles.get(filePath);
  }
  
  /**
   * Add a mapping from generated code to original source
   */
  addMapping(
    genFilePath: string,
    genLine: number,
    genColumn: number,
    srcLocation: SourceLocation
  ): void {
    // Create the mapping entry
    const mapping: SourceMapping = {
      generated: {
        file: genFilePath,
        line: genLine,
        column: genColumn
      },
      original: srcLocation
    };
    
    // Get or create the mapping array for this file
    if (!this.mappings.has(genFilePath)) {
      this.mappings.set(genFilePath, []);
    }
    
    // Add to mappings
    this.mappings.get(genFilePath)!.push(mapping);
  }
  
  /**
   * Find the original source location for a generated position
   */
  findOriginalLocation(
    genFilePath: string,
    genLine: number,
    genColumn: number
  ): SourceLocation | undefined {
    // Get mappings for this file
    const fileMappings = this.mappings.get(genFilePath);
    if (!fileMappings || fileMappings.length === 0) {
      return undefined;
    }
    
    // Find the closest mapping
    let bestMatch: SourceMapping | undefined;
    
    for (const mapping of fileMappings) {
      // Skip if line is after the current position
      if (mapping.generated.line > genLine) {
        continue;
      }
      
      // If on the same line, check column
      if (mapping.generated.line === genLine) {
        // If column is after the current position, skip
        if (mapping.generated.column > genColumn) {
          continue;
        }
        
        // Update best match if we found a closer mapping
        if (!bestMatch || 
            mapping.generated.line > bestMatch.generated.line || 
            (mapping.generated.line === bestMatch.generated.line && 
             mapping.generated.column > bestMatch.generated.column)) {
          bestMatch = mapping;
        }
      } else {
        // For earlier lines, use the closest line
        if (!bestMatch || mapping.generated.line > bestMatch.generated.line) {
          bestMatch = mapping;
        }
      }
    }
    
    // Return the original location if found
    return bestMatch?.original;
  }
  
  /**
   * Get all mappings (for runtime error handler)
   */
  getAllMappings(): SourceMapping[] {
    const allMappings: SourceMapping[] = [];
    for (const fileMappings of this.mappings.values()) {
      allMappings.push(...fileMappings);
    }
    return allMappings;
  }
  
  /**
   * Clear all mappings (typically done before a new compilation)
   */
  clearMappings(): void {
    this.mappings.clear();
  }
  
  /**
   * Generate a source map comment to be included in generated code
   */
  generateSourceMapComment(filePath: string): string {
    // Create mapping data
    const mappingData = JSON.stringify({
      version: 3,
      sources: Array.from(this.sourceFiles.keys()),
      mappings: Array.from(this.mappings.values()).flat()
    });
    
    // Create a base64 inline source map
    const base64Map = btoa(mappingData);
    
    // Return the source map comment
    return `\n//# sourceMappingURL=data:application/json;base64,${base64Map}`;
  }
  
  /**
   * Embeds a location table into a JavaScript file
   */
  embedLocationTable(jsCode: string, filePath: string): string {
    const comment = this.generateSourceMapComment(filePath);
    return jsCode + comment;
  }
}

// Singleton instance
export const sourceMapper = SourceMapper.getInstance();