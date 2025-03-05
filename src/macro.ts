// src/macro.ts - Updated with fixes for fx macro expansion

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
 * Registry for HQL-defined macros via defmacro
 */
const hqlMacroRegistry: Map<string, { params: ListNode, body: HQLNode[] }> = new Map();

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
  return macroRegistry.has(symbolName) || hqlMacroRegistry.has(symbolName);
}

/**
 * Apply a macro to a list node.
 */
export function applyMacro(node: ListNode): HQLNode {
  if (node.elements.length === 0) return node;
  const first = node.elements[0];
  if (first.type !== "symbol") return node;
  const symbolName = (first as SymbolNode).name;
  
  // Check HQL macros first
  if (hqlMacroRegistry.has(symbolName)) {
    return expandHQLMacro(symbolName, node);
  }
  
  // Fall back to regular macro registry
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
    
    // Handle defmacro special form
    if (symbolName === "defmacro") {
      registerHQLMacro(node);
      return { type: "list", elements: [] }; // Return empty list for defmacro (no runtime code)
    }
    
    // Expand regular macros
    if (isMacro(symbolName)) {
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

/**
 * Process parameters that have type annotations
 */
function processTypedParameters(params: ListNode): ExtendedParam[] {
  const result: ExtendedParam[] = [];
  
  for (const param of params.elements) {
    if (param.type === "list") {
      // This is a parameter with type annotation or default value
      const paramList = param as ListNode;
      const elements = paramList.elements;
      
      if (elements.length >= 3 && elements[1].type === "symbol" && (elements[1] as SymbolNode).name === ":") {
        // Parameter with type annotation
        const paramName = (elements[0] as SymbolNode).name;
        const paramType = (elements[2] as SymbolNode).name;
        
        // Check for default value
        let defaultValue: HQLNode | undefined = undefined;
        if (elements.length > 4 && elements[3].type === "symbol" && (elements[3] as SymbolNode).name === "=") {
          defaultValue = elements[4];
        }
        
        result.push({
          name: paramName,
          type: paramType,
          defaultValue,
          isNamed: false
        });
      } else if (elements.length >= 1) {
        // Regular parameter, possibly with default value
        const paramName = (elements[0] as SymbolNode).name;
        
        // Check for default value
        let defaultValue: HQLNode | undefined = undefined;
        if (elements.length > 2 && elements[1].type === "symbol" && (elements[1] as SymbolNode).name === "=") {
          defaultValue = elements[2];
        }
        
        result.push({
          name: paramName,
          defaultValue,
          isNamed: false
        });
      }
    } else if (param.type === "symbol") {
      // Simple parameter or named parameter
      const paramName = (param as SymbolNode).name;
      
      if (paramName.endsWith(":")) {
        // Named parameter
        result.push({
          name: paramName.slice(0, -1), // Remove the colon
          isNamed: true
        });
      } else {
        // Regular parameter
        result.push({
          name: paramName,
          isNamed: false
        });
      }
    }
  }
  
  return result;
}

/**
 * Register an HQL-defined macro from defmacro form
 */
function registerHQLMacro(node: ListNode): void {
  // Validate defmacro form
  if (node.elements.length < 4) {
    throw new Error("defmacro requires a name, parameter list, and body");
  }
  
  const nameSym = node.elements[1] as SymbolNode;
  const name = nameSym.name;
  const paramList = node.elements[2] as ListNode;
  const body = node.elements.slice(3);
  
  // Store the macro definition
  hqlMacroRegistry.set(name, { params: paramList, body });
  
  // Also register a function to evaluate this macro
  defineMacro(name, (callNode: ListNode): HQLNode => {
    return expandHQLMacro(name, callNode);
  });
}

/**
 * Expand an HQL-defined macro
 */
function expandHQLMacro(name: string, callNode: ListNode): HQLNode {
  const macroDef = hqlMacroRegistry.get(name);
  if (!macroDef) {
    throw new Error(`Macro ${name} not found`);
  }
  
  // Create bindings by matching parameters to arguments
  const bindings = createBindings(macroDef.params, callNode);
  
  // Evaluate the macro body with these bindings
  return evalMacroBody(macroDef.body, bindings);
}

/**
 * Create bindings for macro parameters
 */
function createBindings(params: ListNode, callNode: ListNode): Map<string, HQLNode> {
  const bindings = new Map<string, HQLNode>();
  const args = callNode.elements.slice(1); // Skip the macro name
  
  let restParam: string | null = null;
  let position = 0;
  
  // Process parameters
  for (let i = 0; i < params.elements.length; i++) {
    const param = params.elements[i];
    
    // Check for rest parameter
    if (param.type === "symbol" && (param as SymbolNode).name === "&") {
      if (i + 1 < params.elements.length && params.elements[i + 1].type === "symbol") {
        restParam = (params.elements[i + 1] as SymbolNode).name;
        i++; // Skip the next parameter as we've processed it
      }
      continue;
    }
    
    if (param.type === "symbol") {
      const paramName = (param as SymbolNode).name;
      
      if (position < args.length) {
        bindings.set(paramName, args[position]);
        position++;
      } else {
        // Parameter with no matching argument
        bindings.set(paramName, { type: "list", elements: [] } as ListNode);
      }
    }
  }
  
  // Handle rest parameter
  if (restParam) {
    bindings.set(restParam, {
      type: "list",
      elements: args.slice(position)
    } as ListNode);
  }
  
  return bindings;
}

/**
 * Evaluate a macro body with bindings
 */
function evalMacroBody(body: HQLNode[], bindings: Map<string, HQLNode>): HQLNode {
  if (body.length === 0) {
    return { type: "list", elements: [] } as ListNode;
  }
  
  // For simplicity, just evaluate the first form in the body
  return evalMacroForm(body[0], bindings);
}

/**
 * Evaluate a single macro form with bindings
 */
function evalMacroForm(form: HQLNode, bindings: Map<string, HQLNode>): HQLNode {
  // Symbol reference
  if (form.type === "symbol") {
    const name = (form as SymbolNode).name;
    
    // Handle quoted symbols
    if (name.startsWith("'")) {
      return { type: "symbol", name: name.slice(1) } as SymbolNode;
    }
    
    return bindings.get(name) || form;
  }
  
  // Literal evaluation
  if (form.type === "literal") {
    return form;
  }
  
  // List evaluation (function call or special form)
  if (form.type === "list") {
    const list = form as ListNode;
    if (list.elements.length === 0) {
      return list;
    }
    
    // Special forms
    if (list.elements[0].type === "symbol") {
      const op = (list.elements[0] as SymbolNode).name;
      
      switch (op) {
        case "quote":
          // (quote form) - return form unevaluated
          if (list.elements.length < 2) {
            throw new Error("quote requires an argument");
          }
          return list.elements[1];
          
        case "list":
          // (list a b c) -> evaluate each argument and return a list
          return {
            type: "list",
            elements: list.elements.slice(1).map(el => evalMacroForm(el, bindings))
          } as ListNode;
          
        case "if":
          // (if condition then else) - conditional evaluation
          if (list.elements.length < 3) {
            throw new Error("if requires at least 2 arguments");
          }
          
          const condition = evalMacroForm(list.elements[1], bindings);
          const isTruthy = isTruthyValue(condition);
          
          if (isTruthy) {
            return evalMacroForm(list.elements[2], bindings);
          } else if (list.elements.length > 3) {
            return evalMacroForm(list.elements[3], bindings);
          } else {
            return { type: "list", elements: [] } as ListNode;
          }
          
        case "do":
          // (do expr1 expr2 ...) - evaluate all expressions, return last
          if (list.elements.length < 2) {
            return { type: "list", elements: [] } as ListNode;
          }
          
          let lastResult: HQLNode = { type: "list", elements: [] } as ListNode;
          for (let i = 1; i < list.elements.length; i++) {
            lastResult = evalMacroForm(list.elements[i], bindings);
          }
          return lastResult;
          
        case "let":
          // (let [name1 val1, name2 val2...] body...)
          if (list.elements.length < 3 || list.elements[1].type !== "list") {
            throw new Error("let requires a binding vector and body");
          }
          
          const bindingList = list.elements[1] as ListNode;
          const localBindings = new Map(bindings);
          
          // Process bindings in pairs
          for (let i = 0; i < bindingList.elements.length; i += 2) {
            if (i + 1 >= bindingList.elements.length) break;
            
            if (bindingList.elements[i].type !== "symbol") {
              throw new Error("let binding name must be a symbol");
            }
            
            const bindingName = (bindingList.elements[i] as SymbolNode).name;
            const bindingValue = evalMacroForm(bindingList.elements[i + 1], localBindings);
            localBindings.set(bindingName, bindingValue);
          }
          
          // Evaluate body with local bindings
          let result: HQLNode = { type: "list", elements: [] } as ListNode;
          for (let i = 2; i < list.elements.length; i++) {
            result = evalMacroForm(list.elements[i], localBindings);
          }
          return result;
          
        case "and":
          // (and expr1 expr2 ...) - short-circuit logical AND
          let andResult: HQLNode = { type: "literal", value: true } as LiteralNode;
          for (let i = 1; i < list.elements.length; i++) {
            andResult = evalMacroForm(list.elements[i], bindings);
            if (!isTruthyValue(andResult)) {
              return { type: "literal", value: false } as LiteralNode;
            }
          }
          return andResult;
          
        case "or":
          // (or expr1 expr2 ...) - short-circuit logical OR
          for (let i = 1; i < list.elements.length; i++) {
            const orResult = evalMacroForm(list.elements[i], bindings);
            if (isTruthyValue(orResult)) {
              return orResult;
            }
          }
          return { type: "literal", value: false } as LiteralNode;
          
        case "str":
          // (str a b c) - string concatenation
          let strResult = "";
          for (let i = 1; i < list.elements.length; i++) {
            const val = evalMacroForm(list.elements[i], bindings);
            strResult += stringifyHQLNode(val);
          }
          return { type: "literal", value: strResult } as LiteralNode;
          
        case "concat":
          // (concat l1 l2...) - list concatenation
          const elements: HQLNode[] = [];
          for (let i = 1; i < list.elements.length; i++) {
            const val = evalMacroForm(list.elements[i], bindings);
            if (val.type === "list") {
              elements.push(...(val as ListNode).elements);
            } else {
              elements.push(val);
            }
          }
          return { type: "list", elements } as ListNode;
          
        case "car":
        case "first":
          // (first coll) - get first element
          if (list.elements.length < 2) {
            throw new Error("first requires a collection argument");
          }
          
          const coll = evalMacroForm(list.elements[1], bindings);
          if (coll.type !== "list") {
            throw new Error("first requires a list argument");
          }
          
          return (coll as ListNode).elements[0] || { type: "list", elements: [] } as ListNode;
          
        case "cdr":
        case "rest":
          // (rest coll) - get all but first element
          if (list.elements.length < 2) {
            throw new Error("rest requires a collection argument");
          }
          
          const restColl = evalMacroForm(list.elements[1], bindings);
          if (restColl.type !== "list") {
            throw new Error("rest requires a list argument");
          }
          
          return {
            type: "list",
            elements: (restColl as ListNode).elements.slice(1)
          } as ListNode;
      }
    }
    
    // List form, evaluate all elements
    return {
      type: "list",
      elements: list.elements.map(el => evalMacroForm(el, bindings))
    } as ListNode;
  }
  
  // Default: return the form as is
  return form;
}

/**
 * Check if a value is truthy in the macro system
 */
function isTruthyValue(node: HQLNode): boolean {
  if (node.type === "literal") {
    const val = (node as LiteralNode).value;
    if (val === false || val === null || val === 0 || val === "") {
      return false;
    }
    return true;
  }
  
  if (node.type === "list") {
    return (node as ListNode).elements.length > 0;
  }
  
  return true;
}

/**
 * Convert an HQLNode to a string for string operations
 */
function stringifyHQLNode(node: HQLNode): string {
  if (node.type === "literal") {
    const val = (node as LiteralNode).value;
    return val === null ? "null" : String(val);
  }
  
  if (node.type === "symbol") {
    return (node as SymbolNode).name;
  }
  
  if (node.type === "list") {
    const elements = (node as ListNode).elements;
    return `(${elements.map(stringifyHQLNode).join(" ")})`;
  }
  
  return JSON.stringify(node);
}

/**
 * Expand an ExtendedDefn node into a canonical defun form.
 */
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

// Initialize built-in macros
defineMacro("fx", (node: ListNode): HQLNode => {
  if (node.elements.length < 4) {
    throw new Error("fx form requires a name, parameter list, and body");
  }
  
  const name = node.elements[1] as SymbolNode;
  const paramList = node.elements[2] as ListNode;
  
  // Check for return type annotation
  let hasReturnType = false;
  let returnTypePos = 3;
  
  if (node.elements.length > 4 && 
      node.elements[3].type === "symbol" && 
      (node.elements[3] as SymbolNode).name === "->") {
    hasReturnType = true;
    returnTypePos = 4;
  }
  
  // Process parameters, handling type annotations and default values
  const processedParams = processTypedParameters(paramList);
  
  // Create an ExtendedDefnNode to expand
  const extendedDefn: ExtendedDefnNode = {
    type: "extendedDefn",
    name: name.name,
    params: processedParams,
    returnType: hasReturnType ? node.elements[returnTypePos] : undefined,
    body: node.elements.slice(hasReturnType ? returnTypePos + 1 : 3)
  };
  
  // Expand the ExtendedDefnNode to defun
  return expandExtendedDefn(extendedDefn);
});

// Register other built-in macros (examples) 
defineMacro("when", (node: ListNode): HQLNode => {
  if (node.elements.length < 3) {
    throw new Error("when requires a condition and a body");
  }
  
  const condition = node.elements[1];
  const body = node.elements.slice(2);
  
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "if" } as SymbolNode,
      condition,
      {
        type: "list",
        elements: [
          { type: "symbol", name: "do" } as SymbolNode,
          ...body
        ]
      } as ListNode,
      { type: "literal", value: null } as LiteralNode
    ]
  } as ListNode;
});

defineMacro("unless", (node: ListNode): HQLNode => {
  if (node.elements.length < 3) {
    throw new Error("unless requires a condition and a body");
  }
  
  const condition = node.elements[1];
  const body = node.elements.slice(2);
  
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "if" } as SymbolNode,
      {
        type: "list",
        elements: [
          { type: "symbol", name: "not" } as SymbolNode,
          condition
        ]
      } as ListNode,
      {
        type: "list",
        elements: [
          { type: "symbol", name: "do" } as SymbolNode,
          ...body
        ]
      } as ListNode,
      { type: "literal", value: null } as LiteralNode
    ]
  } as ListNode;
});