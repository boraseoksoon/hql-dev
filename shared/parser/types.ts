/**
 * Shared S-expression types
 * Used by both core and LSP
 */

/**
 * Source position in a file
 */
export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

/**
 * Core S-expression types representing the fundamental HQL building blocks
 */
export type SExp = SSymbol | SList | SLiteral | SString | SNumber | SBoolean | SNil;

export interface SSymbol {
  type: "symbol";
  name: string;
  position?: SourcePosition;
}

export interface SList {
  type: "list";
  elements: SExp[];
  position?: SourcePosition;
}

export interface SLiteral {
  type: "literal";
  value: string | number | boolean | null;
  position?: SourcePosition;
}

export interface SString {
  type: "string";
  value: string;
  position?: SourcePosition;
}

export interface SNumber {
  type: "number";
  value: number;
  position?: SourcePosition;
}

export interface SBoolean {
  type: "boolean";
  value: boolean;
  position?: SourcePosition;
}

export interface SNil {
  type: "nil";
  value: null;
  position?: SourcePosition;
}

/**
 * Helper functions to create S-expressions
 */
export function createSymbol(name: string, position?: SourcePosition): SSymbol {
  return { type: "symbol", name, position };
}

export function createList(...elements: SExp[]): SList;
export function createList(elements: SExp[], position?: SourcePosition): SList;
export function createList(...args: any[]): SList {
  if (args.length === 0) {
    return { type: "list", elements: [] };
  }
  
  if (args.length === 1 && Array.isArray(args[0])) {
    // Called with array of elements
    return { type: "list", elements: args[0] };
  } 
  
  if (args.length === 2 && Array.isArray(args[0]) && typeof args[1] === 'object') {
    // Called with array and position
    return { type: "list", elements: args[0], position: args[1] };
  }
  
  // Called with rest parameters
  return { type: "list", elements: args };
}

export function createLiteral(
  value: string | number | boolean | null,
  position?: SourcePosition
): SLiteral {
  return { type: "literal", value, position };
}

export function createStringLiteral(value: string, position?: SourcePosition): SString {
  return { type: "string", value, position };
}

export function createNumberLiteral(value: number, position?: SourcePosition): SNumber {
  return { type: "number", value, position };
}

export function createBooleanLiteral(value: boolean, position?: SourcePosition): SBoolean {
  return { type: "boolean", value, position };
}

export function createNilLiteral(position?: SourcePosition): SLiteral {
    return { type: "literal", value: null, position };
}  

/**
 * Type guards for S-expressions
 */
export function isSymbol(exp: SExp): exp is SSymbol {
  return exp.type === "symbol";
}

export function isList(exp: SExp): exp is SList {
  return exp.type === "list";
}

export function isLiteral(exp: SExp): exp is SLiteral {
  return exp.type === "literal";
}

export function isString(exp: SExp): exp is SString {
  return exp.type === "string";
}

export function isNumber(exp: SExp): exp is SNumber {
  return exp.type === "number";
}

export function isBoolean(exp: SExp): exp is SBoolean {
  return exp.type === "boolean";
}

export function isNil(exp: SExp): exp is SNil {
  return exp.type === "nil";
}

/**
 * Check if an S-expression is a specific form
 */
export function isForm(exp: SExp, formName: string): boolean {
  return isList(exp) &&
    exp.elements.length > 0 &&
    isSymbol(exp.elements[0]) &&
    exp.elements[0].name === formName;
}

/**
 * Convert S-expression to a readable string for debugging
 */
export function sexpToString(exp: SExp): string {
  if (isSymbol(exp)) {
    return exp.name;
  } else if (isLiteral(exp)) {
    if (exp.value === null) {
      return "nil";
    } else if (typeof exp.value === "string") {
      return `"${exp.value}"`;
    } else {
      return String(exp.value);
    }
  } else if (isString(exp)) {
    return `"${exp.value}"`;
  } else if (isNumber(exp)) {
    return String(exp.value);
  } else if (isBoolean(exp)) {
    return exp.value ? "true" : "false";
  } else if (isNil(exp)) {
    return "nil";
  } else if (isList(exp)) {
    return `(${exp.elements.map(sexpToString).join(" ")})`;
  } else {
    return String(exp);
  }
}

/**
 * Deep clone an S-expression
 */
export function cloneSExp(exp: SExp): SExp {
  if (isSymbol(exp)) {
    return createSymbol(exp.name, exp.position);
  } else if (isLiteral(exp)) {
    return createLiteral(exp.value, exp.position);
  } else if (isString(exp)) {
    return createStringLiteral(exp.value, exp.position);
  } else if (isNumber(exp)) {
    return createNumberLiteral(exp.value, exp.position);
  } else if (isBoolean(exp)) {
    return createBooleanLiteral(exp.value, exp.position);
  } else if (isNil(exp)) {
    return createNilLiteral(exp.position);
  } else if (isList(exp)) {
    return createList(exp.elements.map(cloneSExp), exp.position);
  } else {
    // Fallback to handle unknown types for backward compatibility
    const anyExp = exp as any;
    if (anyExp.type === "nil") {
      return createNilLiteral(anyExp.position);
    }
    if (anyExp.type === "string") {
      return createStringLiteral(anyExp.value, anyExp.position);
    }
    if (anyExp.type === "number") {
      return createNumberLiteral(anyExp.value, anyExp.position);
    }
    if (anyExp.type === "boolean") {
      return createBooleanLiteral(anyExp.value, anyExp.position);
    }
    
    throw new Error(`Unknown expression type: ${JSON.stringify(exp)}`);
  }
}

/**
 * Check if an expression is a defmacro form
 */
export function isDefMacro(exp: SExp): boolean {
  return isForm(exp, "defmacro");
}

/**
 * Check if an expression is a user macro form
 */
export function isUserMacro(exp: SExp): boolean {
  return isForm(exp, "macro");
}

/**
 * Check if an expression is an import form
 */
export function isImport(exp: SExp): boolean {
  return isForm(exp, "import");
}

/**
 * Check if an import is vector-based
 * Format: (import [a b] from "path")
 */
export function isSExpVectorImport(elements: SExp[]): boolean {
  return elements.length >= 4 &&
    elements[1].type === "list" &&
    isSymbol(elements[2]) &&
    elements[2].name === "from";
}

/**
 * Check if an import is namespace-based with "from" syntax
 * Format: (import name from "path")
 */
export function isSExpNamespaceImport(elements: SExp[]): boolean {
  return elements.length === 4 &&
    isSymbol(elements[1]) &&
    isSymbol(elements[2]) &&
    elements[2].name === "from" &&
    ((isLiteral(elements[3]) && typeof elements[3].value === "string") ||
     (isString(elements[3])));
}

// Original SExp type (for backward compatibility with core)
export type OriginalSExp = SSymbol | SList | SLiteral;

// Type compatibility helpers
export function typeCompatCloneSExp(exp: SExp): OriginalSExp {
  // Convert specialized types to original types for core compatibility
  if (isString(exp)) {
    return createLiteral(exp.value, exp.position);
  } else if (isNumber(exp)) {
    return createLiteral(exp.value, exp.position);
  } else if (isBoolean(exp)) {
    return createLiteral(exp.value, exp.position);
  } else if (isNil(exp)) {
    return createLiteral(null, exp.position);
  } else {
    return exp as OriginalSExp; // SSymbol, SList, SLiteral are already compatible
  }
} 