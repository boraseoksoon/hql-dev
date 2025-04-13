/**
 * Compatibility layer for Core to work with shared S-expression types
 */
import { typeCompatCloneSExp, SExp, OriginalSExp } from "../../../shared/parser/types.ts";

/**
 * Convert any S-expression to core-compatible types
 * This ensures that specialized types (SString, SNumber, SBoolean, SNil)
 * are converted to the original SLiteral type for core compatibility
 */
export function ensureCoreCompatible<T extends SExp | SExp[]>(expr: T): T {
  if (Array.isArray(expr)) {
    return expr.map(e => typeCompatCloneSExp(e)) as T;
  }
  return typeCompatCloneSExp(expr as SExp) as T;
} 