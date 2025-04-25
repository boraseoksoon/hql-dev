// src/transpiler/syntax/import-export.ts
// Module for handling import and export operations

import * as ts from "npm:typescript";
import * as path from "../../platform/platform.ts";
import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode, LiteralNode } from "../type/hql_ast.ts";
import { TransformError, ValidationError } from "../../common/error-pipeline.ts";
import { perform } from "../../common/error-pipeline.ts";
import { sanitizeIdentifier } from "../../common/utils.ts";
import { globalLogger as logger } from "../../logger.ts";
import { Environment } from "../../environment.ts";
import { isUserLevelMacro } from "../../s-exp/macro.ts";
import { processVectorElements } from "./data-structure.ts";
import { execute, convertVariableDeclaration } from "../pipeline/hql-ir-to-ts-ast.ts";
import { registerImportedIdentifier } from "../pipeline/hql-ast-to-hql-ir.ts";

export function convertImportDeclaration(node: IR.IRImportDeclaration): ts.ImportDeclaration {
  return execute(node, "import declaration", () => {
    if (!node.specifiers || node.specifiers.length === 0) {
      const moduleName = createModuleVariableName(node.source);
      return ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
          false,
          undefined,
          ts.factory.createNamespaceImport(ts.factory.createIdentifier(moduleName))
        ),
        ts.factory.createStringLiteral(node.source)
      );
    }
    const namedImports = node.specifiers.map(spec =>
      ts.factory.createImportSpecifier(
        false,
        spec.imported.name !== spec.local.name ? ts.factory.createIdentifier(spec.imported.name) : undefined,
        ts.factory.createIdentifier(spec.local.name)
      )
    );
    return ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(false, undefined, ts.factory.createNamedImports(namedImports)),
      ts.factory.createStringLiteral(node.source)
    );
  });
}

export function convertJsImportReference(node: IR.IRJsImportReference): ts.Statement[] {
  return execute(node, "JS import reference", () => {
    const importName = sanitizeIdentifier(node.name);
    const internalModuleName = `${importName}Module`;
    const importDecl = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamespaceImport(ts.factory.createIdentifier(internalModuleName))
      ),
      ts.factory.createStringLiteral(node.source)
    );
    const functionBody = ts.factory.createBlock(
      [
        ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createIdentifier("wrapper"),
                undefined,
                undefined,
                ts.factory.createConditionalExpression(
                  ts.factory.createBinaryExpression(
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier(internalModuleName),
                      ts.factory.createIdentifier("default")
                    ),
                    ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                    ts.factory.createIdentifier("undefined")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.QuestionToken),
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier(internalModuleName),
                    ts.factory.createIdentifier("default")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.ColonToken),
                  ts.factory.createObjectLiteralExpression([], false)
                )
              ),
            ],
            ts.NodeFlags.Const
          )
        ),
        ts.factory.createForOfStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createArrayBindingPattern([
                  ts.factory.createBindingElement(undefined, undefined, ts.factory.createIdentifier("key")),
                  ts.factory.createBindingElement(undefined, undefined, ts.factory.createIdentifier("value")),
                ]),
                undefined,
                undefined,
                undefined
              ),
            ],
            ts.NodeFlags.Const
          ),
          ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier("Object"),
              ts.factory.createIdentifier("entries")
            ),
            undefined,
            [ts.factory.createIdentifier(internalModuleName)]
          ),
          ts.factory.createBlock(
            [
              ts.factory.createIfStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createIdentifier("key"),
                  ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                  ts.factory.createStringLiteral("default")
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    ts.factory.createElementAccessExpression(ts.factory.createIdentifier("wrapper"), ts.factory.createIdentifier("key")),
                    ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                    ts.factory.createIdentifier("value")
                  )
                )
              ),
            ],
            true
          )
        ),
        ts.factory.createReturnStatement(ts.factory.createIdentifier("wrapper")),
      ],
      true
    );
    const iife = ts.factory.createCallExpression(
      ts.factory.createParenthesizedExpression(
        ts.factory.createFunctionExpression(undefined, undefined, undefined, undefined, [], undefined, functionBody)
      ),
      undefined,
      []
    );
    const defaultAssignment = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(importName),
            undefined,
            undefined,
            iife
          ),
        ],
        ts.NodeFlags.Const
      )
    );
    return [importDecl, defaultAssignment];
  });
}

export function convertExportNamedDeclaration(node: IR.IRExportNamedDeclaration): ts.ExportDeclaration {
  return execute(node, "export named declaration", () => {
    const specifiers = node.specifiers.map(spec =>
      ts.factory.createExportSpecifier(
        false,
        spec.local.name !== spec.exported.name ? ts.factory.createIdentifier(spec.local.name) : undefined,
        ts.factory.createIdentifier(spec.exported.name)
      )
    );
    return ts.factory.createExportDeclaration(
      undefined,
      false,
      ts.factory.createNamedExports(specifiers),
      undefined
    );
  });
}

export function convertExportVariableDeclaration(node: IR.IRExportVariableDeclaration): ts.Statement[] {
  return execute(node, "export variable declaration", () => {
    const varDecl = convertVariableDeclaration(node.declaration);
    const varName = node.declaration.declarations[0].id.name;
    const exportDecl = ts.factory.createExportDeclaration(
      undefined,
      false,
      ts.factory.createNamedExports([
        ts.factory.createExportSpecifier(
          false,
          ts.factory.createIdentifier(varName),
          ts.factory.createIdentifier(node.exportName)
        ),
      ]),
      undefined
    );
    return [varDecl, exportDecl];
  });
}

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

      // Register the imported namespace identifier
      registerImportedIdentifier(name);

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
            // Register both the alias and original name as imported
            registerImportedIdentifier(aliasName!);
            registerImportedIdentifier(symbolName);
            i += 3;
          } else {
            importSpecifiers.push(
              createImportSpecifier(symbolName, symbolName),
            );
            // Register the imported symbol
            registerImportedIdentifier(symbolName);
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

function createModuleVariableName(source: string): string {
  return execute(source, "module variable name creation", () => {
    let cleanSource = source;
    if (cleanSource.startsWith("npm:")) {
      cleanSource = cleanSource.substring(4);
    } else if (cleanSource.startsWith("jsr:")) {
      cleanSource = cleanSource.substring(4);
    }
    if (cleanSource.includes("@") && cleanSource.includes("/")) {
      const parts = cleanSource.split("/");
      cleanSource = parts[parts.length - 1];
    } else if (cleanSource.includes("/")) {
      const parts = cleanSource.split("/");
      cleanSource = parts[parts.length - 1];
    }
    let baseName = cleanSource.replace(/\.(js|ts|mjs|cjs)$/, "");
    baseName = baseName.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
    baseName = baseName.replace(/^[^a-zA-Z_$]/, "_");
    return `${baseName}Module`;
  });
}