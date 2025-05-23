// core/src/transpiler/pipeline/syntax-transformer.ts
// Modified version with enhanced error reporting and source location support

import {
  createLiteral,
  createList,
  createSymbol,
  isList,
  isSymbol,
  SExp,
  SList,
  SSymbol,
} from "../../s-exp/types.ts";
import { Logger, globalLogger as logger } from "../../logger.ts";
import { TransformError, perform } from "../../common/error.ts";
import { withSourceLocationOpts } from "../utils/source_location_utils.ts";
import { ListNode, SymbolNode } from "../type/hql_ast.ts";
import { globalSymbolTable } from "../symbol_table.ts";

/**
 * Options for syntax transformation
 */
interface TransformOptions {
  verbose?: boolean;
}

/**
 * Main entry point - transforms all syntax sugar into canonical S-expressions
 */
export function transformSyntax(ast: SExp[]): SExp[] {
  // Clear the symbol table at the start if possible
  if (typeof globalSymbolTable.clear === "function") {
    globalSymbolTable.clear();
  }

  // === Phase 1: Register enums and cases ===
  const enumDefinitions = new Map<string, SList>();
  for (const node of ast) {
    if (isList(node)) {
      const list = node as SList;
      if (list.elements.length > 0 && isSymbol(list.elements[0]) && (list.elements[0] as SSymbol).name === "enum" && list.elements.length > 1 && isSymbol(list.elements[1])) {
        const enumName = (list.elements[1] as SSymbol).name.split(":")[0];
        enumDefinitions.set(enumName, list);
        const cases: string[] = [];
        const associatedValues: { name: string; type: string }[] = [];
        for (let i = 2; i < list.elements.length; i++) {
          const el = list.elements[i];
          if (isList(el) && el.elements.length > 1 && isSymbol(el.elements[0]) && (el.elements[0] as SSymbol).name === "case") {
            const caseName = (el.elements[1] as SSymbol)?.name;
            if (caseName) cases.push(caseName);
            if (el.elements.length > 2 && isList(el.elements[2])) {
              for (const field of (el.elements[2] as SList).elements) {
                if (isSymbol(field)) {
                  const fieldStr = (field as SSymbol).name;
                  if (fieldStr.includes(":")) {
                    const [fname, ftype] = fieldStr.split(":");
                    associatedValues.push({ name: fname, type: ftype });
                  }
                }
              }
            }
            globalSymbolTable.set({ name: `${enumName}.${caseName}`, kind: "enum-case", parent: enumName, scope: "global", associatedValues, definition: el });
          }
        }
        globalSymbolTable.set({ name: enumName, kind: "enum", cases, associatedValues, scope: "global", definition: list });
      }
    }
  }
  logger.debug("=== Symbol Table after ENUM phase ===\n" + JSON.stringify(globalSymbolTable.dump(), null, 2));

  // === Phase 2: Register classes, structs, interfaces ===
  for (const node of ast) {
    if (isList(node)) {
      const list = node as SList;
      if (list.elements.length > 0 && isSymbol(list.elements[0])) {
        const head = (list.elements[0] as SSymbol).name;
        if (["struct", "class", "interface"].includes(head) && list.elements.length > 1 && isSymbol(list.elements[1])) {
          const typeName = (list.elements[1] as SSymbol).name;
          const fields: { name: string; type?: string }[] = [];
          const methods: { name: string; params?: { name: string; type?: string }[], returnType?: string }[] = [];
          for (let i = 2; i < list.elements.length; i++) {
            const el = list.elements[i];
            if (isList(el) && el.elements.length > 0 && isSymbol(el.elements[0])) {
              const subHead = (el.elements[0] as SSymbol).name;
              if (subHead === "field" && el.elements.length > 1 && isSymbol(el.elements[1])) {
                const fieldName = (el.elements[1] as SSymbol).name;
                let fieldType = undefined;
                if (el.elements.length > 2 && isSymbol(el.elements[2])) {
                  fieldType = (el.elements[2] as SSymbol).name;
                }
                fields.push({ name: fieldName, type: fieldType });
                globalSymbolTable.set({ name: `${typeName}.${fieldName}`, kind: "field", parent: typeName, scope: head as any, type: fieldType, definition: el });
              } else if (["fn", "fx", "method"].includes(subHead) && el.elements.length > 1 && isSymbol(el.elements[1])) {
                const mName = (el.elements[1] as SSymbol).name;
                let params: { name: string; type?: string }[] = [];
                let returnType: string | undefined = undefined;
                if (el.elements.length > 2 && isList(el.elements[2])) {
                  params = (el.elements[2] as SList).elements.map(p => {
                    if (isSymbol(p)) {
                      const pname = (p as SSymbol).name;
                      if (pname.includes(":")) {
                        const [paramName, paramType] = pname.split(":");
                        return { name: paramName, type: paramType };
                      }
                      return { name: pname };
                    }
                    return { name: "?" };
                  });
                }
                if (el.elements.length > 3 && isList(el.elements[3])) {
                  const retList = el.elements[3] as SList;
                  if (retList.elements.length > 1 && isSymbol(retList.elements[0]) && (retList.elements[0] as SSymbol).name === "->") {
                    if (isSymbol(retList.elements[1])) {
                      returnType = (retList.elements[1] as SSymbol).name;
                    }
                  }
                }
                methods.push({ name: mName, params, returnType });
                globalSymbolTable.set({ name: `${typeName}.${mName}`, kind: "method", parent: typeName, scope: head as any, params, returnType, definition: el });
              }
            }
          }
          globalSymbolTable.set({ name: typeName, kind: head as any, fields, methods, scope: "global", definition: list });
        }
      }
    }
  }
  logger.debug("=== Symbol Table after CLASS/STRUCT/INTERFACE phase ===\n" + JSON.stringify(globalSymbolTable.dump(), null, 2));

  // === Phase 3: Register functions, macros, fx ===
  for (const node of ast) {
    if (isList(node)) {
      const list = node as SList;
      if (list.elements.length > 0 && isSymbol(list.elements[0])) {
        const head = (list.elements[0] as SSymbol).name;
        if (["fn", "fx", "macro"].includes(head) && list.elements.length > 1 && isSymbol(list.elements[1])) {
          const name = (list.elements[1] as SSymbol).name;
          const kind = head === "fn" ? "function" : (head === "fx" ? "fx" : "macro");
          let params: { name: string; type?: string }[] | undefined = undefined;
          let returnType: string | undefined = undefined;
          if (list.elements.length > 2 && isList(list.elements[2])) {
            params = (list.elements[2] as SList).elements.map(p => {
              if (isSymbol(p)) {
                const pname = (p as SSymbol).name;
                if (pname.includes(":")) {
                  const [paramName, paramType] = pname.split(":");
                  return { name: paramName, type: paramType };
                }
                return { name: pname };
              }
              return { name: "?" };
            });
          }
          if (list.elements.length > 3 && isList(list.elements[3])) {
            const retList = list.elements[3] as SList;
            if (retList.elements.length > 1 && isSymbol(retList.elements[0]) && (retList.elements[0] as SSymbol).name === "->") {
              if (isSymbol(retList.elements[1])) {
                returnType = (retList.elements[1] as SSymbol).name;
              }
            }
          }
          globalSymbolTable.set({ name, kind, scope: "global", params, returnType, definition: list });
        }
      }
    }
  }
  logger.debug("=== Symbol Table after FUNCTION/MACRO/FX phase ===\n" + JSON.stringify(globalSymbolTable.dump(), null, 2));

  // === Phase 4: Register let bindings and data types ===
  for (const node of ast) {
    if (isList(node)) {
      const list = node as SList;
      if (list.elements.length > 0 && isSymbol(list.elements[0])) {
        const head = (list.elements[0] as SSymbol).name;
        
        // Process let binding (either global binding form or with a binding list)
        if (head === "let") {
          try {
            // Global binding form: (let name value)
            if (list.elements.length === 3 && isSymbol(list.elements[1])) {
              const varName = (list.elements[1] as SSymbol).name;
              const valueNode = list.elements[2];
              
              // Register variable and detect its type
              const dataType = inferDataType(valueNode);
              globalSymbolTable.set({ 
                name: varName, 
                kind: "variable", 
                type: dataType,
                scope: "local", 
                definition: valueNode 
              });
              
              logger.debug(`Registered let binding: ${varName} with type ${dataType}`);
            }
            // Binding list form: (let (name1 value1 name2 value2...) body...)
            else if (list.elements.length > 1 && isList(list.elements[1])) {
              const bindings = list.elements[1] as SList;
              
              // Validate bindings list has even number of elements
              if (bindings.elements.length % 2 !== 0) {
                const errorLoc = getLocationFromNode(bindings);
                throw new TransformError(
                  "Let bindings require an even number of forms (pairs of name and value)",
                  "let bindings validation",
                  withSourceLocationOpts(errorLoc, list)
                );
              }
              
              // Process each binding pair
              for (let i = 0; i < bindings.elements.length; i += 2) {
                if (i + 1 < bindings.elements.length && isSymbol(bindings.elements[i])) {
                  const varName = (bindings.elements[i] as SSymbol).name;
                  const valueNode = bindings.elements[i + 1];
                  
                  // Register variable and detect its type
                  const dataType = inferDataType(valueNode);

                  globalSymbolTable.set({ 
                    name: varName, 
                    kind: "variable", 
                    type: dataType,
                    scope: "local", 
                    definition: valueNode 
                  });
                  
                  logger.debug(`Registered let binding: ${varName} with type ${dataType}`);
                } else if (i + 1 < bindings.elements.length) {
                  // Error: Binding name is not a symbol
                  const errorLoc = getLocationFromNode(bindings.elements[i]);
                  throw new TransformError(
                    "Let binding name must be a symbol",
                    "let binding name validation",
                    withSourceLocationOpts(errorLoc, bindings.elements[i])
                  );
                }
              }
            } else if (list.elements.length > 1) {
              // Invalid form
              const errorLoc = getLocationFromNode(list);
              throw new TransformError(
                "Invalid let form: must be either (let name value) or (let (bindings...) body...)",
                "let form validation",
                withSourceLocationOpts(errorLoc, list)
              );
            }
          } catch (error) {
            if (!(error instanceof TransformError)) {
              const errorLoc = getLocationFromNode(list);
              throw new TransformError(
                `Invalid let form: ${error instanceof Error ? error.message : String(error)}`,
                "let form validation",
                withSourceLocationOpts(errorLoc, list)
              );
            }
            throw error;
          }
        }
      }
    }
  }
  logger.debug("=== Symbol Table after LET phase ===\n" + JSON.stringify(globalSymbolTable.dump(), null, 2));

  // === Phase 5: Register module/import/export/namespace/alias/operator/constant/property/special-form/builtin ===
  for (const node of ast) {
    if (isList(node)) {
      const list = node as SList;
      if (list.elements.length > 0 && isSymbol(list.elements[0])) {
        const head = (list.elements[0] as SSymbol).name;
        if (["module", "import", "export", "namespace", "alias"].includes(head)) {
          const name = (list.elements[1] && isSymbol(list.elements[1])) ? (list.elements[1] as SSymbol).name : undefined;
          if (name) {
            globalSymbolTable.set({ name, kind: head as any, scope: "global", definition: list });
          }
        }
        if (["operator", "constant", "property", "special-form", "builtin"].includes(head)) {
          const name = (list.elements[1] && isSymbol(list.elements[1])) ? (list.elements[1] as SSymbol).name : undefined;
          if (name) {
            globalSymbolTable.set({ name, kind: head as any, scope: "global", definition: list });
          }
        }
      }
    }
  }
  logger.debug("=== Symbol Table after MODULE/IMPORT/EXPORT/ETC. phase ===\n" + JSON.stringify(globalSymbolTable.dump(), null, 2));

  // === Phase 6: Transform nodes with all the collected metadata ===
  const transformed: SExp[] = [];
  for (const node of ast) {
    try {
      transformed.push(transformNode(node, enumDefinitions, logger));
    } catch (error) {
      // Enhance error with better source location information
      if (error instanceof TransformError) {
        // Error already has good info, just re-throw
        throw error;
      } else {
        // Convert regular error to TransformError with source location
        const errorLoc = getLocationFromNode(node);
        throw new TransformError(
          `Transformation error: ${error instanceof Error ? error.message : String(error)}`,
          "node transformation",
          withSourceLocationOpts(errorLoc, node)
        );
      }
    }
  }
  logger.debug("=== FINAL Symbol Table ===\n" + JSON.stringify(globalSymbolTable.dump(), null, 2));
  return transformed;
}

/**
 * Extract source location information from a node
 */
function getLocationFromNode(node: any): {filePath?: string, line?: number, column?: number} {
  // Try to extract from node's metadata
  if (node && node._meta) {
    return {
      filePath: node._meta.filePath,
      line: node._meta.line,
      column: node._meta.column
    };
  }
  return {};
}

/**
 * Helper function to infer data types for variables during binding
 */
function inferDataType(node: SExp): string {
  if (!node) return "Unknown";
  
  // If it's a list, examine its structure
  if (isList(node)) {
    const list = node as SList;
    
    // Empty list
    if (list.elements.length === 0) {
      return "Array";
    }
    
    // Check the first element for operation type
    if (isSymbol(list.elements[0])) {
      const op = (list.elements[0] as SSymbol).name;
      
      // Check common data structure constructors
      if (op === "vector" || op === "empty-array") {
        return "Array";
      }
      if (op === "hash-set" || op === "empty-set") {
        return "Set";
      }
      if (op === "hash-map" || op === "empty-map") {
        return "Map";
      }
      
      // Check for new expressions
      if (op === "new" && list.elements.length > 1 && isSymbol(list.elements[1])) {
        const className = (list.elements[1] as SSymbol).name;
        if (className === "Set") return "Set";
        if (className === "Map") return "Map";
        if (className.includes("Array")) return "Array";
      }
      
      // Function literals
      if (op === "fn" || op === "fx" || op === "lambda") {
        return "Function";
      }
    }
  }
  
  return "Unknown";
}

/**
 * Transform a single node, dispatching to specific handlers based on type
 */
export function transformNode(
  node: SExp | null,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SExp {
  if (!node) {
    return createLiteral(null);
  }

  return perform(
    () => {
      // Handle dot notation for enums (.caseName) in symbol form
      if (isSymbol(node) && (node as SSymbol).name.startsWith(".")) {
        return transformDotNotationSymbol(node as SSymbol, enumDefinitions, logger);
      }

      if (!isList(node)) {
        // Only lists can contain syntactic sugar that needs transformation (except for dot symbols handled above)
        return node;
      }

      const list = node as SList;
      if (list.elements.length === 0) {
        // Empty lists don't need transformation
        return list;
      }

      // Handle collection access: (collection index) with collection type from symbol table
      if (list.elements.length >= 2 && isSymbol(list.elements[0])) {
        const collectionName = (list.elements[0] as SSymbol).name;
        const collectionInfo = globalSymbolTable.get(collectionName);
        
        if (collectionInfo && collectionInfo.type) {
          logger.debug(`Found symbol ${collectionName} with type ${collectionInfo.type}`);
          
          // Handle different collection types
          if (collectionInfo.type === "Set") {
            // For sets, convert to Array.from(set)[index]
            return createList(
              createSymbol("js-get"),
              createList(
                createSymbol("js-call"),
                createSymbol("Array"),
                createLiteral("from"),
                list.elements[0]
              ),
              ...list.elements.slice(1)
            );
          }
          else if (collectionInfo.type === "Map") {
            // For maps, use the get method
            return createList(
              createSymbol("js-call"),
              list.elements[0],
              createLiteral("get"),
              ...list.elements.slice(1)
            );
          }
          // For arrays and other types, use standard indexing
          // (which is handled by the default conversion)
        }
      }

      // Handle enum declarations with explicit colon syntax: (enum Name : Type ...)
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

      // Handle equality comparisons with enums - this is high priority to catch all cases
      if (list.elements.length >= 3 && 
          isSymbol(list.elements[0]) && 
          ((list.elements[0] as SSymbol).name === "=" || (list.elements[0] as SSymbol).name === "eq?")) {
        return transformEqualityExpression(list, enumDefinitions, logger);
      }

      // Handle function calls with named arguments
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
        // Handle special forms that might contain enum comparisons
        case "if":
        case "cond":
        case "when":
        case "unless":
          return transformSpecialForm(list, enumDefinitions, logger);
        // Enhanced let handling with better error reporting
        case "let":
          return transformLetExpr(list, enumDefinitions, logger);
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
    withSourceLocationOpts({ phase: "syntax transformation" }, node),
  );
}

/**
 * Transform a let expression with enhanced error checking
 */
function transformLetExpr(
  list: SList,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SExp {
  try {
    // Two valid forms:
    // 1. (let name value)
    // 2. (let (pair1 pair2...) body...)
    
    // Check for global binding form
    if (list.elements.length === 3 && isSymbol(list.elements[1])) {
      // (let name value) form
      return {
        ...list,
        elements: [
          list.elements[0],
          list.elements[1],
          transformNode(list.elements[2], enumDefinitions, logger)
        ]
      };
    }
    
    // Check for local binding form with binding vector
    if (list.elements.length >= 2 && isList(list.elements[1])) {
      const bindingList = list.elements[1] as SList;
      
      // Validate that binding list has even number of elements
      if (bindingList.elements.length % 2 !== 0) {
        const errorLoc = getLocationFromNode(bindingList);
        throw new TransformError(
          "Let binding list must contain an even number of forms (pairs of name and value)",
          "let binding list validation",
          withSourceLocationOpts(errorLoc, bindingList)
        );
      }
      
      // Transform the binding values and body expressions
      const transformedBindings = transformBindingList(bindingList, enumDefinitions, logger);
      const transformedBody = list.elements.slice(2).map(expr => 
        transformNode(expr, enumDefinitions, logger)
      );
      
      return {
        ...list,
        elements: [
          list.elements[0],   // 'let' symbol
          transformedBindings, // transformed binding list
          ...transformedBody   // transformed body expressions
        ]
      };
    }
    
    // Invalid let form
    const errorLoc = getLocationFromNode(list);
    throw new TransformError(
      "Invalid let form. Expected either (let name value) or (let (bindings...) body...)",
      "let form validation",
      withSourceLocationOpts(errorLoc, list)
    );
  } catch (error) {
    if (error instanceof TransformError) {
      throw error;
    }
    
    // Convert regular error to TransformError with location info
    const errorLoc = getLocationFromNode(list);
    throw new TransformError(
      `Invalid let form: ${error instanceof Error ? error.message : String(error)}`,
      "let form validation",
      withSourceLocationOpts(errorLoc, list)
    );
  }
}

/**
 * Transform a binding list in a let expression
 */
function transformBindingList(
  bindingList: SList,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SList {
  const transformedBindings: SExp[] = [];
  
  for (let i = 0; i < bindingList.elements.length; i += 2) {
    // Keep the binding name unchanged
    transformedBindings.push(bindingList.elements[i]);
    
    // Transform the binding value
    const value = bindingList.elements[i + 1];
    transformedBindings.push(transformNode(value, enumDefinitions, logger));
  }
  
  return {
    ...bindingList,
    elements: transformedBindings
  };
}

/**
 * Transform a dot notation symbol (.caseName) to a fully-qualified enum reference
 */
function transformDotNotationSymbol(
  symbol: SSymbol,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SExp {
  const caseName = symbol.name.substring(1); // Remove the dot
  
  // Find an enum that has this case name
  for (const [enumName, enumDef] of enumDefinitions.entries()) {
    if (hasCaseNamed(enumDef, caseName)) {
      logger.debug(`Transformed dot notation .${caseName} to ${enumName}.${caseName}`);
      return createSymbol(`${enumName}.${caseName}`);
    }
  }
  
  // If we can't resolve the enum, keep it as is
  logger.debug(`Could not resolve enum for dot notation: ${symbol.name}`);
  return symbol;
}


function transformEqualityExpression(
  list: SList,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SExp {
  // Only process equality expressions with at least 3 elements (=, left, right)
  if (list.elements.length < 3) {
    return {
      ...list,
      elements: list.elements.map(elem => transformNode(elem, enumDefinitions, logger))
    };
  }

  const leftExpr = list.elements[1];
  const rightExpr = list.elements[2];
  
  // Looking for patterns like: (= os .macOS) or (= .macOS os)
  let dotExpr = null;
  let otherExpr = null;
  
  // Check if either side is a dot expression
  if (isSymbol(leftExpr) && (leftExpr as SSymbol).name.startsWith(".")) {
    dotExpr = leftExpr as SSymbol;
    otherExpr = rightExpr;
  } else if (isSymbol(rightExpr) && (rightExpr as SSymbol).name.startsWith(".")) {
    dotExpr = rightExpr as SSymbol;
    otherExpr = leftExpr;
  }
  
  // If we found a dot expression, transform it
  if (dotExpr) {
    const caseName = dotExpr.name.substring(1); // Remove the dot

    // Find an enum that has this case
    for (const [enumName, enumDef] of enumDefinitions.entries()) {
      if (hasCaseNamed(enumDef, caseName)) {
        // Replace the dot expression with the full enum reference
        const fullEnumRef = createSymbol(`${enumName}.${caseName}`);
        logger.debug(`Transformed ${dotExpr.name} to ${enumName}.${caseName} in equality expression`);
        
        // Create the transformed list with the full enum reference
        if (dotExpr === leftExpr) {
          return createList(
            list.elements[0], // Keep the operator (=)
            fullEnumRef,     // Replace with full enum reference
            transformNode(otherExpr, enumDefinitions, logger) // Transform the other expression
          );
        } else {
          return createList(
            list.elements[0], // Keep the operator (=)
            transformNode(otherExpr, enumDefinitions, logger), // Transform the other expression
            fullEnumRef      // Replace with full enum reference
          );
        }
      }
    }
  }
  
  // If no dot expression found or no matching enum, transform all elements normally
  return {
    ...list,
    elements: list.elements.map(elem => transformNode(elem, enumDefinitions, logger))
  };
}

/**
 * Transform special forms that might contain enum comparisons
 */
function transformSpecialForm(
  list: SList,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SExp {
  const op = (list.elements[0] as SSymbol).name;
  
  // Create a new list with the same operation name
  const transformed: SExp[] = [list.elements[0]];
  
  // Handle each form differently based on its structure
  switch (op) {
    case "=":
    case "eq?":
      // Special handling for equality expressions
      return transformEqualityExpression(list, enumDefinitions, logger);
      
    case "if":
      // Structure: (if test then else?)
      if (list.elements.length >= 3) {
        // Transform the test expression (which might be an equality check)
        transformed.push(transformNode(list.elements[1], enumDefinitions, logger));
        // Transform the 'then' expression
        transformed.push(transformNode(list.elements[2], enumDefinitions, logger));
        // Transform the 'else' expression if it exists
        if (list.elements.length > 3) {
          transformed.push(transformNode(list.elements[3], enumDefinitions, logger));
        }
      } else {
        // Just transform all elements without special handling
        list.elements.slice(1).forEach(elem => {
          transformed.push(transformNode(elem, enumDefinitions, logger));
        });
      }
      break;
      
    case "cond":
      // Structure: (cond (test1 result1) (test2 result2) ... (else resultN))
      for (let i = 1; i < list.elements.length; i++) {
        const clause = list.elements[i];
        if (isList(clause)) {
          // Transform each clause as a list
          const clauseList = clause as SList;
          const transformedClause = transformNode(clauseList, enumDefinitions, logger);
          transformed.push(transformedClause);
        } else {
          // If not a list, just transform the element
          transformed.push(transformNode(clause, enumDefinitions, logger));
        }
      }
      break;
      
    case "when":
    case "unless":
      // Structure: (when/unless test body...)
      if (list.elements.length >= 2) {
        // Transform the test expression
        transformed.push(transformNode(list.elements[1], enumDefinitions, logger));
        // Transform each body expression
        for (let i = 2; i < list.elements.length; i++) {
          transformed.push(transformNode(list.elements[i], enumDefinitions, logger));
        }
      } else {
        // Just transform all elements without special handling
        list.elements.slice(1).forEach(elem => {
          transformed.push(transformNode(elem, enumDefinitions, logger));
        });
      }
      break;
      
    default:
      // For any other special form, just transform all elements
      list.elements.slice(1).forEach(elem => {
        transformed.push(transformNode(elem, enumDefinitions, logger));
      });
  }
  
  return createList(...transformed);
}

/**
 * Transform function call with named arguments
 */
function transformNamedArguments(
  list: SList,
  enumDefinitions: Map<string, SList>,
  logger: Logger
): SExp {
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
        // Continue with regular transformation (which handles dot notation)
        transformedElements.push(transformNode(nextElem, enumDefinitions, logger));
        i++; // Skip the argument value
      }
    } else {
      // Regular positional argument
      transformedElements.push(transformNode(elem, enumDefinitions, logger));
    }
  }
  
  return createList(...transformedElements);
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
        
        // Check if this is a method/property indicator (symbol starting with '.')
        if (isSymbol(element) && (element as SymbolNode).name.startsWith('.')) {
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
          currentMethod = element as SymbolNode;
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
      for (let i = 0; i < methodGroups.length; i++) {
        const { method, args } = methodGroups[i];
        const methodName = (method as SymbolNode).name;
        const methodNameWithoutDot = methodName.substring(1);
        
        // Determine how to handle this dot-chain element
        if (args.length > 0) {
          // Has arguments - definitely a method call
          result = createList(
            createSymbol("method-call"),
            result,
            createLiteral(methodNameWithoutDot),
            ...args
          );
        } else if (i < methodGroups.length - 1) {
          // No arguments but not the last in chain - treat as a JS method with runtime check
          result = createList(
            createSymbol("js-method"),
            result,
            createLiteral(methodNameWithoutDot)
          );
        } else {
          // No arguments and last in chain - could be property or no-arg method
          // Use js-method to dynamically check at runtime
          result = createList(
            createSymbol("js-method"),
            result,
            createLiteral(methodNameWithoutDot)
          );
        }
      }
      
      return result;
    },
    "transformDotChainForm",
    TransformError,
    withSourceLocationOpts({ phase: "dot-chain form transformation" }, list),
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
          withSourceLocationOpts({ phase: "valid fx form" }, list)
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
          withSourceLocationOpts({ phase: "list" }, paramsList)
        );
      }

      // Validate return type list
      if (returnTypeList.type !== "list") {
        throw new TransformError(
          "Invalid fx syntax: return type must be a list starting with ->",
          "fx return type",
          withSourceLocationOpts({ phase: "list with ->" }, returnTypeList)
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
          withSourceLocationOpts({ phase: "(-> Type)" }, returnTypeList)
        );
      }

      // Create a processed version with the original 'fx' operation
      return createList(
        createSymbol("fx"),
        name,
        transformNode(paramsList, enumDefinitions, logger),
        returnTypeList,
        ...body,
      );
    },
    "transformFxSyntax",
    TransformError,
    withSourceLocationOpts({ phase: "fx syntax transformation" }, list),
  );
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
          withSourceLocationOpts({ phase: "valid fn form" }, list),
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
          withSourceLocationOpts({ phase: "list" }, paramsList)
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
          withSourceLocationOpts({ phase: "symbol" }, name)
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
    withSourceLocationOpts({ phase: "fn syntax transformation" }, list),
  );
}

/**
 * Check if an enum has a case with the given name
 */
function hasCaseNamed(enumDef: ListNode, caseName: string): boolean {
  for (let i = 2; i < enumDef.elements.length; i++) {
    const element = enumDef.elements[i];
    if (element.type === "list") {
      const caseList = element as ListNode;
      if (caseList.elements.length >= 2 && 
          caseList.elements[0].type === "symbol" && 
          (caseList.elements[0] as SymbolNode).name === "case" &&
          caseList.elements[1].type === "symbol" && 
          (caseList.elements[1] as SymbolNode).name === caseName) {
        return true;
      }
    }
  }
  return false;
}