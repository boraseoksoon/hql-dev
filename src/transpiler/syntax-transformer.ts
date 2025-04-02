// src/transpiler/syntax-transformer.ts
// Enhanced version with dot-chain syntax transformation and enum dot notation

import {
  createLiteral,
  createList,
  createSymbol,
  isList,
  isLiteral,
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

  // First pass: collect all enum definitions
  const enumDefinitions = new Map<string, SList>();
  
  for (const node of ast) {
    if (isList(node)) {
      const list = node as SList;
      if (list.elements.length > 0 && 
          isSymbol(list.elements[0]) && 
          (list.elements[0] as SSymbol).name === "enum" && 
          list.elements.length >= 2 && 
          isSymbol(list.elements[1])) {
        // Extract the enum name (handle both "Name" and "Name:Type" forms)
        let enumName = (list.elements[1] as SSymbol).name;
        if (enumName.includes(":")) {
          enumName = enumName.split(":")[0];
        }
        enumDefinitions.set(enumName, list);
        logger.debug(`Found enum definition: ${enumName}`);
      }
    }
  }

  // Second pass: transform nodes with knowledge of enums
  return ast.map((node) => transformNode(node, enumDefinitions, logger));
}

/**
 * Transform a single node, dispatching to specific handlers based on type
 */
export function transformNode(
  node: SExp,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SExp {
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

      if (isSymbol(list.elements[0]) && 
          (list.elements[0] as SSymbol).name === "enum" && 
          list.elements.length >= 4) {
        
        // Check for pattern: (enum Name : Type ...)
        if (isSymbol(list.elements[1]) && 
            isSymbol(list.elements[2]) && 
            (list.elements[2] as SSymbol).name === ":" &&
            isSymbol(list.elements[3])) {
          
          // Combine the name, colon and type into a single symbol
          const enumName = (list.elements[1] as SSymbol).name;
          const typeName = (list.elements[3] as SSymbol).name;
          const combinedName = createSymbol(`${enumName}:${typeName}`);
              
          // Create a new list with the combined name
          return {
            type: "list",
            elements: [
              list.elements[0], // enum keyword
              combinedName,     // Name:Type
              ...list.elements.slice(4).map(elem => transformNode(elem, enumDefinitions, logger))
            ]
          };
        }
      }

      // Handle function calls with named arguments that might have dot syntax
      if (list.elements.length >= 3 && 
          isSymbol(list.elements[0]) && 
          list.elements.some(elem => 
            isSymbol(elem) && 
            (elem as SSymbol).name.endsWith(":")
          )) {
        return transformNamedArguments(list, enumDefinitions, logger);
      }

      // Check if this is a dot-chain method invocation form
      if (isDotChainForm(list)) {
        return transformDotChainForm(list, enumDefinitions, logger);
      }

      // Process standard list with recursion on elements
      const first = list.elements[0];
      if (!isSymbol(first)) {
        // If the first element isn't a symbol, recursively transform its children
        return {
          ...list,
          elements: list.elements.map((elem) => transformNode(elem, enumDefinitions, logger)),
        };
      }

      // Get the operation name
      const op = (first as SSymbol).name;

      // Handle specific syntactic transformations
      switch (op) {
        case "fx":
          return transformFxSyntax(list, enumDefinitions, logger);
        case "fn":
          return transformFnSyntax(list, enumDefinitions, logger);
        default:
          // Recursively transform elements for non-special forms
          return {
            ...list,
            elements: list.elements.map((elem) => transformNode(elem, enumDefinitions, logger)),
          };
      }
    },
    "transformNode",
    TransformError,
    ["syntax transformation"],
  );
}

/**
 * Transform named arguments, checking for dot-notation shorthand for enums
 */
function transformNamedArguments(
  list: SList,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SExp {
  const funcName = (list.elements[0] as SSymbol).name;
  const transformedElements: SExp[] = [list.elements[0]]; // Keep the function name

  // Process each element
  for (let i = 1; i < list.elements.length; i++) {
    const elem = list.elements[i];
    
    // Check if this is a named argument
    if (isSymbol(elem) && (elem as SSymbol).name.endsWith(":")) {
      transformedElements.push(elem);
      
      // Check if the next element is a dot-prefixed symbol (enum shorthand)
      if (i + 1 < list.elements.length) {
        const nextElem = list.elements[i + 1];
        if (isSymbol(nextElem) && (nextElem as SSymbol).name.startsWith(".")) {
          // This is a dot-prefixed symbol like .macOS
          const caseName = (nextElem as SSymbol).name.substring(1);
          
          // Find the enum type from defined enums
          let foundEnum = false;
          for (const [enumName, enumDef] of enumDefinitions.entries()) {
            // Check if this enum has a case with the given name
            if (hasCaseNamed(enumDef, caseName)) {
              // Replace .caseName with EnumName.caseName
              transformedElements.push(createSymbol(`${enumName}.${caseName}`));
              foundEnum = true;
              logger.debug(`Transformed dot notation .${caseName} to ${enumName}.${caseName}`);
              break;
            }
          }
          
          // If we couldn't find an enum for this case name, keep the original dot notation
          if (!foundEnum) {
            transformedElements.push(nextElem);
            logger.debug(`Could not resolve enum for dot notation: ${(nextElem as SSymbol).name}`);
          }
          
          i++; // Skip the argument value we just processed
        } else {
          // Normal argument value, keep as is but transform recursively
          transformedElements.push(transformNode(nextElem, enumDefinitions, logger));
          i++; // Skip the argument value
        }
      }
    } else {
      // Regular positional argument
      transformedElements.push(transformNode(elem, enumDefinitions, logger));
    }
  }
  
  return createList(...transformedElements);
}

/**
 * Check if an enum definition has a case with the given name
 */
function hasCaseNamed(enumDef: SList, caseName: string): boolean {
  for (let i = 2; i < enumDef.elements.length; i++) {
    const element = enumDef.elements[i];
    if (isList(element) && 
        (element as SList).elements.length >= 2 && 
        isSymbol((element as SList).elements[0]) && 
        (element as SList).elements[0].name === "case" &&
        isSymbol((element as SList).elements[1]) && 
        (element as SList).elements[1].name === caseName) {
      return true;
    }
  }
  return false;
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
function transformDotChainForm(list: SList, enumDefinitions: Map<string, SList>, logger: Logger): SExp {
  return perform(
    () => {
      logger.debug("Transforming dot-chain form");

      // Start with the base object
      let result = transformNode(list.elements[0], enumDefinitions, logger);
      
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
          const transformedArg = transformNode(element, enumDefinitions, logger);
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
function transformFxSyntax(list: SList, enumDefinitions: Map<string, SList>, logger: Logger): SExp {
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
      const body = list.elements.slice(4).map(elem => transformNode(elem, enumDefinitions, logger));

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
 * Handle array type notation like [String] in function signatures
 */
function transformTypeAnnotation(node: SExp): SExp {
  // If it's already a symbol, just return it
  if (isSymbol(node)) {
    return node;
  }
  
  // If it's a list that represents an array type like [String]
  if (isList(node) && 
      (node as SList).elements.length === 1 && 
      isSymbol((node as SList).elements[0])) {
    
    // Convert [String] to Array<String> format
    const innerType = ((node as SList).elements[0] as SSymbol).name;
    return createSymbol(`Array<${innerType}>`);
  }
  
  // For other cases, just return the node as is
  return node;
}

/**
 * Transform fn function syntax
 * Supporting both untyped: (fn add (x = 100 y = 200) (+ x y))
 * And typed: (fn add (x: Int = 100 y: Int = 200) (-> Int) (+ x y))
 */
function transformFnSyntax(list: SList, enumDefinitions: Map<string, SList>, logger: Logger): SExp {
  return perform(
    () => {
      logger.debug("Transforming fn syntax");

      // Validate the fn syntax - minimum required elements
      if (list.elements.length < 3) {
        throw new TransformError(
          "Invalid fn syntax: requires at least a name, parameter list, and body",
          "fn syntax transformation",
          "valid fn form",
          list,
        );
      }

      // Extract basic components
      const name = list.elements[1];
      const paramsList = list.elements[2] as SList;
      
      // Check if this is a typed fn with a return type
      let bodyStartIndex = 3;
      let hasReturnType = false;
      let returnTypeList = null;
      
      // Check if the next element is a return type list starting with ->
      if (list.elements.length > 3 && 
          isList(list.elements[3]) && 
          (list.elements[3] as SList).elements.length > 0 &&
          isSymbol((list.elements[3] as SList).elements[0]) &&
          ((list.elements[3] as SList).elements[0] as SSymbol).name === "->") {
        
        returnTypeList = list.elements[3] as SList;
        bodyStartIndex = 4; // Body starts after the return type
        hasReturnType = true;
        
        logger.debug("Detected typed fn with return type");
      }
      
      // Extract the body expressions, transforming each one
      const body = list.elements.slice(bodyStartIndex).map(elem => 
        transformNode(elem, enumDefinitions, logger)
      );

      // Validate parameter list
      if (paramsList.type !== "list") {
        throw new TransformError(
          "Invalid fn syntax: parameter list must be a list",
          "fn parameter list",
          "list",
          paramsList.type,
        );
      }

      // Transform the parameter list elements
      const transformedParams = paramsList.elements.map(param => 
        transformNode(param, enumDefinitions, logger)
      );
      
      // Validate the name
      if (!isSymbol(name)) {
        throw new TransformError(
          "Invalid fn syntax: function name must be a symbol",
          "fn name",
          "symbol",
          name,
        );
      }

      // If there is a return type, handle it, including array type notation
      if (hasReturnType && returnTypeList) {
        // Check if there's a type specified
        if (returnTypeList.elements.length >= 2) {
          const originalType = returnTypeList.elements[1];
          let transformedType = originalType;
          
          // Handle array type notation [ElementType]
          if (isList(originalType) && 
              (originalType as SList).elements.length === 1 && 
              isSymbol((originalType as SList).elements[0])) {
            
            const elementType = ((originalType as SList).elements[0] as SSymbol).name;
            transformedType = createSymbol(`Array<${elementType}>`);
          }
          
          // Create a new return type list with the transformed type
          const newReturnTypeList = createList(
            returnTypeList.elements[0], // The -> symbol
            transformedType
          );
          
          // Create the full fn form with the transformed return type
          return createList(
            createSymbol("fn"),
            name,
            createList(...transformedParams),
            newReturnTypeList,
            ...body,
          );
        } else {
          // Return type list exists but has no type specified
          return createList(
            createSymbol("fn"),
            name,
            createList(...transformedParams),
            returnTypeList,
            ...body,
          );
        }
      } else {
        // Untyped form doesn't include a return type
        return createList(
          createSymbol("fn"),
          name,
          createList(...transformedParams),
          ...body,
        );
      }
    },
    "transformFnSyntax",
    TransformError,
    ["fn syntax transformation"],
  );
}
