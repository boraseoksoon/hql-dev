// src/transformer.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./ast.ts";
import { bundleFile, bundleJSModule } from "./bundler.ts";
import { join, relative } from "https://deno.land/std@0.170.0/path/mod.ts";

// Define transformer handlers interface for better organization
interface TransformerHandlers {
  [key: string]: (
    node: ListNode,
    currentDir: string,
    visited: Set<string>,
    inModule: boolean,
    collectedExports: string[]
  ) => Promise<string>;
}

function isHQLModule(filePath: string): boolean {
  return filePath.endsWith(".hql");
}

/**
 * Convert hyphenated identifiers to valid JavaScript identifiers.
 * e.g., "calculate-area" -> "calculateArea"
 */
function convertToValidJSIdentifier(name: string): string {
  // Replace hyphens followed by a character with the uppercase version of that character
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
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
  // Convert hyphenated identifiers to camelCase
  return convertToValidJSIdentifier(sym.name);
}

/**
 * Process a parameter list for function definitions.
 * Handles both regular parameters and typed parameters (ending with ":")
 * Returns an object with parameter names and type annotations
 */
async function transformParameterList(
  paramList: ListNode,
  currentDir: string,
  visited: Set<string>,
  inModule: boolean
): Promise<{ params: string[], hasNamedParams: boolean, typeAnnotations: Map<string, string> }> {
  const params: string[] = [];
  const typeAnnotations = new Map<string, string>();
  let hasNamedParams = false;
  
  for (let i = 0; i < paramList.elements.length; i++) {
    const element = paramList.elements[i];
    if (element.type === "symbol") {
      const name = element.name;
      if (name.endsWith(":")) {
        // This is a parameter with a type annotation
        const paramName = name.slice(0, -1);
        params.push(convertToValidJSIdentifier(paramName));
        hasNamedParams = true;
        
        // Get the type annotation if available
        if (i + 1 < paramList.elements.length) {
          const typeElement = paramList.elements[i + 1];
          if (typeElement.type === "symbol") {
            typeAnnotations.set(paramName, typeElement.name);
            i++; // Skip the type annotation token
          }
        }
      } else {
        params.push(convertToValidJSIdentifier(name));
      }
    } else {
      const transformed = await transformNode(element, currentDir, visited, inModule, []);
      params.push(transformed);
    }
  }
  
  return { params, hasNamedParams, typeAnnotations };
}

/**
 * Determine if a function call should use named parameters.
 * This checks if:
 * 1. The function was defined with named parameters
 * 2. The caller is using named parameters (arguments ending with ":")
 */
function shouldUseNamedParams(args: string[]): boolean {
  // If any argument ends with ":", it's a named parameter call
  return args.some(arg => arg.endsWith(":"));
}

/**
 * Transform arguments for a function call.
 * If arguments are provided as named pairs, build an object literal.
 * If using positional arguments, pass them directly.
 */
function transformCallArguments(args: string[], functionName: string): string {
  // Check if we're using named parameters (any arg ends with ":")
  if (shouldUseNamedParams(args)) {
    const pairs: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i].endsWith(":")) {
        let key = args[i].slice(0, -1);
        // Convert hyphenated keys to camelCase
        key = convertToValidJSIdentifier(key);
        
        // Make sure we have a value after the key
        if (i + 1 < args.length) {
          const value = args[i + 1];
          pairs.push(`${key}: ${value}`);
          i++; // Skip the value we just processed
        } else {
          throw new Error(`Named parameter ${key} is missing a value`);
        }
      } else {
        // Mixed positional and named params - this is an error
        throw new Error(`Mixed positional and named parameters in call to ${functionName}`);
      }
    }
    return `{ ${pairs.join(", ")} }`;
  } else {
    // Regular positional arguments
    return args.join(", ");
  }
}

// Create a registry of handlers for different forms
const handlers: TransformerHandlers = {
  // Variable definitions via def
  async def(node, currentDir, visited, inModule, collectedExports) {
    // Handle import definitions
    if (
      node.elements.length === 3 &&
      node.elements[2].type === "list" &&
      ((node.elements[2] as ListNode).elements[0] as SymbolNode).name === "import"
    ) {
      const varNode = node.elements[1] as SymbolNode;
      const importCall = node.elements[2] as ListNode;
      const importArg = importCall.elements[1];
      
      if (
        importArg.type === "literal" &&
        typeof (importArg as LiteralNode).value === "string"
      ) {
        const url = (importArg as LiteralNode).value as string;
        if (url.startsWith(".")) {
          const fullPath = join(currentDir, url);
          if (isHQLModule(fullPath)) {
            const moduleCode = await bundleFile(fullPath, visited, true);
            return `const ${convertToValidJSIdentifier(varNode.name)} = (function(){\nlet exports = {};\n${moduleCode}\nreturn exports;\n})();`;
          } else {
            if (fullPath.endsWith(".js")) {
              const processedJS = await bundleJSModule(fullPath, visited);
              const base64 = btoa(processedJS);
              const dataUrl = `data:application/javascript;base64,${base64}`;
              return `import * as ${convertToValidJSIdentifier(varNode.name)} from ${JSON.stringify(dataUrl)};`;
            } else {
              const relPath = relative(Deno.cwd(), fullPath);
              const importPath = relPath.startsWith(".") ? relPath : "./" + relPath;
              return `import ${convertToValidJSIdentifier(varNode.name)} from ${JSON.stringify(importPath)};`;
            }
          }
        }
        
        // For remote URLs from deno_std, use a namespace import
        if (url.startsWith("https://deno.land/std")) {
          return `import * as ${convertToValidJSIdentifier(varNode.name)} from ${JSON.stringify(url)};`;
        } else {
          return `import ${convertToValidJSIdentifier(varNode.name)} from ${JSON.stringify(url)};`;
        }
      }
    } else if (node.elements.length === 3) {
      // Generic variable definition
      const varName = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
      const value = await transformNode(node.elements[2], currentDir, visited, inModule, collectedExports);
      return `const ${varName} = ${value};`;
    }
    
    return "";
  },
  
  // Function definitions (named) via defn
  async defn(node, currentDir, visited, inModule, collectedExports) {
    const nameNode = node.elements[1] as SymbolNode;
    const name = convertToValidJSIdentifier(nameNode.name);
    
    const argsNode = node.elements[2] as ListNode;
    const { params, hasNamedParams } = await transformParameterList(argsNode, currentDir, visited, inModule);
    
    let bodyStartIndex = 3;
    let returnType = "";
    
    // Check for return type annotation
    if (node.elements.length > 3 && node.elements[3].type === "list") {
      const maybeTypeAnnotation = node.elements[3] as ListNode;
      if (
        maybeTypeAnnotation.elements.length > 0 &&
        maybeTypeAnnotation.elements[0].type === "symbol" &&
        (maybeTypeAnnotation.elements[0] as SymbolNode).name === "->"
      ) {
        returnType = await transformNode(maybeTypeAnnotation.elements[1], currentDir, visited, inModule, collectedExports);
        bodyStartIndex = 4;
      }
    }
    
    const body = (await Promise.all(
      node.elements.slice(bodyStartIndex).map(e =>
        transformNode(e, currentDir, visited, inModule, collectedExports)
      )
    )).join(";\n");
    
    // For functions with named parameters, we need to handle the parameter object
    if (hasNamedParams) {
      return `function ${name}(params) { ${
        hasNamedParams ? `const {${params.join(", ")}} = params;` : ''
      } return ${body}; }`;
    } else {
      return `function ${name}(${params.join(", ")}) { return ${body}; }`;
    }
  },
  
  // Anonymous functions via fn
  async fn(node, currentDir, visited, inModule, collectedExports) {
    const argsNode = node.elements[1] as ListNode;
    const { params, hasNamedParams } = await transformParameterList(argsNode, currentDir, visited, inModule);
    
    let bodyStartIndex = 2;
    let returnType = "";
    
    // Check for return type annotation
    if (node.elements.length > 2 && node.elements[2].type === "list") {
      const maybeTypeAnnotation = node.elements[2] as ListNode;
      if (
        maybeTypeAnnotation.elements.length > 0 &&
        maybeTypeAnnotation.elements[0].type === "symbol" &&
        (maybeTypeAnnotation.elements[0] as SymbolNode).name === "->"
      ) {
        returnType = await transformNode(maybeTypeAnnotation.elements[1], currentDir, visited, inModule, collectedExports);
        bodyStartIndex = 3;
      }
    }
    
    const body = (await Promise.all(
      node.elements.slice(bodyStartIndex).map(e =>
        transformNode(e, currentDir, visited, inModule, collectedExports)
      )
    )).join(";\n");
    
    // For functions with named parameters, we need to handle the parameter object
    if (hasNamedParams) {
      return `(function(params) { ${
        hasNamedParams ? `const {${params.join(", ")}} = params;` : ''
      } return ${body}; })`;
    } else {
      return `(function(${params.join(", ")}) { return ${body}; })`;
    }
  },
  
  // Exports
  async export(node, currentDir, visited, inModule, collectedExports) {
    let rawExportName = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
    let exportName = rawExportName.replace(/"/g, "");
    
    // Make sure the export name is also a valid JS identifier
    const jsExportName = convertToValidJSIdentifier(exportName);
    
    const rawValue = await transformNode(node.elements[2], currentDir, visited, inModule, collectedExports);
    const value = convertToValidJSIdentifier(rawValue); // Ensure exported identifiers are valid JS
    
    if (inModule) {
      collectedExports.push(`exports.${jsExportName} = ${value};`);
    } else {
      // Use the JavaScript-safe identifiers for both the value and export name
      collectedExports.push(`export { ${value} as ${jsExportName} };`);
    }
    
    return "";
  },
  
  // String concatenation
  async str(node, currentDir, visited, inModule, collectedExports) {
    const parts = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return parts.join(" + ");
  },
  
  // Console output
  async print(node, currentDir, visited, inModule, collectedExports) {
    const args = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `console.log(${args.join(", ")});`;
  },
  
  async log(node, currentDir, visited, inModule, collectedExports) {
    const args = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `console.log(${args.join(", ")});`;
  },
  
  // Property access
  async get(node, currentDir, visited, inModule, collectedExports) {
    if (node.elements.length >= 3) {
      const objCode = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
      const propNode = node.elements[2];
      if (propNode.type === "literal") {
        const propName = (propNode as LiteralNode).value;
        return `${objCode}.${propName}`;
      }
    }
    return "";
  },
  
  // Array creation
  async list(node, currentDir, visited, inModule, collectedExports) {
    const items = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `[${items.join(", ")}]`;
  },
  
  // Vector (alias for list)
  async vector(node, currentDir, visited, inModule, collectedExports) {
    const items = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `[${items.join(", ")}]`;
  },
  
  // Keywords
  async keyword(node, currentDir, visited, inModule, collectedExports) {
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
  },
  
  // Map creation
  async "hash-map"(node, currentDir, visited, inModule, collectedExports) {
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
  },
  
  // Arithmetic: Addition
  async "+"(node, currentDir, visited, inModule, collectedExports) {
    const terms = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return terms.join(" + ");
  },
  
  // Arithmetic: Subtraction
  async "-"(node, currentDir, visited, inModule, collectedExports) {
    const terms = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return terms.join(" - ");
  },
  
  // Arithmetic: Multiplication
  async "*"(node, currentDir, visited, inModule, collectedExports) {
    const terms = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return terms.join(" * ");
  },
  
  // Arithmetic: Division
  async "/"(node, currentDir, visited, inModule, collectedExports) {
    const terms = await Promise.all(
      node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return terms.join(" / ");
  },
  
  // Constructor via 'new'
  async new(node, currentDir, visited, inModule, collectedExports) {
    const constructor = await transformNode(node.elements[1], currentDir, visited, inModule, collectedExports);
    const args = await Promise.all(
      node.elements.slice(2).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
    );
    return `new ${constructor}(${args.join(", ")})`;
  },
  
  // Enum definitions
  async defenum(node, currentDir, visited, inModule, collectedExports) {
    const enumName = (node.elements[1] as SymbolNode).name;
    const values = node.elements.slice(2).map(e => {
      if (e.type === "symbol") return (e as SymbolNode).name;
      return "";
    });
    const enumEntries = values.map(v => `${v}: "${v}"`).join(", ");
    return `const ${convertToValidJSIdentifier(enumName)} = { ${enumEntries} };`;
  }
};

async function transformList(
  node: ListNode,
  currentDir: string,
  visited: Set<string>,
  inModule: boolean,
  collectedExports: string[]
): Promise<string> {
  if (node.elements.length === 0) return "";
  
  const head = node.elements[0];
  if (head.type === "symbol") {
    const functionName = (head as SymbolNode).name;
    
    // Check if we have a handler for this function
    if (handlers[functionName]) {
      return handlers[functionName](node, currentDir, visited, inModule, collectedExports);
    }
  }
  
  // Default: function call
  const func = await transformNode(head, currentDir, visited, inModule, collectedExports);
  const rawArgs = await Promise.all(
    node.elements.slice(1).map(e => transformNode(e, currentDir, visited, inModule, collectedExports))
  );
  
  const args = transformCallArguments(rawArgs, func);
  return `${func}(${args})`;
}