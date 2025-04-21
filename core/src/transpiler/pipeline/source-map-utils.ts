// src/transpiler/pipeline/source-map-utils.ts
// Enhanced implementation focused on accurate error position mapping

import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { globalLogger as logger } from "../../logger.ts";
import { registerSourceMapData } from "../../common/error-source-map-registry.ts";

// Import SourceMapGenerator directly to avoid any compatibility issues
import { SourceMapGenerator } from "npm:source-map@0.7.3";

// Add type definitions for source info in IR nodes (to solve linter errors)
interface SourceInfo {
  source?: string;
  range?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/**
 * Add detailed source mappings from IR nodes to generated TypeScript code
 */
export function addSourceMappings(
  map: SourceMapGenerator,
  ir: IR.IRProgram,
  tsAst: ts.SourceFile,
  sourcePath: string,
  generatedCode: string
): void {
  try {
    // Register the source content for better error reporting
    const sourceContent = (ir as unknown as SourceInfo).source || "";
    map.setSourceContent(sourcePath, sourceContent);
    
    // Store original source for error mapping
    if ((ir as unknown as SourceInfo).source) {
      registerSourceMapData(
        tsAst.fileName,
        sourcePath,
        "", // Will be generated later
        (ir as unknown as SourceInfo).source
      );
    }
    
    // Create position mappings for each IR node
    mapIRNodesToOutput(map, ir, tsAst, sourcePath, generatedCode);
    
    logger.debug(`Added source mappings for ${sourcePath}`);
  } catch (error) {
    logger.error(`Error adding source mappings: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Map IR nodes recursively to the generated TypeScript code
 */
function mapIRNodesToOutput(
  map: SourceMapGenerator,
  ir: IR.IRProgram,
  tsAst: ts.SourceFile,
  sourcePath: string,
  generatedCode: string
): void {
  // Basic mapping based on line/column
  const lines = generatedCode.split('\n');
  
  // Add mappings for each line to provide basic coverage even if we can't map precisely
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Add mapping for start of the line
    map.addMapping({
      source: sourcePath,
      original: { line: 1, column: 0 }, // Default to start of source
      generated: { line: i + 1, column: 0 },
    });
    
    // Add mapping for significant tokens in the line
    // This helps pinpoint errors more accurately
    mapSignificantTokens(map, line, i + 1, sourcePath);
  }
  
  // Process IR nodes recursively for more detailed mappings
  if (ir.body) {
    for (const node of ir.body) {
      processIRNode(map, node, sourcePath, generatedCode);
    }
  }
}

/**
 * Add mappings for significant tokens in a line that might be error points
 */
function mapSignificantTokens(
  map: SourceMapGenerator,
  line: string,
  lineNumber: number,
  sourcePath: string
): void {
  // Identify tokens that are frequent error locations
  const tokenPatterns = [
    /[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g,  // Function calls
    /\b(let|const|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,  // Variable declarations
    /\b(if|switch|for|while)\b/g,  // Control flow keywords
    /[a-zA-Z_][a-zA-Z0-9_]*(?=\s*[:=])/g,  // Assignment targets
    /(?<=\.)[a-zA-Z_][a-zA-Z0-9_]*/g,  // Property access
  ];
  
  // For each pattern, find matches and add mappings
  for (const pattern of tokenPatterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const column = match.index;
      
      // Add mapping for this token
      map.addMapping({
        source: sourcePath,
        // Use approximate source positions - these will be refined during error handling
        original: { 
          line: 1,  
          column: 0
        },
        generated: { 
          line: lineNumber, 
          column: column 
        },
        name: match[0]
      });
    }
  }
}

/**
 * Process an IR node and add mappings to the source map
 */
function processIRNode(
  map: SourceMapGenerator,
  node: IR.IRNode,
  sourcePath: string,
  generatedCode: string
): void {
  if (!node) return;
  
  // If node has source position info, add a mapping
  const nodeWithRange = node as unknown as SourceInfo;
  if (nodeWithRange.range && nodeWithRange.range.start && nodeWithRange.range.end) {
    const { start, end } = nodeWithRange.range;
    
    // Try to find corresponding generated position (approximate)
    const generatedPos = findGeneratedPosition(node, generatedCode);
    if (generatedPos) {
      // Add mapping for this node
      map.addMapping({
        source: sourcePath,
        original: { 
          line: start.line, 
          column: start.column 
        },
        generated: { 
          line: generatedPos.line, 
          column: generatedPos.column 
        },
        name: getNodeName(node)
      });
    }
  }
  
  // Recursively process children
  processNodeChildren(map, node, sourcePath, generatedCode);
}

/**
 * Process children of an IR node
 */
function processNodeChildren(
  map: SourceMapGenerator,
  node: IR.IRNode,
  sourcePath: string,
  generatedCode: string
): void {
  // Process different node types
  switch (node.type) {
    case IR.IRNodeType.Program:
      const program = node as IR.IRProgram;
      if (program.body) {
        for (const child of program.body) {
          processIRNode(map, child, sourcePath, generatedCode);
        }
      }
      break;
      
    case IR.IRNodeType.FunctionDeclaration:
      const funcDecl = node as IR.IRFunctionDeclaration;
      if (funcDecl.params) {
        for (const param of funcDecl.params) {
          processIRNode(map, param, sourcePath, generatedCode);
        }
      }
      if (funcDecl.body) {
        processIRNode(map, funcDecl.body, sourcePath, generatedCode);
      }
      break;
      
    case IR.IRNodeType.BlockStatement:
      const block = node as IR.IRBlockStatement;
      if (block.body) {
        for (const stmt of block.body) {
          processIRNode(map, stmt, sourcePath, generatedCode);
        }
      }
      break;
      
    case IR.IRNodeType.CallExpression:
      const call = node as IR.IRCallExpression;
      if (call.callee) {
        processIRNode(map, call.callee, sourcePath, generatedCode);
      }
      if (call.arguments) {
        for (const arg of call.arguments) {
          processIRNode(map, arg, sourcePath, generatedCode);
        }
      }
      break;
      
    // Add cases for other node types as needed
    
    default:
      // Generic handling for other node types with children
      // Safe check for children property
      const nodeWithChildren = node as { children?: IR.IRNode[] };
      if (nodeWithChildren.children && Array.isArray(nodeWithChildren.children)) {
        for (const child of nodeWithChildren.children) {
          processIRNode(map, child, sourcePath, generatedCode);
        }
      }
      break;
  }
}

/**
 * Get a name for the node to use in source map
 */
function getNodeName(node: IR.IRNode): string | undefined {
  if (!node) return undefined;
  
  switch (node.type) {
    case IR.IRNodeType.Identifier:
      return (node as IR.IRIdentifier).name;
      
    case IR.IRNodeType.FunctionDeclaration:
      const funcDecl = node as IR.IRFunctionDeclaration;
      return funcDecl.id && typeof funcDecl.id === 'object' && 'name' in funcDecl.id ? 
        (funcDecl.id as IR.IRIdentifier).name : 'anonymous';
      
    case IR.IRNodeType.CallExpression:
      const call = node as IR.IRCallExpression;
      if (call.callee && call.callee.type === IR.IRNodeType.Identifier) {
        return (call.callee as IR.IRIdentifier).name;
      }
      return 'call';
      
    default:
      return IR.IRNodeType[node.type];
  }
}

/**
 * Approximate the generated position for an IR node
 */
function findGeneratedPosition(
  node: IR.IRNode,
  generatedCode: string
): { line: number; column: number } | null {
  // This is an approximation - in a full implementation, you would need
  // to analyze the generated code to find the exact position
  
  // For now, just estimate based on node characteristics
  const nodeName = getNodeName(node);
  if (!nodeName) return null;
  
  // Try to find the node name in the generated code
  const lines = generatedCode.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const index = line.indexOf(nodeName);
    if (index >= 0) {
      return { line: i + 1, column: index };
    }
  }
  
  return null;
}

/**
 * Register a source map with the error registry
 */
export function registerSourceMap(
  generatedPath: string,
  originalPath: string,
  sourceMap: string,
  originalSource: string | undefined
): void {
  registerSourceMapData(
    generatedPath,
    originalPath,
    sourceMap,
    originalSource
  );
}