// core/src/s-exp/types.ts - Modified to support source location metadata

export type SExp = SSymbol | SList | SLiteral;

export interface SExpMeta {
  filePath?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  _meta?: SExpMeta;  // Allow nested metadata
}

export interface SSymbol {
  type: "symbol";
  name: string;
  _meta?: SExpMeta;  // Optional metadata for source location
}

export interface SList {
  type: "list";
  elements: SExp[];
  _meta?: SExpMeta;  // Optional metadata for source location
}

export interface SLiteral {
  type: "literal";
  value: string | number | boolean | null;
  _meta?: SExpMeta;  // Optional metadata for source location
}

/**
 * Helper functions to create S-expressions
 */
export function createSymbol(name: string): SSymbol {
  return { type: "symbol", name };
}

export function createList(...elements: SExp[]): SList {
  return { type: "list", elements };
}

export function createLiteral(
  value: string | number | boolean | null,
): SLiteral {
  return { type: "literal", value };
}

export function createNilLiteral(): SLiteral {
  return { type: "literal", value: null };
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

/**
 * Check if an S-expression is a specific form
 */
export function isForm(exp: SExp, formName: string): boolean {
  return isList(exp) &&
    exp.elements.length > 0 &&
    isSymbol(exp.elements[0]) &&
    exp.elements[0].name === formName;
}

export function isDefMacro(exp: SExp): boolean {
  return isForm(exp, "macro");
}

export function isImport(exp: SExp): boolean {
  return isForm(exp, "import");
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
    const result = createSymbol(exp.name);
    // Copy metadata if present
    if (exp._meta) result._meta = {...exp._meta};
    return result;
  } else if (isLiteral(exp)) {
    const result = createLiteral(exp.value);
    // Copy metadata if present
    if (exp._meta) result._meta = {...exp._meta};
    return result;
  } else if (isList(exp)) {
    const result = createList(...exp.elements.map(cloneSExp));
    // Copy metadata if present
    if (exp._meta) result._meta = {...exp._meta};
    return result;
  } else {
    throw new Error(`Unknown expression type: ${JSON.stringify(exp)}`);
  }
}

/**
 * Check if an import is vector-based
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
    isLiteral(elements[3]) &&
    typeof elements[3].value === "string";
}

/**
 * Get source location from an S-expression, if available
 */
export function getSExpLocation(exp: SExp): { filePath?: string; line?: number; column?: number } {
  if (!exp._meta) return {};
  
  return {
    filePath: exp._meta.filePath,
    line: exp._meta.line,
    column: exp._meta.column
  };
}

/**
 * Set source location for an S-expression
 */
export function setSExpLocation(
  exp: SExp, 
  filePath: string, 
  line?: number, 
  column?: number, 
  endLine?: number, 
  endColumn?: number
): SExp {
  if (!exp._meta) {
    exp._meta = {};
  }
  
  exp._meta.filePath = filePath;
  if (line !== undefined) exp._meta.line = line;
  if (column !== undefined) exp._meta.column = column;
  if (endLine !== undefined) exp._meta.endLine = endLine;
  if (endColumn !== undefined) exp._meta.endColumn = endColumn;
  
  return exp;
}