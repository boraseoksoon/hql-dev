import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./ast.ts";
import { bundleFile } from "./bundler.ts";
import { join } from "https://deno.land/std@0.170.0/path/mod.ts";

// We'll track local aliases for inlined modules.
const localAliases = new Set<string>();

export async function transformAST(nodes: HQLNode[], currentDir: string, visited: Set<string>): Promise<string> {
  const parts = await Promise.all(nodes.map(node => transformNode(node, currentDir, visited)));
  return parts.filter(part => part.trim() !== "").join("\n");
}

async function transformNode(node: HQLNode, currentDir: string, visited: Set<string>): Promise<string> {
  switch (node.type) {
    case "literal":
      return JSON.stringify((node as LiteralNode).value);
    case "symbol":
      return transformSymbol(node as SymbolNode);
    case "list":
      return await transformList(node as ListNode, currentDir, visited);
    default:
      throw new Error("Unknown node type");
  }
}

// Updated transformSymbol: if symbol has dot and its prefix is a local alias, output only the property.
function transformSymbol(sym: SymbolNode): string {
  if (sym.name.includes(".")) {
    const [alias, prop] = sym.name.split(".");
    if (localAliases.has(alias)) {
      return prop;
    }
  }
  return sym.name;
}

async function transformList(node: ListNode, currentDir: string, visited: Set<string>): Promise<string> {
  if (node.elements.length === 0) return "";
  const head = node.elements[0];
  
  // Handle remote or local import definitions.
  if (head.type === "symbol" && (head as SymbolNode).name === "def") {
    if (node.elements.length === 3) {
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
          // If URL starts with a dot, it's local; inline it.
          if (url.startsWith(".")) {
            const fullPath = join(currentDir, url);
            // Record the alias so that references to mod.sayHi become sayHi.
            localAliases.add((varNode as SymbolNode).name);
            return await bundleFile(fullPath, visited);
          }
          // Otherwise, remote import: output a default import.
          return `import ${varNode.name} from ${JSON.stringify(url)};`;
        }
      }
    }
  }
  
  // Handle built-in "str": (str a b c) -> a + b + c.
  if (head.type === "symbol" && (head as SymbolNode).name === "str") {
    const parts = await Promise.all(node.elements.slice(1).map(e => transformNode(e, currentDir, visited)));
    return parts.join(" + ");
  }
  
  // Handle "print": (print expr) -> console.log(expr);
  if (head.type === "symbol" && (head as SymbolNode).name === "print") {
    const args = await Promise.all(node.elements.slice(1).map(e => transformNode(e, currentDir, visited)));
    return `console.log(${args.join(", ")});`;
  }
  
  // Handle "get": (get obj "prop") -> obj.prop.
  if (head.type === "symbol" && (head as SymbolNode).name === "get") {
    if (node.elements.length >= 3) {
      const objCode = await transformNode(node.elements[1], currentDir, visited);
      const propNode = node.elements[2];
      if (propNode.type === "literal") {
        const propName = (propNode as LiteralNode).value;
        return `${objCode}.${propName}`;
      }
    }
  }
  
  // Handle "list": (list 1 2 3) -> [1, 2, 3].
  if (head.type === "symbol" && (head as SymbolNode).name === "list") {
    const items = await Promise.all(node.elements.slice(1).map(e => transformNode(e, currentDir, visited)));
    return `[${items.join(", ")}]`;
  }
  
  // Handle function definition: (defn name (args) body...)
  if (head.type === "symbol" && (head as SymbolNode).name === "defn") {
    const name = await transformNode(node.elements[1], currentDir, visited);
    const argsNode = node.elements[2] as ListNode;
    const args = (await Promise.all(argsNode.elements.map(e => transformNode(e, currentDir, visited)))).join(", ");
    const body = (await Promise.all(node.elements.slice(3).map(e => transformNode(e, currentDir, visited)))).join(";\n");
    return `function ${name}(${args}) { return ${body}; }`;
  }
  
  // Handle export: (export "name" value) -> export { value as name };
  if (head.type === "symbol" && (head as SymbolNode).name === "export") {
    let exportName = await transformNode(node.elements[1], currentDir, visited);
    exportName = exportName.replace(/"/g, "");
    const value = await transformNode(node.elements[2], currentDir, visited);
    return `export { ${value} as ${exportName} };`;
  }
  
  // Handle addition: (+ x y) -> x + y.
  if (head.type === "symbol" && (head as SymbolNode).name === "+") {
    const terms = await Promise.all(node.elements.slice(1).map(e => transformNode(e, currentDir, visited)));
    return terms.join(" + ");
  }
  
  // Otherwise, treat as a function call.
  const func = await transformNode(head, currentDir, visited);
  const args = await Promise.all(node.elements.slice(1).map(e => transformNode(e, currentDir, visited)));
  return `${func}(${args.join(", ")})`;
}