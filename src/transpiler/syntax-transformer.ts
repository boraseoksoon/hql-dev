// src/s-exp/syntax-transformer.ts
// Centralized syntax transformation layer for HQL

import {
  createList,
  createSymbol,
  isList,
  isSymbol,
  SExp,
  SList,
} from "../s-exp/types.ts";
import { Logger } from "../logger.ts";
import { TransformError } from "../transpiler/errors.ts";
import { perform } from "../transpiler/error-utils.ts";

/**
 * Options for syntax transformation
 */
interface TransformOptions {
  verbose?: boolean;
}

/**
 * Main entry point - transforms all syntax sugar into canonical S-expressions
 */
export function transformSyntax(
  ast: SExp[],
  options: TransformOptions = {}
): SExp[] {
  const logger = new Logger(options.verbose || false);
  logger.debug(`Starting syntax transformation on ${ast.length} expressions`);
  
  return ast.map((node) => transformNode(node, logger));
}

/**
 * Transform a single node, dispatching to specific handlers based on type
 */
function transformNode(node: SExp, logger: Logger): SExp {
  return perform(
    () => {
      if (!isList(node)) {
        // Only lists can contain syntactic sugar that needs transformation
        return node;
      }
      
      const list = node as SList;
      if (list.elements.length === 0) {
        // Empty lists don't need transformation
        return list;
      }
      
      // Check if this is a special form that needs transformation
      const first = list.elements[0];
      if (!isSymbol(first)) {
        // If the first element isn't a symbol, recursively transform its children
        return {
          ...list,
          elements: list.elements.map((elem) => transformNode(elem, logger))
        };
      }
      
      // Get the operation name
      const op = (first as SymbolNode).name;
      
      // Handle specific syntactic transformations
      switch (op) {
        case "fx":
          return transformFxSyntax(list, logger);
        // Add other transformations here as needed
        // case "some-other-syntax":
        //   return transformOtherSyntax(list, logger);
        default:
          // Recursively transform elements for non-special forms
          return {
            ...list,
            elements: list.elements.map((elem) => transformNode(elem, logger))
          };
      }
    },
    "transformNode",
    TransformError,
    ["syntax transformation"]
  );
}

/**
 * Transform fx function syntax
 * 
 * (fx add (x: Int = 100 y: Int = 200) (-> Int) (+ x y))
 * 
 * We'll keep the same fx name but reorganize parameters for easier processing
 */
function transformFxSyntax(list: SList, logger: Logger): SExp {
  return perform(
    () => {
      logger.debug("Transforming fx syntax");
      
      // Validate the fx syntax
      if (list.elements.length < 4) {
        throw new TransformError(
          "Invalid fx syntax: requires at least a name, parameter list, return type and body",
          "fx syntax transformation",
          "valid fx form",
          list
        );
      }
      
      // Extract components
      const name = list.elements[1];
      const paramsList = list.elements[2] as SList;
      const returnTypeList = list.elements[3] as SList;
      const body = list.elements.slice(4);
      
      // Validate parameter list
      if (paramsList.type !== "list") {
        throw new TransformError(
          "Invalid fx syntax: parameter list must be a list",
          "fx parameter list",
          "list",
          paramsList
        );
      }
      
      // Validate return type list
      if (returnTypeList.type !== "list") {
        throw new TransformError(
          "Invalid fx syntax: return type must be a list starting with ->",
          "fx return type",
          "list with ->",
          returnTypeList
        );
      }
      
      if (returnTypeList.elements.length < 2 || 
          returnTypeList.elements[0].type !== "symbol" ||
          (returnTypeList.elements[0] as SymbolNode).name !== "->") {
        throw new TransformError(
          "Invalid fx syntax: return type must be a list starting with ->",
          "fx return type",
          "(-> Type)",
          returnTypeList
        );
      }
      
      // Simply create a processed version with the original 'fx' operation
      // Just reusing existing components with minimal transformation
      return createList(
        createSymbol("fx"),  // Keep 'fx', don't change to 'fx-typed'
        name,
        paramsList,
        returnTypeList,
        ...body
      );
    },
    "transformFxSyntax",
    TransformError,
    ["fx syntax transformation"]
  );
}