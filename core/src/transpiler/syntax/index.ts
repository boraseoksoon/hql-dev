// src/transpiler/syntax/index.ts
// Export all syntax handlers from a single point

// Re-export all functionality from syntax modules
export * from "./binding.ts";
export * from "./class.ts";
export * from "./conditional.ts";
export * from "./data-structure.ts";
export * from "./enum.ts";
export * from "./function.ts";
export * from "./import-export.ts";
export * from "./js-interop.ts";
export * from "./loop-recur.ts";
export * from "./primitive.ts";
export * from "./quote.ts";

// Define a consistent API for all syntax handlers
import * as IR from "../type/hql_ir.ts";
import { ListNode } from "../type/hql_ast.ts";

/**
 * Common interface for all syntax handler modules
 */
export type SyntaxHandler = {
  transform: (list: ListNode, currentDir: string, transformNode: NodeTransformer) => IR.IRNode;
};

/**
 * Type for the transform node function that gets passed to syntax handlers
 */
export type NodeTransformer = (node: any, dir: string) => IR.IRNode | null;