// src/macro.ts - Revised to rely entirely on HQL-defined macros
import {
  HQLNode,
  SymbolNode,
  ListNode,
  LiteralNode
} from "./transpiler/hql_ast.ts";

/**
 * Registry for HQL-defined macros via defmacro
 */
const hqlMacroRegistry: Map<string, { params: ListNode, body: HQLNode[] }> = new Map();

// Track nodes being processed to prevent infinite recursion
const processingNodes = new Set<string>();

/**
 * Check whether a symbol name has an associated macro.
 */
export function isMacro(symbolName: string): boolean {
  return hqlMacroRegistry.has(symbolName);
}

/**
 * Apply a macro to a list node.
 */
export function applyMacro(node: ListNode): HQLNode {
  if (node.elements.length === 0) return node;
  const first = node.elements[0];
  if (first.type !== "symbol") return node;
  const symbolName = (first as SymbolNode).name;
  
  if (hqlMacroRegistry.has(symbolName)) {
    return expandHQLMacro(symbolName, node);
  }
  
  return node;
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
  
  // Register special builtin macros for JavaScript syntax
  if (name === "js-array") {
    hqlMacroRegistry.set("[", { params: paramList, body });
  } else if (name === "js-map") {
    hqlMacroRegistry.set("{", { params: paramList, body });
  } else if (name === "js-set") {
    hqlMacroRegistry.set("#[", { params: paramList, body });
  }
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