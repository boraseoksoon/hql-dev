// src/transformer.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./ast.ts";

function transformSymbol(sym: SymbolNode): string {
  return sym.name;
}

function transformLiteral(lit: LiteralNode): string {
  return JSON.stringify(lit.value);
}

function transformList(node: ListNode): string {
  if (node.elements.length === 0) return "";

  const head = node.elements[0];
  
// Inside transformList, when handling a remote import definition:
if (head.type === "symbol" && (head as SymbolNode).name === "def") {
    if (node.elements.length === 3) {
      const varNode = node.elements[1];
      const importCall = node.elements[2];
      if (
        varNode.type === "symbol" &&
        importCall.type === "list" &&
        (importCall as ListNode).elements.length >= 2 &&
        ((importCall as ListNode).elements[0] as SymbolNode).name === "import"
      ) {
        const importArg = (importCall as ListNode).elements[1];
        if (
          importArg.type === "literal" &&
          typeof (importArg as LiteralNode).value === "string"
        ) {
          const url = (importArg as LiteralNode).value;
          // GENERIC: do not modify the URL; import as default.
          return `import ${varNode.name} from ${JSON.stringify(url)};`;
        }
      }
    }
  }
  
  // Handle built-in "str": convert (str a b c) into a + b + c.
  if (head.type === "symbol" && (head as SymbolNode).name === "str") {
    const parts = node.elements.slice(1).map(transformNode);
    return parts.join(" + ");
  }
  
  // Handle "print": transform (print expr) into console.log(expr);
  if (head.type === "symbol" && (head as SymbolNode).name === "print") {
    const args = node.elements.slice(1).map(transformNode).join(", ");
    return `console.log(${args});`;
  }
  
  // Handle "get": transform (get obj "prop") into obj.prop.
  if (head.type === "symbol" && (head as SymbolNode).name === "get") {
    if (node.elements.length >= 3) {
      const objCode = transformNode(node.elements[1]);
      const propNode = node.elements[2];
      if (propNode.type === "literal") {
        const propName = (propNode as LiteralNode).value;
        return `${objCode}.${propName}`;
      }
    }
  }
  
  // Handle "list": transform (list 1 2 3) into [1, 2, 3].
  if (head.type === "symbol" && (head as SymbolNode).name === "list") {
    const items = node.elements.slice(1).map(transformNode).join(", ");
    return `[${items}]`;
  }
  
  // Handle function definition.
  if (head.type === "symbol" && (head as SymbolNode).name === "defn") {
    const name = transformNode(node.elements[1]);
    const argsNode = node.elements[2] as ListNode;
    const args = argsNode.elements.map(transformNode).join(", ");
    const body = node.elements.slice(3).map(transformNode).join(";\n");
    return `function ${name}(${args}) { return ${body}; }`;
  }
  
  // Handle export.
  if (head.type === "symbol" && (head as SymbolNode).name === "export") {
    let exportName = transformNode(node.elements[1]).replace(/"/g, "");
    const value = transformNode(node.elements[2]);
    return `export { ${value} as ${exportName} };`;
  }
  
  // Handle addition operator.
  if (head.type === "symbol" && (head as SymbolNode).name === "+") {
    const terms = node.elements.slice(1).map(transformNode).join(" + ");
    return terms;
  }
  
  // Default: function call.
  const func = transformNode(head);
  const args = node.elements.slice(1).map(transformNode).join(", ");
  return `${func}(${args})`;
}

function transformNode(node: HQLNode): string {
  switch (node.type) {
    case "literal":
      return transformLiteral(node as LiteralNode);
    case "symbol":
      return transformSymbol(node as SymbolNode);
    case "list":
      return transformList(node as ListNode);
    default:
      throw new Error("Unknown node type");
  }
}

export function transformAST(nodes: HQLNode[]): string {
  return nodes.map(transformNode).join("\n");
}
