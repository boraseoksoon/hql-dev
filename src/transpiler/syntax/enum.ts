// src/transpiler/enum-handler.ts
// A unified module for handling enum operations across the transpiler

import * as IR from "../hql_ir.ts";
import { ListNode, SymbolNode } from "../hql_ast.ts";
import { ValidationError, TransformError } from "../errors.ts";
import { sanitizeIdentifier } from "../../utils.ts";
import { Logger } from "../../logger.ts";
import { perform } from "../error-utils.ts";
import * as ts from "npm:typescript";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Parse an enum case from an AST node
 * @param caseList The list node representing an enum case
 * @param currentDir The current directory (for resolving imports)
 * @returns An IR node representing the enum case
 */
export function parseEnumCase(
  caseList: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode
): IR.IREnumCase {
  return perform(
    () => {
      // Validate case list format
      if (
        caseList.elements.length < 2 ||
        caseList.elements[0].type !== "symbol" ||
        (caseList.elements[0] as SymbolNode).name !== "case" ||
        caseList.elements[1].type !== "symbol"
      ) {
        throw new ValidationError(
          "Invalid enum case format. Expected (case CaseName ...)",
          "enum case format",
          "(case CaseName)",
          `invalid format: ${JSON.stringify(caseList)}`,
        );
      }

      const caseNameNode = caseList.elements[1] as SymbolNode;
      const caseName = caseNameNode.name;

      // Create the basic enum case
      const enumCase: IR.IREnumCase = {
        type: IR.IRNodeType.EnumCase,
        id: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(caseName),
        },
      };

      // Check if this case has additional elements (raw value or associated values)
      if (caseList.elements.length > 2) {
        // If any symbol in the remaining elements ends with a colon, treat them as named parameters
        const hasNamedParams = caseList.elements.some(elem =>
          elem.type === "symbol" && (elem as SymbolNode).name.endsWith(":")
        );

        if (hasNamedParams) {
          // Parse associated values
          const associatedValues: IR.IREnumAssociatedValue[] = [];
          for (let i = 2; i < caseList.elements.length; i++) {
            const elem = caseList.elements[i];
            if (elem.type === "symbol" && (elem as SymbolNode).name.endsWith(":")) {
              const paramName = (elem as SymbolNode).name.slice(0, -1); // remove colon
              if (i + 1 < caseList.elements.length && caseList.elements[i + 1].type === "symbol") {
                const typeSymbol = caseList.elements[i + 1] as SymbolNode;
                associatedValues.push({
                  name: paramName,
                  type: typeSymbol.name
                });
                i++; // Skip the type symbol
              }
            }
          }
          enumCase.associatedValues = associatedValues;
          enumCase.hasAssociatedValues = true;
          logger.debug(`Enum case ${caseName} has ${associatedValues.length} associated values`);
        } else {
          // Treat the extra element as a raw value
          const rawValueNode = caseList.elements[2];
          enumCase.rawValue = transformNode(rawValueNode, currentDir);
          logger.debug(`Enum case ${caseName} has raw value`);
        }
      }

      return enumCase;
    },
    "parseEnumCase",
    TransformError,
    [caseList],
  );
}

/**
 * Detects if an enum needs to be implemented as a class (for associated values)
 * or as a simple frozen object
 */
export function shouldUseClassImplementation(enumDecl: IR.IREnumDeclaration): boolean {
  return enumDecl.hasAssociatedValues === true || 
         enumDecl.cases.some(c => c.hasAssociatedValues === true);
}

/**
 * Creates a JS object-based implementation for a simple enum
 */
export function createEnumObjectImplementation(enumDecl: IR.IREnumDeclaration): ts.Statement {
  return perform(
    () => {
      logger.debug(`Creating object-based enum implementation: ${enumDecl.id.name}`);
      
      // Create properties for each case
      const properties = enumDecl.cases.map(enumCase => {
        if (enumCase.type !== IR.IRNodeType.EnumCase) {
          throw new ValidationError(
            `Expected EnumCase inside EnumDeclaration, got ${IR.IRNodeType[enumCase.type]}`,
            "enum case",
            "EnumCase",
            `${IR.IRNodeType[enumCase.type]}`
          );
        }
        
        const caseName = enumCase.id.name;
        logger.debug(`  Creating object property for case: ${caseName}`);
        
        // Use raw value if available, otherwise use the case name as a string
        const valueExpression = enumCase.rawValue
          ? convertIRExpr(enumCase.rawValue)
          : ts.factory.createStringLiteral(caseName);
          
        return ts.factory.createPropertyAssignment(
          ts.factory.createIdentifier(caseName),
          valueExpression
        );
      });
      
      // Create a comment for the enum type if rawType is specified
      let enumTypeComment: ts.SynthesizedComment | undefined;
      if (enumDecl.rawType) {
        enumTypeComment = {
          kind: ts.SyntaxKind.MultiLineCommentTrivia,
          text: ` @type {Object<string, ${enumDecl.rawType}>} `,
          hasTrailingNewLine: false,
          pos: -1,
          end: -1
        };
      }
      
      const objectLiteral = ts.factory.createObjectLiteralExpression(
        properties,
        true
      );
      
      // Add comment to the object literal if we have a type
      if (enumTypeComment) {
        ts.addSyntheticLeadingComment(
          objectLiteral,
          enumTypeComment.kind,
          enumTypeComment.text,
          enumTypeComment.hasTrailingNewLine
        );
      }
      
      const freezeCall = ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier("Object"),
          ts.factory.createIdentifier("freeze")
        ),
        undefined,
        [objectLiteral]
      );
      
      const variableDeclaration = ts.factory.createVariableDeclaration(
        ts.factory.createIdentifier(enumDecl.id.name),
        undefined,
        undefined,
        freezeCall
      );
      
      return ts.factory.createVariableStatement(
        [],  // Empty array = no modifiers
        ts.factory.createVariableDeclarationList(
          [variableDeclaration],
          ts.NodeFlags.Const
        )
      );
    },
    "createEnumObjectImplementation",
    ValidationError,
    [enumDecl]
  );
}

/**
 * Creates a class-based implementation for an enum with associated values
 */
export function createEnumClassImplementation(enumDecl: IR.IREnumDeclaration): ts.ClassDeclaration {
  return perform(
    () => {
      const enumName = enumDecl.id.name;
      const members: ts.ClassElement[] = [];
      
      // Create a private constructor
      const constructorDecl = ts.factory.createConstructorDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
        [
          ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            ts.factory.createIdentifier("type"),
            undefined,
            undefined
          ),
          ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            ts.factory.createIdentifier("values"),
            undefined,
            undefined
          )
        ],
        ts.factory.createBlock([
          ts.factory.createExpressionStatement(
            ts.factory.createBinaryExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createThis(),
                ts.factory.createIdentifier("type")
              ),
              ts.factory.createToken(ts.SyntaxKind.EqualsToken),
              ts.factory.createIdentifier("type")
            )
          ),
          ts.factory.createExpressionStatement(
            ts.factory.createBinaryExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createThis(),
                ts.factory.createIdentifier("values")
              ),
              ts.factory.createToken(ts.SyntaxKind.EqualsToken),
              ts.factory.createIdentifier("values")
            )
          )
        ], true)
      );
      
      members.push(constructorDecl);
      
      // Add properties for type and values
      members.push(
        ts.factory.createPropertyDeclaration(
          undefined,
          ts.factory.createIdentifier("type"),
          undefined,
          undefined,
          undefined
        )
      );
      
      members.push(
        ts.factory.createPropertyDeclaration(
          undefined,
          ts.factory.createIdentifier("values"),
          undefined,
          undefined,
          undefined
        )
      );
      
      // Add utility methods
      members.push(createIsMethod());
      members.push(createGetValueMethod());
      
      // Add factory methods for each case
      for (const enumCase of enumDecl.cases) {
        members.push(createCaseFactoryMethod(enumCase, enumName));
      }
      
      return ts.factory.createClassDeclaration(
        [],  // No modifiers
        ts.factory.createIdentifier(enumName),
        undefined,
        undefined,
        members
      );
    },
    "createEnumClassImplementation",
    ValidationError,
    [enumDecl]
  );
}

/**
 * Create the 'is' method for enum classes
 */
function createIsMethod(): ts.MethodDeclaration {
  return ts.factory.createMethodDeclaration(
    undefined,
    undefined,
    ts.factory.createIdentifier("is"),
    undefined,
    undefined,
    [
      ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        ts.factory.createIdentifier("type"),
        undefined,
        undefined
      )
    ],
    undefined,
    ts.factory.createBlock([
      ts.factory.createReturnStatement(
        ts.factory.createBinaryExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createThis(),
            ts.factory.createIdentifier("type")
          ),
          ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
          ts.factory.createIdentifier("type")
        )
      )
    ], true)
  );
}

/**
 * Create the 'getValue' method for enum classes
 */
function createGetValueMethod(): ts.MethodDeclaration {
  return ts.factory.createMethodDeclaration(
    undefined,
    undefined,
    ts.factory.createIdentifier("getValue"),
    undefined,
    undefined,
    [
      ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        ts.factory.createIdentifier("key"),
        undefined,
        undefined
      )
    ],
    undefined,
    ts.factory.createBlock([
      ts.factory.createReturnStatement(
        ts.factory.createElementAccessExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createThis(),
            ts.factory.createIdentifier("values")
          ),
          ts.factory.createIdentifier("key")
        )
      )
    ], true)
  );
}

/**
 * Create a factory method for an enum case
 */
function createCaseFactoryMethod(enumCase: IR.IREnumCase, enumName: string): ts.ClassElement {
  const caseName = enumCase.id.name;
  
  if (enumCase.hasAssociatedValues && enumCase.associatedValues) {
    // Create a factory method with named parameters
    const paramNames = enumCase.associatedValues.map(param => param.name);
    
    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.StaticKeyword)],
      undefined,
      ts.factory.createIdentifier(caseName),
      undefined,
      undefined,
      [
        // Create a parameter with explicit named options
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          ts.factory.createIdentifier("options"),
          undefined,
          undefined,
          ts.factory.createObjectLiteralExpression([], false)
        )
      ],
      undefined,
      ts.factory.createBlock([
        // Create object literal with all the parameters
        ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createIdentifier("values"),
                undefined,
                undefined,
                ts.factory.createObjectLiteralExpression(
                  paramNames.map(name => 
                    ts.factory.createPropertyAssignment(
                      ts.factory.createIdentifier(name),
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier("options"),
                        ts.factory.createIdentifier(name)
                      )
                    )
                  ),
                  false
                )
              )
            ],
            ts.NodeFlags.Const
          )
        ),
        ts.factory.createReturnStatement(
          ts.factory.createNewExpression(
            ts.factory.createIdentifier(enumName),
            undefined,
            [
              ts.factory.createStringLiteral(caseName),
              ts.factory.createIdentifier("values")
            ]
          )
        )
      ], true)
    );
  } else {
    // Create a simple property for cases without associated values
    const valueExpr = enumCase.rawValue 
      ? convertIRExpr(enumCase.rawValue)
      : ts.factory.createStringLiteral(caseName);
      
    return ts.factory.createPropertyDeclaration(
      [
        ts.factory.createModifier(ts.SyntaxKind.StaticKeyword), 
        ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)
      ],
      ts.factory.createIdentifier(caseName),
      undefined,
      undefined,
      ts.factory.createNewExpression(
        ts.factory.createIdentifier(enumName),
        undefined,
        [
          ts.factory.createStringLiteral(caseName),
          ts.factory.createObjectLiteralExpression([], false)
        ]
      )
    );
  }
}

/**
 * Helper function for converting IR expressions to TS expressions
 * This needs to be implemented based on your convertIRExpr function
 */
function convertIRExpr(node: IR.IRNode): ts.Expression {
  // This is just a placeholder - real implementation should convert IR expressions
  // to TypeScript AST expressions
  if (node.type === IR.IRNodeType.StringLiteral) {
    return ts.factory.createStringLiteral((node as IR.IRStringLiteral).value);
  } else if (node.type === IR.IRNodeType.NumericLiteral) {
    return ts.factory.createNumericLiteral((node as IR.IRNumericLiteral).value);
  } else if (node.type === IR.IRNodeType.BooleanLiteral) {
    return (node as IR.IRBooleanLiteral).value ? 
      ts.factory.createTrue() : 
      ts.factory.createFalse();
  } else if (node.type === IR.IRNodeType.Identifier) {
    return ts.factory.createIdentifier((node as IR.IRIdentifier).name);
  }
  
  // Default fallback
  return ts.factory.createIdentifier('undefined');
}

/**
 * Check if an enum has a case with the given name
 */
export function hasCaseNamed(enumDef: ListNode, caseName: string): boolean {
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