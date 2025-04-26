// core/src/error/source-map-integration.ts
// Integrates our source mapping with TypeScript's source maps

import { SourceLocation } from './error-types.ts';
import { sourceMapper } from './source-mapper.ts';
import * as ts from "npm:typescript";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";

// Interface for a basic source map
interface SourceMap {
  version: number;
  sources: string[];
  names: string[];
  mappings: string;
  file?: string;
  sourceRoot?: string;
  sourcesContent?: string[];
}

/**
 * Create a source map that maps TypeScript to HQL source
 */
export function createSourceMap(
  tsFilePath: string,
  hqlFilePath: string,
  hqlSource: string
): SourceMap {
  // Create a simple source map
  const sourceMap: SourceMap = {
    version: 3,
    sources: [hqlFilePath],
    names: [],
    mappings: '', // Will be populated later
    sourcesContent: [hqlSource]
  };
  
  // Add file name without directory
  sourceMap.file = path.basename(tsFilePath);
  
  // Return the source map
  return sourceMap;
}

/**
 * Create a TS compiler host that tracks source locations
 */
export function createTrackingCompilerHost(
  tsSystem: ts.System,
  compilerOptions: ts.CompilerOptions
): ts.CompilerHost {
  // Create the default compiler host
  const defaultHost = ts.createCompilerHost(compilerOptions);
  
  // Enhance the getSourceFile function to track locations
  const originalGetSourceFile = defaultHost.getSourceFile;
  defaultHost.getSourceFile = function(
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void,
    shouldCreateNewSourceFile?: boolean
  ): ts.SourceFile | undefined {
    // Call the original function
    const sourceFile = originalGetSourceFile(
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    );
    
    if (sourceFile) {
      // If this is a TypeScript file generated from HQL, track the node locations
      if (fileName.endsWith('.ts') && sourceFile.text) {
        trackNodeLocationsInTypeScript(sourceFile);
      }
    }
    
    return sourceFile;
  };
  
  return defaultHost;
}

/**
 * Track node locations in a TypeScript source file
 */
function trackNodeLocationsInTypeScript(sourceFile: ts.SourceFile): void {
  // Get the source file path
  const tsFilePath = sourceFile.fileName;
  
  // Find or create the corresponding HQL file path
  const hqlFilePath = tsFilePath.replace(/\.ts$/, '.hql');
  
  // We would need to traverse the TypeScript AST and map locations
  // For this example, we'll just add some basic mappings
  ts.forEachChild(sourceFile, node => {
    trackNodeLocation(node, tsFilePath, hqlFilePath);
  });
}

/**
 * Track location for a TypeScript node
 */
function trackNodeLocation(node: ts.Node, tsFilePath: string, hqlFilePath: string): void {
  // Get the position in the TypeScript file
  const tsStart = node.getStart();
  const { line: tsLine, character: tsColumn } = 
    ts.getLineAndCharacterOfPosition(node.getSourceFile(), tsStart);
  
  // Create a mapping from TS position to HQL position
  // In a real implementation, this would use information from the HQL AST
  // For now, we'll use a simple 1:1 mapping
  const hqlLocation: SourceLocation = {
    filePath: hqlFilePath,
    line: tsLine + 1, // Convert to 1-based lines
    column: tsColumn + 1 // Convert to 1-based columns
  };
  
  // Register the mapping
  sourceMapper.addMapping(
    tsFilePath,
    tsLine + 1,
    tsColumn + 1,
    hqlLocation
  );
  
  // Process child nodes recursively
  ts.forEachChild(node, child => {
    trackNodeLocation(child, tsFilePath, hqlFilePath);
  });
}

/**
 * Process TypeScript compiler diagnostic messages and convert to HQL errors
 */
export function processTypeScriptDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  errorHandler: (error: Error) => void
): void {
  for (const diagnostic of diagnostics) {
    // Skip if no file
    if (!diagnostic.file) continue;
    
    // Get the TypeScript location
    const tsFilePath = diagnostic.file.fileName;
    
    // Convert position to line/column
    const { line: tsLine, character: tsColumn } = 
      ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start || 0);
    
    // Try to map back to HQL source
    const hqlLocation = sourceMapper.findOriginalLocation(
      tsFilePath,
      tsLine + 1, // Convert to 1-based
      tsColumn + 1 // Convert to 1-based
    );
    
    // Create error message
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    
    // Create an error with appropriate location
    const error = new Error(`TS${diagnostic.code} [ERROR]: ${message}`);
    
    // Attach source location
    (error as any)._sourceLocation = hqlLocation || {
      filePath: tsFilePath,
      line: tsLine + 1,
      column: tsColumn + 1
    };
    
    // Report the error
    errorHandler(error);
  }
}

/**
 * Process JavaScript output and rewrite the source map to point to HQL
 */
export function rewriteJavaScriptSourceMap(
  jsCode: string,
  jsFilePath: string
): string {
  const sourceMapComment = sourceMapper.generateSourceMapComment(jsFilePath);
  
  // If there's already a source map comment, replace it
  if (jsCode.includes('//# sourceMappingURL=')) {
    return jsCode.replace(/\/\/# sourceMappingURL=.*$/, sourceMapComment);
  }
  
  // Otherwise add the source map comment
  return jsCode + sourceMapComment;
}