// src/transpiler/ts-import-manager.ts

import * as TS from "./ts-ast-types.ts";

/**
 * TSImportManager encapsulates the collection of import declarations.
 */
export class TSImportManager {
  private imports: TS.TSImportDeclaration[] = [];

  /**
   * Adds a new import declaration.
   */
  addImport(imp: TS.TSImportDeclaration): void {
    this.imports.push(imp);
  }

  /**
   * Returns all collected import declarations.
   */
  getImports(): TS.TSImportDeclaration[] {
    return this.imports;
  }

  /**
   * Resets the collection (useful between transpilation runs).
   */
  reset(): void {
    this.imports = [];
  }
}
