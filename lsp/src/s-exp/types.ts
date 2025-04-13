/**
 * Re-export shared s-expression types module with LSP-specific extensions
 */
export * from '../../../shared/parser/types';

import { SourcePosition } from '../../../shared/parser/types';

/**
 * LSP-specific Extensions
 */

/**
 * A symbol with required position information for LSP features
 */
export interface LSPSymbol {
  type: "symbol";
  name: string;
  position: SourcePosition; // Required, not optional
}

/**
 * Create a symbol with required position information
 */
export function createLSPSymbol(name: string, position: SourcePosition): LSPSymbol {
  return { type: "symbol", name, position };
} 