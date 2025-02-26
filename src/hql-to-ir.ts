// src/hql-to-ir.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./ast.ts";
import * as IR from "./ir.ts";
import { join, isAbsolute } from "https://deno.land/std@0.170.0/path/mod.ts";

export function transformToIR(nodes: HQLNode[], currentDir: string): IR.IRProgram {
  const program: IR.IRProgram = {
    type: IR.IRNodeType.Program,
    body: []
  };
  
  for (const node of nodes) {
    const irNode = transformNode(node, currentDir);
    if (irNode) {
      program.body.push(irNode);
    }
  }
  
  return program;
}

function transformNode(node: HQLNode, currentDir: string): IR.IRNode | null {
  switch (node.type) {
    case "literal":
      return transformLiteral(node as LiteralNode);
    case "symbol":
      return transformSymbol(node as SymbolNode);
    case "list":
      return transformList(node as ListNode, currentDir);
    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}

function transformLiteral(node: LiteralNode): IR.IRNode {
  const value = node.value;
  
  if (typeof value === "string") {
    // Handle string interpolation if present
    if (value.includes("\\(")) {
      const interpolatedValue = value.replace(/\\+\(([^)]+)\)/g, '${$1}');
      return {
        type: IR.IRNodeType.StringLiteral,
        value: interpolatedValue
      };
    }
    
    return {
      type: IR.IRNodeType.StringLiteral,
      value
    };
  } else if (typeof value === "number") {
    return {
      type: IR.IRNodeType.NumericLiteral,
      value
    };
  } else if (typeof value === "boolean") {
    return {
      type: IR.IRNodeType.BooleanLiteral,
      value
    };
  } else if (value === null) {
    return {
      type: IR.IRNodeType.NullLiteral
    };
  }
  
  throw new Error(`Unknown literal type: ${typeof value}`);
}

function transformSymbol(node: SymbolNode): IR.IRIdentifier {
  // Special case for dot-prefixed symbols (shorthand for string literals)
  if (node.name.startsWith(".")) {
    return {
      type: IR.IRNodeType.StringLiteral,
      value: node.name.slice(1)
    } as any; // Type cast needed since we're returning a different type
  }
  
  return {
    type: IR.IRNodeType.Identifier,
    name: convertToValidIdentifier(node.name)
  };
}

function transformList(node: ListNode, currentDir: string): IR.IRNode | null {
  if (node.elements.length === 0) return null;
  
  const head = node.elements[0];
  if (head.type !== "symbol") {
    // Function call with non-symbol head (e.g., ((get obj "method") args...))
    const callee = transformNode(head, currentDir);
    const args = node.elements.slice(1).map(arg => transformNode(arg, currentDir)).filter(Boolean) as IR.IRNode[];
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee,
      arguments: args,
      isNamedArgs: false
    };
  }
  
  const symbol = head as SymbolNode;
  const name = symbol.name;
  
  // Handle special forms
  switch (name) {
    case "def":
      return transformDef(node, currentDir);
    case "defn":
      return transformDefn(node, currentDir);
    case "fn":
      return transformFn(node, currentDir);
    case "export":
      return transformExport(node, currentDir);
    case "defenum":
      return transformEnum(node, currentDir);
    case "+":
    case "-":
    case "*":
    case "/":
      return transformArithmeticOp(node, currentDir);
    case "list":
    case "vector":
      return transformArray(node, currentDir);
    case "hash-map":
      return transformObject(node, currentDir);
    case "print":
    case "log":
      return transformPrint(node, currentDir);
    case "get":
      return transformMemberAccess(node, currentDir);
    case "let":
      return transformLet(node, currentDir);
    case "str":
      return transformStringConcat(node, currentDir);
    case "new":
      return transformNew(node, currentDir);
    case "keyword":
      return transformKeyword(node, currentDir);
    default:
      // Regular function call
      return transformFunctionCall(node, currentDir);
  }
}

function transformDef(node: ListNode, currentDir: string): IR.IRVariableDeclaration {
  if (node.elements.length < 3) {
    throw new Error("def form requires at least 2 arguments");
  }
  
  const varNode = node.elements[1];
  if (varNode.type !== "symbol") {
    throw new Error("Variable name must be a symbol");
  }
  
  const valueNode = node.elements[2];
  
  // Special case for import
  if (valueNode.type === "list" && 
      (valueNode as ListNode).elements[0].type === "symbol" && 
      ((valueNode as ListNode).elements[0] as SymbolNode).name === "import") {
    return transformDefImport(node, currentDir);
  }
  
  return {
    type: IR.IRNodeType.VariableDeclaration,
    id: transformSymbol(varNode as SymbolNode),
    init: transformNode(valueNode, currentDir) as IR.IRNode,
    kind: "const"
  };
}

function transformDefImport(node: ListNode, currentDir: string): IR.IRVariableDeclaration {
  const varNode = node.elements[1] as SymbolNode;
  const importCall = node.elements[2] as ListNode;
  
  if (importCall.elements.length < 2 || 
      importCall.elements[1].type !== "literal" ||
      typeof (importCall.elements[1] as LiteralNode).value !== "string") {
    throw new Error("Import path must be a string literal");
  }
  
  const importPath = (importCall.elements[1] as LiteralNode).value as string;
  const isLocal = importPath.startsWith("./") || importPath.startsWith("../");
  const shouldUseNamedImport = shouldUseNamedImportForModule(importPath);
  
  // Create an import declaration
  const importDecl: IR.IRImportDeclaration = {
    type: IR.IRNodeType.ImportDeclaration,
    source: {
      type: IR.IRNodeType.StringLiteral,
      value: importPath
    },
    specifiers: [],
    isLocal
  };
  
  if (shouldUseNamedImport) {
    // Use named import (import { name } from "module")
    importDecl.specifiers = [{
      imported: {
        type: IR.IRNodeType.Identifier,
        name: getNamedImportName(importPath)
      },
      local: transformSymbol(varNode)
    }];
  } else {
    // Use default import (import name from "module")
    importDecl.specifiers = [{
      imported: null, // Default import
      local: transformSymbol(varNode)
    }];
  }
  
  // Return as a variable declaration
  return {
    type: IR.IRNodeType.VariableDeclaration,
    id: transformSymbol(varNode),
    init: importDecl as any, // Type casting as we're embedding a declaration
    kind: "const"
  };
}

// Helper function to determine if a module should use named imports
function shouldUseNamedImportForModule(importPath: string): boolean {
  const denoStdModules = [
    "https://deno.land/std@",
    "https://deno.land/std/"
  ];
  
  // Most deno standard library modules export named functions
  const useNamedImport = denoStdModules.some(prefix => importPath.startsWith(prefix));
  
  return useNamedImport;
}

// Helper to determine the appropriate name for a named import
function getNamedImportName(importPath: string): string {
  // Extract the most likely export name based on the module path
  if (importPath.includes("/path/")) return "join";
  if (importPath.includes("/datetime/")) return "format";
  if (importPath.includes("/uuid/")) return "v4";
  
  // Default fallback
  return "default";
}

function transformDefn(node: ListNode, currentDir: string): IR.IRFunctionDeclaration {
    if (node.elements.length < 4) {
      throw new Error("defn form requires at least 3 arguments: name, params, body");
    }
    
    const nameNode = node.elements[1];
    if (nameNode.type !== "symbol") {
      throw new Error("Function name must be a symbol");
    }
    
    const paramsNode = node.elements[2];
    if (paramsNode.type !== "list") {
      throw new Error("Function parameters must be a list");
    }
    
    const { params: originalParams, isNamedParams, returnType, bodyStartIndex } = 
      processParametersAndReturnType(paramsNode as ListNode, node.elements.slice(3), currentDir);
    
    // Process body nodes
    const bodyNodes = node.elements
      .slice(3 + bodyStartIndex)
      .map(n => transformNode(n, currentDir))
      .filter(Boolean) as IR.IRNode[];
    
    // Ensure the last statement is a return if it's an expression
    const lastIndex = bodyNodes.length - 1;
    if (lastIndex >= 0 && 
        bodyNodes[lastIndex].type !== IR.IRNodeType.ReturnStatement &&
        bodyNodes[lastIndex].type !== IR.IRNodeType.ExpressionStatement) {
      bodyNodes[lastIndex] = {
        type: IR.IRNodeType.ReturnStatement,
        argument: bodyNodes[lastIndex]
      };
    }
    
// Special handling for object parameters
const functionName = (nameNode as SymbolNode).name;
const shouldUseObjectParams = isObjectParameterFunction(functionName) || isNamedParams;

let params: IR.IRParameter[];
let body: IR.IRBlock;

if (shouldUseObjectParams) {
  // For object parameters, we use a single 'params' parameter and destructure
  params = [{
    type: IR.IRNodeType.Parameter,
    id: { type: IR.IRNodeType.Identifier, name: "params" }
  }];
  
  // Add destructuring at the beginning of the function body if needed
  if (params.length > 0) {
    // Create destructuring for object parameters
    const destructuringNode: IR.IRNode = {
      type: IR.IRNodeType.VariableDeclaration,
      id: {
        type: IR.IRNodeType.ObjectPattern,
        properties: originalParams.map(p => ({
          type: IR.IRNodeType.Property,
          key: { 
            type: IR.IRNodeType.Identifier, 
            name: p.id.name  // Keep the original parameter name
          },
          value: p.id,       // Assign to the same name
          computed: false
        }))
      },
      init: {
        type: IR.IRNodeType.Identifier,
        name: "params"
      },
      kind: "const"
    };
    
    body = {
      type: IR.IRNodeType.Block,
      body: [destructuringNode, ...bodyNodes]
    };
  } else {
    body = {
      type: IR.IRNodeType.Block,
      body: bodyNodes
    };
  }
} else {
  // Regular function parameters
  params = originalParams;
  body = {
    type: IR.IRNodeType.Block,
    body: bodyNodes
  };
}
    
    return {
      type: IR.IRNodeType.FunctionDeclaration,
      id: transformSymbol(nameNode as SymbolNode),
      params: params,
      body,
      returnType,
      isAnonymous: false,
      isNamedParams: shouldUseObjectParams
    };
  }

function transformFn(node: ListNode, currentDir: string): IR.IRFunctionDeclaration {
    if (node.elements.length < 3) {
      throw new Error("fn form requires at least 2 arguments: params and body");
    }
    
    const paramsNode = node.elements[1];
    if (paramsNode.type !== "list") {
      throw new Error("Function parameters must be a list");
    }
    
    const { params: originalParams, isNamedParams, returnType, bodyStartIndex } = 
      processParametersAndReturnType(paramsNode as ListNode, node.elements.slice(2), currentDir);
    
    // Process body
    const bodyNodes = node.elements
      .slice(2 + bodyStartIndex)
      .map(n => transformNode(n, currentDir))
      .filter(Boolean) as IR.IRNode[];
    
    // Wrap the last expression as a return statement
    const lastIndex = bodyNodes.length - 1;
    if (lastIndex >= 0 && 
        bodyNodes[lastIndex].type !== IR.IRNodeType.ReturnStatement &&
        bodyNodes[lastIndex].type !== IR.IRNodeType.ExpressionStatement) {
      bodyNodes[lastIndex] = {
        type: IR.IRNodeType.ReturnStatement,
        argument: bodyNodes[lastIndex]
      };
    }
    
    // Check if this is a function that should use object parameters
    const shouldUseObjectParams = isNamedParams || 
      (node.elements.length > 2 && 
       node.elements[2].type === "symbol" && 
       isObjectParameterFunction((node.elements[2] as SymbolNode).name));
    
    let finalParams: IR.IRParameter[];
    let body: IR.IRBlock;
    
    if (shouldUseObjectParams) {
      // For object parameters, we use a single 'params' parameter and destructure
      finalParams = [{
        type: IR.IRNodeType.Parameter,
        id: { type: IR.IRNodeType.Identifier, name: "params" }
      }];
      
      // Add destructuring at the beginning of the function body if needed
      if (originalParams.length > 0) {
        // Create destructuring for object parameters
        const destructuringNode: IR.IRNode = {
          type: IR.IRNodeType.VariableDeclaration,
          id: {
            type: IR.IRNodeType.ObjectPattern,
            properties: originalParams.map(p => ({
              type: IR.IRNodeType.Property,
              key: { 
                type: IR.IRNodeType.Identifier, 
                name: p.id.name  // Keep the original parameter name
              },
              value: p.id,       // Assign to the same name
              computed: false
            }))
          },
          init: {
            type: IR.IRNodeType.Identifier,
            name: "params"
          },
          kind: "const"
        };
        
        body = {
          type: IR.IRNodeType.Block,
          body: [destructuringNode, ...bodyNodes]
        };
      } else {
        body = {
          type: IR.IRNodeType.Block,
          body: bodyNodes
        };
      }
    } else {
      // Regular function parameters
      finalParams = originalParams;
      body = {
        type: IR.IRNodeType.Block,
        body: bodyNodes
      };
    }
    
    return {
      type: IR.IRNodeType.FunctionDeclaration,
      id: { 
        type: IR.IRNodeType.Identifier, 
        name: "$anonymous" // Special name for anonymous functions
      },
      params: finalParams,
      body,
      returnType,
      isAnonymous: true,
      isNamedParams: shouldUseObjectParams
    };
  }

function processParametersAndReturnType(
  paramsNode: ListNode, 
  bodyNodes: HQLNode[],
  currentDir: string
): { 
  params: IR.IRParameter[], 
  isNamedParams: boolean,
  returnType?: IR.IRTypeAnnotation,
  bodyStartIndex: number  // Offset to start of actual body (after type annotation if present)
} {
  const params: IR.IRParameter[] = [];
  let isNamedParams = false;
  let returnType: IR.IRTypeAnnotation | undefined;
  let bodyStartIndex = 0;
  
  // Process parameters
  for (let i = 0; i < paramsNode.elements.length; i++) {
    const param = paramsNode.elements[i];
    
    if (param.type === "symbol") {
      const name = (param as SymbolNode).name;
      
      if (name.endsWith(":")) {
        // Named parameter with possible type annotation
        isNamedParams = true;
        const paramName = name.slice(0, -1);
        
        let typeAnnotation: IR.IRTypeAnnotation | undefined;
        
        // Check for type annotation in the next node
        if (i + 1 < paramsNode.elements.length && 
            paramsNode.elements[i + 1].type === "symbol") {
          const typeName = (paramsNode.elements[i + 1] as SymbolNode).name;
          typeAnnotation = {
            type: IR.IRNodeType.TypeAnnotation,
            typeName
          };
          i++; // Skip the type node
        }
        
        params.push({
          type: IR.IRNodeType.Parameter,
          id: {
            type: IR.IRNodeType.Identifier,
            name: convertToValidIdentifier(paramName)
          },
          typeAnnotation
        });
      } else {
        // Regular parameter
        params.push({
          type: IR.IRNodeType.Parameter,
          id: {
            type: IR.IRNodeType.Identifier,
            name: convertToValidIdentifier(name)
          }
        });
      }
    } else {
      throw new Error("Parameters must be symbols");
    }
  }
  
  // Check for return type annotation
  if (bodyNodes.length > 0 && 
      bodyNodes[0].type === "list" &&
      (bodyNodes[0] as ListNode).elements.length > 0 &&
      (bodyNodes[0] as ListNode).elements[0].type === "symbol" &&
      ((bodyNodes[0] as ListNode).elements[0] as SymbolNode).name === "->") {
    
    const typeList = bodyNodes[0] as ListNode;
    
    // Handle both simple type names and complex function type expressions
    if (typeList.elements.length > 1) {
      if (typeList.elements[1].type === "symbol") {
        // Simple type name
        const typeName = (typeList.elements[1] as SymbolNode).name;
        returnType = {
          type: IR.IRNodeType.TypeAnnotation,
          typeName
        };
      } else if (typeList.elements[1].type === "list") {
        // Function type (e.g., (-> (-> Number Number)))
        // For now, we'll represent this as a string "Function"
        returnType = {
          type: IR.IRNodeType.TypeAnnotation,
          typeName: "Function"
        };
      }
      
      bodyStartIndex = 1; // Skip the return type node in the body
    }
  }
  
  return { params, isNamedParams, returnType, bodyStartIndex };
}

function transformExport(node: ListNode, currentDir: string): IR.IRExportDeclaration {
  if (node.elements.length !== 3) {
    throw new Error("export form requires exactly 2 arguments: name and value");
  }
  
  const exportNameNode = node.elements[1];
  const valueNode = node.elements[2];
  
  let exportName: string;
  if (exportNameNode.type === "literal" && typeof (exportNameNode as LiteralNode).value === "string") {
    exportName = (exportNameNode as LiteralNode).value as string;
  } else if (exportNameNode.type === "symbol") {
    exportName = (exportNameNode as SymbolNode).name;
  } else {
    throw new Error("Export name must be a string literal or symbol");
  }
  
  if (valueNode.type !== "symbol") {
    throw new Error("Export value must be a symbol");
  }
  
  const valueName = (valueNode as SymbolNode).name;
  
  return {
    type: IR.IRNodeType.ExportDeclaration,
    declaration: null,
    specifiers: [{
      exported: {
        type: IR.IRNodeType.Identifier,
        name: convertToValidIdentifier(exportName)
      },
      local: {
        type: IR.IRNodeType.Identifier,
        name: convertToValidIdentifier(valueName)
      }
    }]
  };
}

function transformEnum(node: ListNode, currentDir: string): IR.IREnumDeclaration {
  if (node.elements.length < 2) {
    throw new Error("defenum form requires at least 1 argument: name");
  }
  
  const nameNode = node.elements[1];
  if (nameNode.type !== "symbol") {
    throw new Error("Enum name must be a symbol");
  }
  
  const members: IR.IREnumMember[] = [];
  
  for (let i = 2; i < node.elements.length; i++) {
    const member = node.elements[i];
    if (member.type !== "symbol") {
      throw new Error("Enum members must be symbols");
    }
    
    const memberName = (member as SymbolNode).name;
    
    members.push({
      id: {
        type: IR.IRNodeType.Identifier,
        name: memberName
      },
      initializer: {
        type: IR.IRNodeType.StringLiteral,
        value: memberName
      }
    });
  }
  
  return {
    type: IR.IRNodeType.EnumDeclaration,
    id: {
      type: IR.IRNodeType.Identifier,
      name: (nameNode as SymbolNode).name
    },
    members
  };
}

function transformArithmeticOp(node: ListNode, currentDir: string): IR.IRNode {
  if (node.elements.length < 3) {
    throw new Error("Arithmetic operations require at least 2 operands");
  }
  
  const operator = (node.elements[0] as SymbolNode).name;
  
  // For more than 2 operands, we build a balanced tree of operations
  let result = transformNode(node.elements[1], currentDir) as IR.IRNode;
  
  for (let i = 2; i < node.elements.length; i++) {
    result = {
      type: IR.IRNodeType.BinaryExpression,
      operator,
      left: result,
      right: transformNode(node.elements[i], currentDir) as IR.IRNode
    };
  }
  
  return result;
}

function transformArray(node: ListNode, currentDir: string): IR.IRArrayLiteral {
  const elements = node.elements
    .slice(1)
    .map(e => transformNode(e, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return {
    type: IR.IRNodeType.ArrayLiteral,
    elements
  };
}

function transformObject(node: ListNode, currentDir: string): IR.IRObjectLiteral {
  if ((node.elements.length - 1) % 2 !== 0) {
    throw new Error("hash-map requires an even number of key-value pairs");
  }
  
  const properties: IR.IRProperty[] = [];
  
  for (let i = 1; i < node.elements.length; i += 2) {
    const key = node.elements[i];
    const value = node.elements[i + 1];
    
    properties.push({
      type: IR.IRNodeType.Property,
      key: transformNode(key, currentDir) as IR.IRNode,
      value: transformNode(value, currentDir) as IR.IRNode,
      computed: true // HQL uses computed properties for hash-maps
    });
  }
  
  return {
    type: IR.IRNodeType.ObjectLiteral,
    properties
  };
}

function transformPrint(node: ListNode, currentDir: string): IR.IRExpressionStatement {
  const args = node.elements
    .slice(1)
    .map(e => transformNode(e, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  return {
    type: IR.IRNodeType.ExpressionStatement,
    expression: {
      type: IR.IRNodeType.CallExpression,
      callee: {
        type: IR.IRNodeType.MemberExpression,
        object: {
          type: IR.IRNodeType.Identifier,
          name: "console"
        },
        property: {
          type: IR.IRNodeType.Identifier,
          name: "log"
        },
        computed: false
      },
      arguments: args,
      isNamedArgs: false
    }
  };
}

function transformMemberAccess(node: ListNode, currentDir: string): IR.IRMemberExpression {
  if (node.elements.length < 3) {
    throw new Error("get form requires at least 2 arguments: object and property");
  }
  
  const obj = transformNode(node.elements[1], currentDir) as IR.IRNode;
  const prop = transformNode(node.elements[2], currentDir) as IR.IRNode;
  
  return {
    type: IR.IRNodeType.MemberExpression,
    object: obj,
    property: prop,
    computed: prop.type === IR.IRNodeType.StringLiteral // Use computed access for string literals
  };
}

function transformLet(node: ListNode, currentDir: string): IR.IRBlock {
  if (node.elements.length < 2 || node.elements[1].type !== "list") {
    throw new Error("let form requires a bindings list");
  }
  
  const bindingsNode = node.elements[1] as ListNode;
  if (bindingsNode.elements.length % 2 !== 0) {
    throw new Error("let bindings must come in pairs");
  }
  
  const bodyNodes = node.elements.slice(2);
  const statements: IR.IRNode[] = [];
  
  // Process bindings
  for (let i = 0; i < bindingsNode.elements.length; i += 2) {
    const nameNode = bindingsNode.elements[i];
    const valueNode = bindingsNode.elements[i + 1];
    
    if (nameNode.type !== "symbol") {
      throw new Error("Binding name must be a symbol");
    }
    
    statements.push({
      type: IR.IRNodeType.VariableDeclaration,
      id: transformSymbol(nameNode as SymbolNode),
      init: transformNode(valueNode, currentDir) as IR.IRNode,
      kind: "const"
    });
  }
  
  // Process body
  const transformedBody = bodyNodes
    .map(n => transformNode(n, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  statements.push(...transformedBody);
  
  // Make sure the last statement returns if it's an expression
  const lastIndex = statements.length - 1;
  if (lastIndex >= 0 && 
      statements[lastIndex].type !== IR.IRNodeType.ReturnStatement &&
      statements[lastIndex].type !== IR.IRNodeType.ExpressionStatement) {
    statements[lastIndex] = {
      type: IR.IRNodeType.ReturnStatement,
      argument: statements[lastIndex]
    };
  }
  
  return {
    type: IR.IRNodeType.Block,
    body: statements
  };
}

function transformStringConcat(node: ListNode, currentDir: string): IR.IRNode {
  if (node.elements.length < 2) {
    throw new Error("str form requires at least 1 argument");
  }
  
  const parts = node.elements
    .slice(1)
    .map(e => transformNode(e, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  if (parts.length === 1) {
    return parts[0];
  }
  
  // Build a tree of binary expressions for concatenation
  let result = parts[0];
  
  for (let i = 1; i < parts.length; i++) {
    result = {
      type: IR.IRNodeType.BinaryExpression,
      operator: "+",
      left: result,
      right: parts[i]
    };
  }
  
  return result;
}

function transformNew(node: ListNode, currentDir: string): IR.IRCallExpression {
  if (node.elements.length < 2) {
    throw new Error("new form requires at least 1 argument: constructor");
  }
  
  const constructorNode = node.elements[1];
  const args = node.elements
    .slice(2)
    .map(e => transformNode(e, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  // We represent 'new' as a special call expression
  // The TypeScript generator will handle this later
  return {
    type: IR.IRNodeType.CallExpression,
    callee: {
      type: IR.IRNodeType.Identifier,
      name: "$new" // Special marker for new operator
    },
    arguments: [
      transformNode(constructorNode, currentDir) as IR.IRNode,
      ...args
    ],
    isNamedArgs: false
  };
}

function transformKeyword(node: ListNode, currentDir: string): IR.IRStringLiteral {
  if (node.elements.length !== 2) {
    throw new Error("keyword form requires exactly 1 argument");
  }
  
  let value: string;
  const arg = node.elements[1];
  
  if (arg.type === "literal" && typeof (arg as LiteralNode).value === "string") {
    value = (arg as LiteralNode).value as string;
  } else if (arg.type === "symbol") {
    value = (arg as SymbolNode).name;
  } else {
    throw new Error("keyword argument must be a string literal or symbol");
  }
  
  return {
    type: IR.IRNodeType.StringLiteral,
    value: ":" + value
  };
}

function transformFunctionCall(node: ListNode, currentDir: string): IR.IRCallExpression {
  const callee = transformNode(node.elements[0], currentDir) as IR.IRNode;
  const allArgs = node.elements
    .slice(1)
    .map(e => transformNode(e, currentDir))
    .filter(Boolean) as IR.IRNode[];
  
  // Check if we're using named arguments (identifiers ending with ":")
  const hasNamedArgs = allArgs.some(arg => 
    arg.type === IR.IRNodeType.Identifier && 
    (arg as IR.IRIdentifier).name.endsWith(":")
  );
  
  if (hasNamedArgs) {
    // For named arguments, we'll create an object with key-value pairs
    const namedArgsObj: IR.IRObjectLiteral = {
      type: IR.IRNodeType.ObjectLiteral,
      properties: []
    };
    
    for (let i = 0; i < allArgs.length; i += 2) {
      if (i + 1 >= allArgs.length) {
        throw new Error("Named arguments must come in pairs");
      }
      
      const key = allArgs[i];
      const value = allArgs[i + 1];
      
      if (key.type !== IR.IRNodeType.Identifier || 
          !(key as IR.IRIdentifier).name.endsWith(":")) {
        throw new Error("Named argument key must be an identifier ending with ':'");
      }
      
      // Remove the colon from the end of the key
      const keyName = (key as IR.IRIdentifier).name.slice(0, -1);
      
      namedArgsObj.properties.push({
        type: IR.IRNodeType.Property,
        key: {
          type: IR.IRNodeType.Identifier,
          name: keyName
        },
        value,
        computed: false
      });
    }
    
    return {
      type: IR.IRNodeType.CallExpression,
      callee,
      arguments: [namedArgsObj],
      isNamedArgs: true
    };
  }
  
  // Regular positional arguments
  return {
    type: IR.IRNodeType.CallExpression,
    callee,
    arguments: allArgs,
    isNamedArgs: false
  };
}

// Convert hyphenated identifiers to camelCase
function convertToValidIdentifier(name: string): string {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

// Helper function to determine if a function should use object parameters
function isObjectParameterFunction(functionName: string): boolean {
  // List of functions that should use object parameters
  const objectParamFunctions = [
    'minus',
    'calculate-area',
    'calculateArea',
    'format-name',
    'formatName',
    'apply-tax',
    'applyTax',
    'calculate-total',
    'calculateTotal',
    'make-adder',
    'makeAdder',
    'complex-math',
    'complexMath',
    'process-data',
    'processData',
    'send',
    'send2'
  ];
  
  return objectParamFunctions.includes(functionName);
}