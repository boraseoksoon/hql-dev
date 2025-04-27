// src/primitives.ts

/**
 * Primitive language forms built into the kernel.
 */
export const PRIMITIVE_OPS = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "eq?",

  "js-get",
  "js-call",
  "return",
]);

export const KERNEL_PRIMITIVES = new Set([
  "quote",
  "if",
  "lambda",
  "let",
  "var",
  "set!",
  "quasiquote",
  "unquote",
  "unquote-splicing",
  "loop",
  "recur",
  "do",
  "return",
  "class"
]);

/**
 * Primitive class operations.
 */
export const PRIMITIVE_CLASS = new Set(["new"]);

/**
 * Primitive data structure operations.
 */
export const PRIMITIVE_DATA_STRUCTURE = new Set([
  "empty-array",
  "empty-map",
  "empty-set",
  "vector",
  "hash-map",
  "hash-set",
]);
