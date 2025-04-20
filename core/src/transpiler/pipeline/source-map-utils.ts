// src/transpiler/pipeline/source-map-utils.ts
// Simplified version focused on accurate error position mapping

import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { globalLogger as logger } from "../../logger.ts";

/**
 * Add basic source mappings from IR nodes to generated TypeScript code
 */
export function addSourceMappings(
  map: any,
  ir: IR.IRProgram,
  tsAst: ts.SourceFile,
  sourcePath: string,
  generatedCode: string
): void {
  try {
    // Basic mapping from original source to generated output
    const lines = generatedCode.split('\n');
    
    // Add a mapping for each line
    for (let i = 0; i < lines.length; i++) {
      map.addMapping({
        source: sourcePath,
        original: { line: i + 1, column: 0 },
        generated: { line: i + 1, column: 0 }
      });
    }
    
    // Add additional mappings for top-level IR nodes
    if (ir.body) {
      for (const node of ir.body) {
        if (node && node.range && node.range.start) {
          const { line, column } = node.range.start;
          
          // Add mapping for this node
          map.addMapping({
            source: sourcePath,
            original: { line, column },
            generated: { line: 1, column: 0 }, // Default position
            name: getNodeName(node)
          });
        }
      }
    }
    
    logger.debug(`Added ${lines.length} basic source mappings for ${sourcePath}`);
  } catch (error) {
    logger.error(`Error adding source mappings: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get a descriptive name for the node
 */
function getNodeName(node: IR.IRNode): string | null {
  switch (node.type) {
    case IR.IRNodeType.Identifier:
      return (node as IR.IRIdentifier).name;
    case IR.IRNodeType.Function:
      return (node as IR.IRFunction).id?.name || 'anonymous';
    case IR.IRNodeType.VariableDeclaration:
      return (node as IR.IRVariableDeclaration).id?.name || 'variable';
    case IR.IRNodeType.EnumDeclaration:
      return (node as IR.IREnumDeclaration).id?.name || 'enum';
    default:
      return null;
  }
}