// src/transpiler/syntax/import-export.ts
// Module for handling import and export operations

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode, LiteralNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError, ImportError } from "../error/errors.ts";
import { sanitizeIdentifier } from "../../utils/utils.ts";
import { Logger } from "../../logger.ts";
import { perform } from "../error/error-utils.ts";
import { Environment } from "../../environment.ts";
import { isUserLevelMacro } from "../../s-exp/macro.ts";
import { processVectorElements } from "./data-structure.ts";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Check if a list is a vector import
 */
export function isVectorImport(list: ListNode): boolean {
  return (
    list.elements.length > 3 &&
    list.elements[0].type === "symbol" &&
    (list.elements[0] as SymbolNode).name === "import" &&
    list.elements[1].type === "list" &&
    list.elements[2].type === "symbol" &&
    (list.elements[2] as SymbolNode).name === "from"
  );
}

/**
 * Check if a list is a vector export
 */
export function isVectorExport(list: ListNode): boolean {
  return (
    list.elements.length > 1 &&
    list.elements[0].type === "symbol" &&
    (list.elements[0] as SymbolNode).name === "export" &&
    list.elements[1].type === "list"
  );
}

/**
 * Check if a list is a namespace import
 */
export function isNamespaceImport(list: ListNode): boolean {
  return (
    list.elements.length > 3 &&
    list.elements[0].type === "symbol" &&
    (list.elements[0] as SymbolNode).name === "import" &&
    list.elements[1].type === "symbol" &&
    list.elements[2].type === "symbol" &&
    (list.elements[2] as SymbolNode).name === "from"
  );
}

/**
 * Check if a position in a list of nodes has an 'as' alias following it
 */
export function hasAliasFollowing(elements: any[], position: number): boolean {
  return (
    position + 2 < elements.length &&
    elements[position + 1].type === "symbol" &&
    (elements[position + 1] as SymbolNode).name === "as" &&
    elements[position + 2].type === "symbol"
  );
}

/**
 * Create an import specifier for the IR
 */
export function createImportSpecifier(
  imported: string,
  local: string,
): IR.IRImportSpecifier {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ImportSpecifier,
        imported: {
          type: IR.IRNodeType.Identifier,
          name: imported,
        } as IR.IRIdentifier,
        local: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(local),
        } as IR.IRIdentifier,
      };
    },
    `createImportSpecifier '${imported} as ${local}'`,
    TransformError,
    [imported, local],
  );
}

/**
 * Check if a symbol is a macro in a module
 */
export function isSymbolMacroInModule(
  symbolName: string,
  modulePath: string,
  currentDir: string,
): boolean {
  return perform(
    () => {
      const env = Environment.getGlobalEnv();
      if (!env) {
        logger.debug(
          `No global environment, assuming '${symbolName}' is not a macro in module`,
        );
        return false;
      }

      if (!modulePath.endsWith(".hql")) {
        logger.debug(`Not an HQL file, skipping macro check: ${modulePath}`);
        return false;
      }

      let resolvedPath = modulePath;
      if (modulePath.startsWith("./") || modulePath.startsWith("../")) {
        import * as path from "../../platform/platform.ts";
        resolvedPath = path.resolve(currentDir, modulePath);
        logger.debug(
          `Resolved relative path '${modulePath}' to '${resolvedPath}'`,
        );
      }

      for (const [filePath, macros] of env.moduleMacros.entries()) {
        if (
          (filePath === resolvedPath || filePath.endsWith(resolvedPath)) &&
          macros.has(symbolName) &&
          env.getExportedMacros(filePath)?.has(symbolName)
        ) {
          logger.debug(
            `Symbol '${symbolName}' is a macro in module ${filePath}`,
          );
          return true;
        }
      }

      logger.debug(
        `Symbol '${symbolName}' is not a macro in module ${modulePath}`,
      );
      return false;
    },
    `isSymbolMacroInModule '${symbolName}'`,
    TransformError,
    [symbolName, modulePath, currentDir],
  );
}

/**
 * Transform namespace import with "from" syntax
 */
export function transformNamespaceImport(
  list: ListNode,
  currentDir: string,
): IR.IRNode | null {
  return perform(
    () => {
      const nameNode = list.elements[1];
      const pathNode = list.elements[3];

      if (nameNode.type !== "symbol") {
        throw new ValidationError(
          "Import name must be a symbol",
          "namespace import",
          "symbol",
          nameNode.type,
        );
      }

      if (pathNode.type !== "literal") {
        throw new ValidationError(
          "Import path must be a string literal",
          "namespace import",
          "string literal",
          pathNode.type,
        );
      }

      const name = (nameNode as SymbolNode).name;
      const pathVal = String((pathNode as LiteralNode).value);

      return {
        type: IR.IRNodeType.JsImportReference,
        name,
        source: pathVal,
      } as IR.IRJsImportReference;
    },
    "transformNamespaceImport",
    TransformError,
    [list],
  );
}

/**
 * Transform a vector-based export statement
 */
export function transformVectorExport(
  list: ListNode,
  currentDir: string,
): IR.IRNode | null {
  return perform(
    () => {
      const vectorNode = list.elements[1];
      if (vectorNode.type !== "list") {
        throw new ValidationError(
          "Export argument must be a vector (list)",
          "vector export",
          "vector (list)",
          vectorNode.type,
        );
      }

      const symbols = processVectorElements((vectorNode as ListNode).elements);
      const exportSpecifiers: IR.IRExportSpecifier[] = [];

      for (const elem of symbols) {
        if (elem.type !== "symbol") {
          logger.warn(`Skipping non-symbol export element: ${elem.type}`);
          continue;
        }
        const symbolName = (elem as SymbolNode).name;

        if (isUserLevelMacro(symbolName, currentDir)) {
          logger.debug(`Skipping macro in export: ${symbolName}`);
          continue;
        }
        exportSpecifiers.push(createExportSpecifier(symbolName));
      }

      if (exportSpecifiers.length === 0) {
        logger.debug("All exports were macros, skipping export declaration");
        return null;
      }

      return {
        type: IR.IRNodeType.ExportNamedDeclaration,
        specifiers: exportSpecifiers,
      } as IR.IRExportNamedDeclaration;
    },
    "transformVectorExport",
    TransformError,
    [list],
  );
}

/**
 * Create an export specifier
 */
export function createExportSpecifier(symbolName: string): IR.IRExportSpecifier {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ExportSpecifier,
        local: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(symbolName),
        } as IR.IRIdentifier,
        exported: {
          type: IR.IRNodeType.Identifier,
          name: symbolName,
        } as IR.IRIdentifier,
      };
    },
    `createExportSpecifier '${symbolName}'`,
    TransformError,
    [symbolName],
  );
}

/**
 * Transform a vector-based import statement
 */
export function transformVectorImport(
  list: ListNode,
  currentDir: string,
): IR.IRNode | null {
  return perform(
    () => {
      const vectorNode = list.elements[1] as ListNode;
      if (list.elements[3].type !== "literal") {
        throw new ValidationError(
          "Import path must be a string literal",
          "vector import",
          "string literal",
          list.elements[3].type,
        );
      }

      const modulePath = (list.elements[3] as LiteralNode).value as string;
      if (typeof modulePath !== "string") {
        throw new ValidationError(
          "Import path must be a string",
          "vector import",
          "string",
          typeof modulePath,
        );
      }

      const elements = processVectorElements(vectorNode.elements);
      const importSpecifiers: IR.IRImportSpecifier[] = [];
      let i = 0;
      while (i < elements.length) {
        const elem = elements[i];
        if (elem.type === "symbol") {
          const symbolName = (elem as SymbolNode).name;
          const hasAlias = hasAliasFollowing(elements, i);
          const aliasName = hasAlias
            ? (elements[i + 2] as SymbolNode).name
            : null;

          const isMacro = isUserLevelMacro(symbolName, currentDir) ||
            isSymbolMacroInModule(symbolName, modulePath, currentDir);

          if (isMacro) {
            logger.debug(
              `Skipping macro in import: ${symbolName}${
                aliasName ? ` as ${aliasName}` : ""
              }`,
            );
            i += hasAlias ? 3 : 1;
            continue;
          }

          if (hasAlias) {
            importSpecifiers.push(
              createImportSpecifier(symbolName, aliasName!),
            );
            i += 3;
          } else {
            importSpecifiers.push(
              createImportSpecifier(symbolName, symbolName),
            );
            i += 1;
          }
        } else {
          i += 1;
        }
      }

      if (importSpecifiers.length === 0) {
        logger.debug("All imports were macros, skipping import declaration");
        return null;
      }

      return {
        type: IR.IRNodeType.ImportDeclaration,
        source: modulePath,
        specifiers: importSpecifiers,
      } as IR.IRImportDeclaration;
    },
    "transformVectorImport",
    TransformError,
    [list],
  );
}