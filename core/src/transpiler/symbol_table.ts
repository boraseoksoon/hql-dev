// Universal Symbol Table for HQL Transpiler
// Supports variables, functions, macros, types, and more

// Expanded SymbolKind for all HQL constructs
export type SymbolKind =
  | 'variable'
  | 'function'
  | 'macro'
  | 'fx'
  | 'fn'
  | 'type'
  | 'enum'
  | 'enum-case'
  | 'struct'
  | 'class'
  | 'field'
  | 'method'
  | 'interface'
  | 'module'
  | 'import'
  | 'export'
  | 'namespace'
  | 'operator'
  | 'constant'
  | 'property'
  | 'special-form'
  | 'builtin'
  | 'alias';

import type { HQLNode } from "./type/hql_ast.ts";
import type { IRNode } from "./type/hql_ir.ts";

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  type?: string; // e.g., 'Set', 'Array', 'Function', 'Color', etc.
  scope: 'global' | 'local' | 'parameter' | 'module' | 'class' | 'namespace';
  parent?: string; // e.g., enclosing class, enum, module
  params?: { name: string; type?: string }[];
  returnType?: string;
  cases?: string[]; // for enums
  associatedValues?: { name: string; type: string }[]; // for enum-cases
  fields?: { name: string; type?: string }[]; // for struct/class/interface
  methods?: { name: string; params?: { name: string; type?: string }[], returnType?: string }[];
  sourceModule?: string; // for import/export
  aliasOf?: string; // for aliases
  isExported?: boolean;
  isImported?: boolean;
  node?: HQLNode | IRNode; // Reference to AST/IR node
  meta?: Record<string, unknown>; // extensible for future use
}

export class SymbolTable {
  private table: Map<string, SymbolInfo> = new Map();
  private parent: SymbolTable | null;

  constructor(parent: SymbolTable | null = null) {
    this.parent = parent;
  }

  set(symbol: SymbolInfo) {
    this.table.set(symbol.name, symbol);
  }

  get(name: string): SymbolInfo | undefined {
    if (this.table.has(name)) return this.table.get(name);
    if (this.parent) return this.parent.get(name);
    return undefined;
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  clear() {
    this.table.clear();
  }

  // For debugging
  dump(): Record<string, SymbolInfo> {
    return Object.fromEntries(this.table.entries());
  }
}

// Example usage (to be integrated in parser/transformer):
// const globalSymbols = new SymbolTable();
// globalSymbols.set({ name: 'my-set', kind: 'variable', type: 'Set', scope: 'global' });
// globalSymbols.set({ name: 'my-macro', kind: 'macro', scope: 'global' });
// const localSymbols = new SymbolTable(globalSymbols);
// localSymbols.set({ name: 'x', kind: 'parameter', type: 'Number', scope: 'parameter' });
