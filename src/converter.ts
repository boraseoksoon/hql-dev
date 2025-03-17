// src/converter.ts

/**
 * This module takes the raw HQL AST (possibly already macro-expanded)
 * and applies all necessary conversions (e.g., converting export forms, 
 * adjusting syntax, etc.) so that it becomes a “clean” AST ready for IR conversion.
 *
 */

export function convertAST(rawAst: any[]): any[] {
    // Example conversion: map through each node and transform export forms.
    return rawAst.map(node => {
      if (
        node.type === "list" &&
        node.elements.length >= 3 &&
        node.elements[0].type === "symbol" &&
        node.elements[0].name === "export"
      ) {
        const exportNameNode = node.elements[1];
        const localNode = node.elements[2];
        if (exportNameNode.type === "literal" && typeof exportNameNode.value === "string") {
          return {
            type: "ExportNamedDeclaration",
            specifiers: [
              {
                type: "ExportSpecifier",
                local: localNode,
                exported: { type: "symbol", name: exportNameNode.value }
              }
            ]
          };
        }
      }
      // Other conversions can go here...
      return node;
    });
  }
  