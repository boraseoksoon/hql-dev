import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./ast.ts";
import { bundleFile, bundleJSModule } from "./bundler.ts";
import { join, relative } from "https://deno.land/std@0.170.0/path/mod.ts";

function isHQLModule(filePath: string): boolean {
  return filePath.endsWith(".hql");
}

/**
 * Transform an array of HQL nodes into a JS module string.
 * All export declarations are collected and appended at the end.
 */
export async function transformAST(
  nodes: HQLNode[],
  currentDir: string,
  visited: Set<string>,
  inModule: boolean = false
): Promise<string> {
  const collectedExports: string[] = [];
  const parts = await Promise.all(
    nodes.map(node =>
      transformNode(node, currentDir, visited, inModule, collectedExports)
    )
  );
  return parts.filter(s => s.trim() !== "").join("\n") + "\n" + collectedExports.join("\n");
}

/**
 * Extend transformNode to take a collectedExports array.
 */
async function transformNode(
  node: HQLNode,
  currentDir: string,
  visited: Set<string>,
  inModule: boolean,
  collectedExports: string[]
): Promise<string> {
  switch (node.type) {
    case "literal":
      return transformLiteral(node as LiteralNode);
    case "symbol":
      return transformSymbol(node as SymbolNode);
    case "list":
      return await transformList(node as ListNode, currentDir, visited, inModule, collectedExports);
    default:
      throw new Error("Unknown node type");
  }
}

/**
 * Transform a literal.  
 * If the literal is a string and it contains the interpolation marker "\( ... )",
 * convert it into a template literal using ES6 interpolation.
 */
function transformLiteral(node: LiteralNode): string {
  const value = node.value;
  if (typeof value === "string" && value.includes("\\(")) {
    // Match one or more backslashes followed by '(' then capture everything up to ')'
    const template = value.replace(/\\+\(([^)]+)\)/g, (_, expr) => '${' + expr + '}');
    return "`" + template + "`";
  }
  return JSON.stringify(value);
}



function transformSymbol(sym: SymbolNode): string {
  // If a symbol starts with a dot, treat it as a shorthand for a string literal.
  if (sym.name.startsWith(".")) {
    return JSON.stringify(sym.name.slice(1));
  }
  return sym.name;
}

/**
 * Process a parameter list.
 * Symbols ending with ":" have their colon removed and the next token (a type annotation) is skipped.
 */
async function transformParameterList(
  paramList: ListNode,
  currentDir: string,
  visited: Set<string>,
  inModule: boolean
): Promise<string[]> {
  const params: string[] = [];
  for (let i = 0; i < paramList.elements.length; i++) {
    const element = paramList.elements[i];
    if (element.type === "symbol") {
      const name = element.name;
      if (name.endsWith(":")) {
        const paramName = name.slice(0, -1);
        params.push(paramName);
        i++; // Skip the type annotation token.
      } else {
        params.push(name);
      }
    } else {
      const transformed = await transformNode(element, currentDir, visited, inModule, []);
      params.push(transformed);
    }
  }
  return params;
}

/**
 * If arguments are provided as named pairs (e.g. ["x:", "100", "y:", "20"]),
 * then build an object literal { x: 100, y: 20 }.
 */
function transformCallArguments(args: string[]): string {
  if (args.length > 0 && args[0].endsWith(":")) {
    if (args.length % 2 !== 0) {
      throw new Error("Named arguments should be provided in pairs.");
    }
    const pairs: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
      let key = args[i];
      if (key.endsWith(":")) key = key.slice(0, -1);
      const value = args[i + 1];
      pairs.push(`${key}: ${value}`);
    }
    return `{ ${pairs.join(", ")} }`;
  } else {
    return args.join(", ");
  }
}

async function transformList(
  node: ListNode,
  currentDir: string,
  visited: Set<string>,
  inModule: boolean,
  collectedExports: string[]
): Promise<string> {
  if (node.elements.length === 0) return "";
  const head = node.elements[0];

  // --- Variable definitions via def ---
  if (head.type === "symbol" && head.name === "def") {
    // Handle import definitions.
    if (
      node.elements.length === 3 &&
      node.elements[2].type === "list" &&
      ((node.elements[2] as ListNode).elements[0] as SymbolNode).name === "import"
    ) {
      const varNode = node.elements[1];
      const importCall = node.elements[2] as ListNode;
      const importArg = importCall.elements[1];
      if (
        importArg.type === "literal" &&
        typeof (importArg as LiteralNode).value === "string"
      ) {
        const url = (importArg as LiteralNode).value;
        if (url.startsWith(".")) {
          const fullPath = join(currentDir, url);
          if (isHQLModule(fullPath)) {
            const moduleCode = await bundleFile(fullPath, visited, true);
            return `const ${varNode.name} = (function(){\nlet exports = {};\n${moduleCode}\nreturn exports;\n})();`;
          } else {
            if (fullPath.endsWith(".js")) {
              const processedJS = await bundleJSModule(fullPath, visited);
              const base64 = btoa(processedJS);
              const dataUrl = `data:application/javascript;base64,${base64}`;
              return `import * as ${varNode.name} from ${JSON.stringify(dataUrl)};`;
            } else {
              const relPath = relative(Deno.cwd(), fullPath);
              const importPath = relPath.startsWith(".") ? relPath : "./" + relPath;
              return `import ${varNode.name} from ${JSON.stringify(importPath)};`;
            }
          }
        }
        // For remote URLs from deno_std, use a namespace import.
        if (url.startsWith("https://deno.land/std")) {
          return `import * as ${varNode.name} from ${JSON.stringify(url)};`;
        } else {
          return `import ${varNode.name} from ${JSON.stringify(url)};`;
        }
      }
    } else if (node.elements.length === 3) {
      // Generic variable definition.
      const varName = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
      const value = await transformNode(node.elements[2], currentDir, visited, inModule, collectedExports);
      return `const ${varName} = ${value};`;
    }
  }

  // --- Built-in forms ---
  if (head.type === "symbol" && head.name === "str") {
    const parts = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return parts.join(" + ");
  }
  if (head.type === "symbol" && head.name === "print") {
    const args = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `console.log(${args.join(", ")});`;
  }
  if (head.type === "symbol" && head.name === "log") {
    const args = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `console.log(${args.join(", ")});`;
  }
  if (head.type === "symbol" && head.name === "get") {
    if (node.elements.length >= 3) {
      const objCode = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
      const propNode = node.elements[2];
      if (propNode.type === "literal") {
        const propName = (propNode as LiteralNode).value;
        return `${objCode}.${propName}`;
      }
    }
  }
  if (head.type === "symbol" && head.name === "list") {
    const items = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `[${items.join(", ")}]`;
  }
  // --- Special: 'vector' built-in ---
  if (head.type === "symbol" && head.name === "vector") {
    const items = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `[${items.join(", ")}]`;
  }
  // --- Special: 'keyword' built-in ---
  if (head.type === "symbol" && head.name === "keyword") {
    if (node.elements.length === 2) {
      const arg = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
      let raw: string;
      try {
        raw = JSON.parse(arg);
      } catch {
        raw = arg;
      }
      return JSON.stringify(":" + raw);
    }
    return JSON.stringify(":undefined");
  }
  // --- Special: 'hash-map' built-in ---
  if (head.type === "symbol" && head.name === "hash-map") {
    const items = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    if (items.length % 2 !== 0) {
      throw new Error("hash-map expects an even number of arguments");
    }
    const pairs: string[] = [];
    for (let i = 0; i < items.length; i += 2) {
      const key = items[i];
      const value = items[i + 1];
      pairs.push(`[${key}]: ${value}`);
    }
    return `({ ${pairs.join(", ")} })`;
  }
  
  // --- Function definitions (named) via defn ---
  if (head.type === "symbol" && head.name === "defn") {
    const name = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
    const argsNode = node.elements[2] as ListNode;
    const params = await transformParameterList(argsNode, currentDir, visited, inModule);
    let bodyStartIndex = 3;
    if (node.elements.length > 3 && node.elements[3].type === "list") {
      const maybeTypeAnnotation = node.elements[3] as ListNode;
      if (
        maybeTypeAnnotation.elements.length > 0 &&
        maybeTypeAnnotation.elements[0].type === "symbol" &&
        (maybeTypeAnnotation.elements[0] as SymbolNode).name === "->"
      ) {
        bodyStartIndex = 4;
      }
    }
    const body = (await Promise.all(
      node.elements.slice(bodyStartIndex).map(e =>
        transformNode(e, currentDir, visited, inModule, collectedExports)
      )
    )).join(";\n");
    // Emit a simple positional function.
    return `function ${name}(${params.join(", ")}) { return ${body}; }`;
  }
  
  // --- Anonymous functions via fn ---
  if (head.type === "symbol" && head.name === "fn") {
    const argsNode = node.elements[1] as ListNode;
    const params = await transformParameterList(argsNode, currentDir, visited, inModule);
    let bodyStartIndex = 2;
    if (node.elements.length > 2 && node.elements[2].type === "list") {
      const maybeTypeAnnotation = node.elements[2] as ListNode;
      if (
        maybeTypeAnnotation.elements.length > 0 &&
        maybeTypeAnnotation.elements[0].type === "symbol" &&
        (maybeTypeAnnotation.elements[0] as SymbolNode).name === "->"
      ) {
        bodyStartIndex = 3;
      }
    }
    const body = (await Promise.all(
      node.elements.slice(bodyStartIndex).map(e =>
        transformNode(e, currentDir, visited, inModule, collectedExports)
      )
    )).join(";\n");
    // Emit a simple positional anonymous function.
    return `(function(${params.join(", ")}) { return ${body}; })`;
  }
  
  // --- Exports ---
  if (head.type === "symbol" && head.name === "export") {
    let exportName = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
    exportName = exportName.replace(/"/g, "");
    const value = await transformNode(node.elements[2], currentDir, visited, inModule, collectedExports);
    if (inModule) {
      collectedExports.push(`exports.${exportName} = ${value};`);
    } else {
      collectedExports.push(`export { ${value} as ${exportName} };`);
    }
    return "";
  }
  
  // --- Arithmetic operators ---
  if (head.type === "symbol" && head.name === "+") {
    const terms = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return terms.join(" + ");
  }
  if (head.type === "symbol" && head.name === "-") {
    const terms = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return terms.join(" - ");
  }
  
  // --- 'new' operator ---
  if (head.type === "symbol" && head.name === "new") {
    const constructor = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
    const args = await Promise.all(
      node.elements.slice(2).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `new ${constructor}(${args.join(", ")})`;
  }
  
  // --- Enum definitions ---
  if (head.type === "symbol" && head.name === "defenum") {
    const enumName = (node.elements[1] as SymbolNode).name;
    const values = node.elements.slice(2).map(e => {
      if (e.type === "symbol") return (e as SymbolNode).name;
      return "";
    });
    const enumEntries = values.map(v => `${v}: "${v}"`).join(", ");
    return `const ${enumName} = { ${enumEntries} };`;
  }
  
  // --- Default: function calls ---
  const func = await transformNode(head, currentDir, visited, inModule, collectedExports);
  const rawArgs = await Promise.all(
    node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
  );
  return `${func}(${transformCallArguments(rawArgs)})`;
}
