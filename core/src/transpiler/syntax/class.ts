// src/transpiler/syntax/class.ts
// Module for handling class declarations and related operations

import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode } from "../type/hql_ast.ts";
import { ValidationError, TransformError } from "../error/errors.ts";
import { sanitizeIdentifier } from "../../common/utils.ts";
import { globalLogger as logger } from "../../logger.ts";
import { perform } from "../error/index.ts";
import { execute,  } from "../pipeline/hql-ir-to-ts-ast.ts";
import { convertIRNode, convertIRExpr } from "../pipeline/hql-ir-to-ts-ast.ts";

export function convertCallExpression(node: IR.IRCallExpression): ts.CallExpression {
  return execute(node, "call expression", () => {
    if (
      node.callee.type === IR.IRNodeType.Identifier &&
      (node.callee as IR.IRIdentifier).name === "js-call" &&
      node.arguments.length >= 2
    ) {
      const object = convertIRExpr(node.arguments[0]);
      let methodNameExpr: ts.Expression;
      if (node.arguments[1].type === IR.IRNodeType.StringLiteral) {
        const methodName = (node.arguments[1] as IR.IRStringLiteral).value;
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(methodName)) {
          return ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(
              object,
              ts.factory.createIdentifier(methodName)
            ),
            undefined,
            node.arguments.slice(2).map(arg => convertIRExpr(arg))
          );
        } else {
          methodNameExpr = ts.factory.createStringLiteral(methodName);
        }
      } else {
        methodNameExpr = convertIRExpr(node.arguments[1]);
      }
      const methodAccess = ts.factory.createElementAccessExpression(object, methodNameExpr);
      return ts.factory.createCallExpression(
        methodAccess,
        undefined,
        node.arguments.slice(2).map(arg => convertIRExpr(arg))
      );
    }
    if (node.callee.type === IR.IRNodeType.MemberExpression) {
      const memberExpr = node.callee as IR.IRMemberExpression;
      const object = convertIRExpr(memberExpr.object);
      let methodAccess: ts.Expression;
      if (memberExpr.property.type === IR.IRNodeType.Identifier) {
        methodAccess = ts.factory.createPropertyAccessExpression(
          object,
          ts.factory.createIdentifier((memberExpr.property as IR.IRIdentifier).name)
        );
      } else if (memberExpr.property.type === IR.IRNodeType.StringLiteral) {
        const propValue = (memberExpr.property as IR.IRStringLiteral).value;
        methodAccess = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propValue)
          ? ts.factory.createPropertyAccessExpression(
              object,
              ts.factory.createIdentifier(propValue)
            )
          : ts.factory.createElementAccessExpression(
              object,
              ts.factory.createStringLiteral(propValue)
            );
      } else {
        methodAccess = ts.factory.createElementAccessExpression(
          object,
          convertIRExpr(memberExpr.property)
        );
      }
      return ts.factory.createCallExpression(
        methodAccess,
        undefined,
        node.arguments.map(arg => convertIRExpr(arg))
      );
    }
    const callee = convertIRExpr(node.callee);
    const args = node.arguments.map(arg => convertIRExpr(arg));
    return ts.factory.createCallExpression(callee, undefined, args);
  });
}

export function convertMemberExpression(node: IR.IRMemberExpression): ts.Expression {
  return execute(node, "member expression", () => {
    const object = convertIRExpr(node.object);
    if (node.property.type === IR.IRNodeType.Identifier) {
      return ts.factory.createPropertyAccessExpression(
        object,
        ts.factory.createIdentifier((node.property as IR.IRIdentifier).name)
      );
    } else if (node.property.type === IR.IRNodeType.StringLiteral) {
      const propValue = (node.property as IR.IRStringLiteral).value;
      return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propValue)
        ? ts.factory.createPropertyAccessExpression(object, ts.factory.createIdentifier(propValue))
        : ts.factory.createElementAccessExpression(object, ts.factory.createStringLiteral(propValue));
    } else {
      return ts.factory.createElementAccessExpression(object, convertIRExpr(node.property));
    }
  });
}

export function convertCallMemberExpression(node: IR.IRCallMemberExpression): ts.CallExpression {
  return execute(node, "call member expression", () => {
    let memberExpr: ts.Expression;
    if (node.property.type === IR.IRNodeType.StringLiteral) {
      memberExpr = ts.factory.createPropertyAccessExpression(
        convertIRExpr(node.object),
        ts.factory.createIdentifier((node.property as IR.IRStringLiteral).value)
      );
    } else {
      const property = convertIRExpr(node.property);
      memberExpr = ts.isStringLiteral(property)
        ? ts.factory.createPropertyAccessExpression(
            convertIRExpr(node.object),
            ts.factory.createIdentifier(property.text)
          )
        : ts.isIdentifier(property)
          ? ts.factory.createPropertyAccessExpression(convertIRExpr(node.object), property)
          : ts.factory.createElementAccessExpression(convertIRExpr(node.object), property);
    }
    return ts.factory.createCallExpression(
      memberExpr,
      undefined,
      node.arguments.map(arg => convertIRExpr(arg))
    );
  });
}

export function convertNewExpression(node: IR.IRNewExpression): ts.NewExpression {
  return execute(node, "new expression", () =>
    ts.factory.createNewExpression(convertIRExpr(node.callee), undefined, node.arguments.map(arg => convertIRExpr(arg)))
  );
}

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

export function convertClassDeclaration(node: IR.IRClassDeclaration): ts.ClassDeclaration {
  return execute(node, "class declaration", () => {
    const members: ts.ClassElement[] = [];
    node.fields.forEach(field => {
      try {
        members.push(convertClassField(field));
      } catch (e) {
        logger.error(`Error processing field ${field.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    if (node.constructor) {
      try {
        members.push(convertClassConstructor(node.constructor));
      } catch (e) {
        logger.error(`Error processing constructor: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    node.methods.forEach(method => {
      try {
        members.push(convertClassMethod(method));
      } catch (e) {
        logger.error(`Error processing method ${method.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    logger.debug(`Final class members count: ${members.length}`);
    return ts.factory.createClassDeclaration(
      [],
      ts.factory.createIdentifier(node.id.name),
      undefined,
      undefined,
      members
    );
  });
}

export function convertClassField(node: IR.IRClassField): ts.PropertyDeclaration {
  return execute(node, "class field", () => {
    const nameIdentifier = ts.factory.createIdentifier(node.name);
    const initializer = node.initialValue ? convertIRExpr(node.initialValue) : undefined;
    return ts.factory.createPropertyDeclaration(
      [],
      nameIdentifier,
      undefined,
      undefined,
      initializer
    );
  });
}

export function convertClassConstructor(node: IR.IRClassConstructor): ts.ConstructorDeclaration {
  return execute(node, "class constructor", () => {
    const parameters = node.params.map(param =>
      ts.factory.createParameterDeclaration(undefined, undefined, ts.factory.createIdentifier(param.name))
    );
    const bodyStatements: ts.Statement[] = [];
    if (node.body && node.body.type === IR.IRNodeType.BlockStatement) {
      node.body.body.forEach(stmt => {
        const transformedStmt = replaceSelfWithThis(stmt);
        const tsStmt = convertIRNodeToStatement(transformedStmt);
        if (tsStmt) {
          Array.isArray(tsStmt) ? bodyStatements.push(...tsStmt) : bodyStatements.push(tsStmt);
        }
      });
    }
    if (!hasExplicitReturnThis(bodyStatements)) {
      bodyStatements.push(ts.factory.createReturnStatement(ts.factory.createThis()));
    }
    return ts.factory.createConstructorDeclaration(
      undefined,
      parameters,
      ts.factory.createBlock(bodyStatements, true)
    );
  });
}

function convertClassMethod(node: IR.IRClassMethod): ts.MethodDeclaration {
  return execute(node, "class method", () => {
    const parameters = node.params.map(param => {
      const defaultValue = node.defaults?.find(d => d.name === param.name)
        ? convertIRExpr(node.defaults.find(d => d.name === param.name)!.value)
        : undefined;
      return ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        ts.factory.createIdentifier(param.name),
        undefined,
        undefined,
        defaultValue
      );
    });
    const bodyStatements: ts.Statement[] = [];
    if (node.body && node.body.type === IR.IRNodeType.BlockStatement) {
      node.body.body.forEach((stmt, i) => {
        const transformedStmt = replaceSelfWithThis(stmt);
        const tsStmt = convertIRNodeToStatement(
          i === node.body.body.length - 1 && transformedStmt.type !== IR.IRNodeType.ReturnStatement
            ? { type: IR.IRNodeType.ReturnStatement, argument: transformedStmt } as IR.IRReturnStatement
            : transformedStmt
        );
        if (tsStmt) {
          Array.isArray(tsStmt) ? bodyStatements.push(...tsStmt) : bodyStatements.push(tsStmt);
        }
      });
    }
    if (bodyStatements.length === 0) {
      bodyStatements.push(ts.factory.createReturnStatement(ts.factory.createNull()));
    }
    return ts.factory.createMethodDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(node.name),
      undefined,
      undefined,
      parameters,
      undefined,
      ts.factory.createBlock(bodyStatements, true)
    );
  });
}

function convertIRNodeToStatement(node: IR.IRNode): ts.Statement | ts.Statement[] | null {
  const result = convertIRNode(node);
  if (!result) return null;
  if (Array.isArray(result)) return result;
  if (ts.isStatement(result)) return result;
  if (ts.isExpression(result)) {
    return ts.factory.createExpressionStatement(result);
  }
  logger.warn(`Unexpected result type from convertIRNode: ${result}`);
  return null;
}

function replaceSelfWithThis(node: IR.IRNode): IR.IRNode {
  switch (node.type) {
    case IR.IRNodeType.Identifier: {
      const identNode = node as IR.IRIdentifier;
      return identNode.name === "self"
        ? { ...node, type: IR.IRNodeType.Identifier, name: "this" } as IR.IRIdentifier
        : node;
    }
    case IR.IRNodeType.MemberExpression: {
      const memberExpr = node as IR.IRMemberExpression;
      return {
        ...memberExpr,
        type: IR.IRNodeType.MemberExpression,
        object:
          memberExpr.object.type === IR.IRNodeType.Identifier &&
          (memberExpr.object as IR.IRIdentifier).name === "self"
            ? { type: IR.IRNodeType.Identifier, name: "this" } as IR.IRIdentifier
            : replaceSelfWithThis(memberExpr.object),
        property: replaceSelfWithThis(memberExpr.property),
        computed: memberExpr.computed
      } as IR.IRMemberExpression;
    }
    case IR.IRNodeType.ReturnStatement: {
      const returnStmt = node as IR.IRReturnStatement;
      return {
        ...returnStmt,
        type: IR.IRNodeType.ReturnStatement,
        argument: returnStmt.argument ? replaceSelfWithThis(returnStmt.argument) : null,
      } as IR.IRReturnStatement;
    }
    case IR.IRNodeType.AssignmentExpression: {
      const assignExpr = node as IR.IRAssignmentExpression;
      return {
        ...assignExpr,
        type: IR.IRNodeType.AssignmentExpression,
        left: replaceSelfWithThis(assignExpr.left),
        right: replaceSelfWithThis(assignExpr.right),
        operator: assignExpr.operator
      } as IR.IRAssignmentExpression;
    }
    case IR.IRNodeType.CallExpression: {
      const callExpr = node as IR.IRCallExpression;
      return {
        ...callExpr,
        type: IR.IRNodeType.CallExpression,
        callee: replaceSelfWithThis(callExpr.callee),
        arguments: callExpr.arguments.map((arg: IR.IRNode) => replaceSelfWithThis(arg)),
      } as IR.IRCallExpression;
    }
    case IR.IRNodeType.BlockStatement: {
      const blockStmt = node as IR.IRBlockStatement;
      return {
        ...blockStmt,
        type: IR.IRNodeType.BlockStatement,
        body: blockStmt.body.map((stmt: IR.IRNode) => replaceSelfWithThis(stmt)),
      } as IR.IRBlockStatement;
    }
    default: {
      return node;
    }
  }
}

function hasExplicitReturnThis(statements: ts.Statement[]): boolean {
  return statements.some(
    stmt =>
      ts.isReturnStatement(stmt) &&
      stmt.expression &&
      ts.isExpression(stmt.expression)
  );
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