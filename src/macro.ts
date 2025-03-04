// src/macro.ts - Fix for let bindings in macro expansion
import {
  HQLNode,
  SymbolNode,
  ListNode,
  LiteralNode,
  JsonObjectLiteralNode,
  JsonArrayLiteralNode,
  ExtendedDefnNode,
  ExtendedParam
} from "./transpiler/hql_ast.ts";
import { hyphenToCamel } from "./utils.ts";

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
 * Transforms {"key": value} into (hash-map (keyword "key") value ...).
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
 * Transforms [a, b, c] into (vector a b c).
 */
function expandJsonArrayLiteral(node: JsonArrayLiteralNode): HQLNode {
  const elements: HQLNode[] = [
    { type: "symbol", name: "vector" } as SymbolNode,
    ...node.elements.map(expandMacros)
  ];
  return { type: "list", elements } as ListNode;
}

/**
 * Group the flat parameter list for fx forms.
 * For any symbol that ends with ":", group it together with the next token.
 */
export function groupFxParams(paramList: ListNode): ListNode {
  const newElements: HQLNode[] = [];
  let i = 0;
  while (i < paramList.elements.length) {
    const curr = paramList.elements[i];
    if (curr.type === "symbol" && (curr as SymbolNode).name.endsWith(":")) {
      if (i + 1 < paramList.elements.length) {
        const grouped: ListNode = {
          type: "list",
          elements: [curr, paramList.elements[i + 1]]
        };
        newElements.push(groupFxParams(grouped)); // Recursively group if needed.
        i += 2;
      } else {
        newElements.push(curr);
        i++;
      }
    } else {
      newElements.push(curr);
      i++;
    }
  }
  return { type: "list", elements: newElements };
}

function parseExtendedParam(paramNode: HQLNode): ExtendedParam {
  if (paramNode.type === "symbol") {
    // Handle plain symbol parameters and named parameters (ending with colon)
    let name = (paramNode as SymbolNode).name;
    let hasNamed = false;
    
    if (name.endsWith(":")) {
      name = name.slice(0, -1);
      hasNamed = true;
    }
    
    // Don't apply hyphenToCamel here, we want to preserve the original name
    return { name, isNamed: hasNamed };
  }
  
  if (paramNode.type === "list") {
    const elements = (paramNode as ListNode).elements;
    if (elements.length >= 1 && elements[0].type === "symbol") {
      let paramName = (elements[0] as SymbolNode).name;
      let hasNamed = false;
      
      // Handle named parameter with colon
      if (paramName.endsWith(":")) {
        paramName = paramName.slice(0, -1);
        hasNamed = true;
      }
      
      let type: string | undefined;
      let defaultValue: HQLNode | undefined;
      
      // Check for type annotation, e.g. (name : Type)
      if (elements.length >= 3 &&
          elements[1].type === "symbol" &&
          (elements[1] as SymbolNode).name === ":") {
        if (elements[2].type === "symbol") {
          type = (elements[2] as SymbolNode).name;
        }
      }
      
      // Check for default value, e.g. (name = defaultValue)
      const eqIndex = elements.findIndex(el =>
        el.type === "symbol" && (el as SymbolNode).name === "="
      );
      if (eqIndex !== -1 && eqIndex + 1 < elements.length) {
        defaultValue = elements[eqIndex + 1];
      }
      
      // Don't apply hyphenToCamel here, we want to preserve the original name
      return { name: paramName, type, defaultValue, isNamed: hasNamed };
    }
  }
  
  // Fallback if the parameter is not recognized
  return { name: "param" };
}

function expandExtendedDefn(node: ExtendedDefnNode): HQLNode {
  const fnName = node.name;
  const params = node.params;
  const body = node.body;

  const hasNamed = params.some(p => p.isNamed === true);
  
  if (!hasNamed) {
    // Regular function handling (non-named parameters)
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
    // and prepend the function body with a let binding that destructures the named parameters
    
    // Generate properly camelCased parameter names
    const namedParams = params.map(p => ({
      original: p.name,
      camel: hyphenToCamel(p.name)
    }));
    
    // Handle default values for named parameters
    const defaultBindings: [string, HQLNode][] = params
      .filter(p => p.defaultValue)
      .map(p => [hyphenToCamel(p.name), p.defaultValue!]);
    
    // Create destructuring let for named parameters
    let destructuringLet: HQLNode;
    
    if (defaultBindings.length > 0) {
      // With default values
      const bindingPairs: HQLNode[] = [];
      for (const param of namedParams) {
        bindingPairs.push({ type: "symbol", name: param.camel } as SymbolNode);
        
        // Find default value if exists
        const defaultEntry = defaultBindings.find(([name]) => name === param.camel);
        if (defaultEntry) {
          bindingPairs.push(expandMacros(defaultEntry[1]));
        } else {
          // For params without defaults, use destructuring from params object
          bindingPairs.push({
            type: "list",
            elements: [
              { type: "symbol", name: "get" } as SymbolNode,
              { type: "symbol", name: "params" } as SymbolNode,
              { type: "literal", value: param.camel } as LiteralNode
            ]
          } as ListNode);
        }
      }
      
      destructuringLet = {
        type: "list",
        elements: [
          { type: "symbol", name: "let" } as SymbolNode,
          { type: "list", elements: bindingPairs } as ListNode,
          ...body.map(expandMacros)
        ]
      } as ListNode;
    } else {
      // Simple destructuring without defaults
      const destructuringBindings: HQLNode[] = [];
      
      // First add the object destructuring pattern with camelCase names
      destructuringBindings.push({
        type: "list",
        elements: [
          { type: "symbol", name: "{" } as SymbolNode,
          ...namedParams.map(p => ({ type: "symbol", name: p.camel } as SymbolNode)),
          { type: "symbol", name: "}" } as SymbolNode
        ]
      } as ListNode);
      
      // Then add the object to destructure
      destructuringBindings.push({ type: "symbol", name: "params" } as SymbolNode);
      
      destructuringLet = {
        type: "list",
        elements: [
          { type: "symbol", name: "let" } as SymbolNode,
          { type: "list", elements: destructuringBindings } as ListNode,
          ...body.map(expandMacros)
        ]
      } as ListNode;
    }
    
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
  
  // Extract function name
  if (node.elements[1].type !== "symbol") {
    throw new Error("Function name must be a symbol");
  }
  const name = (node.elements[1] as SymbolNode).name;
  
  // Extract parameter list
  if (node.elements[2].type !== "list") {
    throw new Error("Parameter list must be a list");
  }
  const paramList = node.elements[2] as ListNode;
  
  // Check for return type annotation after parameter list
  let bodyStart = 3;
  let returnType: HQLNode | undefined = undefined;
  
  if (node.elements.length > 3 && 
      node.elements[3].type === "symbol" &&
      (node.elements[3] as SymbolNode).name === "->") {
    if (node.elements.length < 5) {
      throw new Error("Return type annotation requires a type");
    }
    returnType = node.elements[4];
    bodyStart = 5;
  }
  
  // Extract function body
  const body = node.elements.slice(bodyStart);
  
  // Parse parameters
  const params: ExtendedParam[] = [];
  
  for (let i = 0; i < paramList.elements.length; i++) {
    const param = paramList.elements[i];
    
    // Named parameter case (ending with colon)
    if (param.type === "symbol" && (param as SymbolNode).name.endsWith(":")) {
      const paramName = (param as SymbolNode).name.slice(0, -1);
      
      // Check for type annotation
      let type: string | undefined;
      if (i + 1 < paramList.elements.length && 
          paramList.elements[i + 1].type === "symbol" && 
          !(paramList.elements[i + 1] as SymbolNode).name.endsWith(":") && 
          (paramList.elements[i + 1] as SymbolNode).name !== "=") {
        type = (paramList.elements[i + 1] as SymbolNode).name;
        i++;
      }
      
      // Check for default value
      let defaultValue: HQLNode | undefined;
      if (i + 2 < paramList.elements.length && 
          paramList.elements[i + 1].type === "symbol" && 
          (paramList.elements[i + 1] as SymbolNode).name === "=" && 
          i + 3 <= paramList.elements.length) {
        defaultValue = paramList.elements[i + 2];
        i += 2;
      }
      
      params.push({ 
        name: paramName, 
        type, 
        defaultValue, 
        isNamed: true 
      });
    } 
    // Regular parameter or parameter with default
    else if (param.type === "symbol") {
      params.push({ name: (param as SymbolNode).name });
    }
    // Complex parameter form (x: Type = default) or (x = default)
    else if (param.type === "list") {
      params.push(parseExtendedParam(param));
    }
    else {
      throw new Error("Invalid parameter");
    }
  }
  
  // Create extended definition node
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
 * Transforms an array literal into a vector.
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