// src/macro.ts - Fixed with recursion protection
import {
  HQLNode,
  SymbolNode,
  ListNode,
  LiteralNode
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

// Track nodes being processed to prevent infinite recursion
const processingNodes = new Set<string>();

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
    default:
      return node;
  }
}

/**
 * Recursively expand macros in a list node.
 */
function expandListMacros(node: ListNode): HQLNode {
  // Prevent infinite recursion by tracking nodes we're processing
  const nodeKey = JSON.stringify(node);
  if (processingNodes.has(nodeKey)) {
    return node; // Return the node as is to break the recursion
  }
  
  // Special handling for empty lists
  if (node.elements.length === 0) {
    return node;
  }

  if (node.elements[0].type === "symbol") {
    const symbolName = (node.elements[0] as SymbolNode).name;
    
    // Handle defmacro special form
    if (symbolName === "defmacro") {
      registerHQLMacro(node);
      return { type: "list", elements: [] }; // Return empty list for defmacro (no runtime code)
    }
    
    // Expand regular macros
    if (isMacro(symbolName)) {
      processingNodes.add(nodeKey); // Mark node as being processed
      const expanded = applyMacro(node);
      
      // Only recursively expand if it's a different node
      if (JSON.stringify(expanded) !== nodeKey) {
        const result = expandMacros(expanded);
        processingNodes.delete(nodeKey); // Done processing
        return result;
      }
      
      // Clean up and return expanded form
      processingNodes.delete(nodeKey);
      return expanded;
    }
  }
  
  // Process child elements - mark this node as being processed to prevent recursive loops
  processingNodes.add(nodeKey);
  const expandedElements = node.elements.map(expandMacros);
  processingNodes.delete(nodeKey);
  
  return { ...node, elements: expandedElements };
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
        case "quote": {
          // (quote form) - return form unevaluated
          if (list.elements.length < 2) {
            throw new Error("quote requires an argument");
          }
          return list.elements[1];
        }
          
        case "list": {
          // (list a b c) -> evaluate each argument and return a list
          return {
            type: "list",
            elements: list.elements.slice(1).map(el => evalMacroForm(el, bindings))
          } as ListNode;
        }
          
        case "if": {
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
        }
          
        case "do": {
          // (do expr1 expr2 ...) - evaluate all expressions, return last
          if (list.elements.length < 2) {
            return { type: "list", elements: [] } as ListNode;
          }
          
          let lastResult: HQLNode = { type: "list", elements: [] } as ListNode;
          for (let i = 1; i < list.elements.length; i++) {
            lastResult = evalMacroForm(list.elements[i], bindings);
          }
          return lastResult;
        }
          
        case "let": {
          // (let [name1 val1, name2 val2...] body...)
          if (list.elements.length < 3 || list.elements[1].type !== "list") {
            throw new Error("let requires a binding vector and body");
          }
          
          const bindingList = list.elements[1] as ListNode;
          const localBindings = new Map(bindings);
          
          // Process all bindings regardless of their structure
          for (let i = 0; i < bindingList.elements.length; i += 2) {
            if (i + 1 >= bindingList.elements.length) break;
            
            const nameNode = bindingList.elements[i];
            const valueNode = bindingList.elements[i + 1];
            
            // If it's a symbol, do normal binding
            if (nameNode.type === "symbol") {
              const bindingName = (nameNode as SymbolNode).name;
              const bindingValue = evalMacroForm(valueNode, localBindings);
              localBindings.set(bindingName, bindingValue);
            } 
            // For any other type, still evaluate both expressions 
            // but use a synthetic name for the binding
            else {
              // Evaluate the "name" expression - it might have side effects
              evalMacroForm(nameNode, localBindings);
              
              // Evaluate the value expression
              const value = evalMacroForm(valueNode, localBindings);
              
              // Create a synthetic binding that won't conflict with real ones
              const syntheticName = `__synthetic_binding_${i}`;
              localBindings.set(syntheticName, value);
            }
          }
          
          // Evaluate body with local bindings
          let result: HQLNode = { type: "list", elements: [] } as ListNode;
          for (let i = 2; i < list.elements.length; i++) {
            result = evalMacroForm(list.elements[i], localBindings);
          }
          return result;
        }
          
        case "and": {
          // (and expr1 expr2 ...) - short-circuit logical AND
          let andResult: HQLNode = { type: "literal", value: true } as LiteralNode;
          for (let i = 1; i < list.elements.length; i++) {
            andResult = evalMacroForm(list.elements[i], bindings);
            if (!isTruthyValue(andResult)) {
              return { type: "literal", value: false } as LiteralNode;
            }
          }
          return andResult;
        }
          
        case "or": {
          // (or expr1 expr2 ...) - short-circuit logical OR
          for (let i = 1; i < list.elements.length; i++) {
            const orResult = evalMacroForm(list.elements[i], bindings);
            if (isTruthyValue(orResult)) {
              return orResult;
            }
          }
          return { type: "literal", value: false } as LiteralNode;
        }
          
        case "str": {
          // (str a b c) - string concatenation
          let strResult = "";
          for (let i = 1; i < list.elements.length; i++) {
            const val = evalMacroForm(list.elements[i], bindings);
            strResult += stringifyHQLNode(val);
          }
          return { type: "literal", value: strResult } as LiteralNode;
        }
          
        case "concat": {
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
        }
          
        case "first": {
          // (first coll) - get first element
          if (list.elements.length < 2) {
            throw new Error("first requires a collection argument");
          }
          
          const coll = evalMacroForm(list.elements[1], bindings);
          if (coll.type !== "list") {
            throw new Error("first requires a list argument");
          }
          
          return (coll as ListNode).elements[0] || { type: "list", elements: [] } as ListNode;
        }
          
        case "rest": {
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
    if (val === false || val === null || val === undefined || val === 0 || val === "") {
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

// Process parameters into a structure with names, types, and default values
function processParameters(params: ListNode): Array<{
  name: string;
  type?: string;
  defaultValue?: HQLNode;
  isNamed: boolean;
}> {
  const result: Array<{
    name: string;
    type?: string;
    defaultValue?: HQLNode;
    isNamed: boolean;
  }> = [];
  
  // Handle case where list.elements might be undefined or not an array
  if (!params || !params.elements || !Array.isArray(params.elements)) {
    // Silent handling instead of warning
    return result;
  }
  
  // Special case for params destructuring for named parameters
  if (params.elements.length === 1 && 
      params.elements[0] && 
      params.elements[0].type === "symbol" && 
      (params.elements[0] as SymbolNode).name === "params") {
    result.push({
      name: "params",
      isNamed: true
    });
    return result;
  }
  
  for (let i = 0; i < params.elements.length; i++) {
    const el = params.elements[i];
    
    if (!el) continue; // Skip undefined elements
    
    if (el.type === "symbol" && (el as SymbolNode).name === "&optional") {
      continue;
    }
    
    // Handle & as a rest parameter marker
    if (el.type === "symbol" && (el as SymbolNode).name === "&") {
      // If the next element exists, mark it as a rest parameter
      if (i + 1 < params.elements.length) {
        const nextEl = params.elements[i + 1];
        if (nextEl && nextEl.type === "symbol") {
          result.push({
            name: (nextEl as SymbolNode).name,
            isNamed: false
          });
          i++; // Skip the next element since we've processed it
          continue;
        }
      }
      // If there's no valid next element, skip this & token
      continue;  
    }
    
    if (el.type === "symbol") {
      let name = (el as SymbolNode).name;
      let isNamed = false;
      
      if (name.endsWith(":")) {
        name = name.slice(0, -1);
        isNamed = true;
      }
      
      result.push({
        name: name,
        isNamed: isNamed
      });
      
      continue;
    }
    
    if (el.type === "list") {
      const paramStruct = el as ListNode;
      
      // Parameter with default value: (y = 0)
      if (paramStruct.elements && paramStruct.elements.length >= 2 &&
          paramStruct.elements[0] && paramStruct.elements[0].type === "symbol") {
          
        const paramName = (paramStruct.elements[0] as SymbolNode).name;
        
        // Handle (name default) without explicit = (common in Lisp)
        if (paramStruct.elements.length === 2) {
          result.push({
            name: paramName,
            defaultValue: paramStruct.elements[1],
            isNamed: false
          });
          continue;
        }
        
        // Handle (name = default)
        if (paramStruct.elements.length >= 3 &&
            paramStruct.elements[1] && paramStruct.elements[1].type === "symbol" &&
            (paramStruct.elements[1] as SymbolNode).name === "=") {
          result.push({
            name: paramName,
            defaultValue: paramStruct.elements[2],
            isNamed: false
          });
          continue;
        }
      }
      
      // Named parameter written as (param "name") from our new structure
      if (paramStruct.elements && paramStruct.elements.length >= 2 && 
          paramStruct.elements[0] && paramStruct.elements[0].type === "symbol" &&
          (paramStruct.elements[0] as SymbolNode).name === "param" &&
          paramStruct.elements[1] && paramStruct.elements[1].type === "literal") {
        
        const paramName = (paramStruct.elements[1] as LiteralNode).value as string;
        
        result.push({
          name: paramName,
          isNamed: true
        });
        continue;
      }
    }
  }
  return result;
}

defineMacro("fx", (node: ListNode): HQLNode => {
  if (node.elements.length < 4) {
    throw new Error("fx requires a name, parameter list, and body");
  }
  
  const name = node.elements[1] as SymbolNode;
  const paramList = node.elements[2] as ListNode;

  // Extract parameter names from the paramList
  const paramNames: string[] = [];
  for (let i = 0; i < paramList.elements.length; i++) {
    const param = paramList.elements[i];
    if (param.type === "list") {
      const paramNode = param as ListNode;
      if (
        paramNode.elements.length >= 2 &&
        paramNode.elements[0].type === "symbol" &&
        (paramNode.elements[0] as SymbolNode).name === "param" &&
        paramNode.elements[1].type === "literal"
      ) {
        const paramName = (paramNode.elements[1] as LiteralNode).value as string;
        paramNames.push(paramName);
        i++; // Skip the type token
      }
    }
  }

  // Determine where the function body starts (skip the optional return type)
  let bodyStart = 3;
  if (
    node.elements.length > 3 &&
    (
      (node.elements[3].type === "list" &&
        (node.elements[3] as ListNode).elements.length > 0 &&
        ((node.elements[3] as ListNode).elements[0] as SymbolNode).name === "->") ||
      (node.elements[3].type === "symbol" &&
        (node.elements[3] as SymbolNode).name === "->")
    )
  ) {
    bodyStart = 4;
  }
  
  const body = node.elements.slice(bodyStart);

  // Create proper name-value pairs for each parameter in let-bindings
  const letBindings: HQLNode[] = [];
  paramNames.forEach(name => {
    letBindings.push({ type: "symbol", name } as SymbolNode);
    letBindings.push({
      type: "list",
      elements: [
        { type: "symbol", name: "get" } as SymbolNode,
        { type: "symbol", name: "_params0" } as SymbolNode,
        { type: "literal", value: name } as LiteralNode
      ]
    } as ListNode);
  });
  
  // Use a unique parameter name instead of "params"
  const newParamList: ListNode = {
    type: "list",
    elements: [{ type: "symbol", name: "_params0" }]
  };
  // Attach the extracted parameter names as metadata so the transformer knows what keys to destructure
  (newParamList as any).namedParamIds = paramNames;
  
  const result: ListNode = {
    type: "list",
    elements: [
      { type: "symbol", name: "defun" } as SymbolNode,
      { type: "symbol", name: name.name } as SymbolNode,
      newParamList,
      {
        type: "list",
        elements: [
          { type: "symbol", name: "let" } as SymbolNode,
          { type: "list", elements: letBindings } as ListNode,
          ...body
        ]
      } as ListNode
    ]
  } as ListNode;
  
  return result;
});


// Hash-map macro - Convert keyword-value pairs to object literals
defineMacro("hash-map", (node: ListNode): HQLNode => {
  // The transformer converts this directly to object literals,
  // so just return as is for proper handling
  return node;
});

// Vector macro - Convert vector form to array literals
defineMacro("vector", (node: ListNode): HQLNode => {
  // Just return as is since our IR transformer handles vectors directly
  return node;
});

// Set macro - Convert set form to new Set() constructor
defineMacro("set", (node: ListNode): HQLNode => {
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "new" } as SymbolNode,
      { type: "symbol", name: "Set" } as SymbolNode,
      {
        type: "list",
        elements: [
          { type: "symbol", name: "vector" } as SymbolNode,
          ...node.elements.slice(1)
        ]
      } as ListNode
    ]
  } as ListNode;
});

// Type annotation macro - Process #: reader macro for type annotations
defineMacro("type-annotation", (node: ListNode): HQLNode => {
  // This is handled during parameter processing
  return node;
});

// Param macro - Process named parameters in function calls
defineMacro("param", (node: ListNode): HQLNode => {
  // Just return the parameter name for handling during function call processing
  if (node.elements.length >= 2 && node.elements[1].type === "literal") {
    return { type: "symbol", name: (node.elements[1] as LiteralNode).value as string } as SymbolNode;
  }
  return node;
});

// When macro - syntactic sugar for if with only the true branch
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

// Unless macro - syntactic sugar for (if (not condition) ...)
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