// src/transpiler/syntax/function.ts

import * as ts from "npm:typescript";
import * as IR from "../type/hql_ir.ts";
import { ListNode, SymbolNode, HQLNode } from "../type/hql_ast.ts";
import { TransformError, ValidationError, perform } from "../../common/error.ts";
import { sanitizeIdentifier } from "../../common/utils.ts";
import { globalLogger as logger } from "../../logger.ts";
import { registerPureFunction, verifyFunctionPurity } from "../fx/purity.ts";
import { isValidType } from "../fx/purity.ts";
import { execute, convertIdentifier, convertBlockStatement, convertIRExpr } from "../pipeline/hql-ir-to-ts-ast.ts";
import { transformNode } from "../pipeline/hql-ast-to-hql-ir.ts";
import { SourceLocation } from "../../common/error.ts";

const fnFunctionRegistry = new Map<string, IR.IRFnFunctionDeclaration>();
const fxFunctionRegistry = new Map<string, IR.IRFxFunctionDeclaration>();

/**
 * Check if a function call has named arguments
 */
export function hasNamedArguments(list: ListNode): boolean {
  // Special case: if this is an enum declaration, it shouldn't be treated as named arguments
  if (list.elements.length > 0 && 
      list.elements[0].type === "symbol" && 
      (list.elements[0] as SymbolNode).name === "enum") {
    return false;
  }
  
  for (let i = 1; i < list.elements.length; i++) {
    const elem = list.elements[i];
    if (elem.type === "symbol" && (elem as SymbolNode).name.endsWith(":")) {
      return true;
    }
  }
  return false;
}

/**
 * Transform a function call with named arguments (param: value)
 */
export function transformNamedArgumentCall(
  list: ListNode,
  currentDir: string,
): IR.IRNode {
  try {
    const functionName = (list.elements[0] as SymbolNode).name;

    // Check if this is an fx or fn function
    const fxDef = getFxFunction(functionName);
    const fnDef = getFnFunction(functionName);

    // If it's a registered function, use the specialized processor
    if (fxDef) {
      // Process named arguments for fx functions
      return processNamedArgumentsForFx(
        functionName,
        fxDef,
        list.elements.slice(1),
        currentDir,
        transformNode,
      );
    } else if (fnDef) {
      // Process named arguments for fn functions
      return processNamedArgumentsForFn(
        functionName,
        fnDef,
        list.elements.slice(1),
        currentDir,
        transformNode,
      );
    }

    // Default handling for functions without registry entries
    return transformGenericNamedArguments(list, functionName, currentDir);
  } catch (error) {
    throw new TransformError(
      `Failed to transform named argument call: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "named argument function call",
      "transformation",
      list,
    );
  }
}

/**
 * Handle registered fx function calls
 */
export function handleFxFunctionCall(list: ListNode, op: string, fxDef: IR.IRFxFunctionDeclaration, currentDir: string): IR.IRNode {
  logger.debug(`Processing call to fx function ${op}`);

  // Check if we have any placeholder symbols in the arguments
  const hasPlaceholders = list.elements.slice(1).some(isPlaceholder);

  // If we have placeholders or named arguments, use our specialized processor
  if (hasPlaceholders || hasNamedArguments(list)) {
    return processFxFunctionCall(
      op,
      fxDef,
      list.elements.slice(1),
      currentDir,
      transformNode,
    );
  }

  // Otherwise use the standard function call transformation
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(op),
    },
    arguments: list.elements.slice(1).map((arg) => {
      const transformed = transformNode(arg, currentDir);
      if (!transformed) {
        throw new ValidationError(
          `Argument transformed to null in call to ${op}`,
          "function call",
          "valid expression",
          "null",
        );
      }
      return transformed;
    }),
  } as IR.IRCallExpression;
}


/**
 * Process function body expressions, creating return statements
 */
export function processFunctionBody(
  bodyExprs: HQLNode[],
  currentDir: string,
): IR.IRNode[] {
  return perform(
    () => {
      const bodyNodes: IR.IRNode[] = [];

      // Check if there are any expressions
      if (bodyExprs.length === 0) {
        return bodyNodes;
      }

      // Process all expressions except the last one
      for (let i = 0; i < bodyExprs.length - 1; i++) {
        const expr = transformNode(bodyExprs[i], currentDir);
        if (expr) bodyNodes.push(expr);
      }

      // Process the last expression specially - wrap it in a return statement
      const lastExpr = transformNode(
        bodyExprs[bodyExprs.length - 1],
        currentDir,
      );
      
      if (lastExpr) {
        // If it's already a return statement, use it as is
        if (lastExpr.type === IR.IRNodeType.ReturnStatement) {
          bodyNodes.push(lastExpr);
        } else {
          // Wrap in a return statement to ensure the value is returned
          bodyNodes.push({
            type: IR.IRNodeType.ReturnStatement,
            argument: lastExpr,
          } as IR.IRReturnStatement);
        }
      }

      return bodyNodes;
    },
    "processFunctionBody",
    TransformError,
    [bodyExprs],
  );
}

export function transformStandardFunctionCall(
  list: ListNode,
  currentDir: string,
): IR.IRNode {
  return perform(
    () => {
      const first = list.elements[0];

      if (first.type === "symbol") {
        const op = (first as SymbolNode).name;

        // Check if we're calling an fx function
        const fxDef = getFxFunction(op);

        // Check if we have any named arguments
        const hasNamed = hasNamedArguments(list);

        if (fxDef && hasNamed) {
          // We found an fx function with named arguments
          logger.debug(
            `Processing call to fx function ${op} with named arguments`,
          );
          return transformNamedArgumentCall(list, currentDir);
        } else if (fxDef) {
          // Process as a regular call to an fx function with positional args
          logger.debug(
            `Processing call to fx function ${op} with positional arguments`,
          );
          return processFxFunctionCall(
            op,
            fxDef,
            list.elements.slice(1),
            currentDir,
            transformNode,
          );
        } else if (hasNamed) {
          // Handle named arguments for regular functions
          logger.debug(
            `Processing call to function ${op} with named arguments`,
          );
          return transformNamedArgumentCall(list, currentDir);
        }

        // Handle regular positional args call
        logger.debug(`Processing standard function call to ${op}`);
        const args = list.elements.slice(1).map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Function argument transformed to null: ${JSON.stringify(arg)}`,
              "function argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });

        return {
          type: IR.IRNodeType.CallExpression,
          callee: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(op),
          } as IR.IRIdentifier,
          arguments: args,
        } as IR.IRCallExpression;
      }

      // Handle function expression calls
      const callee = transformNode(list.elements[0], currentDir);
      if (!callee) {
        throw new ValidationError(
          "Function callee transformed to null",
          "function call",
          "valid function expression",
          "null",
        );
      }

      const args = list.elements.slice(1).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Function argument transformed to null: ${JSON.stringify(arg)}`,
            "function argument",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.CallExpression,
        callee,
        arguments: args,
      } as IR.IRCallExpression;
    },
    "transformStandardFunctionCall",
    TransformError,
    [list],
  );
}

/**
 * Get an fn function from the registry
 */
export function getFnFunction(name: string): IR.IRFnFunctionDeclaration | undefined {
  return fnFunctionRegistry.get(name);
}

/**
 * Get an fx function from the registry
 */
export function getFxFunction(name: string): IR.IRFxFunctionDeclaration | undefined {
  return fxFunctionRegistry.get(name);
}

export function convertFunctionExpression(node: IR.IRFunctionExpression): ts.FunctionExpression {
  return execute(node, "function expression", () => {
    const parameters = node.params.map(param =>
      param.name.startsWith("...")
        ? ts.factory.createParameterDeclaration(
            undefined,
            ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
            ts.factory.createIdentifier(param.name.slice(3))
          )
        : ts.factory.createParameterDeclaration(undefined, undefined, convertIdentifier(param))
    );
    return ts.factory.createFunctionExpression(
      undefined,
      undefined,
      undefined,
      undefined,
      parameters,
      undefined,
      convertBlockStatement(node.body)
    );
  });
}

export function convertFnFunctionDeclaration(
  node: IR.IRFnFunctionDeclaration,
): ts.FunctionDeclaration {
  return execute(node, "fn function declaration", () => {
    // Map parameter names, properly handling rest parameters
    const parameters = node.params.map(param => {
      const paramName = param.name;
      
      // Check if this is a rest parameter (starts with "...")
      if (paramName.startsWith("...")) {
        return ts.factory.createParameterDeclaration(
          undefined,
          ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
          ts.factory.createIdentifier(paramName.slice(3)) // Remove "..." prefix
        );
      }
      
      // Regular parameter
      return ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        ts.factory.createIdentifier(paramName)
      );
    });
    
    // Create the function declaration with body and parameters
    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      convertIdentifier(node.id),
      undefined,
      parameters,
      undefined,
      convertBlockStatement(node.body)
    );
  });
}

export function convertFxFunctionDeclaration(
  node: IR.IRFxFunctionDeclaration
): ts.FunctionDeclaration {
  return execute(node, "fx function declaration", () => {
    const defaultValues = new Map(
      node.defaults.map(d => [d.name, convertIRExpr(d.value)])
    );
    const parameters = [
      ts.factory.createParameterDeclaration(
        undefined,
        ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
        ts.factory.createIdentifier("args")
      ),
    ];
    const bodyStatements: ts.Statement[] = [];
    for (const param of node.params) {
      const defaultExpr: ts.Expression =
        defaultValues.get(param.name) ||
        (() => {
          const paramType = node.paramTypes.find(pt => pt.name === param.name)?.type;
          if (paramType === "Int" || paramType === "Double") return ts.factory.createNumericLiteral("0");
          if (paramType === "String") return ts.factory.createStringLiteral("");
          if (paramType === "Bool") return ts.factory.createFalse();
          return ts.factory.createIdentifier("undefined");
        })();
      bodyStatements.push(
        ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [ts.factory.createVariableDeclaration(
              convertIdentifier(param),
              undefined,
              undefined,
              defaultExpr
            )],
            ts.NodeFlags.Let
          )
        )
      );
    }
    if (node.params.length > 0) {
      bodyStatements.push(
        ts.factory.createIfStatement(
          ts.factory.createBinaryExpression(
            ts.factory.createBinaryExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createIdentifier("length")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  ts.factory.createNumericLiteral("1")
                ),
                ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                ts.factory.createBinaryExpression(
                  ts.factory.createTypeOfExpression(
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier("args"),
                      ts.factory.createNumericLiteral("0")
                    )
                  ),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  ts.factory.createStringLiteral("object")
                )
              ),
              ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
              ts.factory.createBinaryExpression(
                ts.factory.createElementAccessExpression(
                  ts.factory.createIdentifier("args"),
                  ts.factory.createNumericLiteral("0")
                ),
                ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                ts.factory.createNull()
              )
            ),
            ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
            ts.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.ExclamationToken,
              ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier("Array"),
                  ts.factory.createIdentifier("isArray")
                ),
                undefined,
                [
                  ts.factory.createElementAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createNumericLiteral("0")
                  )
                ]
              )
            )
          ),
          ts.factory.createBlock([
            ...node.params.map(param =>
              ts.factory.createIfStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createElementAccessExpression(
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier("args"),
                      ts.factory.createNumericLiteral("0")
                    ),
                    ts.factory.createStringLiteral(param.name)
                  ),
                  ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                  ts.factory.createIdentifier("undefined")
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    convertIdentifier(param),
                    ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                    ts.factory.createElementAccessExpression(
                      ts.factory.createElementAccessExpression(
                        ts.factory.createIdentifier("args"),
                        ts.factory.createNumericLiteral("0")
                      ),
                      ts.factory.createStringLiteral(param.name)
                    )
                  )
                )
              )
            ),
            ts.factory.createIfStatement(
              ts.factory.createBinaryExpression(
                ts.factory.createBinaryExpression(
                  convertIdentifier(node.params[0]),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  defaultValues.get(node.params[0].name) || ts.factory.createIdentifier("undefined")
                ),
                ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createIdentifier("length")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.GreaterThanToken),
                  ts.factory.createNumericLiteral("0")
                )
              ),
              ts.factory.createExpressionStatement(
                ts.factory.createBinaryExpression(
                  convertIdentifier(node.params[0]),
                  ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                  ts.factory.createElementAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createNumericLiteral("0")
                  )
                )
              )
            )
          ], true),
          ts.factory.createBlock(
            node.params.map((param, index) =>
              ts.factory.createIfStatement(
                ts.factory.createBinaryExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier("args"),
                    ts.factory.createIdentifier("length")
                  ),
                  ts.factory.createToken(ts.SyntaxKind.GreaterThanToken),
                  ts.factory.createNumericLiteral(index.toString())
                ),
                ts.factory.createExpressionStatement(
                  ts.factory.createBinaryExpression(
                    convertIdentifier(param),
                    ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                    ts.factory.createElementAccessExpression(
                      ts.factory.createIdentifier("args"),
                      ts.factory.createNumericLiteral(index.toString())
                    )
                  )
                )
              )
            ),
            true
          )
        )
      );
    }
    for (const param of node.params) {
      bodyStatements.push(
        ts.factory.createExpressionStatement(
          ts.factory.createBinaryExpression(
            convertIdentifier(param),
            ts.factory.createToken(ts.SyntaxKind.EqualsToken),
            ts.factory.createConditionalExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createBinaryExpression(
                  ts.factory.createTypeOfExpression(convertIdentifier(param)),
                  ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                  ts.factory.createStringLiteral("object")
                ),
                ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                ts.factory.createBinaryExpression(
                  convertIdentifier(param),
                  ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                  ts.factory.createNull()
                )
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier("JSON"),
                  ts.factory.createIdentifier("parse")
                ),
                undefined,
                [
                  ts.factory.createCallExpression(
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier("JSON"),
                      ts.factory.createIdentifier("stringify")
                    ),
                    undefined,
                    [convertIdentifier(param)]
                  )
                ]
              ),
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              convertIdentifier(param)
            )
          )
        )
      );
    }
    const bodyBlock = convertBlockStatement(node.body);
    for (const statement of bodyBlock.statements) {
      bodyStatements.push(statement);
    }
    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      convertIdentifier(node.id),
      undefined,
      parameters,
      undefined,
      ts.factory.createBlock(bodyStatements, true)
    );
  });
}

export function convertFunctionDeclaration(node: IR.IRFunctionDeclaration): ts.FunctionDeclaration {
  return execute(node, "function declaration", () => {
    const params = node.params.map(param =>
      ts.factory.createParameterDeclaration(undefined, undefined, convertIdentifier(param))
    );
    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      convertIdentifier(node.id),
      undefined,
      params,
      undefined,
      convertBlockStatement(node.body)
    );
  });
}

/**
 * Transform an fn function declaration.
 * Format: (fn name (param1 = default1 param2) body...)
 */
export function transformFn(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
  processFunctionBody: (body: any[], dir: string) => IR.IRNode[]
): IR.IRNode {
  try {
    logger.debug("Transforming fn function");

    // Validate fn syntax
    if (list.elements.length < 3) {
      throw new ValidationError(
        "fn requires a name, parameter list, and at least one body expression",
        "fn definition",
        "name, params, body",
        `${list.elements.length - 1} arguments`,
      );
    }

    // Extract function name
    const nameNode = list.elements[1];
    if (nameNode.type !== "symbol") {
      throw new ValidationError(
        "Function name must be a symbol",
        "fn name",
        "symbol",
        nameNode.type,
      );
    }
    const funcName = (nameNode as SymbolNode).name;

    // Extract parameter list
    const paramListNode = list.elements[2];
    if (paramListNode.type !== "list") {
      throw new ValidationError(
        "fn parameter list must be a list",
        "fn parameters",
        "list",
        paramListNode.type,
      );
    }
    const paramList = paramListNode as ListNode;

    // Check if this is a typed fn with a return type
    let bodyStartIndex = 3;
    let hasReturnType = false;

    // Check if the next element is a return type list starting with ->
    if (list.elements.length > 3 && 
        list.elements[3].type === "list" && 
        (list.elements[3] as ListNode).elements.length > 0 &&
        (list.elements[3] as ListNode).elements[0].type === "symbol" &&
        ((list.elements[3] as ListNode).elements[0] as SymbolNode).name === "->") {
      hasReturnType = true;
      bodyStartIndex = 4;
    }

    // Body expressions start after either the parameter list or return type
    const bodyExpressions = list.elements.slice(bodyStartIndex);

    // Parse parameters with types and defaults
    const paramsInfo = hasReturnType 
      ? parseParametersWithTypes(paramList, currentDir, transformNode)  // For typed fn
      : parseParametersWithDefaults(paramList, currentDir, transformNode);  // For untyped fn

    // Extract params and defaults
    const params = paramsInfo.params;
    const defaultValues = paramsInfo.defaults;

    // Process the body expressions
    const bodyNodes = processFunctionBody(bodyExpressions, currentDir);

    // Create the FnFunctionDeclaration node
    const fnFuncDecl = {
      type: IR.IRNodeType.FnFunctionDeclaration,
      id: {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(funcName),
      },
      params,
      defaults: Array.from(defaultValues.entries()).map(([name, value]) => ({
        name,
        value,
      })),
      body: {
        type: IR.IRNodeType.BlockStatement,
        body: bodyNodes,
      },
    } as IR.IRFnFunctionDeclaration;

    // Register this function in our registry for call site handling
    registerFnFunction(funcName, fnFuncDecl);
    return fnFuncDecl;
  } catch (error) {
    throw new TransformError(
      `Failed to transform fn function: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "fn function",
      "transformation",
      list,
    );
  }
}

/**
 * Transform an fx function declaration
 */
export function transformFx(
  list: ListNode, 
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
  processFunctionBody: (body: any[], dir: string) => IR.IRNode[]
): IR.IRNode {
  try {
    logger.debug("Transforming fx function");

    // Validate the fx syntax
    if (list.elements.length < 4) {
      throw new ValidationError(
        "fx requires a name, parameter list, return type list, and at least one body expression",
        "fx definition",
        "name, params, return type, body",
        `${list.elements.length - 1} arguments`,
      );
    }

    // Extract function name
    const nameNode = list.elements[1];
    if (nameNode.type !== "symbol") {
      throw new ValidationError(
        "Function name must be a symbol",
        "fx name",
        "symbol",
        nameNode.type,
      );
    }
    const funcName = (nameNode as SymbolNode).name;

    // Extract parameter list
    const paramListNode = list.elements[2];
    if (paramListNode.type !== "list") {
      throw new ValidationError(
        "fx parameter list must be a list",
        "fx parameters",
        "list",
        paramListNode.type,
      );
    }
    const paramList = paramListNode as ListNode;

    // Extract return type list: (-> Type)
    const returnTypeNode = list.elements[3];
    if (
      returnTypeNode.type !== "list" ||
      (returnTypeNode as ListNode).elements.length < 2 ||
      (returnTypeNode as ListNode).elements[0].type !== "symbol" ||
      ((returnTypeNode as ListNode).elements[0] as SymbolNode).name !== "->"
    ) {
      throw new ValidationError(
        "fx return type must be a list starting with -> followed by a type",
        "fx return type",
        "(-> Type)",
        returnTypeNode.type,
      );
    }

    const returnTypeList = returnTypeNode as ListNode;
    let returnType = "Any"; // Default if no type specified

    // Process the return type, handling array types
    if (returnTypeList.elements.length >= 2) {
      const typeNode = returnTypeList.elements[1];
      
      // Handle array type notation: [ElementType]
      if (typeNode.type === "list" && (typeNode as ListNode).elements.length === 1) {
        const innerTypeNode = (typeNode as ListNode).elements[0];
        if (innerTypeNode.type === "symbol") {
          returnType = `Array<${(innerTypeNode as SymbolNode).name}>`;
        } else {
          returnType = "Array";
        }
      } 
      // Regular type
      else if (typeNode.type === "symbol") {
        returnType = (typeNode as SymbolNode).name;
      }
    }
    
    // Body expressions start from index 4
    const bodyOffset = 4;
    const bodyExpressions = list.elements.slice(bodyOffset);

    // Parse parameters with types and defaults
    const paramsInfo = parseParametersWithTypes(paramList, currentDir, transformNode);

    // Extract params and body
    const params = paramsInfo.params;
    const paramTypes = paramsInfo.types;
    const defaultValues = paramsInfo.defaults;

    // Check that all parameter types are supported
    for (const [paramName, paramType] of paramTypes.entries()) {
      // Accept all types now, including array types and enums
      if (!isValidType(paramType)) {
        logger.warn(`Parameter ${paramName} has unusual type: ${paramType}`);
      }
    }

    // Extract raw parameter symbols for purity verification
    const rawParams = extractRawParams(paramList);

    // Verify function purity using our purity verification system
    verifyFunctionPurity(funcName, rawParams, bodyExpressions);

    // Process the body expressions like a regular function
    const bodyNodes = processFunctionBody(bodyExpressions, currentDir);

    // Generate parameter copy statements
    const paramCopyStatements = generateParameterCopies(params);

    // Register as pure function
    registerPureFunction(funcName);

    // Create the FxFunctionDeclaration node
    const fxFuncDecl = {
      type: IR.IRNodeType.FxFunctionDeclaration,
      id: {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(funcName),
      },
      params,
      defaults: Array.from(defaultValues.entries()).map(([name, value]) => ({
        name,
        value,
      })),
      paramTypes: Array.from(paramTypes.entries()).map(([name, type]) => ({
        name,
        type,
      })),
      returnType,
      body: {
        type: IR.IRNodeType.BlockStatement,
        body: [...paramCopyStatements, ...bodyNodes],
      },
    } as IR.IRFxFunctionDeclaration;

    // Register this function in our registry for call site handling
    registerFxFunction(funcName, fxFuncDecl);
    return fxFuncDecl;
  } catch (error) {
    throw new TransformError(
      `Failed to transform fx function: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "fx function",
      "transformation",
      list,
    );
  }
}

// Enhancements to core/src/transpiler/syntax/function.ts
// Adding better error location tracking and reporting

/**
 * Process and transform a call to an fn function.
 * Handles both positional and named arguments.
 * Now with enhanced error reporting.
 */
export function processFnFunctionCall(
  funcName: string,
  funcDef: IR.IRFnFunctionDeclaration,
  args: any[],
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
): IR.IRNode {
  try {
    // Extract parameter info from the function definition
    const paramNames = funcDef.params.map((p) => p.name);
    const defaultValues = new Map(funcDef.defaults.map((d) => [d.name, d.value]));

    // Check if we have a rest parameter (name starts with "...")
    const hasRestParam = paramNames.length > 0 &&
      paramNames[paramNames.length - 1].startsWith("...");

    // Get the regular parameters (all except the last one if it's a rest parameter)
    const regularParamNames = hasRestParam ? paramNames.slice(0, -1) : paramNames;

    // Check if we have any named arguments or placeholders
    const hasNamedArgs = args.some(arg => 
      arg.type === "symbol" && (arg as SymbolNode).name.endsWith(":")
    );

    // If we have named arguments, process them differently
    if (hasNamedArgs) {
      return processNamedArguments(funcName, funcDef, args, currentDir, transformNode);
    }
    
    // Process normal positional arguments
    const finalArgs: IR.IRNode[] = [];

    // Process each parameter in the function definition
    for (let i = 0; i < regularParamNames.length; i++) {
      const paramName = regularParamNames[i];

      if (i < args.length) {
        const arg = args[i];

        // If this argument is a placeholder, use default
        if (isPlaceholder(arg)) {
          if (defaultValues.has(paramName)) {
            finalArgs.push(defaultValues.get(paramName)!);
          } else {
            // Enhanced error message with more context
            throw new ValidationError(
              `Placeholder used for parameter '${paramName}' but no default value is defined`,
              "function call with placeholder",
              "parameter with default value",
              "parameter without default",
              extractSourceLocation(arg) // Extract source location from the argument
            );
          }
        } else {
          // Normal argument, transform it
          const transformedArg = transformNode(arg, currentDir);
          if (!transformedArg) {
            throw new ValidationError(
              `Argument for parameter '${paramName}' transformed to null`,
              "function call",
              "valid expression",
              "null",
              extractSourceLocation(arg) // Extract source location from the argument
            );
          }
          finalArgs.push(transformedArg);
        }
      } else if (defaultValues.has(paramName)) {
        // Use default value for missing arguments
        finalArgs.push(defaultValues.get(paramName)!);
      } else {
        // Enhanced error message with the actual function name and parameter
        throw new ValidationError(
          `Missing required argument for parameter '${paramName}' in call to function '${funcName}'`,
          "function call",
          `required parameter '${paramName}'`,
          "missing argument",
          getCallLocation(args) // Get the call location from the arguments list
        );
      }
    }

    // If we have a rest parameter, add all remaining arguments
    if (hasRestParam) {
      const restArgStartIndex = regularParamNames.length;
      for (let i = restArgStartIndex; i < args.length; i++) {
        const arg = args[i];
        const transformedArg = transformNode(arg, currentDir);
        if (transformedArg) {
          finalArgs.push(transformedArg);
        }
      }
    } else if (args.length > paramNames.length) {
      // Too many arguments without a rest parameter - Enhanced error with more context
      // Get the extra arguments to show in the error message
      const extraArgs = args.slice(paramNames.length);
      const extraArgStr = extraArgs.map(arg => {
        if (arg.type === "symbol") return `'${(arg as SymbolNode).name}'`;
        if (arg.type === "literal") return `'${(arg as LiteralNode).value}'`;
        return `[${arg.type}]`;
      }).join(", ");
      
      // Create an improved error with detailed information
      throw new ValidationError(
        `Too many arguments in call to function '${funcName}'. Expected ${paramNames.length} ${paramNames.length === 1 ? 'argument' : 'arguments'}, but got ${args.length}. Extra arguments: ${extraArgStr}`,
        "function call",
        `${paramNames.length} ${paramNames.length === 1 ? 'argument' : 'arguments'}`,
        `${args.length} arguments`,
        getExtraArgumentLocation(args, paramNames.length) // Get the location of the first extra argument
      );
    }

    // Create the final call expression
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(funcName),
      },
      arguments: finalArgs,
    } as IR.IRCallExpression;
  } catch (error) {
    // If this is already a ValidationError with location info, don't wrap it
    if (error instanceof ValidationError && error.sourceLocation && 
        (error.sourceLocation.filePath || error.sourceLocation.line)) {
      throw error;
    }
    
    // Otherwise enhance the error with location info
    throw new TransformError(
      `Failed to process function call to '${funcName}': ${
        error instanceof Error ? error.message : String(error)
      }`,
      "function call processing",
      getCallLocation(args) // Get the call location
    );
  }
}

/**
 * Helper function to extract source location from a node
 */
function extractSourceLocation(node: any): SourceLocation {
  // Default empty location
  const location: SourceLocation = {
    filePath: "",
  };
  
  // If the node has _meta information, extract it
  if (node && node._meta) {
    location.filePath = node._meta.filePath || "";
    location.line = node._meta.line;
    location.column = node._meta.column;
  }
  
  return location;
}

/**
 * Helper function to get the location of a function call from its arguments
 */
function getCallLocation(args: any[]): SourceLocation {
  // Default empty location
  const location: SourceLocation = {
    filePath: "",
  };
  
  // Try to get location from the first argument
  if (args && args.length > 0) {
    const firstArg = args[0];
    if (firstArg && firstArg._meta) {
      location.filePath = firstArg._meta.filePath || "";
      location.line = firstArg._meta.line;
      location.column = firstArg._meta.column;
    }
  }
  
  return location;
}

/**
 * Helper function to get the location of an extra argument in a function call
 */
function getExtraArgumentLocation(args: any[], paramCount: number): SourceLocation {
  // Default empty location
  const location: SourceLocation = {
    filePath: "",
  };
  
  // Get the first extra argument's location if it exists
  if (args && args.length > paramCount) {
    const extraArg = args[paramCount]; // First extra argument
    if (extraArg && extraArg._meta) {
      location.filePath = extraArg._meta.filePath || "";
      location.line = extraArg._meta.line;
      location.column = extraArg._meta.column;
    }
  } else if (args && args.length > 0) {
    // Fallback to getting location from the first argument
    return getCallLocation(args);
  }
  
  return location;
}

/**
 * Process named arguments for a function call
 */
function processNamedArguments(
  funcName: string,
  funcDef: IR.IRFnFunctionDeclaration,
  args: any[],
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
): IR.IRNode {
  try {
    // Extract parameter info from the function definition
    const paramNames = funcDef.params.map((p) => p.name);
    const defaultValues = new Map(funcDef.defaults.map((d) => [d.name, d.value]));
    
    // Create a map to store provided named arguments
    const providedArgs = new Map<string, IR.IRNode>();
    
    // Process the arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      // Check if this is a named argument
      if (arg.type === "symbol" && (arg as SymbolNode).name.endsWith(":")) {
        // Extract parameter name (without colon)
        const paramName = (arg as SymbolNode).name.slice(0, -1);
        
        // Check if this parameter exists
        if (!paramNames.includes(paramName)) {
          throw new ValidationError(
            `Unknown parameter '${paramName}' in call to function '${funcName}'`,
            "function call",
            "valid parameter name",
            paramName,
          );
        }
        
        // Ensure we have a value
        if (i + 1 >= args.length) {
          throw new ValidationError(
            `Named argument '${paramName}:' requires a value`,
            "named argument",
            "value",
            "missing value",
          );
        }
        
        // Get and transform the value
        const valueNode = args[++i];
        
        // Handle placeholder
        if (isPlaceholder(valueNode)) {
          if (defaultValues.has(paramName)) {
            providedArgs.set(paramName, defaultValues.get(paramName)!);
          } else {
            throw new ValidationError(
              `Placeholder used for parameter '${paramName}' but no default value is defined`,
              "function call with placeholder",
              "parameter with default value",
              "parameter without default",
            );
          }
        } else {
          // Normal value
          const transformedValue = transformNode(valueNode, currentDir);
          if (!transformedValue) {
            throw new ValidationError(
              `Value for named argument '${paramName}:' transformed to null`,
              "named argument value",
              "valid expression",
              "null",
            );
          }
          providedArgs.set(paramName, transformedValue);
        }
      } else {
        throw new ValidationError(
          "Mixed positional and named arguments are not allowed",
          "function call",
          "all named or all positional arguments",
          "mixed arguments",
        );
      }
    }
    
    // Create the final argument list in the correct parameter order
    const finalArgs: IR.IRNode[] = [];
    
    // Add arguments in the order defined in the function
    for (const paramName of paramNames) {
      // Skip rest parameter - not applicable for named arguments
      if (paramName.startsWith("...")) continue;
      
      if (providedArgs.has(paramName)) {
        // Use the provided value
        finalArgs.push(providedArgs.get(paramName)!);
      } else if (defaultValues.has(paramName)) {
        // Use the default value
        finalArgs.push(defaultValues.get(paramName)!);
      } else {
        throw new ValidationError(
          `Missing required argument for parameter '${paramName}' in call to function '${funcName}'`,
          "function call",
          "argument value",
          "missing argument",
        );
      }
    }
    
    // Create the final call expression
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(funcName),
      },
      arguments: finalArgs,
    } as IR.IRCallExpression;
  } catch (error) {
    throw new TransformError(
      `Failed to process named arguments: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "named arguments",
      "transformation",
      args,
    );
  }
}

/**
 * Process and transform a call to an fx function.
 * Handles both positional and named arguments.
 */
function processFxFunctionCall(
  funcName: string,
  funcDef: IR.IRFxFunctionDeclaration,
  args: any[],
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
): IR.IRNode {
  // Extract parameter info from the function definition
  const paramNames = funcDef.params.map((p) => p.name);
  const defaultValues = new Map(funcDef.defaults.map((d) => [d.name, d.value]));

  // Process normal positional arguments
  const positionalArgs: any[] = args;

  // Prepare the final argument list in the correct parameter order
  const finalArgs: IR.IRNode[] = [];

  // Process each parameter in the function definition
  for (let i = 0; i < paramNames.length; i++) {
    const paramName = paramNames[i];

    if (i < positionalArgs.length) {
      const arg = positionalArgs[i];

      // If this argument is a placeholder, use default
      if (isPlaceholder(arg)) {
        if (defaultValues.has(paramName)) {
          finalArgs.push(defaultValues.get(paramName)!);
        } else {
          throw new ValidationError(
            `Placeholder used for parameter '${paramName}' but no default value is defined`,
            "function call with placeholder",
            "parameter with default value",
            "parameter without default",
          );
        }
      } else {
        // Normal argument, transform it
        const transformedArg = transformNode(arg, currentDir);
        if (!transformedArg) {
          throw new ValidationError(
            `Argument for parameter '${paramName}' transformed to null`,
            "function call",
            "valid expression",
            "null",
          );
        }
        finalArgs.push(transformedArg);
      }
    } else if (defaultValues.has(paramName)) {
      // Use default value for missing arguments
      finalArgs.push(defaultValues.get(paramName)!);
    } else {
      throw new ValidationError(
        `Missing required argument for parameter '${paramName}' in call to function '${funcName}'`,
        "function call",
        "argument value",
        "missing argument",
      );
    }
  }

  // Check for extra positional arguments
  if (positionalArgs.length > paramNames.length) {
    throw new ValidationError(
      `Too many positional arguments in call to function '${funcName}'`,
      "function call",
      `${paramNames.length} arguments`,
      `${positionalArgs.length} arguments`,
    );
  }

  // Create the final call expression
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(funcName),
    },
    arguments: finalArgs,
  } as IR.IRCallExpression;
}

/**
 * Check if a node is a placeholder (_) symbol
 */
function isPlaceholder(node: any): boolean {
  return node.type === "symbol" && (node as SymbolNode).name === "_";
}

/**
 * Process named arguments for an fx function
 */
function processNamedArgumentsForFx(
  funcName: string,
  funcDef: IR.IRFxFunctionDeclaration,
  args: any[],
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
): IR.IRNode {
  // Extract parameter info
  const paramNames = funcDef.params.map((p) => p.name);
  const defaultValues = new Map(funcDef.defaults.map((d) => [d.name, d.value]));

  // Create a map to track which parameters have been provided
  const providedParams = new Map<string, IR.IRNode>();

  // Process named arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Check if it's a named argument (param: value)
    if (arg.type === "symbol" && (arg as SymbolNode).name.endsWith(":")) {
      // Get parameter name without colon
      const paramName = (arg as SymbolNode).name.slice(0, -1);

      // Ensure the parameter exists in the function definition
      if (!paramNames.includes(paramName)) {
        throw new ValidationError(
          `Unknown parameter '${paramName}' in call to function '${funcName}'`,
          "function call",
          "valid parameter name",
          paramName,
        );
      }

      // Ensure a value follows
      if (i + 1 >= args.length) {
        throw new ValidationError(
          `Named argument '${paramName}:' requires a value`,
          "named argument",
          "value",
          "missing value",
        );
      }

      // Transform the value
      const valueNode = transformNode(args[i + 1], currentDir);
      if (!valueNode) {
        throw new ValidationError(
          `Value for named argument '${paramName}:' transformed to null`,
          "named argument value",
          "valid expression",
          "null",
        );
      }

      // Add to provided parameters
      providedParams.set(paramName, valueNode);

      // Skip the value
      i++;
    } else {
      throw new ValidationError(
        "Mixed positional and named arguments are not allowed",
        "function call",
        "all named or all positional arguments",
        "mixed arguments",
      );
    }
  }

  // Prepare the final argument list in the correct parameter order
  const finalArgs: IR.IRNode[] = [];

  // Add arguments in the order defined in the function
  for (const paramName of paramNames) {
    if (providedParams.has(paramName)) {
      // Use the provided value
      finalArgs.push(providedParams.get(paramName)!);
    } else if (defaultValues.has(paramName)) {
      // Use the default value
      finalArgs.push(defaultValues.get(paramName)!);
    } else {
      throw new ValidationError(
        `Missing required argument for parameter '${paramName}' in call to function '${funcName}'`,
        "function call",
        "argument value",
        "missing argument",
      );
    }
  }

  // Create the final call expression
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(funcName),
    },
    arguments: finalArgs,
  } as IR.IRCallExpression;
}

/**
 * Process named arguments for an fn function
 */
function processNamedArgumentsForFn(
  funcName: string,
  funcDef: IR.IRFnFunctionDeclaration,
  args: any[],
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
): IR.IRNode {
  // Extract parameter info
  const paramNames = funcDef.params.map((p) => p.name);
  const defaultValues = new Map(funcDef.defaults.map((d) => [d.name, d.value]));

  // Create a map to track which parameters have been provided
  const providedParams = new Map<string, IR.IRNode>();

  // Process named arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Check if it's a named argument (param: value)
    if (arg.type === "symbol" && (arg as SymbolNode).name.endsWith(":")) {
      // Get parameter name without colon
      const paramName = (arg as SymbolNode).name.slice(0, -1);

      // Ensure the parameter exists in the function definition
      if (!paramNames.includes(paramName)) {
        throw new ValidationError(
          `Unknown parameter '${paramName}' in call to function '${funcName}'`,
          "function call",
          "valid parameter name",
          paramName,
        );
      }

      // Ensure a value follows
      if (i + 1 >= args.length) {
        throw new ValidationError(
          `Named argument '${paramName}:' requires a value`,
          "named argument",
          "value",
          "missing value",
        );
      }

      // Transform the value
      const valueNode = transformNode(args[i + 1], currentDir);
      if (!valueNode) {
        throw new ValidationError(
          `Value for named argument '${paramName}:' transformed to null`,
          "named argument value",
          "valid expression",
          "null",
        );
      }

      // Add to provided parameters
      providedParams.set(paramName, valueNode);

      // Skip the value
      i++;
    } else {
      throw new ValidationError(
        "Mixed positional and named arguments are not allowed",
        "function call",
        "all named or all positional arguments",
        "mixed arguments",
      );
    }
  }

  // Prepare the final argument list in the correct parameter order
  const finalArgs: IR.IRNode[] = [];

  // Add arguments in the order defined in the function
  for (const paramName of paramNames) {
    if (providedParams.has(paramName)) {
      // Use the provided value
      finalArgs.push(providedParams.get(paramName)!);
    } else if (defaultValues.has(paramName)) {
      // Use the default value
      finalArgs.push(defaultValues.get(paramName)!);
    } else {
      throw new ValidationError(
        `Missing required argument for parameter '${paramName}' in call to function '${funcName}'`,
        "function call",
        "argument value",
        "missing argument",
      );
    }
  }

  // Create the final call expression
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(funcName),
    },
    arguments: finalArgs,
  } as IR.IRCallExpression;
}

/**
 * Generate statements to create deep copies of parameters for fx functions
 */
function generateParameterCopies(params: IR.IRIdentifier[]): IR.IRNode[] {
  const statements: IR.IRNode[] = [];

  // For each parameter, create an inline deep copy
  for (const param of params) {
    const paramName = param.name;

    // Create an assignment expression for deep copying the parameter
    const node: IR.IRExpressionStatement = {
      type: IR.IRNodeType.ExpressionStatement,
      expression: {
        type: IR.IRNodeType.AssignmentExpression,
        operator: "=",
        left: {
          type: IR.IRNodeType.Identifier,
          name: paramName,
        },
        right: {
          // Use a conditional expression to only deep copy objects
          type: IR.IRNodeType.ConditionalExpression,
          test: {
            // typeof param === 'object' && param !== null
            type: IR.IRNodeType.BinaryExpression,
            operator: "&&",
            left: {
              type: IR.IRNodeType.BinaryExpression,
              operator: "===",
              left: {
                type: IR.IRNodeType.CallExpression,
                callee: {
                  type: IR.IRNodeType.Identifier,
                  name: "typeof",
                },
                arguments: [
                  {
                    type: IR.IRNodeType.Identifier,
                    name: paramName,
                  },
                ],
              },
              right: {
                type: IR.IRNodeType.StringLiteral,
                value: "object",
              },
            },
            right: {
              type: IR.IRNodeType.BinaryExpression,
              operator: "!==",
              left: {
                type: IR.IRNodeType.Identifier,
                name: paramName,
              },
              right: {
                type: IR.IRNodeType.NullLiteral,
              },
            },
          },
          // If it's an object, use JSON.parse(JSON.stringify()) for deep copying
          consequent: {
            type: IR.IRNodeType.CallExpression,
            callee: {
              type: IR.IRNodeType.MemberExpression,
              object: {
                type: IR.IRNodeType.Identifier,
                name: "JSON",
              },
              property: {
                type: IR.IRNodeType.Identifier,
                name: "parse",
              },
              computed: false,
            },
            arguments: [
              {
                type: IR.IRNodeType.CallExpression,
                callee: {
                  type: IR.IRNodeType.MemberExpression,
                  object: {
                    type: IR.IRNodeType.Identifier,
                    name: "JSON",
                  },
                  property: {
                    type: IR.IRNodeType.Identifier,
                    name: "stringify",
                  },
                  computed: false,
                },
                arguments: [
                  {
                    type: IR.IRNodeType.Identifier,
                    name: paramName,
                  },
                ],
              },
            ],
          },
          // If not an object, return original value
          alternate: {
            type: IR.IRNodeType.Identifier,
            name: paramName,
          },
        },
      },
    } as IR.IRExpressionStatement;
    statements.push(node);
  }

  return statements;
}

/**
 * Handle named arguments for functions without registry entries
 */
function transformGenericNamedArguments(
  list: ListNode,
  functionName: string,
  currentDir: string
): IR.IRNode {
  // Build a single object with all named arguments
  const objProperties: IR.IRObjectProperty[] = [];

  // Process all arguments
  for (let i = 1; i < list.elements.length; i++) {
    const current = list.elements[i];

    // Check if this is a named argument (param: value)
    if (current.type === "symbol" && (current as SymbolNode).name.endsWith(":")) {
      // Get parameter name without colon
      const paramName = (current as SymbolNode).name.slice(0, -1);
      
      // Ensure a value follows
      if (i + 1 >= list.elements.length) {
        throw new ValidationError(
          `Named argument '${paramName}:' requires a value`,
          "named argument",
          "value",
          "missing value",
        );
      }

      // Transform the value
      const valueNode = transformNode(list.elements[i + 1], currentDir);
      if (!valueNode) {
        throw new ValidationError(
          `Value for named argument '${paramName}:' transformed to null`,
          "named argument value",
          "valid expression",
          "null",
        );
      }

      // Add as a property to the argument object
      objProperties.push({
        type: IR.IRNodeType.ObjectProperty,
        key: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(paramName),
        } as IR.IRIdentifier,
        value: valueNode,
      });

      i++; // Skip the value
    } else {
      throw new ValidationError(
        "Mixed positional and named arguments are not allowed",
        "function call",
        "all named or all positional arguments",
        "mixed arguments",
      );
    }
  }

  // Create an object with all the named arguments
  const namedArgsObj = {
    type: IR.IRNodeType.ObjectExpression,
    properties: objProperties,
  } as IR.IRObjectExpression;

  // Create the function call with the object as a single argument
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.Identifier,
      name: sanitizeIdentifier(functionName),
    },
    arguments: [namedArgsObj],
  } as IR.IRCallExpression;
}

/**
 * Extract raw parameter symbols from parameter list for purity verification
 */
function extractRawParams(paramList: ListNode): SymbolNode[] {
  const rawParams: SymbolNode[] = [];

  for (let i = 0; i < paramList.elements.length; i++) {
    const elem = paramList.elements[i];

    if (elem.type === "symbol") {
      const symbolName = (elem as SymbolNode).name;

      // Skip special tokens
      if (symbolName === ":" || symbolName === "=") {
        continue;
      }

      // Handle parameter name with colon suffix
      if (symbolName.endsWith(":")) {
        // Create a cleaned symbol without the colon
        const cleanName = symbolName.slice(0, -1);

        // Create a new symbol node with the cleaned name
        rawParams.push({
          type: "symbol",
          name: cleanName,
        });

        // Skip the type and possible default value
        if (i + 1 < paramList.elements.length) {
          i++; // Skip type

          // Check for default value
          if (
            i + 1 < paramList.elements.length &&
            i + 2 < paramList.elements.length &&
            paramList.elements[i].type === "symbol" &&
            (paramList.elements[i] as SymbolNode).name === "="
          ) {
            i += 2; // Skip = and default value
          }
        }
      } else if (symbolName !== "Int" && !symbolName.includes("->")) {
        // Regular symbol that isn't a type or arrow
        rawParams.push(elem as SymbolNode);
      }
    }
  }

  return rawParams;
}

/**
 * Register an fn function in the registry for call site handling
 */
function registerFnFunction(
  name: string,
  def: IR.IRFnFunctionDeclaration,
): void {
  fnFunctionRegistry.set(name, def);
}

/**
 * Register an fx function in the registry for call site handling
 */
function registerFxFunction(
  name: string,
  def: IR.IRFxFunctionDeclaration,
): void {
  fxFunctionRegistry.set(name, def);
}

/**
 * Parse parameters with default values for fn functions
 */
function parseParametersWithDefaults(
  paramList: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
): {
  params: IR.IRIdentifier[];
  defaults: Map<string, IR.IRNode>;
} {
  // Initialize result structures
  const params: IR.IRIdentifier[] = [];
  const defaults = new Map<string, IR.IRNode>();

  // Track if we're processing a rest parameter
  let restMode = false;

  // Process parameters
  for (let i = 0; i < paramList.elements.length; i++) {
    const elem = paramList.elements[i];

    if (elem.type === "symbol") {
      const symbolName = (elem as SymbolNode).name;

      // Check if this is the rest parameter indicator
      if (symbolName === "&") {
        restMode = true;
        continue;
      }

      // Add parameter to the list, with special handling for rest parameters
      if (restMode) {
        // For rest parameter, use the proper spread syntax in the parameter name
        params.push({
          type: IR.IRNodeType.Identifier,
          name: `...${sanitizeIdentifier(symbolName)}`,
        });
        
        // Store the original name to be able to reference it in the function body
        params[params.length - 1].originalName = symbolName;
      } else {
        params.push({
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(symbolName),
        });
      }

      // Check for default value (=)
      if (
        !restMode && // Rest parameters can't have defaults
        i + 1 < paramList.elements.length &&
        paramList.elements[i + 1].type === "symbol" &&
        (paramList.elements[i + 1] as SymbolNode).name === "="
      ) {
        // Make sure we have a value after the equals sign
        if (i + 2 < paramList.elements.length) {
          const defaultValueNode = paramList.elements[i + 2];

          // Transform the default value
          const defaultValue = transformNode(defaultValueNode, currentDir);
          if (defaultValue) {
            defaults.set(symbolName, defaultValue);
          }

          i += 2; // Skip = and default value
        } else {
          throw new ValidationError(
            `Missing default value after '=' for parameter '${symbolName}'`,
            "fn parameter default",
            "default value",
            "missing value",
          );
        }
      }
    }
  }

  return { params, defaults };
}

/**
 * Parse parameters with type annotations and default values
 */
function parseParametersWithTypes(
  paramList: ListNode,
  currentDir: string,
  transformNode: (node: any, dir: string) => IR.IRNode | null,
): {
  params: IR.IRIdentifier[];
  types: Map<string, string>;
  defaults: Map<string, IR.IRNode>;
} {
  // Initialize result structures
  const params: IR.IRIdentifier[] = [];
  const types = new Map<string, string>();
  const defaults = new Map<string, IR.IRNode>();

  // Process parameters
  for (let i = 0; i < paramList.elements.length; i++) {
    const elem = paramList.elements[i];

    if (elem.type === "symbol") {
      const symbolName = (elem as SymbolNode).name;

      // If it's a parameter name with a colon
      if (symbolName.endsWith(":")) {
        // Extract parameter name (remove the colon)
        const paramName = symbolName.slice(0, -1);
        // Add to params list - remove the colon from the parameter name
        params.push({
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(paramName),
        });

        // Look ahead for the type
        if (i + 1 < paramList.elements.length) {
          let typeName: string;
          const typeNode = paramList.elements[i + 1];
          
          // Handle array type notation: [ElementType]
          if (typeNode.type === "list" && (typeNode as ListNode).elements.length === 1) {
            const innerTypeNode = (typeNode as ListNode).elements[0];
            if (innerTypeNode.type === "symbol") {
              const innerTypeName = (innerTypeNode as SymbolNode).name;
              typeName = `Array<${innerTypeName}>`;
            } else {
              typeName = "Array";
            }
          } 
          // Handle normal type (symbol)
          else if (typeNode.type === "symbol") {
            typeName = (typeNode as SymbolNode).name;
          }
          // Use Any as default if we can't determine the type
          else {
            typeName = "Any";
          }

          // For array types
          if (typeName.startsWith("Array<") && typeName.endsWith(">")) {
            types.set(paramName, typeName);
          } 
          // Handle enum types or any custom type
          else {
            types.set(paramName, typeName);
          }

          // Check for default value
          if (
            i + 2 < paramList.elements.length &&
            paramList.elements[i + 2].type === "symbol" &&
            (paramList.elements[i + 2] as SymbolNode).name === "="
          ) {
            // Make sure we have a value after the equals sign
            if (i + 3 < paramList.elements.length) {
              const defaultValueNode = paramList.elements[i + 3];

              // Transform the default value
              const defaultValue = transformNode(defaultValueNode, currentDir);
              if (defaultValue) {
                defaults.set(paramName, defaultValue);
              }

              i += 3; // Skip type, =, and default value
            } else {
              i += 1; // Just skip the type
            }
          } else {
            i += 1; // Just skip the type
          }
        }
      }
    }
  }

  return { params, types, defaults };
}