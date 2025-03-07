// src/macro-expander.ts - Further improved for compatibility with IR transformer
import { HQLNode, ListNode, SymbolNode } from "./transpiler/hql_ast.ts";
import { 
  Env, 
  evaluateForMacro, 
  initializeGlobalEnv, 
  CORE_FORMS,
  makeList,
  makeSymbol,
  makeLiteral
} from "./bootstrap-core.ts";
import { readTextFile } from "./platform/platform.ts";

// Cache the bootstrapped environment
let globalEnv: Env | null = null;

// Initialize the HQL environment with the core library
export async function initMacroEnvironment(): Promise<Env> {
  if (!globalEnv) {
    globalEnv = await initializeGlobalEnv();
    
    // Register basic helper macros directly in JavaScript
    registerBasicMacros(globalEnv);
  }
  
  return globalEnv;
}

// Register essential macros directly in JavaScript
function registerBasicMacros(env: Env): void {
  // defn macro implementation
  const defnMacro: any = (args: HQLNode[], callEnv: Env) => {
    if (args.length < 2) {
      throw new Error("defn requires at least a name and parameters");
    }
    
    const nameNode = args[0];
    let paramsNode = args[1];
    let body: HQLNode[];
    
    // When params are given as a symbol like [name] rather than a proper list
    if (paramsNode.type === "symbol" && 
        (paramsNode as SymbolNode).name.startsWith("[") && 
        (paramsNode as SymbolNode).name.endsWith("]")) {
      // Extract parameter names from the string
      const paramStr = (paramsNode as SymbolNode).name.slice(1, -1);
      const paramNames = paramStr.split(/\s*,\s*/).filter(s => s);
      const paramSymbols = paramNames.map(name => makeSymbol(name.trim()));
      
      // Create a proper list for parameters
      paramsNode = makeList(...paramSymbols);
      body = args.slice(2);
    } else {
      body = args.slice(2);
    }
    
    // Create a fn expression
    const fnExpr = makeList(
      makeSymbol("fn"),
      paramsNode,
      ...body
    );
    
    // Create a def expression
    return makeList(
      makeSymbol("def"),
      nameNode,
      fnExpr
    );
  };
  
  // import macro implementation - direct string literal for compatibility
  const importMacro: any = (args: HQLNode[], callEnv: Env) => {
    if (args.length !== 1) {
      throw new Error("import requires exactly 1 argument (the path)");
    }
    
    // For direct string compatibility with IR transformer
    return makeList(
      makeSymbol("js-import"),
      args[0] // Pass the string literal directly, not quoted
    );
  };
  
  // export macro implementation - direct string literal for compatibility
  const exportMacro: any = (args: HQLNode[], callEnv: Env) => {
    if (args.length !== 2) {
      throw new Error("export requires exactly 2 arguments (name and value)");
    }
    
    // For direct string compatibility with IR transformer
    return makeList(
      makeSymbol("js-export"),
      args[0], // Pass the name directly, not quoted
      args[1]
    );
  };
  
  // new macro implementation
  const newMacro: any = (args: HQLNode[], callEnv: Env) => {
    if (args.length < 1) {
      throw new Error("new requires at least a constructor");
    }
    
    const constructorArgs = args.slice(1);
    
    // Create a proper arguments list
    return makeList(
      makeSymbol("js-new"),
      args[0],
      makeList(...constructorArgs)
    );
  };
  
  // Register the macros
  env.defineMacro("defn", defnMacro);
  env.defineMacro("import", importMacro);
  env.defineMacro("export", exportMacro);
  env.defineMacro("new", newMacro);
  
  console.log("Basic macros registered in JavaScript");
}

// Check if a node represents a macro call
function isMacroCall(node: HQLNode, env: Env): boolean {
  if (node.type !== "list") return false;
  
  const list = node as ListNode;
  if (list.elements.length === 0) return false;
  
  const first = list.elements[0];
  if (first.type !== "symbol") return false;
  
  const name = (first as SymbolNode).name;
  
  // Check if it's a core form (never a macro)
  if (CORE_FORMS.has(name)) return false;
  
  // Check if it's a macro in the environment
  return env.hasMacro(name);
}

// Check if a node is a composite JS interop form (object.member)
function isCompositeInterop(node: HQLNode): boolean {
  if (node.type !== "list") return false;
  
  const list = node as ListNode;
  if (list.elements.length === 0) return false;
  
  const first = list.elements[0];
  if (first.type !== "symbol") return false;
  
  return (first as SymbolNode).name.includes(".");
}

// Transform composite JS interop form into core forms
function transformCompositeInterop(node: ListNode): HQLNode {
  const first = node.elements[0] as SymbolNode;
  const parts = first.name.split(".");
  if (parts.length !== 2) {
    throw new Error(`Invalid member access syntax: ${first.name}`);
  }
  
  const objectName = parts[0];
  const memberName = parts[1];
  
  // Determine if it's a method call or property access
  if (node.elements.length > 1) {
    // Method call with arguments
    return makeList(
      makeSymbol("js-call"),
      makeSymbol(objectName),
      makeLiteral(memberName), // Direct string literal for compatibility
      ...node.elements.slice(1)
    );
  } else {
    // Property access
    return makeList(
      makeSymbol("js-get"),
      makeSymbol(objectName),
      makeLiteral(memberName) // Direct string literal for compatibility
    );
  }
}

// Expand macros in an entire AST
export async function expandMacros(nodes: HQLNode[]): Promise<HQLNode[]> {
  const env = await initMacroEnvironment();
  const expanded: HQLNode[] = [];
  
  for (const node of nodes) {
    expanded.push(expandNode(node, env));
  }
  
  return expanded;
}

// Recursively expand macros in a node
export function expandNode(
  node: HQLNode, 
  env: Env
): HQLNode {
  // Handle composite JS interop (obj.member) syntax
  if (isCompositeInterop(node)) {
    const transformed = transformCompositeInterop(node as ListNode);
    return expandNode(transformed, env);
  }
  
  // Handle macro calls
  if (isMacroCall(node, env)) {
    const list = node as ListNode;
    const macroName = (list.elements[0] as SymbolNode).name;
    const macroFn = env.getMacro(macroName)!;
    
    try {
      // Call the macro with unevaluated arguments
      const args = list.elements.slice(1);
      const expanded = macroFn(args, env);
      
      // Recursively expand in case the expansion contains more macros
      return expandNode(expanded, env);
    } catch (error) {
      console.error(`Error expanding macro '${macroName}':`, error);
      throw new Error(`Error in macro '${macroName}': ${error.message}`);
    }
  }
  
  // Recursively process lists
  if (node.type === "list") {
    const list = node as ListNode;
    
    // Don't expand inside quote forms
    if (list.elements.length > 0 && 
        list.elements[0].type === "symbol" && 
        (list.elements[0] as SymbolNode).name === "quote") {
      return list;
    }
    
    // Process core forms specially (don't expand first element)
    if (list.elements.length > 0 && 
        list.elements[0].type === "symbol" && 
        CORE_FORMS.has((list.elements[0] as SymbolNode).name)) {
      return {
        type: "list",
        elements: [
          list.elements[0],
          ...list.elements.slice(1).map(elem => expandNode(elem, env))
        ]
      };
    }
    
    // For regular lists, expand all elements
    return {
      type: "list",
      elements: list.elements.map(elem => expandNode(elem, env))
    };
  }
  
  // Literals and symbols pass through unchanged
  return node;
}