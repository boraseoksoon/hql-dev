// src/macro.ts
import {
  HQLNode,
  SymbolNode,
  ListNode,
  LiteralNode,
  JsonObjectLiteralNode,
  JsonArrayLiteralNode,
  ExtendedDefnNode
} from "./transpiler/hql_ast.ts";

/** 
 * A macro function takes a list node and returns a transformed HQLNode.
 */
export type MacroFunction = (node: ListNode) => HQLNode;

/** 
 * Global registry for system (and user-defined) macros.
 */
const macroRegistry: Map<string, MacroFunction> = new Map();

/**
 * Define a macro by registering its name and function.
 */
export function defineMacro(name: string, macroFn: MacroFunction): void {
  macroRegistry.set(name, macroFn);
}

/**
 * Check whether a symbol name has an associated macro.
 */
export function isMacro(symbolName: string): boolean {
  return macroRegistry.has(symbolName);
}

/**
 * Apply a macro to a list node.
 */
export function applyMacro(node: ListNode): HQLNode {
  if (node.elements.length === 0) return node;
  const first = node.elements[0];
  if (first.type !== "symbol") return node;
  const symbolName = (first as SymbolNode).name;
  const macroFn = macroRegistry.get(symbolName);
  if (!macroFn) return node;
  return macroFn(node);
}

/**
 * Recursively expand macros in an HQL AST node.
 */
export function expandMacros(node: HQLNode): HQLNode {
  switch (node.type) {
    case "list":
      return expandListMacros(node as ListNode);
    case "jsonObjectLiteral":
      return expandJsonObjectLiteral(node as JsonObjectLiteralNode);
    case "jsonArrayLiteral":
      return expandJsonArrayLiteral(node as JsonArrayLiteralNode);
    case "extendedDefn":
      return expandExtendedDefn(node as ExtendedDefnNode);
    default:
      return node;
  }
}

/**
 * Recursively expand macros in a list node.
 */
function expandListMacros(node: ListNode): HQLNode {
  if (node.elements.length > 0 && node.elements[0].type === "symbol") {
    const symbolName = (node.elements[0] as SymbolNode).name;
    if (macroRegistry.has(symbolName)) {
      const expanded = applyMacro(node);
      return expandMacros(expanded);
    }
  }
  const expandedElements = node.elements.map(expandMacros);
  return { ...node, elements: expandedElements };
}

/**
 * Expand a JSON object literal into a canonical hash-map form.
 * It transforms {"key": value} into (hash-map (keyword "key") value ...).
 */
function expandJsonObjectLiteral(node: JsonObjectLiteralNode): HQLNode {
  const elements: HQLNode[] = [
    { type: "symbol", name: "hash-map" } as SymbolNode
  ];
  for (const [key, value] of Object.entries(node.properties)) {
    elements.push({
      type: "list",
      elements: [
        { type: "symbol", name: "keyword" } as SymbolNode,
        { type: "literal", value: key } as LiteralNode
      ]
    } as ListNode);
    elements.push(expandMacros(value));
  }
  return { type: "list", elements } as ListNode;
}

/**
 * Expand a JSON array literal into a canonical vector form.
 * It transforms [a, b, c] into (vector a b c).
 */
function expandJsonArrayLiteral(node: JsonArrayLiteralNode): HQLNode {
  const elements: HQLNode[] = [
    { type: "symbol", name: "vector" } as SymbolNode,
    ...node.elements.map(expandMacros)
  ];
  return { type: "list", elements } as ListNode;
}

function parseExtendedParams(paramList: ListNode): Array<{
  name: string;
  type?: string;
  defaultValue?: HQLNode;
  isNamed?: boolean;
}> {
  const params: Array<{ name: string; type?: string; defaultValue?: HQLNode; isNamed?: boolean }> = [];
  
  for (let i = 0; i < paramList.elements.length; i++) {
    const param = paramList.elements[i];
    
    // Simple symbol case
    if (param.type === "symbol") {
      const symbolName = (param as SymbolNode).name;
      if (symbolName.endsWith(":")) {
        // Named parameter
        const paramName = symbolName.slice(0, -1);
        
        // Check for type indication
        let type = undefined;
        let defaultValue = undefined;
        
        // Look ahead for type
        if (i + 1 < paramList.elements.length && 
            paramList.elements[i + 1].type === "symbol") {
          type = (paramList.elements[i + 1] as SymbolNode).name;
          i++;
          
          // Look ahead for default value
          if (i + 2 < paramList.elements.length && 
              paramList.elements[i + 1].type === "symbol" && 
              (paramList.elements[i + 1] as SymbolNode).name === "=" &&
              i + 3 < paramList.elements.length) {
            defaultValue = paramList.elements[i + 2];
            i += 2;
          }
        }
        
        params.push({ name: paramName, type, defaultValue, isNamed: true });
      } else {
        // Regular parameter
        params.push({ name: symbolName });
      }
    } else if (param.type === "list") {
      // Complex parameter with type annotations, default values, etc.
      const elements = (param as ListNode).elements;
      if (elements.length >= 1 && elements[0].type === "symbol") {
        let paramName = (elements[0] as SymbolNode).name;
        let isNamed = false;
        
        if (paramName.endsWith(":")) {
          paramName = paramName.slice(0, -1);
          isNamed = true;
        }
        
        let type: string | undefined;
        let defaultValue: HQLNode | undefined;
        
        // Look for type annotation
        if (elements.length >= 3 &&
            elements[1].type === "symbol" &&
            (elements[1] as SymbolNode).name === ":") {
          if (elements[2].type === "symbol") {
            type = (elements[2] as SymbolNode).name;
          }
        }
        
        // Look for default value
        const eqIndex = elements.findIndex(el =>
          el.type === "symbol" && (el as SymbolNode).name === "="
        );
        
        if (eqIndex !== -1 && eqIndex + 1 < elements.length) {
          defaultValue = elements[eqIndex + 1];
        }
        
        params.push({ name: paramName, type, defaultValue, isNamed });
      }
    }
  }
  
  return params;
}

function expandExtendedDefn(node: ExtendedDefnNode): HQLNode {
  const fnName = node.name;
  const params = node.params;
  const body = node.body;

  const hasNamed = params.some(p => p.isNamed === true || p.isNamed);
  
  if (!hasNamed) {
    const required: string[] = [];
    const optional: Array<[string, HQLNode]> = [];
    
    for (const p of params) {
      if (p.defaultValue) {
        // Parameter with default value goes to optional
        optional.push([p.name, p.defaultValue]);
      } else {
        // Parameter without default goes to required
        required.push(p.name);
      }
    }
    
    // Create parameter list elements
    const paramElements: HQLNode[] = required.map(name => ({
      type: "symbol",
      name
    } as SymbolNode));
    
    // Add optional parameters if any
    if (optional.length > 0) {
      paramElements.push({ type: "symbol", name: "&optional" } as SymbolNode);
      
      for (const [name, value] of optional) {
        paramElements.push({
          type: "list",
          elements: [
            { type: "symbol", name },
            expandMacros(value)
          ]
        } as ListNode);
      }
    }
    
    // Return the canonical defun form
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "defun" } as SymbolNode,
        { type: "symbol", name: fnName } as SymbolNode,
        { type: "list", elements: paramElements } as ListNode,
        ...body.map(expandMacros)
      ]
    } as ListNode;
  } else {
    // For named parameters, use a single parameter "params"
    // and prepend the function body with a let binding that destructures the named parameters.
    const namedParams = params.map(p => p.name);
    
    const destructuringLet: HQLNode = {
      type: "list",
      elements: [
        { type: "symbol", name: "let" } as SymbolNode,
        {
          type: "list",
          elements: [
            {
              type: "list",
              elements: [
                { type: "symbol", name: "{" } as SymbolNode,
                ...namedParams.map(n => ({ type: "symbol", name: n } as SymbolNode)),
                { type: "symbol", name: "}" } as SymbolNode
              ]
            } as ListNode,
            { type: "symbol", name: "params" } as SymbolNode
          ]
        } as ListNode,
        ...body.map(expandMacros)
      ]
    } as ListNode;
    
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "defun" } as SymbolNode,
        { type: "symbol", name: fnName } as SymbolNode,
        { type: "list", elements: [{ type: "symbol", name: "params" } as SymbolNode] } as ListNode,
        destructuringLet
      ]
    } as ListNode;
  }
}

/**
 * Define the fx macro.
 * The fx macro transforms an extended function definition into a canonical defun form.
 */
defineMacro("fx", (node: ListNode): HQLNode => {
  if (node.elements.length < 4) {
    throw new Error("fx requires at least a name, parameter list, and a body");
  }
  const name = (node.elements[1] as SymbolNode).name;
  const paramList = node.elements[2] as ListNode;
  let bodyStart = 3;
  let returnType: HQLNode | undefined = undefined;
  if (node.elements[3].type === "symbol" &&
      (node.elements[3] as SymbolNode).name === "->") {
    returnType = node.elements[4];
    bodyStart = 5;
  }
  const params = parseExtendedParams(paramList);
  const body = node.elements.slice(bodyStart);
  const extDefn: ExtendedDefnNode = {
    type: "extendedDefn",
    name,
    params,
    returnType,
    body
  };
  return expandExtendedDefn(extDefn);
});

/**
 * Define the js-map macro.
 * Transforms a JSON-like object literal into a canonical hash-map form.
 */
defineMacro("js-map", (node: ListNode): HQLNode => {
  if (node.elements.length <= 1) {
    return { type: "list", elements: [{ type: "symbol", name: "hash-map" }] };
  }
  const elements: HQLNode[] = [
    { type: "symbol", name: "hash-map" } as SymbolNode
  ];
  for (let i = 1; i < node.elements.length; i++) {
    const pair = node.elements[i] as ListNode;
    const key = pair.elements[0];
    const value = pair.elements[1];
    elements.push({
      type: "list",
      elements: [
        { type: "symbol", name: "keyword" } as SymbolNode,
        key
      ]
    } as ListNode);
    elements.push(value);
  }
  return { type: "list", elements } as ListNode;
});

/**
 * Define the js-array macro.
 * Transforms a literal array into a vector.
 */
defineMacro("js-array", (node: ListNode): HQLNode => {
  const elements: HQLNode[] = [
    { type: "symbol", name: "vector" } as SymbolNode,
    ...node.elements.slice(1)
  ];
  return { type: "list", elements } as ListNode;
});

/**
 * Define the js-set macro.
 * Transforms a set literal #[ ... ] into a new Set call wrapping a vector.
 */
defineMacro("js-set", (node: ListNode): HQLNode => {
  if (node.elements.length <= 1) {
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "new" } as SymbolNode,
        { type: "symbol", name: "Set" } as SymbolNode,
        { type: "list", elements: [{ type: "symbol", name: "vector" }] } as ListNode
      ]
    } as ListNode;
  }
  const arrayElements: HQLNode[] = [
    { type: "symbol", name: "vector" } as SymbolNode,
    ...node.elements.slice(1)
  ];
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "new" } as SymbolNode,
      { type: "symbol", name: "Set" } as SymbolNode,
      { type: "list", elements: arrayElements } as ListNode
    ]
  } as ListNode;
});

/**
 * Initialize the system-level macros.
 */
export function initializeSystemMacros(): void {
  // fx macro - for extended function definition
  defineMacro("fx", (node: ListNode): HQLNode => {
    if (node.elements.length < 4) {
      throw new Error("fx requires at least a name, parameter list, and body");
    }
    
    const name = (node.elements[1] as SymbolNode).name;
    const paramList = node.elements[2] as ListNode;
    let bodyStart = 3;
    let returnType = null;
    
    // Check for return type annotation
    if (node.elements[3].type === "symbol" && 
        (node.elements[3] as SymbolNode).name === "->") {
      returnType = node.elements[4];
      bodyStart = 5;
    }
    
    // Extract parameters with type annotations and defaults
    const params = parseExtendedParams(paramList);
    
    // Extract body
    const body = node.elements.slice(bodyStart);
    
    // Create extended defn node
    return {
      type: "extendedDefn",
      name,
      params,
      returnType,
      body
    } as ExtendedDefnNode;
  });
  
  // js-map macro - for object literals
  defineMacro("js-map", (node: ListNode): HQLNode => {
    if (node.elements.length <= 1) {
      return { type: "list", elements: [{ type: "symbol", name: "hash-map" }] };
    }
    
    const elements: HQLNode[] = [
      { type: "symbol", name: "hash-map" } as SymbolNode
    ];
    
    // Process pairs of key-value
    for (let i = 1; i < node.elements.length; i++) {
      const pair = node.elements[i] as ListNode;
      const key = pair.elements[0];
      const value = pair.elements[1];
      
      // Add (keyword key)
      elements.push({
        type: "list",
        elements: [
          { type: "symbol", name: "keyword" } as SymbolNode,
          key
        ]
      } as ListNode);
      
      // Add value
      elements.push(value);
    }
    
    return {
      type: "list",
      elements
    } as ListNode;
  });
  
  // js-array macro - for array literals
  defineMacro("js-array", (node: ListNode): HQLNode => {
    const elements: HQLNode[] = [
      { type: "symbol", name: "vector" } as SymbolNode,
      ...node.elements.slice(1)
    ];
    
    return {
      type: "list",
      elements
    } as ListNode;
  });
  
  // js-set macro - for set literals
  defineMacro("js-set", (node: ListNode): HQLNode => {
    if (node.elements.length <= 1) {
      // Empty set case
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "new" } as SymbolNode,
          { type: "symbol", name: "Set" } as SymbolNode,
          { 
            type: "list", 
            elements: [
              { type: "symbol", name: "vector" } as SymbolNode
            ]
          } as ListNode
        ]
      } as ListNode;
    }
    
    // Create array from passed elements
    const arrayElements: HQLNode[] = [
      { type: "symbol", name: "vector" } as SymbolNode,
      ...node.elements.slice(1)
    ];
    
    // Create (new Set [elements])
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "new" } as SymbolNode,
        { type: "symbol", name: "Set" } as SymbolNode,
        { type: "list", elements: arrayElements } as ListNode
      ]
    } as ListNode;
  });
}

initializeSystemMacros();