////////////////////////////////////////////////////////////////////////////////
// src/transpiler/hql-ast-to-hql-ir.ts - Updated to handle enums
////////////////////////////////////////////////////////////////////////////////

import * as IR from "./hql_ir.ts";
import { HQLNode, ListNode, LiteralNode, SymbolNode } from "./hql_ast.ts";
import { registerPureFunction, verifyFunctionPurity } from "./purity.ts";
import {
  KERNEL_PRIMITIVES,
  PRIMITIVE_CLASS,
  PRIMITIVE_DATA_STRUCTURE,
  PRIMITIVE_OPS,
} from "./primitives.ts";
import { PRIMITIVE_TYPES } from "./purity.ts";
import { sanitizeIdentifier } from "../utils.ts";
import { Environment } from "../environment.ts";
import * as path from "../platform/platform.ts";
import { TransformError, ValidationError } from "./errors.ts";
import { Logger } from "../logger.ts";
import { perform } from "./error-utils.ts";
import { isUserLevelMacro, macroCache } from "../s-exp/macro.ts";
import {
  isNamespaceImport,
  isVectorExport,
  isVectorImport,
} from "./hql_ast.ts";

// Initialize logger for this module
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Transform factory to map operators to handler functions
 */
const transformFactory = new Map<
  string,
  (list: ListNode, currentDir: string) => IR.IRNode | null
>();

// Registry for fx functions to enable access during call site processing
const fxFunctionRegistry = new Map<string, IR.IRFxFunctionDeclaration>();

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
 * Transform an array of HQL AST nodes into an IR program.
 * Enhanced with better error handling and logging, now wrapped in `perform`.
 */
export function transformToIR(
  nodes: HQLNode[],
  currentDir: string,
): IR.IRProgram {
  return perform(
    () => {
      logger.debug(`Transforming ${nodes.length} HQL AST nodes to IR`);
      const startTime = performance.now();

      macroCache.clear();

      // Initialize the factory if it hasn't been already
      if (transformFactory.size === 0) {
        initializeTransformFactory();
      }

      const body: IR.IRNode[] = [];
      const errors: { node: HQLNode; error: Error }[] = [];

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        try {
          const ir = perform(
            () => transformNode(node, currentDir),
            `transform node #${i + 1}`,
            TransformError,
            [node],
          );
          if (ir) body.push(ir);
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          logger.error(`Error transforming node #${i + 1}: ${errorMsg}`);
          errors.push({
            node: nodes[i],
            error: error instanceof Error ? error : new Error(errorMsg),
          });
        }
      }

      if (errors.length > 0 && body.length > 0) {
        logger.warn(
          `Transformed ${body.length} nodes successfully, but ${errors.length} nodes failed`,
        );
        const MAX_DETAILED_ERRORS = 3;
        errors.slice(0, MAX_DETAILED_ERRORS).forEach((err, index) => {
          logger.error(
            `Error ${index + 1}/${errors.length}: ${err.error.message}`,
          );
        });
        if (errors.length > MAX_DETAILED_ERRORS) {
          logger.error(
            `...and ${errors.length - MAX_DETAILED_ERRORS} more errors`,
          );
        }
      }

      if (errors.length > 0 && body.length === 0) {
        throw new TransformError(
          `Failed to transform any nodes (${errors.length} errors). First error: ${
            errors[0].error.message
          }`,
          `${nodes.length} AST nodes`,
          "AST to IR transformation",
          nodes,
        );
      }

      const endTime = performance.now();
      logger.debug(
        `Transformation completed in ${
          (endTime - startTime).toFixed(2)
        }ms with ${body.length} IR nodes`,
      );

      return { type: IR.IRNodeType.Program, body };
    },
    "transformToIR",
    TransformError,
    [nodes],
  );
}

/**
 * Initialize the transform factory with handlers for each operation
 */
function initializeTransformFactory(): void {
  perform(
    () => {
      logger.debug("Initializing transform factory");

      // Register kernel primitive handlers
      transformFactory.set("quote", transformQuote);
      transformFactory.set("if", transformIf);
      transformFactory.set("cond", transformCond);
      transformFactory.set("lambda", transformLambda);
      transformFactory.set("quasiquote", transformQuasiquote);
      transformFactory.set("unquote", transformUnquote);
      transformFactory.set("unquote-splicing", transformUnquoteSplicing);

      // Register JS interop primitive handlers
      transformFactory.set("js-import", transformJsImport);
      transformFactory.set("js-export", transformJsExport);
      transformFactory.set("js-new", transformJsNew);
      transformFactory.set("js-get", transformJsGet);
      transformFactory.set("js-call", transformJsCall);
      transformFactory.set("js-get-invoke", transformJsGetInvoke);
      transformFactory.set("js-set", transformJsSet);

      // Register data structure handlers
      transformFactory.set("vector", transformVector);
      transformFactory.set("hash-map", transformHashMap);
      transformFactory.set("hash-set", transformHashSet);
      transformFactory.set("empty-array", transformEmptyArray);
      transformFactory.set("empty-map", transformEmptyMap);
      transformFactory.set("empty-set", transformEmptySet);

      // Register special operation handlers
      transformFactory.set("get", transformGet);
      transformFactory.set("new", transformNew);

      transformFactory.set("fn", transformFn);
      transformFactory.set("fx", transformFx);
      transformFactory.set("let", transformLet);
      transformFactory.set("var", transformVar);
      transformFactory.set("set!", transformSet);
      transformFactory.set("do", transformDo);
      transformFactory.set("loop", transformLoop);
      transformFactory.set("recur", transformRecur);
      transformFactory.set("class", transformClass);
      transformFactory.set("return", transformReturn);
      transformFactory.set("method-call", transformMethodCall);

      // Register import/export handlers (these often just return null or are handled elsewhere)
      transformFactory.set("export", null);
      transformFactory.set("import", null);

      // Register enum handler (NEW)
      transformFactory.set("enum", transformEnum);

      logger.debug(`Registered ${transformFactory.size} handler functions`);
    },
    "initializeTransformFactory",
    TransformError,
  );
}

/**
 * Transform an enum declaration to IR (NEW)
 * Handles simple case: (enum TypeName (case CaseName) ...)
 */
/**
 * Transform an enum declaration to IR.
 * Handles both syntaxes:
 *  - (enum StatusCodes:Int (case ok 200) …)
 *  - (enum StatusCodes: Int (case ok 200) …)
 */
function transformEnum(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      logger.debug("Transforming enum declaration");

      // Validate enum syntax: at least a name and one case
      if (list.elements.length < 2) {
        throw new ValidationError(
          "enum requires a name and at least one case",
          "enum definition",
          "name and cases",
          `${list.elements.length - 1} arguments`,
        );
      }

      // Extract enum name and raw type
      const nameNode = list.elements[1];
      let enumName: string;
      let rawType: string | null = null;

      if (nameNode.type === "symbol") {
        const symbolName = (nameNode as SymbolNode).name;
        // If the name token contains a colon, split it up
        if (symbolName.includes(":")) {
          const parts = symbolName.split(":");
          enumName = parts[0].trim();
          rawType = parts[1].trim();
          logger.debug(`Detected enum with raw type (embedded): ${enumName}: ${rawType}`);
        } else {
          enumName = symbolName;
          logger.debug(`Detected simple enum: ${enumName}`);
        }
      } else {
        throw new ValidationError(
          "Enum name must be a symbol",
          "enum name",
          "symbol",
          nameNode.type,
        );
      }

      // Determine where enum cases begin.
      // If rawType is not yet set, check if the next token is a symbol representing the raw type.
      let caseStartIndex = 2;
      if (!rawType && list.elements.length >= 3) {
        const potentialTypeNode = list.elements[2];
        if (potentialTypeNode.type === "symbol") {
          // Optionally you could validate the token against allowed types (e.g. "Int", "Double", etc.)
          rawType = (potentialTypeNode as SymbolNode).name.trim();
          logger.debug(`Detected enum raw type (separate token): ${rawType}`);
          caseStartIndex = 3;
        }
      }

      // Process enum cases: cases start at caseStartIndex
      const cases: IR.IREnumCase[] = [];
      const caseElements = list.elements.slice(caseStartIndex);

      for (const element of caseElements) {
        // Each case must be a list starting with "case" and at least one argument (the case name)
        if (element.type !== "list") {
          throw new ValidationError(
            "Enum cases must be lists starting with 'case'",
            "enum case",
            "list",
            element.type,
          );
        }

        const caseList = element as ListNode;
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
            `invalid format: ${JSON.stringify(element)}`,
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

        // Check if this case has additional elements.
        if (caseList.elements.length > 2) {
          // If any symbol in the remaining elements ends with a colon, treat them as named parameters
          const hasNamedParams = caseList.elements.some(elem =>
            elem.type === "symbol" && (elem as SymbolNode).name.endsWith(":")
          );

          if (hasNamedParams) {
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
            // Otherwise, treat the extra element as a raw value
            const rawValueNode = caseList.elements[2];
            enumCase.rawValue = transformNode(rawValueNode, currentDir);
            logger.debug(`Enum case ${caseName} has raw value`);
          }
        }

        cases.push(enumCase);
      }

      if (cases.length === 0) {
        throw new ValidationError(
          "Enum must define at least one case",
          "enum definition",
          "at least one case",
          "no cases defined",
        );
      }

      // Build the final enum declaration IR node.
      const enumDeclaration: IR.IREnumDeclaration = {
        type: IR.IRNodeType.EnumDeclaration,
        id: {
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(enumName),
        },
        cases,
      };

      if (rawType) {
        enumDeclaration.rawType = rawType;
      }

      if (cases.some(c => c.hasAssociatedValues)) {
        enumDeclaration.hasAssociatedValues = true;
      }

      return enumDeclaration;
    },
    "transformEnum",
    TransformError,
    [list],
  );
}


/**
 * Transform a class declaration to IR
 */
// Updated transformClass function to handle fx methods in classes
function transformClass(list: ListNode, currentDir: string): IR.IRNode {
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
        // Field handling - unchanged
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

        fields.push({
          type: IR.IRNodeType.ClassField,
          name: fieldName,
          mutable: elementType === "var",
          initialValue,
        });
      }
      // Process constructor
      else if (elementType === "constructor") {
        // Constructor handling - unchanged
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

        classConstructor = {
          type: IR.IRNodeType.ClassConstructor,
          params,
          body: bodyBlock,
        };
      }
      // Process fn method definitions
      else if (elementType === "fn") {
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

        methods.push({
          type: IR.IRNodeType.ClassMethod,
          name: methodName,
          params,
          body: bodyBlock,
        });
      }
      // NEW: Process fx method definitions
      else if (elementType === "fx") {
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
        methods.push({
          type: IR.IRNodeType.ClassMethod,
          name: methodName,
          params,
          defaults: defaults.length > 0 ? defaults : undefined, // Include defaults
          body: bodyBlock,
        });
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

function transformDo(list: ListNode, currentDir: string): IR.IRNode {
  // Get body expressions (skip the 'do' symbol)
  const bodyExprs = list.elements.slice(1);

  // If no body, return null
  if (bodyExprs.length === 0) {
    return { type: IR.IRNodeType.NullLiteral };
  }

  // If only one expression, just transform it directly
  if (bodyExprs.length === 1) {
    const expr = transformNode(bodyExprs[0], currentDir);
    return expr || { type: IR.IRNodeType.NullLiteral };
  }

  // Multiple expressions - create statements for IIFE body
  const bodyStatements: IR.IRNode[] = [];

  // Transform all except the last expression
  for (let i = 0; i < bodyExprs.length - 1; i++) {
    const transformedExpr = transformNode(bodyExprs[i], currentDir);
    if (transformedExpr) {
      bodyStatements.push(transformedExpr);
    }
  }

  // Transform the last expression - it's the return value
  const lastExpr = transformNode(bodyExprs[bodyExprs.length - 1], currentDir);

  if (lastExpr) {
    // Create a return statement for the last expression
    bodyStatements.push({
      type: IR.IRNodeType.ReturnStatement,
      argument: lastExpr
    });
  }

  // Return an IIFE (Immediately Invoked Function Expression)
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.FunctionExpression,
      id: null,
      params: [],
      body: {
        type: IR.IRNodeType.BlockStatement,
        body: bodyStatements
      }
    },
    arguments: []
  };
}

function transformReturn(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      // Verify we have at least one argument
      if (list.elements.length < 2) {
        throw new ValidationError(
          "return requires an expression to return",
          "return statement",
          "expression to return",
          "no expression provided",
        );
      }

      // Get the value to return
      const valueNode = transformNode(list.elements[1], currentDir);

      if (!valueNode) {
        throw new ValidationError(
          "Return value transformed to null",
          "return value",
          "valid expression",
          "null",
        );
      }

      // Create a return statement
      return {
        type: IR.IRNodeType.ReturnStatement,
        argument: valueNode,
      } as IR.IRReturnStatement;
    },
    "transformReturn",
    TransformError,
    [list],
  );
}

/**
 * Transform a single HQL node to its IR representation.
 * Enhanced with loop context tracking for proper loop/recur implementation.
 *
 * File: src/transpiler/hql-ast-to-hql-ir.ts
 */
function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
  return perform(
    () => {
      if (!node) {
        throw new ValidationError(
          "Cannot transform null or undefined node",
          "node transformation",
          "valid HQL node",
          "null or undefined",
        );
      }

      logger.debug(`Transforming node of type: ${node.type}`);

      switch (node.type) {
        case "literal":
          return transformLiteral(node as LiteralNode);
        case "symbol":
          return transformSymbol(node as SymbolNode);
        case "list":
          return transformList(node as ListNode, currentDir);
        default:
          logger.warn(`Unknown node type: ${(node as any).type}`);
          return null;
      }
    },
    "transformNode",
    TransformError,
    [node],
  );
}

// Stack to track the current loop context for recur targeting
const loopContextStack: string[] = [];

// Counter for generating unique loop names
let loopIdCounter = 0;
function generateLoopId(): string {
  return `loop_${loopIdCounter++}`;
}

/**
 * Transform a list node, handling special forms including loop and recur.
 */
function transformList(list: ListNode, currentDir: string): IR.IRNode | null {
  // Handle empty list
  if (list.elements.length === 0) {
    return transformEmptyList();
  }

  // Special case for js-get-invoke
  const jsGetInvokeResult = transformJsGetInvokeSpecialCase(list, currentDir);
  if (jsGetInvokeResult) return jsGetInvokeResult;

  const first = list.elements[0];

  // Special case for dot method calls
  if (
    first.type === "symbol" &&
    (first as SymbolNode).name.startsWith('.') &&
    list.elements.length >= 2
  ) {
    logger.debug(`Processing method call starting with ${(first as SymbolNode).name}`);

    const methodName = (first as SymbolNode).name.substring(1);

    // The object is the SECOND element (after the method name)
    const object = transformNode(list.elements[1], currentDir);
    if (!object) {
      throw new ValidationError(
        "Object in method call transformed to null",
        "method call object",
        "valid object expression",
        "null"
      );
    }

    // Arguments are all elements AFTER the object (starting from the third element)
    const args = list.elements.slice(2).map(arg => {
      const transformed = transformNode(arg, currentDir);
      if (!transformed) {
        throw new ValidationError(
          `Method argument transformed to null: ${JSON.stringify(arg)}`,
          "method argument",
          "valid expression",
          "null"
        );
      }
      return transformed;
    });

    // Create a member expression for method access
    const memberExpr: IR.IRMemberExpression = {
      type: IR.IRNodeType.MemberExpression,
      object: object,
      property: {
        type: IR.IRNodeType.Identifier,
        name: methodName
      },
      computed: false
    };

    // Create the call expression
    return {
      type: IR.IRNodeType.CallExpression,
      callee: memberExpr,
      arguments: args
    } as IR.IRCallExpression;
  }

  if (first.type === "symbol") {
    const op = (first as SymbolNode).name;

    // Skip macro definitions
    if (op === "defmacro" || op === "macro") {
      logger.debug(`Skipping macro definition: ${op}`);
      return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
    }

    if (first.type === "symbol" && (first as SymbolNode).name.startsWith('.')) {
      return transformMethodCall(list, currentDir);
    }

    if (
      first.type === "symbol" &&
      (first as SymbolNode).name === "class" &&
      list.elements.length >= 2
    ) {
      return transformClass(list, currentDir);
    }

    // Handle return statements
    if (op === "return") {
      return transformReturn(list, currentDir);
    }

    // Handle if-expression
    if (op === "if") {
      return transformIf(list, currentDir);
    }

    // Handle loop special form
    if (op === "loop") {
      return transformLoop(list, currentDir);
    }

    // Handle recur special form
    if (op === "recur") {
      // Verify recur is inside a loop context
      if (loopContextStack.length === 0) {
        throw new ValidationError(
          "recur must be used inside a loop",
          "recur statement",
          "inside loop context",
          "outside loop context"
        );
      }
      return transformRecur(list, currentDir);
    }

    // Handle import/export forms
    if (isVectorExport(list)) {
      return transformVectorExport(list, currentDir);
    }

    if (isVectorImport(list)) {
      return transformVectorImport(list, currentDir);
    }

    if (isNamespaceImport(list)) {
      return transformNamespaceImport(list, currentDir);
    }
    
    if (hasNamedArguments(list)) {
      return transformNamedArgumentCall(list, currentDir);
    }

    if (isDotNotation(op)) {
      return transformDotNotation(list, op, currentDir);
    }

    const fnDef = fnFunctionRegistry.get(op);
    if (fnDef) {
      logger.debug(`Processing call to fn function ${op}`);
      return processFnFunctionCall(
        op,
        fnDef,
        list.elements.slice(1),
        currentDir,
      );
    }

    const fxDef = fxFunctionRegistry.get(op);
    if (fxDef) {
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

    // Handle built-in operations via the transform factory
    const handler = transformFactory.get(op);
    if (handler) {
      return perform(
        () => handler(list, currentDir),
        `handler for '${op}'`,
        TransformError,
        [list],
      );
    }

    // Handle primitive operations
    if (PRIMITIVE_OPS.has(op)) {
      return transformPrimitiveOp(list, currentDir);
    }

    // This is the critical part - determine if this is a function call or collection access
    if (
      !KERNEL_PRIMITIVES.has(op) &&
      !PRIMITIVE_DATA_STRUCTURE.has(op) &&
      !PRIMITIVE_CLASS.has(op) &&
      !op.startsWith("js-")
    ) {
      // Check if the operator is a known lambda or function
      // We can use heuristics to determine this
      // If we only have one argument and it's a literal, it's likely a collection access
      const isLikelyCollectionAccess = list.elements.length === 2 &&
                                      list.elements[1].type === "literal";

      if (isLikelyCollectionAccess) {
        // Handle as collection access
        return transformCollectionAccess(list, op, currentDir);
      } else {
        // Handle as function call
        const callee = transformNode(list.elements[0], currentDir);
        if (!callee) {
          throw new ValidationError(
            "Function callee transformed to null",
            "function call",
            "valid function expression",
            "null"
          );
        }

        const args = list.elements.slice(1).map(arg => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Function argument transformed to null: ${JSON.stringify(arg)}`,
              "function argument",
              "valid expression",
              "null"
            );
          }
          return transformed;
        });

        return {
          type: IR.IRNodeType.CallExpression,
          callee,
          arguments: args
        } as IR.IRCallExpression;
      }
    }
  }

  // Handle nested lists
  if (first.type === "list") {
    return transformNestedList(list, currentDir);
  }

  // Default case: standard function call
  return transformStandardFunctionCall(list, currentDir);
}

/**
 * Transform a loop special form to its IR representation.
 * File: src/transpiler/hql-ast-to-hql-ir.ts
 */
function transformLoop(list: ListNode, currentDir: string): IR.IRNode {
  try {
    // Verify loop syntax: (loop (bindings...) body...)
    if (list.elements.length < 3) {
      throw new ValidationError(
        "loop requires bindings and at least one body expression",
        "loop statement",
        "bindings and body",
        `${list.elements.length - 1} elements`
      );
    }

    const bindingsNode = list.elements[1];
    if (bindingsNode.type !== "list") {
      throw new ValidationError(
        "loop bindings must be a list",
        "loop bindings",
        "list",
        bindingsNode.type
      );
    }

    const bindings = bindingsNode as ListNode;
    if (bindings.elements.length % 2 !== 0) {
      throw new ValidationError(
        "loop bindings require an even number of forms",
        "loop bindings",
        "even number",
        bindings.elements.length
      );
    }

    // Create a unique ID for this loop context
    const loopId = generateLoopId();
    loopContextStack.push(loopId); // Push this loop onto the context stack

    try {
      // Extract parameter names and initial values
      const params: IR.IRIdentifier[] = [];
      const initialValues: IR.IRNode[] = [];

      for (let i = 0; i < bindings.elements.length; i += 2) {
        const nameNode = bindings.elements[i];
        if (nameNode.type !== "symbol") {
          throw new ValidationError(
            "loop binding names must be symbols",
            "loop binding name",
            "symbol",
            nameNode.type
          );
        }

        const paramName = (nameNode as SymbolNode).name;
        params.push({
          type: IR.IRNodeType.Identifier,
          name: sanitizeIdentifier(paramName)
        });

        // Transform the initial value
        const valueNode = transformNode(bindings.elements[i + 1], currentDir);
        if (!valueNode) {
          throw new ValidationError(
            `Binding value for '${paramName}' transformed to null`,
            "loop binding value",
            "valid expression",
            "null"
          );
        }
        initialValues.push(valueNode);
      }

      // Transform the body expressions
      // For a loop, we'll wrap all body expressions in a single block statement
      // This ensures the recur call is properly tail-recursive
      let bodyBlock: IR.IRBlockStatement;

      // Special case: If there's only one expression in the body and it's an if/when
      // we'll transform it specially to ensure proper tail recursion
      if (list.elements.length === 3 && list.elements[2].type === "list") {
        const bodyExpr = list.elements[2] as ListNode;
        if (bodyExpr.elements.length > 0 && bodyExpr.elements[0].type === "symbol") {
          const op = (bodyExpr.elements[0] as SymbolNode).name;

          if (op === "if" || op === "when") {
            // Let the regular transformers handle this, but in loop context
            const transformedBody = transformNode(bodyExpr, currentDir);
            if (transformedBody) {
              bodyBlock = {
                type: IR.IRNodeType.BlockStatement,
                body: [transformedBody]
              };
            } else {
              bodyBlock = {
                type: IR.IRNodeType.BlockStatement,
                body: []
              };
            }
          } else {
            // Regular case: transform all body expressions
            bodyBlock = transformLoopBody(list.elements.slice(2), currentDir);
          }
        } else {
          // Regular case: transform all body expressions
          bodyBlock = transformLoopBody(list.elements.slice(2), currentDir);
        }
      } else {
        // Regular case: transform all body expressions
        bodyBlock = transformLoopBody(list.elements.slice(2), currentDir);
      }

      // Create the loop function declaration
      const loopFunc: IR.IRFunctionDeclaration = {
        type: IR.IRNodeType.FunctionDeclaration,
        id: {
          type: IR.IRNodeType.Identifier,
          name: loopId
        },
        params,
        body: bodyBlock
      };

      // Create initial function call with binding values
      const initialCall: IR.IRCallExpression = {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: loopId
        },
        arguments: initialValues
      };

      // Create IIFE to contain both the function declaration and initial call
      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.FunctionExpression,
          id: null,
          params: [],
          body: {
            type: IR.IRNodeType.BlockStatement,
            body: [
              loopFunc,
              {
                type: IR.IRNodeType.ReturnStatement,
                argument: initialCall
              }
            ]
          }
        },
        arguments: []
      };
    } finally {
      // Always pop the loop context, even on error
      loopContextStack.pop();
    }
  } catch (error) {
    throw new TransformError(
      `Failed to transform loop: ${error instanceof Error ? error.message : String(error)}`,
      "loop transformation",
      "valid loop expression",
      list
    );
  }
}

/**
 * Transform a recur special form to its IR representation.
 */
function transformRecur(list: ListNode, currentDir: string): IR.IRNode {
  try {
    // Verify that we have at least the recur keyword
    if (list.elements.length < 1) {
      throw new ValidationError(
        "Invalid recur form",
        "recur statement",
        "recur with arguments",
        "incomplete recur form"
      );
    }

    // Get the current loop context (last item on the stack)
    if (loopContextStack.length === 0) {
      throw new ValidationError(
        "recur must be used inside a loop",
        "recur statement",
        "inside loop context",
        "outside loop context"
      );
    }

    const loopId = loopContextStack[loopContextStack.length - 1];

    // Transform all the argument expressions
    const args: IR.IRNode[] = [];
    for (let i = 1; i < list.elements.length; i++) {
      const transformedArg = transformNode(list.elements[i], currentDir);
      if (!transformedArg) {
        throw new ValidationError(
          `Argument ${i} in recur transformed to null`,
          "recur argument",
          "valid expression",
          "null"
        );
      }
      args.push(transformedArg);
    }

    // Create a direct function call to the loop function
    const loopCall: IR.IRCallExpression = {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.Identifier,
        name: loopId
      },
      arguments: args
    };

    // Return a return statement with the loop call
    // This is essential for proper tail call optimization
    return {
      type: IR.IRNodeType.ReturnStatement,
      argument: loopCall
    };
  } catch (error) {
    throw new TransformError(
      `Failed to transform recur: ${error instanceof Error ? error.message : String(error)}`,
      "recur transformation",
      "valid recur expression",
      list
    );
  }
}

/**
 * Helper function to transform a list of body expressions for a loop
 */
function transformLoopBody(bodyExprs: HQLNode[], currentDir: string): IR.IRBlockStatement {
  const bodyNodes: IR.IRNode[] = [];

  for (const expr of bodyExprs) {
    const transformedExpr = transformNode(expr, currentDir);
    if (transformedExpr) {
      bodyNodes.push(transformedExpr);
    }
  }

  return {
    type: IR.IRNodeType.BlockStatement,
    body: bodyNodes
  };
}

/**
 * Transform a fn function declaration.
 * Format: (fn name (param1 = default1 param2) body...)
 */
function transformFn(list: ListNode, currentDir: string): IR.IRNode {
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

    // Check if this is a typed fn with a return type annotation
    const isTyped = list.elements.length > 3 && 
                   list.elements[3].type === "list" &&
                   (list.elements[3] as ListNode).elements.length > 0 &&
                   (list.elements[3] as ListNode).elements[0].type === "symbol" &&
                   ((list.elements[3] as ListNode).elements[0] as SymbolNode).name === "->";
    
    // Determine body start index based on whether there's a return type
    const bodyOffset = isTyped ? 4 : 3;
    const bodyExpressions = list.elements.slice(bodyOffset);

    // Parse parameters based on whether it's typed or untyped
    const paramsInfo = isTyped 
        ? parseParametersWithTypes(paramList, currentDir)
        : parseParametersWithDefaults(paramList, currentDir);

    // Extract params and defaults
    const params = paramsInfo.params;
    const defaultValues = paramsInfo.defaults;

    // Process the body expressions like a regular function
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

    // If it's a typed fn, add type information
    if (isTyped) {
      const returnTypeNode = list.elements[3] as ListNode;
      if (returnTypeNode.elements.length < 2 || returnTypeNode.elements[1].type !== "symbol") {
        throw new ValidationError(
          "Return type must be specified after ->",
          "fn return type",
          "type symbol",
          "missing type",
        );
      }
      const returnType = (returnTypeNode.elements[1] as SymbolNode).name;
      
      // Note: We would add type information here if the IR supported it
      // For now, we'll just proceed with the untyped IR representation
      // since the specification says types are for documentation only
    }

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
 * Parse parameters with default values for fn functions
 */
function parseParametersWithDefaults(
  paramList: ListNode,
  currentDir: string,
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

// Registry for fn functions to enable access during call site processing
const fnFunctionRegistry = new Map<string, IR.IRFnFunctionDeclaration>();

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
 * Check if a node is a placeholder (_) symbol
 */
function isPlaceholder(node: HQLNode): boolean {
  return node.type === "symbol" && (node as SymbolNode).name === "_";
}

/**
 * Process and transform a call to an fn function.
 * Handles both positional and named arguments.
 */
function processFnFunctionCall(
  funcName: string,
  funcDef: IR.IRFnFunctionDeclaration,
  args: HQLNode[],
  currentDir: string,
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
    
    const hasPlaceholders = args.some(isPlaceholder);

    // If we have named arguments, process them differently
    if (hasNamedArgs) {
      return processNamedArguments(funcName, funcDef, args, currentDir);
    }
    
    // Process normal positional arguments
    const finalArgs: IR.IRNode[] = [];

    // Process each regular parameter
    for (let i = 0; i < regularParamNames.length; i++) {
      const paramName = regularParamNames[i];

      if (i < args.length) {
        const arg = args[i];

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
      // Too many arguments without a rest parameter
      throw new ValidationError(
        `Too many positional arguments in call to function '${funcName}'`,
        "function call",
        `${paramNames.length} arguments`,
        `${args.length} arguments`,
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
    throw new TransformError(
      `Failed to process fn function call: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "fn function call",
      "transformation",
      args,
    );
  }
}

/**
 * Transform a literal node to its IR representation.
 */
function transformLiteral(lit: LiteralNode): IR.IRNode {
  return perform(
    () => {
      const value = lit.value;
      if (value === null) {
        return { type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral;
      } else if (typeof value === "boolean") {
        return {
          type: IR.IRNodeType.BooleanLiteral,
          value,
        } as IR.IRBooleanLiteral;
      } else if (typeof value === "number") {
        return {
          type: IR.IRNodeType.NumericLiteral,
          value,
        } as IR.IRNumericLiteral;
      }
      return {
        type: IR.IRNodeType.StringLiteral,
        value: String(value),
      } as IR.IRStringLiteral;
    },
    "transformLiteral",
    TransformError,
    [lit],
  );
}

/**
 * Process named arguments for a function call
 */
function processNamedArguments(
  funcName: string,
  funcDef: IR.IRFnFunctionDeclaration,
  args: HQLNode[],
  currentDir: string,
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
 * Transform a symbol node to its IR representation.
 */
function transformSymbol(sym: SymbolNode): IR.IRNode {
  return perform(
    () => {
      let name = sym.name;
      let isJS = false;

      // Special handling for placeholder symbol
      if (name === "_") {
        // Transform it to a string literal "_" instead of an identifier
        return {
          type: IR.IRNodeType.StringLiteral,
          value: "_",
        } as IR.IRStringLiteral;
      }

      if (name.startsWith("js/")) {
        name = name.slice(3);
        isJS = true;
      }

      if (!isJS) {
        name = sanitizeIdentifier(name);
      } else {
        name = name.replace(/-/g, "_");
      }

      return { type: IR.IRNodeType.Identifier, name, isJS } as IR.IRIdentifier;
    },
    `transformSymbol '${sym.name}'`,
    TransformError,
    [sym],
  );
}

//-----------------------------------------------------------------------------
// Vector, List, and Collection Processing
//-----------------------------------------------------------------------------

/**
 * Process elements in a vector, handling vector keyword and commas
 */
function processVectorElements(elements: HQLNode[]): HQLNode[] {
  return perform(
    () => {
      let startIndex = 0;
      if (
        elements.length > 0 &&
        elements[0].type === "symbol" &&
        (elements[0] as SymbolNode).name === "vector"
      ) {
        startIndex = 1;
      }
      return elements.slice(startIndex).filter(
        (elem) =>
          !(elem.type === "symbol" && (elem as SymbolNode).name === ","),
      );
    },
    "processVectorElements",
    TransformError,
    [elements],
  );
}

/**
 * Check if a string represents dot notation
 */
function isDotNotation(op: string): boolean {
  return op.includes(".") && !op.startsWith("js/");
}

/**
 * Transform an empty list into an empty array expression.
 */
function transformEmptyList(): IR.IRArrayExpression {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements: [],
      } as IR.IRArrayExpression;
    },
    "transformEmptyList",
    TransformError,
  );
}

/**
 * Transform empty array literals
 */
function transformEmptyArray(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements: [],
      } as IR.IRArrayExpression;
    },
    "transformEmptyArray",
    TransformError,
  );
}

/**
 * Transform empty map literals
 */
function transformEmptyMap(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.ObjectExpression,
        properties: [],
      } as IR.IRObjectExpression;
    },
    "transformEmptyMap",
    TransformError,
  );
}

/**
 * Transform empty set literals
 */
function transformEmptySet(_list: ListNode, _currentDir: string): IR.IRNode {
  return perform(
    () => {
      return {
        type: IR.IRNodeType.NewExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "Set",
        } as IR.IRIdentifier,
        arguments: [],
      } as IR.IRNewExpression;
    },
    "transformEmptySet",
    TransformError,
  );
}

/**
 * Handle the special case for js-get-invoke.
 */
function transformJsGetInvokeSpecialCase(
  list: ListNode,
  currentDir: string,
): IR.IRNode | null {
  return perform(
    () => {
      if (
        list.elements.length === 3 &&
        list.elements[0].type === "symbol" &&
        (list.elements[0] as SymbolNode).name === "js-get-invoke"
      ) {
        const object = transformNode(list.elements[1], currentDir);
        if (!object) {
          throw new ValidationError(
            "Object expression in js-get-invoke resulted in null",
            "js-get-invoke",
            "valid object expression",
            "null",
          );
        }

        const property = transformNode(list.elements[2], currentDir);
        if (!property) {
          throw new ValidationError(
            "Property expression in js-get-invoke resulted in null",
            "js-get-invoke",
            "valid property expression",
            "null",
          );
        }

        if (property.type === IR.IRNodeType.StringLiteral) {
          return {
            type: IR.IRNodeType.MemberExpression,
            object,
            property: {
              type: IR.IRNodeType.Identifier,
              name: (property as IR.IRStringLiteral).value,
            } as IR.IRIdentifier,
            computed: false,
          } as IR.IRMemberExpression;
        }

        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property,
          computed: true,
        } as IR.IRMemberExpression;
      }
      return null;
    },
    "transformJsGetInvokeSpecialCase",
    TransformError,
    [list],
  );
}

/**
 * Transform a nested list (list where first element is also a list).
 */
function transformNestedList(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const innerExpr = transformNode(list.elements[0], currentDir);
      if (!innerExpr) {
        throw new ValidationError(
          "Inner list transformed to null",
          "nested list",
          "valid inner expression",
          "null",
        );
      }

      if (list.elements.length > 1) {
        const second = list.elements[1];
        if (
          second.type === "symbol" &&
          (second as SymbolNode).name.startsWith(".")
        ) {
          const methodName = (second as SymbolNode).name.substring(1);
          const args = list.elements.slice(2).map((arg) => {
            const transformed = transformNode(arg, currentDir);
            if (!transformed) {
              throw new ValidationError(
                `Argument transformed to null: ${JSON.stringify(arg)}`,
                "method argument",
                "valid argument expression",
                "null",
              );
            }
            return transformed;
          });
          return {
            type: IR.IRNodeType.CallExpression,
            callee: {
              type: IR.IRNodeType.MemberExpression,
              object: innerExpr,
              property: {
                type: IR.IRNodeType.Identifier,
                name: methodName,
              } as IR.IRIdentifier,
              computed: false,
            } as IR.IRMemberExpression,
            arguments: args,
          } as IR.IRCallExpression;
        } else if (second.type === "symbol") {
          return {
            type: IR.IRNodeType.MemberExpression,
            object: innerExpr,
            property: {
              type: IR.IRNodeType.Identifier,
              name: sanitizeIdentifier((second as SymbolNode).name),
            } as IR.IRIdentifier,
            computed: false,
          } as IR.IRMemberExpression;
        } else {
          const args = list.elements.slice(1).map((arg) => {
            const transformed = transformNode(arg, currentDir);
            if (!transformed) {
              throw new ValidationError(
                `Argument transformed to null: ${JSON.stringify(arg)}`,
                "function argument",
                "valid argument expression",
                "null",
              );
            }
            return transformed;
          });
          return {
            type: IR.IRNodeType.CallExpression,
            callee: innerExpr,
            arguments: args,
          } as IR.IRCallExpression;
        }
      }

      return innerExpr;
    },
    "transformNestedList",
    TransformError,
    [list],
  );
}

/**
 * Transform dot notation expressions to IR
 */
function transformDotNotation(
  list: ListNode,
  op: string,
  currentDir: string,
): IR.IRNode {
  return perform(
    () => {
      const parts = op.split(".");
      const objectName = parts[0];
      const property = parts.slice(1).join(".");

      const objectExpr = {
        type: IR.IRNodeType.Identifier,
        name: sanitizeIdentifier(objectName),
      } as IR.IRIdentifier;

      if (list.elements.length === 1) {
        return {
          type: IR.IRNodeType.MemberExpression,
          object: objectExpr,
          property: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(property),
          } as IR.IRIdentifier,
          computed: false,
        } as IR.IRMemberExpression;
      }

      const args = list.elements.slice(1).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Method argument transformed to null: ${JSON.stringify(arg)}`,
            "method argument",
            "valid argument expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.MemberExpression,
          object: objectExpr,
          property: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(property),
          } as IR.IRIdentifier,
          computed: false,
        } as IR.IRMemberExpression,
        arguments: args,
      } as IR.IRCallExpression;
    },
    `transformDotNotation '${op}'`,
    TransformError,
    [list],
  );
}

function transformStandardFunctionCall(
  list: ListNode,
  currentDir: string,
): IR.IRNode {
  return perform(
    () => {
      const first = list.elements[0];

      if (first.type === "symbol") {
        const op = (first as SymbolNode).name;

        // Check if we're calling an fx function
        const fxDef = fxFunctionRegistry.get(op);

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

//-----------------------------------------------------------------------------
// String and Macro Processing Utilities
//-----------------------------------------------------------------------------

/**
 * Extract a string literal from a node.
 */
function extractStringLiteral(node: HQLNode): string {
  return perform(
    () => {
      if (node.type === "literal") {
        return String((node as LiteralNode).value);
      }

      if (node.type === "list") {
        const theList = node as ListNode;
        if (
          theList.elements.length === 2 &&
          theList.elements[0].type === "symbol" &&
          (theList.elements[0] as SymbolNode).name === "quote" &&
          theList.elements[1].type === "literal"
        ) {
          return String((theList.elements[1] as LiteralNode).value);
        }
      }

      throw new ValidationError(
        `Expected string literal but got: ${node.type}`,
        "string literal extraction",
        "string literal or quoted literal",
        node.type,
      );
    },
    "extractStringLiteral",
    TransformError,
    [node],
  );
}

/**
 * Transform quasiquoted expressions
 */
function transformQuasiquote(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 2) {
        throw new ValidationError(
          `quasiquote requires exactly one argument, got ${
            list.elements.length - 1
          }`,
          "quasiquote",
          "1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const transformed = transformNode(list.elements[1], currentDir);
      if (!transformed) {
        throw new ValidationError(
          "Quasiquoted expression transformed to null",
          "quasiquote",
          "valid expression",
          "null",
        );
      }
      return transformed;
    },
    "transformQuasiquote",
    TransformError,
    [list],
  );
}

/**
 * Transform unquote expressions
 */
function transformUnquote(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 2) {
        throw new ValidationError(
          `unquote requires exactly one argument, got ${
            list.elements.length - 1
          }`,
          "unquote",
          "1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const transformed = transformNode(list.elements[1], currentDir);
      if (!transformed) {
        throw new ValidationError(
          "Unquoted expression transformed to null",
          "unquote",
          "valid expression",
          "null",
        );
      }
      return transformed;
    },
    "transformUnquote",
    TransformError,
    [list],
  );
}

/**
 * Transform unquote-splicing expressions
 */
function transformUnquoteSplicing(
  list: ListNode,
  currentDir: string,
): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 2) {
        throw new ValidationError(
          `unquote-splicing requires exactly one argument, got ${
            list.elements.length - 1
          }`,
          "unquote-splicing",
          "1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const transformed = transformNode(list.elements[1], currentDir);
      if (!transformed) {
        throw new ValidationError(
          "Unquote-spliced expression transformed to null",
          "unquote-splicing",
          "valid expression",
          "null",
        );
      }
      return transformed;
    },
    "transformUnquoteSplicing",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// Import and Export Transformers - Reorganized for better clarity
//-----------------------------------------------------------------------------

/**
 * Check if a position in a list of nodes has an 'as' alias following it
 */
function hasAliasFollowing(elements: HQLNode[], position: number): boolean {
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
function createImportSpecifier(
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
function isSymbolMacroInModule(
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
function transformNamespaceImport(
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
 * Transform JavaScript imports
 */
function transformJsImport(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length === 3) {
        const nameNode = list.elements[1];
        if (nameNode.type !== "symbol") {
          throw new ValidationError(
            "js-import module name must be a symbol",
            "js-import",
            "symbol",
            nameNode.type,
          );
        }

        const name = (nameNode as SymbolNode).name;
        const source = extractStringLiteral(list.elements[2]);
        return {
          type: IR.IRNodeType.JsImportReference,
          name,
          source,
        } as IR.IRJsImportReference;
      } else if (list.elements.length === 2) {
        const source = extractStringLiteral(list.elements[1]);
        const moduleParts = source.split("/");
        let defaultName = moduleParts[moduleParts.length - 1].replace(
          /\.(js|ts|mjs|cjs)$/,
          "",
        );
        defaultName = defaultName.replace(/[^a-zA-Z0-9_$]/g, "_");

        return {
          type: IR.IRNodeType.JsImportReference,
          name: defaultName,
          source,
        } as IR.IRJsImportReference;
      }

      throw new ValidationError(
        `js-import requires 1 or 2 arguments, got ${list.elements.length - 1}`,
        "js-import",
        "1 or 2 arguments",
        `${list.elements.length - 1} arguments`,
      );
    },
    "transformJsImport",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript exports
 */
function transformJsExport(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-export requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-export",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const exportName = extractStringLiteral(list.elements[1]);
      const safeExportName = sanitizeIdentifier(exportName);
      const value = transformNode(list.elements[2], currentDir);
      if (!value) {
        throw new ValidationError(
          "Exported value transformed to null",
          "js-export",
          "valid expression",
          "null",
        );
      }

      if (value.type === IR.IRNodeType.Identifier) {
        return {
          type: IR.IRNodeType.ExportNamedDeclaration,
          specifiers: [
            {
              type: IR.IRNodeType.ExportSpecifier,
              local: value as IR.IRIdentifier,
              exported: {
                type: IR.IRNodeType.Identifier,
                name: safeExportName,
              } as IR.IRIdentifier,
            },
          ],
        } as IR.IRExportNamedDeclaration;
      }

      const tempId: IR.IRIdentifier = {
        type: IR.IRNodeType.Identifier,
        name: `export_${safeExportName}`,
      };

      return {
        type: IR.IRNodeType.ExportVariableDeclaration,
        declaration: {
          type: IR.IRNodeType.VariableDeclaration,
          kind: "const",
          declarations: [
            {
              type: IR.IRNodeType.VariableDeclarator,
              id: tempId,
              init: value,
            },
          ],
        },
        exportName: safeExportName,
      } as IR.IRExportVariableDeclaration;
    },
    "transformJsExport",
    TransformError,
    [list],
  );
}

/**
 * Transform a vector-based export statement
 */
function transformVectorExport(
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
function createExportSpecifier(symbolName: string): IR.IRExportSpecifier {
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
function transformVectorImport(
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

//-----------------------------------------------------------------------------
// JS Interop Transformers
//-----------------------------------------------------------------------------

/**
 * Transform JavaScript "new" expressions
 */
function transformJsNew(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 2) {
        throw new ValidationError(
          "js-new requires a constructor and optional arguments",
          "js-new",
          "at least 1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const constructor = transformNode(list.elements[1], currentDir);
      if (!constructor) {
        throw new ValidationError(
          "Constructor transformed to null",
          "js-new",
          "valid constructor expression",
          "null",
        );
      }

      let args: IR.IRNode[] = [];
      if (list.elements.length > 2) {
        const argsNode = list.elements[2];
        if (argsNode.type !== "list") {
          throw new ValidationError(
            "js-new arguments must be a list",
            "js-new",
            "list",
            argsNode.type,
          );
        }
        args = (argsNode as ListNode).elements.map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-new argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });
      }

      return {
        type: IR.IRNodeType.NewExpression,
        callee: constructor,
        arguments: args,
      } as IR.IRNewExpression;
    },
    "transformJsNew",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript property access
 */
function transformJsGet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-get requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-get",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-get",
          "valid object expression",
          "null",
        );
      }

      try {
        const property = extractStringLiteral(list.elements[2]);
        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property: {
            type: IR.IRNodeType.StringLiteral,
            value: property,
          } as IR.IRStringLiteral,
          computed: true,
        } as IR.IRMemberExpression;
      } catch {
        const propExpr = transformNode(list.elements[2], currentDir);
        if (!propExpr) {
          throw new ValidationError(
            "Property transformed to null",
            "js-get",
            "valid property expression",
            "null",
          );
        }
        return {
          type: IR.IRNodeType.MemberExpression,
          object,
          property: propExpr,
          computed: true,
        } as IR.IRMemberExpression;
      }
    },
    "transformJsGet",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript method calls
 */
function transformJsCall(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 3) {
        throw new ValidationError(
          `js-call requires at least 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-call",
          "at least 2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-call",
          "valid object expression",
          "null",
        );
      }

      try {
        // Check if the second argument is a string literal
        const method = extractStringLiteral(list.elements[2]);
        const args = list.elements.slice(3).map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-call argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });

        // Create a CallExpression that accesses the method via bracket notation
        return {
          type: IR.IRNodeType.CallExpression,
          callee: {
            type: IR.IRNodeType.MemberExpression,
            object: object,
            property: { type: IR.IRNodeType.StringLiteral, value: method },
            computed: true,
          },
          arguments: args,
        };
      } catch {
        // If the second argument isn't a string literal, handle it differently
        const methodExpr = transformNode(list.elements[2], currentDir);
        if (!methodExpr) {
          throw new ValidationError(
            "Method transformed to null",
            "js-call",
            "valid method expression",
            "null",
          );
        }

        const args = list.elements.slice(3).map((arg) => {
          const transformed = transformNode(arg, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Argument transformed to null: ${JSON.stringify(arg)}`,
              "js-call argument",
              "valid expression",
              "null",
            );
          }
          return transformed;
        });

        // If the method is a MemberExpression (e.g. from js-get), use it directly
        if (methodExpr.type === IR.IRNodeType.MemberExpression) {
          return {
            type: IR.IRNodeType.CallExpression,
            callee: methodExpr,
            arguments: args,
          };
        } else {
          // Otherwise create a member expression
          return {
            type: IR.IRNodeType.CallExpression,
            callee: {
              type: IR.IRNodeType.MemberExpression,
              object: object,
              property: methodExpr,
              computed: true,
            },
            arguments: args,
          };
        }
      }
    },
    "transformJsCall",
    TransformError,
    [list],
  );
}

/**
 * Transform JavaScript property access with optional invocation
 */
// src/transpiler/hql-ast-to-hql-ir.ts - Enhanced js-get-invoke transformation

/**
 * Transform JavaScript property access with optional invocation
 */
function transformJsGetInvoke(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `js-get-invoke requires exactly 2 arguments, got ${
            list.elements.length - 1
          }`,
          "js-get-invoke",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const object = transformNode(list.elements[1], currentDir);
      if (!object) {
        throw new ValidationError(
          "Object transformed to null",
          "js-get-invoke",
          "valid object expression",
          "null",
        );
      }

      // Get the property name
      let propertyName: string;
      try {
        if (list.elements[2].type === "literal") {
          propertyName = String(list.elements[2].value);
        } else if (list.elements[2].type === "symbol") {
          propertyName = list.elements[2].name;
        } else {
          throw new ValidationError(
            "js-get-invoke property must be a string literal or symbol",
            "js-get-invoke",
            "string literal or symbol",
            list.elements[2].type,
          );
        }
      } catch (err) {
        throw new ValidationError(
          `js-get-invoke property must be a string literal or symbol: ${
            err instanceof Error ? err.message : String(err)
          }`,
          "js-get-invoke",
          "string literal or symbol",
          "other expression type",
        );
      }

      // Create the IR node for the js-get-invoke operation
      // This transforms to an IIFE that checks if the property is a method at runtime
      return {
        type: IR.IRNodeType.InteropIIFE,
        object,
        property: {
          type: IR.IRNodeType.StringLiteral,
          value: propertyName,
        } as IR.IRStringLiteral,
      } as IR.IRInteropIIFE;
    },
    "transformJsGetInvoke",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// Data Structure Transformers
//-----------------------------------------------------------------------------

/**
 * Transform vector literals
 */
function transformVector(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const elements = list.elements.slice(1).map((elem) => {
        const transformed = transformNode(elem, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Vector element transformed to null: ${JSON.stringify(elem)}`,
            "vector element",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });
      return {
        type: IR.IRNodeType.ArrayExpression,
        elements,
      } as IR.IRArrayExpression;
    },
    "transformVector",
    TransformError,
    [list],
  );
}

/**
 * Transform hash-map literals
 */
function transformHashMap(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const properties: IR.IRObjectProperty[] = [];
      const args = list.elements.slice(1);

      for (let i = 0; i < args.length; i += 2) {
        if (i + 1 >= args.length) {
          logger.warn(
            `Incomplete key-value pair in hash-map at index ${i}, skipping`,
          );
          break;
        }
        const keyNode = args[i];
        const valueNode = args[i + 1];

        let keyExpr: IR.IRNode;
        if (keyNode.type === "literal") {
          const val = (keyNode as LiteralNode).value;
          keyExpr = {
            type: IR.IRNodeType.StringLiteral,
            value: String(val),
          } as IR.IRStringLiteral;
        } else if (keyNode.type === "symbol") {
          keyExpr = {
            type: IR.IRNodeType.StringLiteral,
            value: (keyNode as SymbolNode).name,
          } as IR.IRStringLiteral;
        } else {
          const transformed = transformNode(keyNode, currentDir);
          if (!transformed) {
            throw new ValidationError(
              `Map key transformed to null: ${JSON.stringify(keyNode)}`,
              "hash-map key",
              "valid expression",
              "null",
            );
          }
          keyExpr = transformed;
        }

        const valueExpr = transformNode(valueNode, currentDir);
        if (!valueExpr) {
          throw new ValidationError(
            `Map value transformed to null: ${JSON.stringify(valueNode)}`,
            "hash-map value",
            "valid expression",
            "null",
          );
        }

        const objectProperty: IR.IRObjectProperty = {
          type: IR.IRNodeType.ObjectProperty,
          key: keyExpr,
          value: valueExpr,
        };
        properties.push(objectProperty);
      }

      return {
        type: IR.IRNodeType.ObjectExpression,
        properties,
      } as IR.IRObjectExpression;
    },
    "transformHashMap",
    TransformError,
    [list],
  );
}

/**
 * Transform hash-set literals
 */
function transformHashSet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const elements = list.elements.slice(1).map((elem) => {
        const transformed = transformNode(elem, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Set element transformed to null: ${JSON.stringify(elem)}`,
            "hash-set element",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.NewExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "Set",
        } as IR.IRIdentifier,
        arguments: [
          {
            type: IR.IRNodeType.ArrayExpression,
            elements,
          } as IR.IRArrayExpression,
        ],
      } as IR.IRNewExpression;
    },
    "transformHashSet",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// Collection Operation Transformers
//-----------------------------------------------------------------------------

/**
 * Transform collection 'get' operation.
 */
function transformGet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        return transformStandardFunctionCall(list, currentDir);
      }

      const collection = transformNode(list.elements[1], currentDir);
      if (!collection) {
        throw new ValidationError(
          "Collection transformed to null",
          "get operation",
          "valid collection expression",
          "null",
        );
      }

      const index = transformNode(list.elements[2], currentDir);
      if (!index) {
        throw new ValidationError(
          "Index transformed to null",
          "get operation",
          "valid index expression",
          "null",
        );
      }

      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "get",
        } as IR.IRIdentifier,
        arguments: [collection, index],
      } as IR.IRCallExpression;
    },
    "transformGet",
    TransformError,
    [list],
  );
}

/**
 * Transform "new" constructor.
 */
function transformNew(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 2) {
        throw new ValidationError(
          "'new' requires a constructor",
          "new constructor",
          "at least 1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const constructor = transformNode(list.elements[1], currentDir);
      if (!constructor) {
        throw new ValidationError(
          "Constructor transformed to null",
          "new constructor",
          "valid constructor expression",
          "null",
        );
      }

      const args = list.elements.slice(2).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Constructor argument transformed to null: ${JSON.stringify(arg)}`,
            "new constructor argument",
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      return {
        type: IR.IRNodeType.NewExpression,
        callee: constructor,
        arguments: args,
      } as IR.IRNewExpression;
    },
    "transformNew",
    TransformError,
    [list],
  );
}

//-----------------------------------------------------------------------------
// Expression and Statement Transformers
//-----------------------------------------------------------------------------

/**
 * Transform a quoted expression.
 */
function transformQuote(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 2) {
        throw new ValidationError(
          `quote requires exactly 1 argument, got ${list.elements.length - 1}`,
          "quote",
          "1 argument",
          `${list.elements.length - 1} arguments`,
        );
      }

      const quoted = list.elements[1];
      if (quoted.type === "literal") {
        return transformLiteral(quoted as LiteralNode);
      } else if (quoted.type === "symbol") {
        return {
          type: IR.IRNodeType.StringLiteral,
          value: (quoted as SymbolNode).name,
        } as IR.IRStringLiteral;
      } else if (quoted.type === "list") {
        if ((quoted as ListNode).elements.length === 0) {
          return {
            type: IR.IRNodeType.ArrayExpression,
            elements: [],
          } as IR.IRArrayExpression;
        }

        const elements: IR.IRNode[] = (quoted as ListNode).elements.map((
          elem,
        ) =>
          transformQuote(
            {
              type: "list",
              elements: [{ type: "symbol", name: "quote" }, elem],
            },
            currentDir,
          )
        );
        return {
          type: IR.IRNodeType.ArrayExpression,
          elements,
        } as IR.IRArrayExpression;
      }

      throw new ValidationError(
        `Unsupported quoted expression: ${quoted.type}`,
        "quote",
        "literal, symbol, or list",
        quoted.type,
      );
    },
    "transformQuote",
    TransformError,
    [list],
  );
}

/**
 * Transform an if expression.
 */
function transformIf(list: ListNode, currentDir: string): IR.IRNode {
  try {
    if (list.elements.length < 3 || list.elements.length > 4) {
      throw new ValidationError(
        `if requires 2 or 3 arguments, got ${list.elements.length - 1}`,
        "if expression",
        "2 or 3 arguments",
        `${list.elements.length - 1} arguments`,
      );
    }

    const test = transformNode(list.elements[1], currentDir);
    if (!test) {
      throw new ValidationError(
        "Test condition transformed to null",
        "if test",
        "valid test expression",
        "null",
      );
    }

    const consequent = transformNode(list.elements[2], currentDir);
    if (!consequent) {
      throw new ValidationError(
        "Then branch transformed to null",
        "if consequent",
        "valid consequent expression",
        "null",
      );
    }

    const alternate = list.elements.length > 3
      ? transformNode(list.elements[3], currentDir)
      : ({ type: IR.IRNodeType.NullLiteral } as IR.IRNullLiteral);

    if (!alternate) {
      throw new ValidationError(
        "Else branch transformed to null",
        "if alternate",
        "valid alternate expression",
        "null",
      );
    }

    // If we're in a loop context, we need to handle this differently
    if (loopContextStack.length > 0) {
      // Create an if statement rather than a conditional expression
      return {
        type: IR.IRNodeType.IfStatement,
        test,
        consequent,
        alternate,
      } as IR.IRIfStatement;
    }

    // Regular case - create conditional expression
    return {
      type: IR.IRNodeType.ConditionalExpression,
      test,
      consequent,
      alternate,
    } as IR.IRConditionalExpression;
  } catch (error) {
    throw new TransformError(
      `Failed to transform if: ${error instanceof Error ? error.message : String(error)}`,
      "if transformation",
      "valid if expression",
      list
    );
  }
}

function transformLambda(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length < 3) {
        throw new ValidationError(
          "lambda requires parameters and body",
          "lambda expression",
          "parameters and body",
          `${list.elements.length - 1} arguments`,
        );
      }

      const paramsNode = list.elements[1];
      if (paramsNode.type !== "list") {
        throw new ValidationError(
          "lambda parameters must be a list",
          "lambda parameters",
          "list",
          paramsNode.type,
        );
      }

      // Extract parameter names directly from the parameter list
      const paramList = paramsNode as ListNode;
      const params: IR.IRIdentifier[] = [];
      let restParam: IR.IRIdentifier | null = null;
      let restMode = false;

      for (const param of paramList.elements) {
        if (param.type === "symbol") {
          const paramName = (param as SymbolNode).name;

          if (paramName === "&") {
            restMode = true;
            continue;
          }

          if (restMode) {
            if (restParam !== null) {
              throw new ValidationError(
                `Multiple rest parameters not allowed: found '${
                  restParam.name.slice(3)
                }' and '${paramName}'`,
                "rest parameter",
                "single rest parameter",
                "multiple rest parameters",
              );
            }
            restParam = {
              type: IR.IRNodeType.Identifier,
              name: `...${sanitizeIdentifier(paramName)}`,
            } as IR.IRIdentifier;
          } else {
            params.push({
              type: IR.IRNodeType.Identifier,
              name: sanitizeIdentifier(paramName),
            } as IR.IRIdentifier);
          }
        }
      }

      // Skip return type annotation if present
      let bodyStartIndex = 2;
      if (list.elements.length > 2 && list.elements[2].type === "list") {
        const possibleReturnType = list.elements[2] as ListNode;
        if (
          possibleReturnType.elements.length > 0 &&
          possibleReturnType.elements[0].type === "symbol" &&
          (possibleReturnType.elements[0] as SymbolNode).name === "->"
        ) {
          // This is a return type annotation, skip it
          bodyStartIndex = 3;
        }
      }

      // Process the body
      const bodyNodes = processFunctionBody(list.elements.slice(bodyStartIndex), currentDir);

      return {
        type: IR.IRNodeType.FunctionExpression,
        id: null,
        params: [...params, ...(restParam ? [restParam] : [])],
        body: { type: IR.IRNodeType.BlockStatement, body: bodyNodes },
      } as IR.IRFunctionExpression;
    },
    "transformLambda",
    TransformError,
    [list],
  );
}

/**
 * Transform collection access syntax: (myList 2) => (get myList 2)
 */
function transformCollectionAccess(
  list: ListNode,
  op: string,
  currentDir: string,
): IR.IRNode {
  return perform(
    () => {
      const collection = transformNode(list.elements[0], currentDir);
      if (!collection) {
        throw new ValidationError(
          "Collection transformed to null",
          "collection access",
          "valid collection expression",
          "null",
        );
      }

      const index = transformNode(list.elements[1], currentDir);
      if (!index) {
        throw new ValidationError(
          "Index transformed to null",
          "collection access",
          "valid index expression",
          "null",
        );
      }

      // Determine if this is a function call or collection access
      // If the first element is a symbol that contains "lambda" or "function",
      // treat it as a function call
      if (collection.type === IR.IRNodeType.Identifier) {
        const name = (collection as IR.IRIdentifier).name;
        if (name.includes("lambda") || name.includes("function")) {
          // This is likely a lambda or function call
          return {
            type: IR.IRNodeType.CallExpression,
            callee: collection,
            arguments: [index],
          } as IR.IRCallExpression;
        }
      }

      // Otherwise, use the get function for collection access
      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.Identifier,
          name: "get",
        } as IR.IRIdentifier,
        arguments: [collection, index],
      } as IR.IRCallExpression;
    },
    `transformCollectionAccess '${op}'`,
    TransformError,
    [list],
  );
}

/**
 * Process function body expressions, creating return statements
 */
function processFunctionBody(
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

/**
 * Transform primitive operations (+, -, *, /, etc.).
 */
function transformPrimitiveOp(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      const op = (list.elements[0] as SymbolNode).name;
      const args = list.elements.slice(1).map((arg) => {
        const transformed = transformNode(arg, currentDir);
        if (!transformed) {
          throw new ValidationError(
            `Primitive op argument transformed to null: ${JSON.stringify(arg)}`,
            `${op} argument`,
            "valid expression",
            "null",
          );
        }
        return transformed;
      });

      if (op === "+" || op === "-" || op === "*" || op === "/" || op === "%") {
        return transformArithmeticOp(op, args);
      }

      if (
        op === "=" ||
        op === "eq?" ||
        op === "!=" ||
        op === ">" ||
        op === "<" ||
        op === ">=" ||
        op === "<="
      ) {
        return transformComparisonOp(op, args);
      }

      return {
        type: IR.IRNodeType.CallExpression,
        callee: { type: IR.IRNodeType.Identifier, name: op } as IR.IRIdentifier,
        arguments: args,
      } as IR.IRCallExpression;
    },
    "transformPrimitiveOp",
    TransformError,
    [list],
  );
}

/**
 * Transform arithmetic operations (+, -, *, /, %)
 */
function transformArithmeticOp(op: string, args: IR.IRNode[]): IR.IRNode {
  return perform(
    () => {
      if (args.length === 0) {
        throw new ValidationError(
          `${op} requires at least one argument`,
          `${op} operation`,
          "at least 1 argument",
          "0 arguments",
        );
      }

      if (args.length === 1 && (op === "+" || op === "-")) {
        return {
          type: IR.IRNodeType.UnaryExpression,
          operator: op,
          argument: args[0],
        } as IR.IRUnaryExpression;
      }

      if (args.length === 1) {
        const defaultValue = op === "*" || op === "/" ? 1 : 0;
        return {
          type: IR.IRNodeType.BinaryExpression,
          operator: op,
          left: args[0],
          right: {
            type: IR.IRNodeType.NumericLiteral,
            value: defaultValue,
          } as IR.IRNumericLiteral,
        } as IR.IRBinaryExpression;
      }

      let result = args[0];
      for (let i = 1; i < args.length; i++) {
        result = {
          type: IR.IRNodeType.BinaryExpression,
          operator: op,
          left: result,
          right: args[i],
        } as IR.IRBinaryExpression;
      }
      return result;
    },
    `transformArithmeticOp '${op}'`,
    TransformError,
    [op, args],
  );
}

/**
 * Transform comparison operations (=, !=, <, >, <=, >=)
 */
function transformComparisonOp(op: string, args: IR.IRNode[]): IR.IRNode {
  return perform(
    () => {
      if (args.length !== 2) {
        throw new ValidationError(
          `${op} requires exactly 2 arguments, got ${args.length}`,
          `${op} operation`,
          "2 arguments",
          `${args.length} arguments`,
        );
      }

      let jsOp: string;
      switch (op) {
        case "=":
        case "eq?":
          jsOp = "===";
          break;
        case "!=":
          jsOp = "!==";
          break;
        case ">":
        case "<":
        case ">=":
        case "<=":
          jsOp = op;
          break;
        default:
          jsOp = "===";
      }

      return {
        type: IR.IRNodeType.BinaryExpression,
        operator: jsOp,
        left: args[0],
        right: args[1],
      } as IR.IRBinaryExpression;
    },
    `transformComparisonOp '${op}'`,
    TransformError,
    [op, args],
  );
}

// In src/transpiler/hql-ast-to-hql-ir.ts

/**
 * This function resolves the issue with the specific (let (name value) body...)
 * binding pattern used in the test case
 */
function transformLet(list: ListNode, currentDir: string): IR.IRNode {
  // Handle global binding form: (let name value)
  if (list.elements.length === 3 && list.elements[1].type === "symbol") {
    const nameNode = list.elements[1] as SymbolNode;
    const id = transformSymbol(nameNode) as IR.IRIdentifier;
    const init = transformNode(list.elements[2], currentDir);

    if (!init) {
      throw new ValidationError(
        "Let value transformed to null",
        "let value",
        "valid expression",
        "null",
      );
    }

    return {
      type: IR.IRNodeType.VariableDeclaration,
      kind: "const", // Use 'const' for immutable bindings
      declarations: [
        {
          type: IR.IRNodeType.VariableDeclarator,
          id,
          init,
        },
      ],
    } as IR.IRVariableDeclaration;
  }

  // Handle the specific case (let (name value) body...)
  // This is a specific pattern in bug11.hql
  if (list.elements.length >= 2 &&
      list.elements[1].type === "list" &&
      (list.elements[1] as ListNode).elements.length === 2) {

    const bindingList = list.elements[1] as ListNode;
    // Extract name and value
    const nameNode = bindingList.elements[0];
    const valueNode = bindingList.elements[1];

    if (nameNode.type !== "symbol") {
      throw new ValidationError(
        "Binding name must be a symbol",
        "let binding name",
        "symbol",
        nameNode.type
      );
    }

    const name = (nameNode as SymbolNode).name;
    const valueExpr = transformNode(valueNode, currentDir);

    if (!valueExpr) {
      throw new ValidationError(
        `Binding value for '${name}' transformed to null`,
        "let binding value",
        "valid expression",
        "null",
      );
    }

    // Create a variable declaration
    const variableDecl: IR.IRVariableDeclaration = {
      type: IR.IRNodeType.VariableDeclaration,
      kind: "const",
      declarations: [
        {
          type: IR.IRNodeType.VariableDeclarator,
          id: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(name),
          } as IR.IRIdentifier,
          init: valueExpr,
        },
      ],
    };

    // If there are body expressions
    if (list.elements.length > 2) {
      const bodyExprs = list.elements.slice(2);
      const bodyNodes: IR.IRNode[] = [];

      for (const expr of bodyExprs) {
        const node = transformNode(expr, currentDir);
        if (node) bodyNodes.push(node);
      }

      // Create an IIFE to contain our block of code
      return {
        type: IR.IRNodeType.CallExpression,
        callee: {
          type: IR.IRNodeType.FunctionExpression,
          id: null,
          params: [],
          body: {
            type: IR.IRNodeType.BlockStatement,
            body: [variableDecl, ...bodyNodes],
          } as IR.IRBlockStatement,
        } as IR.IRFunctionExpression,
        arguments: [],
      } as IR.IRCallExpression;
    }

    return variableDecl;
  }

  // Handle standard local binding form: (let (name1 value1 name2 value2...) body...)
  if (list.elements.length >= 2 && list.elements[1].type === "list") {
    const bindingsNode = list.elements[1] as ListNode;
    const bodyExprs = list.elements.slice(2);

    // Process bindings as pairs
    const bindings: Array<{ name: string; value: IR.IRNode }> = [];

    for (let i = 0; i < bindingsNode.elements.length; i += 2) {
      if (i + 1 >= bindingsNode.elements.length) {
        throw new ValidationError(
          "Incomplete binding pair in let",
          "let binding",
          "name-value pair",
          "incomplete pair",
        );
      }

      const nameNode = bindingsNode.elements[i];
      if (nameNode.type !== "symbol") {
        throw new ValidationError(
          "Binding name must be a symbol",
          "let binding name",
          "symbol",
          nameNode.type,
        );
      }

      const name = (nameNode as SymbolNode).name;
      const valueExpr = transformNode(bindingsNode.elements[i + 1], currentDir);

      if (!valueExpr) {
        throw new ValidationError(
          `Binding value for '${name}' transformed to null`,
          "let binding value",
          "valid expression",
          "null",
        );
      }

      bindings.push({ name, value: valueExpr });
    }

    // Create variable declarations for all bindings
    const variableDeclarations: IR.IRNode[] = bindings.map((b) => ({
      type: IR.IRNodeType.VariableDeclaration,
      kind: "const", // Use 'const' for immutable bindings
      declarations: [
        {
          type: IR.IRNodeType.VariableDeclarator,
          id: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(b.name),
          } as IR.IRIdentifier,
          init: b.value,
        },
      ],
    } as IR.IRVariableDeclaration));

    // Process body expressions
    const bodyStatements: IR.IRNode[] = [];

    // Process all body expressions
    for (const bodyExpr of bodyExprs) {
      const processedExpr = transformNode(bodyExpr, currentDir);
      if (processedExpr) {
        bodyStatements.push(processedExpr);
      }
    }

    // Create an IIFE to contain our block of code
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.FunctionExpression,
        id: null,
        params: [],
        body: {
          type: IR.IRNodeType.BlockStatement,
          body: [...variableDeclarations, ...bodyStatements],
        } as IR.IRBlockStatement,
      } as IR.IRFunctionExpression,
      arguments: [],
    } as IR.IRCallExpression;
  }

  throw new ValidationError(
    "Invalid let form",
    "let expression",
    "(let name value) or (let (bindings...) body...)",
    "invalid form",
  );
}

/**
 * Transform a var expression (mutable binding).
 * Handles both forms:
 * 1. (var name value) - Global mutable binding
 * 2. (var (name1 value1 name2 value2...) body...) - Local mutable binding block
 */
function transformVar(list: ListNode, currentDir: string): IR.IRNode {
  // Handle global binding form: (var name value)
  if (list.elements.length === 3 && list.elements[1].type === "symbol") {
    const nameNode = list.elements[1] as SymbolNode;
    const id = transformSymbol(nameNode) as IR.IRIdentifier;
    const init = transformNode(list.elements[2], currentDir);

    if (!init) {
      throw new ValidationError(
        "Var value transformed to null",
        "var value",
        "valid expression",
        "null",
      );
    }

    return {
      type: IR.IRNodeType.VariableDeclaration,
      kind: "let", // Use 'let' for mutable bindings
      declarations: [
        {
          type: IR.IRNodeType.VariableDeclarator,
          id,
          init,
        },
      ],
    } as IR.IRVariableDeclaration;
  }

  // Handle local binding form: (var (name1 value1 name2 value2...) body...)
  if (list.elements.length >= 2 && list.elements[1].type === "list") {
    const bindingsNode = list.elements[1] as ListNode;
    const bodyExprs = list.elements.slice(2);

    // Process bindings as pairs
    const bindings: Array<{ name: string; value: IR.IRNode }> = [];

    for (let i = 0; i < bindingsNode.elements.length; i += 2) {
      if (i + 1 >= bindingsNode.elements.length) {
        throw new ValidationError(
          "Incomplete binding pair in var",
          "var binding",
          "name-value pair",
          "incomplete pair",
        );
      }

      const nameNode = bindingsNode.elements[i];
      if (nameNode.type !== "symbol") {
        throw new ValidationError(
          "Binding name must be a symbol",
          "var binding name",
          "symbol",
          nameNode.type,
        );
      }

      const name = (nameNode as SymbolNode).name;
      const valueExpr = transformNode(bindingsNode.elements[i + 1], currentDir);

      if (!valueExpr) {
        throw new ValidationError(
          `Binding value for '${name}' transformed to null`,
          "var binding value",
          "valid expression",
          "null",
        );
      }

      bindings.push({ name, value: valueExpr });
    }

    // Create variable declarations for all bindings
    const variableDeclarations: IR.IRNode[] = bindings.map((b) => ({
      type: IR.IRNodeType.VariableDeclaration,
      kind: "let", // Use 'let' for mutable bindings
      declarations: [
        {
          type: IR.IRNodeType.VariableDeclarator,
          id: {
            type: IR.IRNodeType.Identifier,
            name: sanitizeIdentifier(b.name),
          } as IR.IRIdentifier,
          init: b.value,
        },
      ],
    } as IR.IRVariableDeclaration));

    // Process body expressions
    const bodyStatements: IR.IRNode[] = [];

    // Process all body expressions
    for (const bodyExpr of bodyExprs) {
      const processedExpr = transformNode(bodyExpr, currentDir);
      if (processedExpr) {
        bodyStatements.push(processedExpr);
      }
    }

    // Create an IIFE to contain our block of code
    return {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.FunctionExpression,
        id: null,
        params: [],
        body: {
          type: IR.IRNodeType.BlockStatement,
          body: [...variableDeclarations, ...bodyStatements],
        } as IR.IRBlockStatement,
      } as IR.IRFunctionExpression,
      arguments: [],
    } as IR.IRCallExpression;
  }

  throw new ValidationError(
    "Invalid var form",
    "var expression",
    "(var name value) or (var (bindings...) body...)",
    "invalid form",
  );
}

function transformSet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 3) {
        throw new ValidationError(
          `set! requires exactly 2 arguments: target and value, got ${
            list.elements.length - 1
          }`,
          "set! expression",
          "2 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const targetNode = list.elements[1];
      const valueNode = list.elements[2];

      if (targetNode.type !== "symbol") {
        throw new ValidationError(
          "Assignment target must be a symbol",
          "set! target",
          "symbol",
          targetNode.type,
        );
      }

      const target = transformSymbol(targetNode as SymbolNode);
      const value = transformNode(valueNode, currentDir);

      if (!value) {
        throw new ValidationError(
          "Assignment value transformed to null",
          "set! value",
          "valid expression",
          "null",
        );
      }

      // Create an assignment expression
      return {
        type: IR.IRNodeType.AssignmentExpression,
        operator: "=",
        left: target,
        right: value,
      } as IR.IRAssignmentExpression;
    },
    "transformSet",
    TransformError,
    [list],
  );
}

function transformJsSet(list: ListNode, currentDir: string): IR.IRNode {
  return perform(
    () => {
      if (list.elements.length !== 4) {
        throw new ValidationError(
          "js-set requires exactly 3 arguments: object, key, and value",
          "js-set",
          "3 arguments",
          `${list.elements.length - 1} arguments`,
        );
      }

      const obj = transformNode(list.elements[1], currentDir);
      const key = transformNode(list.elements[2], currentDir);
      const value = transformNode(list.elements[3], currentDir);

      if (!obj || !key || !value) {
        throw new ValidationError(
          "js-set arguments cannot be null",
          "js-set",
          "valid arguments",
          "null arguments",
        );
      }

      // Create a property assignment directly, not a function call
      return {
        type: IR.IRNodeType.AssignmentExpression,
        operator: "=",
        left: {
          type: IR.IRNodeType.MemberExpression,
          object: obj,
          property: key,
          computed: true,
        },
        right: value,
      };
    },
    "transformJsSet",
    TransformError,
    [list],
  );
}

/**
 * Check if a function call has named arguments
 */
function hasNamedArguments(list: ListNode): boolean {
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
 * This enhanced version handles both fx and fn functions
 */
function transformNamedArgumentCall(
  list: ListNode,
  currentDir: string,
): IR.IRNode {
  try {
    const functionName = (list.elements[0] as SymbolNode).name;

    // Check if this is an fx or fn function
    const fxDef = fxFunctionRegistry.get(functionName);
    const fnDef = fnFunctionRegistry.get(functionName);

    // If it's a registered function, use the specialized processor
    if (fxDef) {
      // Process named arguments for fx functions
      return processNamedArgumentsForFx(
        functionName,
        fxDef,
        list.elements.slice(1),
        currentDir,
      );
    } else if (fnDef) {
      // Process named arguments for fn functions
      return processNamedArgumentsForFn(
        functionName,
        fnDef,
        list.elements.slice(1),
        currentDir,
      );
    }

    // Default handling for functions without registry entries
    // Build a single object with all named arguments
    const objProperties: IR.IRObjectProperty[] = [];

    // Process all arguments
    for (let i = 1; i < list.elements.length; i++) {
      const current = list.elements[i];

      // Check if this is a named argument (param: value)
      if (
        current.type === "symbol" && (current as SymbolNode).name.endsWith(":")
      ) {
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
 * Process named arguments for an fx function
 */
function processNamedArgumentsForFx(
  funcName: string,
  funcDef: IR.IRFxFunctionDeclaration,
  args: HQLNode[],
  currentDir: string,
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
  args: HQLNode[],
  currentDir: string,
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
 * Parse parameters with type annotations and default values
 */
function parseParametersWithTypes(
  paramList: ListNode,
  currentDir: string,
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
        if (
          i + 1 < paramList.elements.length &&
          paramList.elements[i + 1].type === "symbol"
        ) {
          const typeName = (paramList.elements[i + 1] as SymbolNode).name;

          // Validate the type
          if (!PRIMITIVE_TYPES.has(typeName)) {
            throw new ValidationError(
              `Unsupported type '${typeName}'. Expected one of: ${
                Array.from(PRIMITIVE_TYPES).join(", ")
              }`,
              "fx parameter type",
              Array.from(PRIMITIVE_TYPES).join(", "),
              typeName,
            );
          }

          // Set the type for this parameter
          types.set(paramName, typeName);

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

  // Validate that all parameters have types
  for (const param of params) {
    // Convert from sanitized name back to original for lookup
    const originalName = param.name.replace(/_/g, "-");

    if (!types.has(originalName)) {
      throw new ValidationError(
        `Parameter '${originalName}' is missing a type annotation`,
        "fx parameter",
        "type annotation",
        "missing type",
      );
    }
  }

  return { params, types, defaults };
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
 * Process and transform a call to an fx function.
 * Handles both positional and named arguments.
 */
function processFxFunctionCall(
  funcName: string,
  funcDef: IR.IRFxFunctionDeclaration,
  args: HQLNode[],
  currentDir: string,
): IR.IRNode {
  // Extract parameter info from the function definition
  const paramNames = funcDef.params.map((p) => p.name);
  const defaultValues = new Map(funcDef.defaults.map((d) => [d.name, d.value]));

  // Process normal positional arguments
  const positionalArgs: HQLNode[] = args;

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

function transformFx(list: ListNode, currentDir: string): IR.IRNode {
  try {
    logger.debug("Transforming fx function");

    // Validate fx syntax
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
    const returnTypeSymbol = returnTypeList.elements[1];

    if (returnTypeSymbol.type !== "symbol") {
      throw new ValidationError(
        "Return type must be a symbol",
        "fx return type",
        "symbol",
        returnTypeSymbol.type,
      );
    }

    const returnType = (returnTypeSymbol as SymbolNode).name;
    // Validate return type is supported
    if (!PRIMITIVE_TYPES.has(returnType)) {
      throw new ValidationError(
        `Unsupported return type '${returnType}'. Expected one of: ${
          Array.from(PRIMITIVE_TYPES).join(", ")
        }`,
        "fx return type",
        Array.from(PRIMITIVE_TYPES).join(", "),
        returnType,
      );
    }

    // Body expressions start from index 4
    const bodyOffset = 4;
    const bodyExpressions = list.elements.slice(bodyOffset);

    // Parse parameters with types and defaults
    const paramsInfo = parseParametersWithTypes(paramList, currentDir);

    // Extract params and body
    const params = paramsInfo.params;
    const paramTypes = paramsInfo.types;
    const defaultValues = paramsInfo.defaults;

    // Check that all parameter types are supported
    for (const [paramName, paramType] of paramTypes.entries()) {
      if (!PRIMITIVE_TYPES.has(paramType)) {
        throw new ValidationError(
          `Parameter '${paramName}' has unsupported type '${paramType}'. Expected one of: ${
            Array.from(PRIMITIVE_TYPES).join(", ")
          }`,
          "fx parameter type",
          Array.from(PRIMITIVE_TYPES).join(", "),
          paramType,
        );
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

/**
 * Generate statements to create deep copies of parameters
 */
function generateParameterCopies(params: IR.IRIdentifier[]): IR.IRNode[] {
  const statements: IR.IRNode[] = [];

  // For each parameter, create an inline deep copy
  for (const param of params) {
    const paramName = param.name;

    // Create an assignment expression for deep copying the parameter
    statements.push({
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
    });
  }

  return statements;
}

function transformCond(list: ListNode, currentDir: string): IR.IRNode {
  // Extract clauses (skip the 'cond' symbol)
  const clauses = list.elements.slice(1);

  // If no clauses, return nil
  if (clauses.length === 0) {
    return { type: IR.IRNodeType.NullLiteral };
  }

  // Process clauses from first to last
  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];

    // Validate clause format
    if (clause.type !== "list" || (clause as ListNode).elements.length < 2) {
      throw new ValidationError(
        "cond clause must be a list with test and result expressions",
        "cond clause",
        "list with test and result",
        clause.type
      );
    }

    const clauseList = clause as ListNode;
    const testExpr = clauseList.elements[0];

    // Handle 'else' or 'true' as the test condition
    if (testExpr.type === "symbol" && (testExpr as SymbolNode).name === "else") {
      const consequent = transformNode(clauseList.elements[1], currentDir);
      return consequent;
    }

    // Evaluate the condition
    const test = transformNode(testExpr, currentDir);
    const consequent = transformNode(clauseList.elements[1], currentDir);

    // If this is the last clause, it becomes the alternate for all previous conditions
    if (i === clauses.length - 1) {
      return {
        type: IR.IRNodeType.ConditionalExpression,
        test,
        consequent,
        alternate: { type: IR.IRNodeType.NullLiteral }
      };
    }

    // Build a nested conditional for each subsequent clause
    const restClauses = list.elements.slice(0, 1).concat(clauses.slice(i + 1));
    const alternate = transformCond({ type: "list", elements: restClauses }, currentDir);

    return {
      type: IR.IRNodeType.ConditionalExpression,
      test,
      consequent,
      alternate
    };
  }

  // Default case if no clauses match (should not reach here)
  return { type: IR.IRNodeType.NullLiteral };
}

function transformMethodCall(list: ListNode, currentDir: string): IR.IRNode {
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
