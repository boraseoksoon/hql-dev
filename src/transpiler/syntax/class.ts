// src/transpiler/syntax/class.ts
// Module for handling class declarations and related operations

import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError } from "../error/errors.ts";
import { sanitizeIdentifier } from "../../utils/utils.ts";
import { Logger } from "../../logger.ts";
import { perform } from "../error/error-utils.ts";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Transform a class declaration to IR
 */
export function transformClass(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  try {
    // Validate class syntax
    if (list.elements.length < 2) {
      throw new ValidationError(
        "class requires a name and body elements",
        "class definition",
        "name and body",
        `${list.elements.length - 1} arguments`,
      );
    }

    // Extract class name
    const nameNode = list.elements[1];
    if (nameNode.type !== "symbol") {
      throw new ValidationError(
        "Class name must be a symbol",
        "class name",
        "symbol",
        nameNode.type,
      );
    }
    const className = (nameNode as SymbolNode).name;

    // Process class body elements
    const bodyElements = list.elements.slice(2);

    // Extract fields, constructor, and methods
    const fields: IR.IRClassField[] = [];
    let classConstructor: IR.IRClassConstructor | null = null;
    const methods: IR.IRClassMethod[] = [];

    // Process each class body element
    for (const element of bodyElements) {
      if (element.type !== "list") {
        throw new ValidationError(
          "Class body elements must be lists",
          "class body",
          "list",
          element.type,
        );
      }

      const elementList = element as ListNode;
      if (elementList.elements.length === 0) continue;

      const firstElement = elementList.elements[0];
      if (firstElement.type !== "symbol") continue;

      const elementType = (firstElement as SymbolNode).name;

      // Process field declarations (var and let)
      if (elementType === "var" || elementType === "let") {
        const field = processClassField(elementList, currentDir, transformNode, elementType);
        if (field) {
          fields.push(field);
        }
      }
      // Process constructor
      else if (elementType === "constructor") {
        classConstructor = processClassConstructor(elementList, currentDir, transformNode);
      }
      // Process fn method definitions
      else if (elementType === "fn") {
        const method = processClassMethodFn(elementList, currentDir, transformNode);
        if (method) {
          methods.push(method);
        }
      }
      // Process fx method definitions
      else if (elementType === "fx") {
        const method = processClassMethodFx(elementList, currentDir, transformNode);
        if (method) {
          methods.push(method);
        }
      }
    }

    // Create the ClassDeclaration IR node
    return {
      type: IR.IRNodeType.ClassDeclaration,
      id: {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(className),
      },
      fields,
      constructor: classConstructor,
      methods,
    } as IR.IRClassDeclaration;
  } catch (error) {
    throw new TransformError(
      `Failed to transform class declaration: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "class declaration",
      "transformation",
      list,
    );
  }
}

/**
 * Process a class field declaration
 */
function processClassField(
  elementList: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
  elementType: string
): IR.IRClassField | null {
  try {
    // Field handling
    if (elementList.elements.length < 2) {
      throw new ValidationError(
        `${elementType} requires at least a name`,
        "field declaration",
        "name",
        `${elementList.elements.length - 1} arguments`,
      );
    }

    const fieldNameNode = elementList.elements[1];
    if (fieldNameNode.type !== "symbol") {
      throw new ValidationError(
        "Field name must be a symbol",
        "field name",
        "symbol",
        fieldNameNode.type,
      );
    }

    const fieldName = (fieldNameNode as SymbolNode).name;
    let initialValue: IR.IRNode | null = null;

    // If there's an initial value, transform it
    if (elementList.elements.length > 2) {
      initialValue = transformNode(elementList.elements[2], currentDir);
    }

    return {
      type: IR.IRNodeType.ClassField,
      name: fieldName,
      mutable: elementType === "var",
      initialValue,
    };
  } catch (error) {
    logger.error(`Error processing class field: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Process a class constructor
 */
function processClassConstructor(
  elementList: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRClassConstructor | null {
  try {
    // Constructor handling
    if (elementList.elements.length < 3) {
      throw new ValidationError(
        "constructor requires parameters and body",
        "constructor",
        "params and body",
        `${elementList.elements.length - 1} arguments`,
      );
    }

    const paramsNode = elementList.elements[1];
    if (paramsNode.type !== "list") {
      throw new ValidationError(
        "Constructor parameters must be a list",
        "constructor params",
        "list",
        paramsNode.type,
      );
    }

    // Extract parameter names
    const paramsList = paramsNode as ListNode;
    const params: IR.IRIdentifier[] = [];

    for (const param of paramsList.elements) {
      if (param.type !== "symbol") {
        throw new ValidationError(
          "Constructor parameter must be a symbol",
          "constructor param",
          "symbol",
          param.type,
        );
      }

      params.push({
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier((param as SymbolNode).name),
      });
    }

    // Transform constructor body
    let bodyBlock: IR.IRBlockStatement;
    const bodyNode = elementList.elements[2];

    // Special handling for do blocks
    if (bodyNode.type === "list" &&
        bodyNode.elements.length > 0 &&
        bodyNode.elements[0].type === "symbol" &&
        (bodyNode.elements[0] as SymbolNode).name === "do") {

      // Extract statements from do-block directly
      const doList = bodyNode as ListNode;
      const statements: IR.IRNode[] = [];

      for (let i = 1; i < doList.elements.length; i++) {
        const stmt = transformNode(doList.elements[i], currentDir);
        if (stmt) statements.push(stmt);
      }

      bodyBlock = {
        type: IR.IRNodeType.BlockStatement,
        body: statements
      };
    } else {
      // Handle single expression constructor body
      const transformedBody = transformNode(bodyNode, currentDir);
      bodyBlock = {
        type: IR.IRNodeType.BlockStatement,
        body: transformedBody ? [transformedBody] : []
      };
    }

    return {
      type: IR.IRNodeType.ClassConstructor,
      params,
      body: bodyBlock,
    };
  } catch (error) {
    logger.error(`Error processing class constructor: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Process a class method defined with fn syntax
 */
function processClassMethodFn(
  elementList: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRClassMethod | null {
  try {
    if (elementList.elements.length < 4) {
      throw new ValidationError(
        "Method requires a name, parameters, and body",
        "method definition",
        "name, params, body",
        `${elementList.elements.length - 1} arguments`,
      );
    }

    // Get method name
    const methodNameNode = elementList.elements[1];
    if (methodNameNode.type !== "symbol") {
      throw new ValidationError(
        "Method name must be a symbol",
        "method name",
        "symbol",
        methodNameNode.type,
      );
    }
    const methodName = (methodNameNode as SymbolNode).name;

    // Get method parameters
    const paramsNode = elementList.elements[2];
    if (paramsNode.type !== "list") {
      throw new ValidationError(
        "Method parameters must be a list",
        "method params",
        "list",
        paramsNode.type,
      );
    }

    // Extract parameter names
    const paramsList = paramsNode as ListNode;
    const params: IR.IRIdentifier[] = [];

    for (const param of paramsList.elements) {
      if (param.type !== "symbol") {
        throw new ValidationError(
          "Method parameter must be a symbol",
          "method param",
          "symbol",
          param.type,
        );
      }

      params.push({
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier((param as SymbolNode).name),
      });
    }

    // Transform method body
    const bodyNodes = elementList.elements.slice(3).map(node =>
      transformNode(node, currentDir)
    ).filter(node => node !== null) as IR.IRNode[];

    // Create a block statement
    const bodyBlock: IR.IRBlockStatement = {
      type: IR.IRNodeType.BlockStatement,
      body: bodyNodes
    };

    return {
      type: IR.IRNodeType.ClassMethod,
      name: methodName,
      params,
      body: bodyBlock,
    };
  } catch (error) {
    logger.error(`Error processing class method (fn): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Process a class method defined with fx syntax
 */
function processClassMethodFx(
  elementList: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRClassMethod | null {
  try {
    if (elementList.elements.length < 5) {
      throw new ValidationError(
        "fx method requires a name, parameter list, return type, and body",
        "fx method definition",
        "name, params, return type, body",
        `${elementList.elements.length - 1} arguments`,
      );
    }

    // Get method name
    const methodNameNode = elementList.elements[1];
    if (methodNameNode.type !== "symbol") {
      throw new ValidationError(
        "Method name must be a symbol",
        "fx method name",
        "symbol",
        methodNameNode.type,
      );
    }
    const methodName = (methodNameNode as SymbolNode).name;

    // Get method parameters
    const paramsNode = elementList.elements[2];
    if (paramsNode.type !== "list") {
      throw new ValidationError(
        "fx parameters must be a list",
        "fx method params",
        "list",
        paramsNode.type,
      );
    }

    // Parse parameters with type annotations - extract defaults as well
    const paramsList = paramsNode as ListNode;
    const params: IR.IRIdentifier[] = [];
    const defaults: { name: string; value: IR.IRNode }[] = [];

    // Process parameters to extract defaults
    let i = 0;
    while (i < paramsList.elements.length) {
      const elem = paramsList.elements[i];

      if (elem.type === "symbol") {
        const symbolName = (elem as SymbolNode).name;

        // Handle parameter with type
        if (symbolName.endsWith(":")) {
          const paramName = symbolName.slice(0, -1);
          params.push({
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(paramName)
          });

          // Skip type annotation
          i += 2;

          // Check for default value
          if (i < paramsList.elements.length &&
              paramsList.elements[i].type === "symbol" &&
              (paramsList.elements[i] as SymbolNode).name === "=") {

            // Process default value
            if (i + 1 < paramsList.elements.length) {
              const defaultValue = transformNode(paramsList.elements[i + 1], currentDir);
              if (defaultValue) {
                defaults.push({ name: paramName, value: defaultValue });
              }
              i += 2; // Skip = and default value
            } else {
              i++; // Skip =
            }
          }
        } else {
          // Regular parameter
          params.push({
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(symbolName)
          });
          i++;
        }
      } else {
        i++;
      }
    }

    // Skip return type and get the body expressions
    const bodyExprs = elementList.elements.slice(4);

    // Transform body expressions
    const bodyNodes = bodyExprs.map(node =>
      transformNode(node, currentDir)
    ).filter(node => node !== null) as IR.IRNode[];

    // Create a block statement
    const bodyBlock: IR.IRBlockStatement = {
      type: IR.IRNodeType.BlockStatement,
      body: bodyNodes
    };

    // Add as a regular class method but include defaults information
    return {
      type: IR.IRNodeType.ClassMethod,
      name: methodName,
      params,
      defaults: defaults.length > 0 ? defaults : undefined, // Include defaults
      body: bodyBlock,
    };
  } catch (error) {
    logger.error(`Error processing class method (fx): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Transform a method call to a member method.
 */
export function transformMethodCall(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 3) {
        throw new ValidationError(
          "method-call requires at least an object and method name",
          "method-call",
          "at least 2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "method-call",
          "valid object expression",
          "null",
        );
      }

      // Extract method name
      let methodName: string;
      if (list.elements[2].type === "literal") {
        methodName = String(list.elements[2].value);
      } else if (list.elements[2].type === "symbol") {
        methodName = list.elements[2].name;
      } else {
        throw new ValidationError(
          "Method name must be a string literal or symbol",
          "method-call",
          "string literal or symbol",
          list.elements[2].type,
        );
      }

      // Transform arguments (if any)
      const args = list.elements.slice(3).map(arg => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Argument transformed to null: ${JSON.stringify(arg)}`,
            "method-call argument",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      // Create a GetAndCall node - new IR node type for this pattern
      return {
        type: IR.IRNodeType.GetAndCall,
        object,
        method: {
          type: IR.IRNodeType.StringLiteral,
          value: methodName
        } as IR.IRStringLiteral,
        arguments: args
      } as IR.IRGetAndCall;
    },
    "transformMethodCall",
    TransformError,
    [list],
  );
}