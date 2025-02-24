// src/transformer.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./ast.ts";
import { bundleFile, bundleJSModule } from "./bundler.ts";
import { join, relative } from "https://deno.land/std@0.170.0/path/mod.ts";

function isHQLModule(filePath: string): boolean {
  return filePath.endsWith(".hql");
}

export async function transformAST(
  nodes: HQLNode[],
  currentDir: string,
  visited: Set<string>,
  inModule: boolean = false
): Promise<string> {
  const parts = await Promise.all(
    nodes.map(node => transformNode(node, currentDir, visited, inModule))
  );
  return parts.filter(s => s.trim() !== "").join("\n");
}

async function transformNode(
  node: HQLNode,
  currentDir: string,
  visited: Set<string>,
  inModule: boolean
): Promise<string> {
  switch (node.type) {
    case "literal":
      return JSON.stringify((node as LiteralNode).value);
    case "symbol":
      return transformSymbol(node as SymbolNode);
    case "list":
      return await transformList(node as ListNode, currentDir, visited, inModule);
    default:
      throw new Error("Unknown node type");
  }
}

function transformSymbol(sym: SymbolNode): string {
  return sym.name;
}

async function transformList(
  node: ListNode,
  currentDir: string,
  visited: Set<string>,
  inModule: boolean
): Promise<string> {
  if (node.elements.length === 0) return "";
  const head = node.elements[0];

  // Handle local import definitions.
  if (
    head.type === "symbol" &&
    (head as SymbolNode).name === "def" &&
    node.elements.length === 3
  ) {
    const varNode = node.elements[1];
    const importCall = node.elements[2];
    if (
      varNode.type === "symbol" &&
      importCall.type === "list" &&
      (importCall as ListNode).elements.length >= 2 &&
      (((importCall as ListNode).elements[0]) as SymbolNode).name === "import"
    ) {
      const importArg = (importCall as ListNode).elements[1];
      if (
        importArg.type === "literal" &&
        typeof (importArg as LiteralNode).value === "string"
      ) {
        const url = (importArg as LiteralNode).value;
        if (url.startsWith(".")) {
          const fullPath = join(currentDir, url);
          if (isHQLModule(fullPath)) {
            // Inline HQL module: compile it in module mode and wrap in an IIFE with a variable declaration.
            const moduleCode = await bundleFile(fullPath, visited, true);
            return `const ${varNode.name} = (function(){\nlet exports = {};\n${moduleCode}\nreturn exports;\n})();`;
          } else {
            if (fullPath.endsWith(".js")) {
              const processedJS = await bundleJSModule(fullPath, visited);
              const base64 = btoa(processedJS);
              const dataUrl = `data:text/javascript;base64,${base64}`;
              return `import * as ${varNode.name} from ${JSON.stringify(dataUrl)};`;
            } else {
              const relPath = relative(Deno.cwd(), fullPath);
              const importPath = relPath.startsWith(".") ? relPath : "./" + relPath;
              return `import ${varNode.name} from ${JSON.stringify(importPath)};`;
            }
          }
        }
        return `import ${varNode.name} from ${JSON.stringify(url)};`;
      }
    }
  }

  // Built-in forms
  if (head.type === "symbol" && (head as SymbolNode).name === "str") {
    const parts = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule))
    );
    return parts.join(" + ");
  }

  if (head.type === "symbol" && (head as SymbolNode).name === "print") {
    const args = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule))
    );
    return `console.log(${args.join(", ")});`;
  }

  if (head.type === "symbol" && (head as SymbolNode).name === "get") {
    if (node.elements.length >= 3) {
      const objCode = await transformNode(node.elements[1], currentDir, visited, inModule);
      const propNode = node.elements[2];
      if (propNode.type === "literal") {
        const propName = (propNode as LiteralNode).value;
        return `${objCode}.${propName}`;
      }
    }
  }

  if (head.type === "symbol" && (head as SymbolNode).name === "list") {
    const items = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule))
    );
    return `[${items.join(", ")}]`;
  }

  if (head.type === "symbol" && (head as SymbolNode).name === "defn") {
    const name = await transformNode(node.elements[1], currentDir, visited, inModule);
    const argsNode = node.elements[2] as ListNode;
    const args = (await Promise.all(
      argsNode.elements.map(e => transformNode(e, currentDir, visited, inModule))
    )).join(", ");
    const body = (await Promise.all(
      node.elements.slice(3).map(e => transformNode(e, currentDir, visited, inModule))
    )).join(";\n");
    return `function ${name}(${args}) { return ${body}; }`;
  }

  if (head.type === "symbol" && (head as SymbolNode).name === "export") {
    let exportName = await transformNode(node.elements[1], currentDir, visited, inModule);
    exportName = exportName.replace(/"/g, "");
    const value = await transformNode(node.elements[2], currentDir, visited, inModule);
    if (inModule) {
      return `exports.${exportName} = ${value};`;
    } else {
      return `export { ${value} as ${exportName} };`;
    }
  }

  if (head.type === "symbol" && (head as SymbolNode).name === "+") {
    const terms = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule))
    );
    return terms.join(" + ");
  }

  const func = await transformNode(head, currentDir, visited, inModule);
  const args = await Promise.all(
    node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule))
  );
  return `${func}(${args.join(", ")})`;
}
