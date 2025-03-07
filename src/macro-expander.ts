// src/macro-expander.ts - Macro expansion system
import { HQLNode, ListNode, SymbolNode } from "./transpiler/hql_ast.ts";
import { 
  Env, 
  evaluateForMacro, 
  initializeGlobalEnv, 
  CORE_FORMS, 
  isCoreForm,
  makeList,
  makeSymbol,
  makeLiteral
} from "./bootstrap-core.ts";
import { dirname, readTextFile } from "./platform/platform.ts";

// Cache the bootstrapped environment
let globalEnv: Env | null = null;

// Initialize the HQL environment with the core library
export async function initMacroEnvironment(): Promise<Env> {
  if (!globalEnv) {
    globalEnv = await initializeGlobalEnv();
  }
  
  // Load core.hql if not already loaded
  if (!globalEnv.hasMacro("defn")) {
    await loadCoreLibrary(globalEnv);
  }
  
  return globalEnv;
}

// Load the core library of macros defined in HQL
async function loadCoreLibrary(env: Env): Promise<void> {
  try {
    const corePath = Deno.realPathSync("./lib/core.hql");
    const source = await readTextFile(corePath);
    const { parse } = await import("./transpiler/parser.ts");
    
    const ast = parse(source);
    
    // Process each form in the core library
    for (const node of ast) {
      await expandNode(node, env, true);
    }
    
    console.log("Core library loaded successfully");
  } catch (error) {
    console.error("Failed to load core library:", error);
    throw error;
  }
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

// Check if a node is a defmacro form
function isDefMacro(node: HQLNode): boolean {
  if (node.type !== "list") return false;
  
  const list = node as ListNode;
  if (list.elements.length < 4) return false;
  
  const first = list.elements[0];
  if (first.type !== "symbol" || (first as SymbolNode).name !== "defmacro") return false;
  
  return true;
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
      makeLiteral(memberName),
      ...node.elements.slice(1)
    );
  } else {
    // Property access or no-parameter method call that should auto-invoke
    // We use a special form that will generate an IIFE to check if callable
    return makeList(
      makeSymbol("js-get-invoke"),
      makeSymbol(objectName),
      makeLiteral(memberName)
    );
  }
}

// Expand macros in an entire AST
export async function expandMacros(nodes: HQLNode[]): Promise<HQLNode[]> {
  const env = await initMacroEnvironment();
  const expanded: HQLNode[] = [];
  
  for (const node of nodes) {
    expanded.push(await expandNode(node, env));
  }
  
  return expanded;
}

// Recursively expand macros in a node
export async function expandNode(
  node: HQLNode, 
  env: Env, 
  isTopLevel: boolean = false
): Promise<HQLNode> {
  // Special handling for defmacro at top level
  if (isTopLevel && isDefMacro(node)) {
    // Process and register the macro
    evaluateForMacro(node, env);
    
    // Return a placeholder comment node
    const macroName = ((node as ListNode).elements[1] as SymbolNode).name;
    return makeList(
      makeSymbol("comment"),
      makeLiteral(`Defined macro: ${macroName}`)
    );
  }
  
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
    
    // Call the macro with unevaluated arguments
    const args = list.elements.slice(1);
    const expanded = macroFn(args, env);
    
    // Recursively expand in case the expansion contains more macros
    return expandNode(expanded, env);
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
      elements: await Promise.all(list.elements.map(elem => expandNode(elem, env)))
    };
  }
  
  // Literals and symbols pass through unchanged
  return node;
}