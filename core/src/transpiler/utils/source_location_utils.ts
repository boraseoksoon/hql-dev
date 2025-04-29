// Utility to extract source location info from HQL AST nodes (ListNode, SymbolNode, etc.)
export interface SourceLocation {
  filePath?: string;
  line?: number;
  column?: number;
}

/**
 * Extracts source location from a node if available.
 * Compatible with ListNode, SymbolNode, LiteralNode, etc.
 */
export function extractSourceLocation(node: any): SourceLocation | undefined {
  if (!node || typeof node !== 'object') return undefined;

  // Try common patterns
  if (node.filePath && typeof node.line === 'number' && typeof node.column === 'number') {
    return {
      filePath: node.filePath,
      line: node.line,
      column: node.column,
    };
  }
  if (node.sourceLocation && typeof node.sourceLocation === 'object') {
    const loc = node.sourceLocation;
    return {
      filePath: loc.filePath,
      line: loc.line,
      column: loc.column,
    };
  }
  // Some nodes may have location info attached differently
  if (node.location && typeof node.location === 'object') {
    const loc = node.location;
    return {
      filePath: loc.filePath,
      line: loc.line,
      column: loc.column,
    };
  }
  return undefined;
}

/**
 * Helper to merge source location into TransformError opts.
 */
export function withSourceLocationOpts(
  opts: Record<string, any> | undefined,
  node: any
): Record<string, any> {
  const loc = extractSourceLocation(node);
  if (!loc) return opts || {};
  return { ...(opts || {}), ...loc };
}
