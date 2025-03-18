// src/primitives.ts

/**
 * Primitive language forms built into the kernel.
 */
export const KERNEL_PRIMITIVES = new Set([
    "quote",
    "if",
    "fn",
    "def",
    "quasiquote",
    "unquote",
    "unquote-splicing"
  ]);

  /**
   * Primitive operations.
   */
  export const PRIMITIVE_OPS = new Set([
    "+", "-", "*", "/", "%",
    "=", "!=", "<", ">", "<=", ">=", "eq?",
    "js-import", "js-export", "js-get", "js-call",
    "first", "rest", "cons", "second", "length",
    "next", "seq", "empty?",
    "conj", "concat",
    "symbol?", "list?", "map?", "nil?"
  ]);
  
  /**
   * Primitive class operations.
   */
  export const PRIMITIVE_CLASS = new Set(["new"]);
  
  /**
   * Primitive data structure operations.
   */
  export const PRIMITIVE_DATA_STRUCTURE = new Set([
    "empty-array", "empty-map", "empty-set", "vector", "hash-map", "hash-set"
  ]);
  