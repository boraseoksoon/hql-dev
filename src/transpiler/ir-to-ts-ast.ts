// src/transpiler/ir-to-ts-ast.ts
import * as IR from "./hql_ir.ts";
import {
  TSNodeType,
  TSSourceFile,
  TSNode,
  TSIdentifier,
  TSStringLiteral,
  TSNumericLiteral,
  TSBooleanLiteral,
  TSNullLiteral,
  TSRaw,
  TSExportDeclaration,
  TSObjectLiteral,
  TSPropertyAssignment,
  TSBinaryExpression,
  TSCallExpression,
  TSVariableDeclaration,
  TSVariableStatement,
  TSFunctionDeclaration,
  TSBlock,
  TSExpressionStatement
} from "./ts-ast-types.ts";
import { convertImportSpecifier } from "./path-utils.ts";

// A cache to avoid re-converting the same IR nodes
const nodeConversionCache = new Map<IR.IRNode, TSNode | TSNode[] | null>();

/**
 * Main entry point: Convert an IRProgram into a TSSourceFile.
 */
export function convertIRToTSAST(program: IR.IRProgram): TSSourceFile {
  nodeConversionCache.clear();
  const statements: TSNode[] = [];

  // Collect import nodes first
  const imports: TSNode[] = [];
  for (const node of program.body) {
    if (isImport(node)) {
      const importNode = processImport(node);
      if (importNode) imports.push(importNode);
    }
  }

  // Process the rest of the nodes
  for (const node of program.body) {
    if (!isImport(node)) {
      const converted = convertNode(node);
      if (converted) {
        if (Array.isArray(converted)) statements.push(...converted);
        else statements.push(converted);
      }
    }
  }

  return {
    type: TSNodeType.SourceFile,
    statements: [...imports, ...statements]
  } as TSSourceFile;
}

/** Check if an IR node is a $$IMPORT variable declaration. */
function isImport(irNode: IR.IRNode): boolean {
  if (irNode.type !== IR.IRNodeType.VariableDeclaration) return false;
  const vd = irNode as IR.IRVariableDeclaration;
  if (vd.init.type !== IR.IRNodeType.CallExpression) return false;
  const callExpr = vd.init as IR.IRCallExpression;
  return (
    callExpr.callee.type === IR.IRNodeType.Identifier &&
    (callExpr.callee as IR.IRIdentifier).name === "$$IMPORT"
  );
}

/** Process a $$IMPORT node into a TSRaw import statement. */
function processImport(irNode: IR.IRNode): TSNode | null {
  if (irNode.type !== IR.IRNodeType.VariableDeclaration) return null;
  const vd = irNode as IR.IRVariableDeclaration;
  const varName = vd.id.name;

  if (vd.init.type !== IR.IRNodeType.CallExpression) return null;
  const callExpr = vd.init as IR.IRCallExpression;
  if (
    callExpr.arguments.length !== 1 ||
    callExpr.arguments[0].type !== IR.IRNodeType.StringLiteral
  ) {
    return null;
  }

  let url = (callExpr.arguments[0] as IR.IRStringLiteral).value;
  url = convertImportSpecifier(url);

  return {
    type: TSNodeType.Raw,
    code:
      `import * as ${varName}_module from "${url}";\n` +
      `const ${varName} = ${varName}_module.default !== undefined ? ${varName}_module.default : ${varName}_module;`
  } as TSRaw;
}

/** Convert a single IR node to a TS node (or array of nodes, or null). */
function convertNode(irNode: IR.IRNode): TSNode | TSNode[] | null {
  if (!irNode) return null;
  if (nodeConversionCache.has(irNode)) {
    return nodeConversionCache.get(irNode) || null;
  }

  let result: TSNode | TSNode[] | null = null;

  switch (irNode.type) {
    case IR.IRNodeType.StringLiteral:
      result = convertStringLiteral(irNode as IR.IRStringLiteral);
      break;
    case IR.IRNodeType.NumericLiteral:
      result = convertNumericLiteral(irNode as IR.IRNumericLiteral);
      break;
    case IR.IRNodeType.BooleanLiteral:
      result = convertBooleanLiteral(irNode as IR.IRBooleanLiteral);
      break;
    case IR.IRNodeType.NullLiteral:
      result = { type: TSNodeType.NullLiteral } as TSNullLiteral;
      break;
    case IR.IRNodeType.KeywordLiteral:
      result = convertKeywordLiteral(irNode as IR.IRKeywordLiteral);
      break;
    case IR.IRNodeType.Identifier:
      result = convertIdentifier(irNode as IR.IRIdentifier);
      break;
    case IR.IRNodeType.ArrayLiteral:
      result = convertArrayLiteral(irNode as IR.IRArrayLiteral);
      break;
    case IR.IRNodeType.ObjectLiteral:
      result = convertObjectLiteral(irNode as IR.IRObjectLiteral);
      break;
    case IR.IRNodeType.BinaryExpression:
      result = convertBinaryExpression(irNode as IR.IRBinaryExpression);
      break;
    case IR.IRNodeType.AssignmentExpression:
      result = convertAssignmentExpression(irNode as IR.IRAssignmentExpression);
      break;
    case IR.IRNodeType.ConditionalExpression:
      result = convertConditionalExpression(irNode as IR.IRConditionalExpression);
      break;
    case IR.IRNodeType.CallExpression:
      result = convertCallExpression(irNode as IR.IRCallExpression);
      break;
    case IR.IRNodeType.NewExpression:
      result = convertNewExpression(irNode as IR.IRNewExpression);
      break;
    case IR.IRNodeType.PropertyAccess:
      result = convertPropertyAccess(irNode as IR.IRPropertyAccess);
      break;
    case IR.IRNodeType.VariableDeclaration:
      result = convertVariableDeclaration(irNode as IR.IRVariableDeclaration);
      break;
    case IR.IRNodeType.FunctionDeclaration:
      result = convertFunctionDeclaration(irNode as IR.IRFunctionDeclaration);
      break;
    case IR.IRNodeType.EnumDeclaration:
      result = convertEnumDeclaration(irNode as IR.IREnumDeclaration);
      break;
    case IR.IRNodeType.ExportDeclaration:
      result = convertExportDeclaration(irNode as IR.IRExportDeclaration);
      break;
    case IR.IRNodeType.ReturnStatement:
      result = convertReturnStatement(irNode as IR.IRReturnStatement);
      break;
    case IR.IRNodeType.IfStatement:
      result = convertIfStatement(irNode as IR.IRIfStatement);
      break;
    case IR.IRNodeType.ForStatement:
      result = convertForStatement(irNode as IR.IRForStatement);
      break;
    case IR.IRNodeType.Block:
      result = convertBlock(irNode as IR.IRBlock);
      break;
    default:
      console.warn(`Unknown IR node type: ${(irNode as any).type}`);
      result = null;
  }

  nodeConversionCache.set(irNode, result);
  return result;
}

/** Convert string literal IR to TS. */
function convertStringLiteral(lit: IR.IRStringLiteral): TSNode {
  const value = lit.value;
  if (typeof value === "string" && value.includes("\\(")) {
    // Possibly transform \(...) to template literal
    const converted = value.replace(/\\\((.*?)\)/g, "${$1}");
    return { type: TSNodeType.Raw, code: `\`${converted}\`` } as TSRaw;
  }
  return {
    type: TSNodeType.StringLiteral,
    text: JSON.stringify(value)
  } as TSStringLiteral;
}

/** Convert numeric literal IR to TS. */
function convertNumericLiteral(numLit: IR.IRNumericLiteral): TSNode {
  return {
    type: TSNodeType.NumericLiteral,
    text: numLit.value.toString()
  } as TSNumericLiteral;
}

/** Convert boolean literal IR to TS. */
function convertBooleanLiteral(boolLit: IR.IRBooleanLiteral): TSNode {
  return {
    type: TSNodeType.BooleanLiteral,
    text: boolLit.value ? "true" : "false"
  } as TSBooleanLiteral;
}

/** Convert keyword literal IR to TS (just store as a string). */
function convertKeywordLiteral(kw: IR.IRKeywordLiteral): TSNode {
  return {
    type: TSNodeType.StringLiteral,
    text: JSON.stringify(kw.value)
  } as TSStringLiteral;
}

/** Convert IR identifier to a TS identifier or string literal. */
function convertIdentifier(idNode: IR.IRIdentifier): TSNode {
  let name = idNode.name;
  if (name.startsWith(".")) {
    // e.g. .foo => string literal
    name = name.slice(1);
    return {
      type: TSNodeType.StringLiteral,
      text: JSON.stringify(name)
    } as TSStringLiteral;
  } else {
    return {
      type: TSNodeType.Identifier,
      text: name
    } as TSIdentifier;
  }
}

/** Convert array literal IR. */
function convertArrayLiteral(irArr: IR.IRArrayLiteral): TSNode {
  const elements = irArr.elements.map(e => nodeToString(convertNode(e)));
  return {
    type: TSNodeType.Raw,
    code: `[${elements.join(", ")}]`
  } as TSRaw;
}

/** Convert object literal IR. */
function convertObjectLiteral(irObj: IR.IRObjectLiteral): TSNode {
  const props = irObj.properties.map(prop => {
    const keyNode = convertNode(prop.key);
    const valNode = convertNode(prop.value);

    // If the key is a TSStringLiteral (not an array), we might unquote it if valid
    if (keyNode && !Array.isArray(keyNode) && keyNode.type === TSNodeType.StringLiteral) {
      const rawKeyText = (keyNode as TSStringLiteral).text; // includes quotes
      const unquoted = rawKeyText.slice(1, -1);
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(unquoted)) {
        return `${unquoted}: ${nodeToString(valNode)}`;
      } else {
        return `[${rawKeyText}]: ${nodeToString(valNode)}`;
      }
    }

    // Fallback
    return `${nodeToString(keyNode)}: ${nodeToString(valNode)}`;
  });
  if (props.length <= 3) {
    return {
      type: TSNodeType.Raw,
      code: `{${props.join(", ")}}`
    } as TSRaw;
  }
  return {
    type: TSNodeType.Raw,
    code: `{\n  ${props.join(",\n  ")}\n}`
  } as TSRaw;
}

/** Convert binary expression IR to TS. */
function convertBinaryExpression(bin: IR.IRBinaryExpression): TSNode {
  const left = nodeToString(convertNode(bin.left));
  const right = nodeToString(convertNode(bin.right));
  return {
    type: TSNodeType.Raw,
    code: `(${left} ${bin.operator} ${right})`
  } as TSRaw;
}

/** Convert assignment expression IR to TS. */
function convertAssignmentExpression(assign: IR.IRAssignmentExpression): TSNode {
  const left = nodeToString(convertNode(assign.left));
  const right = nodeToString(convertNode(assign.right));
  return {
    type: TSNodeType.Raw,
    code: `${left} = ${right}`
  } as TSRaw;
}

/** Convert conditional expression IR to TS. */
function convertConditionalExpression(cond: IR.IRConditionalExpression): TSNode {
  const test = nodeToString(convertNode(cond.test));
  const cons = nodeToString(convertNode(cond.consequent));
  const alt = nodeToString(convertNode(cond.alternate));
  return {
    type: TSNodeType.Raw,
    code: `${test} ? ${cons} : ${alt}`
  } as TSRaw;
}

/** Convert call expression IR to TS. */
function convertCallExpression(call: IR.IRCallExpression): TSNode {
  // If $$IMPORT => empty raw
  if (isImportCall(call)) {
    return { type: TSNodeType.Raw, code: "" } as TSRaw;
  }
  // if str => string concatenation
  if (isStringConcatenation(call)) {
    return handleStringConcatenation(call);
  }

  const callee = nodeToString(convertNode(call.callee));
  const args = call.arguments.map(a => nodeToString(convertNode(a)));
  if (args.length > 3) {
    return {
      type: TSNodeType.Raw,
      code: `${callee}(\n  ${args.join(",\n  ")}\n)`
    } as TSRaw;
  }
  return {
    type: TSNodeType.Raw,
    code: `${callee}(${args.join(", ")})`
  } as TSRaw;
}
function isImportCall(call: IR.IRCallExpression): boolean {
  return (
    call.callee.type === IR.IRNodeType.Identifier &&
    (call.callee as IR.IRIdentifier).name === "$$IMPORT"
  );
}
function isStringConcatenation(call: IR.IRCallExpression): boolean {
  return (
    call.callee.type === IR.IRNodeType.Identifier &&
    (call.callee as IR.IRIdentifier).name === "str"
  );
}
function handleStringConcatenation(call: IR.IRCallExpression): TSNode {
  if (call.arguments.length === 0) {
    return { type: TSNodeType.StringLiteral, text: '""' } as TSStringLiteral;
  }
  const allSimple = call.arguments.every(
    arg => arg.type === IR.IRNodeType.StringLiteral || arg.type === IR.IRNodeType.Identifier
  );
  if (allSimple) {
    // Template literal
    const parts = call.arguments.map(arg => {
      if (arg.type === IR.IRNodeType.StringLiteral) {
        return (arg as IR.IRStringLiteral).value;
      } else {
        return "${" + (arg as IR.IRIdentifier).name + "}";
      }
    });
    return { type: TSNodeType.Raw, code: "`" + parts.join("") + "`" } as TSRaw;
  }
  // fallback: x + y
  const transformedArgs = call.arguments.map(a => nodeToString(convertNode(a)));
  return {
    type: TSNodeType.Raw,
    code: transformedArgs.join(" + ")
  } as TSRaw;
}

/** Convert new expression IR to TS. */
function convertNewExpression(ne: IR.IRNewExpression): TSNode {
  const callee = nodeToString(convertNode(ne.callee));
  const args = ne.arguments.map(a => nodeToString(convertNode(a)));
  if (args.length > 3) {
    return {
      type: TSNodeType.Raw,
      code: `new ${callee}(\n  ${args.join(",\n  ")}\n)`
    } as TSRaw;
  }
  return {
    type: TSNodeType.Raw,
    code: `new ${callee}(${args.join(", ")})`
  } as TSRaw;
}

/** Define convertPropertyAccess function to fix "not defined" error. */
function convertPropertyAccess(propAccess: IR.IRPropertyAccess): TSNode {
  const obj = nodeToString(convertNode(propAccess.object));
  const propNode = convertNode(propAccess.property);
  // If we can't figure out the property, fallback to bracket
  if (!propNode || Array.isArray(propNode)) {
    return {
      type: TSNodeType.Raw,
      code: `${obj}[/*invalid prop*/]`
    } as TSRaw;
  }
  // If string literal, check if we can do dot
  if (propNode.type === TSNodeType.StringLiteral) {
    const raw = (propNode as TSStringLiteral).text; // includes quotes
    const unquoted = raw.slice(1, -1);
    if (propAccess.computed === false && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(unquoted)) {
      // dot access
      return {
        type: TSNodeType.Raw,
        code: `${obj}.${unquoted}`
      } as TSRaw;
    } else {
      // bracket
      return {
        type: TSNodeType.Raw,
        code: `${obj}[${raw}]`
      } as TSRaw;
    }
  }
  // If it's something else, fallback to bracket
  return {
    type: TSNodeType.Raw,
    code: `${obj}[${nodeToString(propNode)}]`
  } as TSRaw;
}

/** Convert variable declaration IR to TS. */
function convertVariableDeclaration(vd: IR.IRVariableDeclaration): TSNode {
  if (isImport(vd)) {
    return { type: TSNodeType.Raw, code: "" } as TSRaw; // empty
  }
  const name = vd.id.name;
  const initStr = nodeToString(convertNode(vd.init));
  return {
    type: TSNodeType.Raw,
    code: `${vd.kind} ${name} = ${initStr};`
  } as TSRaw;
}

/** Convert function declaration IR to TS. */
function convertFunctionDeclaration(fn: IR.IRFunctionDeclaration): TSNode {
  const fnName = fn.id.name;

  // Convert IR params => TS param strings
  let paramsStr: string;
  if (fn.isNamedParams && fn.namedParamIds && fn.namedParamIds.length > 0) {
    // Named parameters => single "params"
    paramsStr = "params";
  } else {
    // Convert each IR param to TS param by calling convertNode
    const paramNames = fn.params.map(param => {
      const tsId = convertNode(param.id) as TSIdentifier; // <== ensure we get a TSIdentifier
      return tsId.text;
    });
    paramsStr = paramNames.join(", ");
  }

  const bodyStr = buildFunctionBody(fn);

  if (fn.isAnonymous) {
    return {
      type: TSNodeType.Raw,
      code: `function(${paramsStr}) ${bodyStr}`
    } as TSRaw;
  } else {
    return {
      type: TSNodeType.Raw,
      code: `function ${fnName}(${paramsStr}) ${bodyStr}`
    } as TSRaw;
  }
}

function buildFunctionBody(fn: IR.IRFunctionDeclaration): string {
  const stmts = fn.body.body.map(node => nodeToString(convertNode(node))).filter(Boolean);
  
  if (fn.isNamedParams && fn.namedParamIds && fn.namedParamIds.length > 0) {
    // destructure
    stmts.unshift(`const { ${fn.namedParamIds.join(", ")} } = params;`);
  }
  if (stmts.length === 0) return "{}";
  if (stmts.length === 1 && stmts[0].length < 60 && !stmts[0].includes("\n")) {
    return `{ ${stmts[0]} }`;
  }
  return `{\n  ${stmts.join("\n  ")}\n}`;
}

/** Convert an enum declaration IR to TS. */
function convertEnumDeclaration(ed: IR.IREnumDeclaration): TSNode {
  const enumName = ed.name.name;
  const members = ed.members.map(m => `${m}: "${m}"`).join(", ");
  if (ed.members.length <= 3) {
    return {
      type: TSNodeType.Raw,
      code: `const ${enumName} = { ${members} };`
    } as TSRaw;
  }
  const lines = ed.members.map(m => `  ${m}: "${m}"`).join(",\n");
  return {
    type: TSNodeType.Raw,
    code: `const ${enumName} = {\n${lines}\n};`
  } as TSRaw;
}

/** Convert an export declaration IR to TS. */
function convertExportDeclaration(ex: IR.IRExportDeclaration): TSNode {
  return {
    type: TSNodeType.ExportDeclaration,
    exports: ex.exports.map(e => ({
      local: e.local.name,
      exported: e.exported
    }))
  } as TSExportDeclaration;
}

/** Convert return statement IR to TS. */
function convertReturnStatement(ret: IR.IRReturnStatement): TSNode {
  if (!ret.argument) {
    return { type: TSNodeType.Raw, code: "return;" } as TSRaw;
  }
  const argStr = nodeToString(convertNode(ret.argument));
  return {
    type: TSNodeType.Raw,
    code: `return ${argStr};`
  } as TSRaw;
}

/** Convert if statement IR to TS. */
function convertIfStatement(ifStmt: IR.IRIfStatement): TSNode {
  const test = nodeToString(convertNode(ifStmt.test));
  const cons = nodeToString(convertNode(ifStmt.consequent));
  if (!ifStmt.alternate) {
    return {
      type: TSNodeType.Raw,
      code: `if (${test}) ${cons}`
    } as TSRaw;
  }
  const alt = nodeToString(convertNode(ifStmt.alternate));
  return {
    type: TSNodeType.Raw,
    code: `if (${test}) ${cons} else ${alt}`
  } as TSRaw;
}

/** Convert for statement IR to TS. */
function convertForStatement(forStmt: IR.IRForStatement): TSNode {
  const init = nodeToString(convertNode(forStmt.init));
  const test = nodeToString(convertNode(forStmt.test));
  const update = forStmt.update ? nodeToString(convertNode(forStmt.update)) : "";
  const body = nodeToString(convertNode(forStmt.body));
  return {
    type: TSNodeType.Raw,
    code: `for (${init}; ${test}; ${update}) ${body}`
  } as TSRaw;
}

/** Convert a block IR to TS. */
function convertBlock(blk: IR.IRBlock): TSNode {
  const stmts = blk.body.map(n => nodeToString(convertNode(n))).filter(Boolean);
  if (stmts.length === 0) {
    return { type: TSNodeType.Raw, code: "{}" } as TSRaw;
  }
  if (stmts.length === 1 && stmts[0].length < 40 && !stmts[0].includes("\n")) {
    return { type: TSNodeType.Raw, code: `{ ${stmts[0]} }` } as TSRaw;
  }
  const joined = stmts.map(s => "  " + s).join("\n");
  return {
    type: TSNodeType.Raw,
    code: `{\n${joined}\n}`
  } as TSRaw;
}

/** Convert a TSNode or array of TSNodes to a string. */
function nodeToString(node: TSNode | TSNode[] | null): string {
  if (!node) return "";
  if (Array.isArray(node)) {
    return node.map(n => nodeToString(n)).join("\n");
  }
  switch (node.type) {
    case TSNodeType.Raw:
      return (node as TSRaw).code;
    case TSNodeType.StringLiteral:
      return (node as TSStringLiteral).text;
    case TSNodeType.NumericLiteral:
      return (node as TSNumericLiteral).text;
    case TSNodeType.BooleanLiteral:
      return (node as TSBooleanLiteral).text;
    case TSNodeType.NullLiteral:
      return "null";
    case TSNodeType.Identifier:
      return (node as TSIdentifier).text;
    case TSNodeType.ExportDeclaration:
      // no direct string output
      return "";
    default:
      console.warn(`Unhandled TS node type in nodeToString: ${node.type}`);
      return "";
  }
}
