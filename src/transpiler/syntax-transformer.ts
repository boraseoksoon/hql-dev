// src/transpiler/syntax-transformer.ts
// Enhanced version with dot-chain syntax transformation

import {
  createLiteral,
  createList,
  createSymbol,
  isList,
  isSymbol,
  SExp,
  SList,
  SSymbol,
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
  options: TransformOptions = {},
): SExp[] {
  const logger = new Logger(options.verbose || false);
  logger.debug(`Starting syntax transformation on ${ast.length} expressions`);

  return ast.map((node) => transformNode(node, logger));
}

/**
 * Transform a single node, dispatching to specific handlers based on type
 */
export function transformNode(node: SExp, logger: Logger): SExp {
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

      // Check if this is a dot-chain method invocation form
      if (isDotChainForm(list)) {
        return transformDotChainForm(list, logger);
      }

      // Process standard list with recursion on elements
      const first = list.elements[0];
      if (!isSymbol(first)) {
        // If the first element isn't a symbol, recursively transform its children
        return {
          ...list,
          elements: list.elements.map((elem) => transformNode(elem, logger)),
        };
      }

      // Get the operation name
      const op = (first as SSymbol).name;

      // Handle specific syntactic transformations
      switch (op) {
        case "fx":
          return transformFxSyntax(list, logger);
        case "fn":
          return transformFnSyntax(list, logger);
        default:
          // Recursively transform elements for non-special forms
          return {
            ...list,
            elements: list.elements.map((elem) => transformNode(elem, logger)),
          };
      }
    },
    "transformNode",
    TransformError,
    ["syntax transformation"],
  );
}

/**
 * Check if a list appears to be in dot-chain form
 * The first element should not be a method (doesn't start with .)
 * And there should be at least one method (element starting with .) elsewhere in the list
 */
function isDotChainForm(list: SList): boolean {
  if (list.elements.length <= 1) {
    return false;
  }

  // First element shouldn't be a method
  const firstIsNotMethod = !isSymbol(list.elements[0]) || 
                          !(list.elements[0] as SSymbol).name.startsWith('.');
  
  // Check for at least one method in the rest of the list
  const hasMethodInRest = list.elements.slice(1).some(elem => 
    isSymbol(elem) && (elem as SSymbol).name.startsWith('.')
  );
  
  return firstIsNotMethod && hasMethodInRest;
}

/**
 * Transform a dot-chain form into proper nested method calls
 * Example: (obj .method1 arg1 .method2 arg2) becomes proper nested js-call expressions
 */
function transformDotChainForm(list: SList, logger: Logger): SExp {
  return perform(
    () => {
      logger.debug("Transforming dot-chain form");

      // Start with the base object
      let result = transformNode(list.elements[0], logger);
      
      // Group methods and their arguments
      const methodGroups = [];
      let currentMethod = null;
      let currentArgs = [];
      
      for (let i = 1; i < list.elements.length; i++) {
        const element = list.elements[i];
        
        // Check if this is a method indicator (symbol starting with '.')
        if (isSymbol(element) && (element as SSymbol).name.startsWith('.')) {
          // If we have a previous method, store it
          if (currentMethod !== null) {
            methodGroups.push({
              method: currentMethod,
              args: currentArgs
            });
            // Reset for next method
            currentArgs = [];
          }
          
          // Set current method
          currentMethod = element as SSymbol;
        } 
        // If not a method indicator, it's an argument to the current method
        else if (currentMethod !== null) {
          // Transform the argument recursively
          const transformedArg = transformNode(element, logger);
          currentArgs.push(transformedArg);
        }
      }
      
      // Add the last method group if there is one
      if (currentMethod !== null) {
        methodGroups.push({
          method: currentMethod,
          args: currentArgs
        });
      }
      
      // Build the nested method calls from inside out
      for (const { method, args } of methodGroups) {
        const methodName = (method as SSymbol).name;
        const methodNameWithoutDot = methodName.substring(1);
        
        // Now we'll use a different approach - create a get-and-call expression
        // This will ensure proper method invocation using the get runtime function
        result = createList(
          createSymbol("method-call"),
          result,                           // Object
          createLiteral(methodNameWithoutDot),  // Method name
          ...args                           // Arguments (if any)
        );
      }
      
      return result;
    },
    "transformDotChainForm",
    TransformError,
    ["dot-chain form transformation"],
  );
}


/**
 * Transform fx function syntax
 * (fx add (x: Int = 100 y: Int = 200) (-> Int) (+ x y))
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
          list,
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
          paramsList,
        );
      }

      // Validate return type list
      if (returnTypeList.type !== "list") {
        throw new TransformError(
          "Invalid fx syntax: return type must be a list starting with ->",
          "fx return type",
          "list with ->",
          returnTypeList,
        );
      }

      if (
        returnTypeList.elements.length < 2 ||
        returnTypeList.elements[0].type !== "symbol" ||
        (returnTypeList.elements[0] as SSymbol).name !== "->"
      ) {
        throw new TransformError(
          "Invalid fx syntax: return type must be a list starting with ->",
          "fx return type",
          "(-> Type)",
          returnTypeList,
        );
      }

      // Create a processed version with the original 'fx' operation
      return createList(
        createSymbol("fx"),
        name,
        paramsList,
        returnTypeList,
        ...body,
      );
    },
    "transformFxSyntax",
    TransformError,
    ["fx syntax transformation"],
  );
}

/**
 * Transform fn function syntax
 * (fn add (x = 100 y = 200) (+ x y))
 */
function transformFnSyntax(list: SList, logger: Logger): SExp {
  return perform(
    () => {
      logger.debug("Transforming fn syntax");

      // Validate the fn syntax
      if (list.elements.length < 3) {
        throw new TransformError(
          "Invalid fn syntax: requires at least a name, parameter list, and body",
          "fn syntax transformation",
          "valid fn form",
          list,
        );
      }

      // Extract components
      const name = list.elements[1];
      const paramsList = list.elements[2] as SList;
      const body = list.elements.slice(3);

      // Validate parameter list
      if (paramsList.type !== "list") {
        throw new TransformError(
          "Invalid fn syntax: parameter list must be a list",
          "fn parameter list",
          "list",
          paramsList,
        );
      }

      // Validate the name
      if (!isSymbol(name)) {
        throw new TransformError(
          "Invalid fn syntax: function name must be a symbol",
          "fn name",
          "symbol",
          name,
        );
      }

      // Create a processed version with the original 'fn' operation
      return createList(
        createSymbol("fn"),
        name,
        paramsList,
        ...body,
      );
    },
    "transformFnSyntax",
    TransformError,
    ["fn syntax transformation"],
  );
}