// src/transpiler/purity.ts

import { HQLNode, ListNode, SymbolNode } from "./hql_ast.ts";
import { ValidationError } from "./errors.ts";
import { Logger } from "../logger.ts";

const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

// Registry to track pure functions
const pureFunctions = new Set<string>();

// Define safe globals that are allowed in pure functions
// These are considered safe because they provide pure operations
// that don't depend on or modify external state
const SAFE_GLOBALS = new Set<string>([
  // JavaScript globals that provide pure operations
  "String", // String operations are pure
  "Number", // Number operations are pure
  "Boolean", // Boolean operations are pure
  "Object", // Object operations like assign can be pure
  "Array", // Array operations can be pure
  "JSON", // JSON stringification is a pure operation
  "Math", // Math operations are pure
  "Date", // Creating dates without using current time can be pure
]);

// JavaScript literals that aren't actually variables
const JS_LITERALS = new Set<string>([
  "null",
  "undefined",
  "NaN",
  "Infinity",
]);

// Register built-in pure operations - include js interop operations that are ok in pure functions
const builtInPure = new Set<string>([
  // Arithmetic and comparison
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

  // JS Interop - these are allowed in pure functions as long as they operate only on local data
  "js-call",
  "js-get",
  "js-set",
  "js-get-invoke",

  // Data structures
  "list",
  "vector",
  "hash-map",
  "empty-array",
  "empty-map",
  "get",

  // Control flow
  "if",
  "cond",
  "let",
  "lambda",
  "return",
]);

// Define supported primitive types
export const PRIMITIVE_TYPES = new Set([
  "Int",
  "Double",
  "String",
  "Bool",
  "Any",
]);

export function isValidType(typeName: string): boolean {
  // Check if it's a primitive type
  if (PRIMITIVE_TYPES.has(typeName)) {
    return true;
  }
  
  // Check if it's an array type (Array<ElementType>)
  if (typeName.startsWith("Array<") && typeName.endsWith(">")) {
    const innerType = typeName.substring(6, typeName.length - 1);
    return isValidType(innerType);
  }
  
  // Check if it's a known enum type
  // We'll consider any type name not in primitive types as potentially valid
  // and let the rest of the system validate it if needed
  return true;
}


/**
 * Register a function as pure
 */
export function registerPureFunction(name: string): void {
  pureFunctions.add(name);
  logger.debug(`Registered pure function: ${name}`);
}

/**
 * Check if a function is known to be pure
 */
export function isPureFunction(name: string): boolean {
  return pureFunctions.has(name) || builtInPure.has(name);
}

/**
 * Verify purity of an fx function
 */
export function verifyFunctionPurity(
  funcName: string,
  params: SymbolNode[],
  body: HQLNode[],
): void {
  logger.debug(`Verifying purity of function: ${funcName}`);

  // Create a set of allowed symbols (parameters)
  const paramNames = new Set<string>(params.map((p) => p.name));

  // Allow the function itself (for recursion)
  paramNames.add(funcName);

  // Track local variables defined within the function
  const localVars = new Map<string, boolean>();

  // Verify each expression in the body
  body.forEach((expr) =>
    verifyExpressionPurity(expr, funcName, paramNames, localVars)
  );

  // After verification, register this function as pure
  registerPureFunction(funcName);
  logger.debug(`Function ${funcName} verified as pure`);
}

/**
 * Verify an expression obeys purity rules
 */
function verifyExpressionPurity(
  expr: HQLNode,
  funcName: string,
  paramNames: Set<string>,
  localVars: Map<string, boolean>,
): void {
  // Handle different node types
  if (expr.type === "symbol") {
    verifySymbolPurity(expr as SymbolNode, funcName, paramNames, localVars);
  } else if (expr.type === "list") {
    verifyListPurity(expr as ListNode, funcName, paramNames, localVars);
  }
  // Literal values are always pure
}


/**
 * Verify a symbol obeys purity rules
 */
function verifySymbolPurity(
  symbol: SymbolNode,
  funcName: string,
  paramNames: Set<string>,
  localVars: Map<string, boolean>,
): void {
  const name = symbol.name;

  // Skip purity check for certain symbols
  if (name.startsWith(".")) return; // Property access

  // Allow parameter names and function name itself (for recursion)
  if (paramNames.has(name)) return;

  // Allow local variables
  if (localVars.has(name)) return;

  // Allow built-in pure operations and functions
  if (builtInPure.has(name)) return;

  // Allow known pure functions
  if (pureFunctions.has(name)) return;

  // Allow safe JavaScript globals
  if (SAFE_GLOBALS.has(name)) return;

  // Allow JavaScript literals like null, undefined, etc.
  if (JS_LITERALS.has(name)) return;

  // Otherwise, symbol is forbidden in a pure function
  throw new ValidationError(
    `Pure function '${funcName}' cannot reference external variable '${name}'`,
    "pure function violation",
    "parameter or local variable",
    `external variable '${name}'`,
  );
}

/**
 * Verify a list expression obeys purity rules
 */
function verifyListPurity(
  list: ListNode,
  funcName: string,
  paramNames: Set<string>,
  localVars: Map<string, boolean>,
): void {
  const elements = list.elements;
  if (elements.length === 0) return;

  // First, check if this is a special form
  if (elements[0].type === "symbol") {
    const operator = (elements[0] as SymbolNode).name;

    // Handle let special form (introduces local variables)
    if (operator === "let") {
      handleLetForm(list, funcName, paramNames, localVars);
      return;
    }

    // Handle lambda special form
    if (operator === "lambda") {
      handleLambdaForm(list, funcName, paramNames, localVars);
      return;
    }

    // Block known impure operations
    if (isImpureOperation(operator)) {
      throw new ValidationError(
        `Pure function '${funcName}' cannot use impure operation '${operator}'`,
        "pure function violation",
        "pure operation",
        `impure operation '${operator}'`,
      );
    }

    // Check for JavaScript method calls, which may be allowed if they're on safe objects
    if (operator === "js-call" && elements.length >= 3) {
      const objectSym = elements[1];
      if (objectSym.type === "symbol") {
        const objName = (objectSym as SymbolNode).name;
        if (SAFE_GLOBALS.has(objName)) {
          // This is a call to a safe global object method, verify all arguments
          for (let i = 3; i < elements.length; i++) {
            verifyExpressionPurity(
              elements[i],
              funcName,
              paramNames,
              localVars,
            );
          }
          return;
        }
      }
    }

    // Verify the operator itself is allowed (built-in or pure function)
    verifySymbolPurity(
      elements[0] as SymbolNode,
      funcName,
      paramNames,
      localVars,
    );
  }

  // For all elements (or just non-first for special forms), verify recursively
  for (let i = 0; i < elements.length; i++) {
    verifyExpressionPurity(elements[i], funcName, paramNames, localVars);
  }
}

/**
 * Handle let special form in pure functions
 */
function handleLetForm(
  letExpr: ListNode,
  funcName: string,
  paramNames: Set<string>,
  localVars: Map<string, boolean>,
): void {
  const elements = letExpr.elements;

  // Handle simple let form: (let name value)
  if (elements.length >= 3 && elements[1].type === "symbol") {
    const varName = (elements[1] as SymbolNode).name;
    const valueExpr = elements[2];

    // Verify the initialization expression is pure
    verifyExpressionPurity(valueExpr, funcName, paramNames, localVars);

    // Add to local variables
    localVars.set(varName, true);

    // Verify the body expressions
    for (let i = 3; i < elements.length; i++) {
      verifyExpressionPurity(elements[i], funcName, paramNames, localVars);
    }
  } // Handle binding list form: (let (name1 val1 name2 val2) body...)
  else if (elements.length >= 2 && elements[1].type === "list") {
    const bindingList = elements[1] as ListNode;
    const bindings = bindingList.elements;

    // First pass: register all binding names
    for (let i = 0; i < bindings.length; i += 2) {
      if (i + 1 >= bindings.length) break;

      if (bindings[i].type === "symbol") {
        const varName = (bindings[i] as SymbolNode).name;
        localVars.set(varName, false); // Not yet initialized
      }
    }

    // Second pass: verify all binding values
    for (let i = 0; i < bindings.length; i += 2) {
      if (i + 1 >= bindings.length) break;

      if (bindings[i].type === "symbol") {
        const varName = (bindings[i] as SymbolNode).name;
        verifyExpressionPurity(
          bindings[i + 1],
          funcName,
          paramNames,
          localVars,
        );
        localVars.set(varName, true); // Mark as initialized
      }
    }

    // Final pass: verify body expressions
    for (let i = 2; i < elements.length; i++) {
      verifyExpressionPurity(elements[i], funcName, paramNames, localVars);
    }
  }
}

/**
 * Handle lambda special form in pure functions
 */
function handleLambdaForm(
  lambdaExpr: ListNode,
  funcName: string,
  outerParamNames: Set<string>,
  outerLocalVars: Map<string, boolean>,
): void {
  const elements = lambdaExpr.elements;

  // Needs at least (lambda (params) body)
  if (elements.length < 3) return;

  // Must have parameter list
  if (elements[1].type !== "list") return;

  // Collect lambda parameters
  const lambdaParams = new Set<string>();
  const paramsList = elements[1] as ListNode;

  for (const param of paramsList.elements) {
    if (param.type === "symbol") {
      const paramName = (param as SymbolNode).name;
      // Skip the rest parameter indicator
      if (paramName !== "&") {
        lambdaParams.add(paramName);
      }
    }
  }

  // Create a merged scope for lambda body verification
  const mergedParams = new Set<string>([...outerParamNames, ...lambdaParams]);

  // Copy outer local vars
  const mergedLocalVars = new Map(outerLocalVars);

  // Verify lambda body with merged scope
  for (let i = 2; i < elements.length; i++) {
    verifyExpressionPurity(
      elements[i],
      funcName,
      mergedParams,
      mergedLocalVars,
    );
  }
}

/**
 * Check if an operation is known to be impure
 */
function isImpureOperation(op: string): boolean {
  // Only specific operations are impure
  const impureOps = new Set([
    "print",
    "console.log", // I/O operations
    "var", // Mutable bindings - allowed but not a pure operation
    "fn", // Potentially impure function definitions
  ]);

  return impureOps.has(op);
}
