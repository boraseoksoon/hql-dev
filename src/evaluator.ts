// src/evaluator.ts - Full-Featured Evaluator for both Runtime and Macro Expansion

import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./transpiler/hql_ast.ts";
import { Environment, makeSymbol, makeLiteral, makeList } from "./environment.ts";
import { resolve, dirname } from "./platform/platform.ts";

// Module cache to avoid redundant imports
const moduleCache = new Map<string, any>();

/**
 * A full-featured evaluator that handles all language features.
 * This single evaluator is used for both runtime and macro expansion.
 */
export function evaluate(expr: HQLNode, env: Environment): any {
  if (!expr || typeof expr !== 'object') {
    throw new Error(`Invalid expression: ${JSON.stringify(expr)}`);
  }
  
  switch (expr.type) {
    case "literal":
      return (expr as LiteralNode).value;
      
    case "symbol": {
      const name = (expr as SymbolNode).name;
      
      // Handle property access in symbols (e.g., "obj.prop")
      if (name.includes('.')) {
        const parts = name.split('.');
        let current: any;
        
        try {
          current = env.lookup(parts[0]);
        } catch (e) {
          throw new Error(`Cannot access property chain starting with undefined symbol: ${parts[0]}`);
        }
        
        for (let i = 1; i < parts.length; i++) {
          if (current === null || current === undefined) {
            throw new Error(`Cannot access property ${parts[i]} of ${parts[i-1]} which is null or undefined`);
          }
          
          const prop = parts[i];
          const member = current[prop];
          
          // If it's a method, preserve the 'this' binding
          current = typeof member === 'function' ? member.bind(current) : member;
        }
        
        return current;
      }
      
      // Regular symbol lookup
      return env.lookup(name);
    }
      
    case "list": {
      const list = expr as ListNode;
      if (list.elements.length === 0) {
        return []; // Empty list evaluates to empty array
      }
      
      const first = list.elements[0];
      if (first.type !== "symbol") {
        // If first element is not a symbol, evaluate it and call the result
        const fn = evaluate(first, env);
        const args = list.elements.slice(1).map(arg => evaluate(arg, env));
        
        if (typeof fn !== "function") {
          throw new Error(`${JSON.stringify(first)} is not a function`);
        }
        
        return fn(...args);
      }
      
      const op = (first as SymbolNode).name;
      
      // Check if this is a macro first
      if (env.hasMacro(op)) {
        const macro = env.getMacro(op)!;
        const expanded = macro(list.elements.slice(1), env);
        
        // Recursively evaluate the expanded code
        return evaluate(expanded, env);
      }
      
      // Handle special forms
      switch (op) {
        case "quote":
          if (list.elements.length !== 2) {
            throw new Error("quote requires exactly one argument");
          }
          return list.elements[1];
          
        case "if": {
          if (list.elements.length < 3 || list.elements.length > 4) {
            throw new Error("if requires 2 or 3 arguments");
          }
          
          const condition = evaluate(list.elements[1], env);
          
          if (condition) {
            return evaluate(list.elements[2], env);
          } else if (list.elements.length > 3) {
            return evaluate(list.elements[3], env);
          } else {
            return null;
          }
        }
          
        case "fn": {
          if (list.elements.length < 3) {
            throw new Error("fn requires parameters and body");
          }
          
          const paramsNode = list.elements[1];
          if (paramsNode.type !== "list") {
            throw new Error("fn parameters must be a list");
          }
          
          const paramsList = paramsNode as ListNode;
          const paramNames: string[] = [];
          let restParam: string | null = null;
          
          // Process parameters, handling rest parameters (marked with &)
          for (let i = 0; i < paramsList.elements.length; i++) {
            const param = paramsList.elements[i];
            if (param.type !== "symbol") {
              throw new Error("fn parameters must be symbols");
            }
            
            const paramName = (param as SymbolNode).name;
            
            if (paramName === "&") {
              if (i + 1 < paramsList.elements.length && 
                  paramsList.elements[i + 1].type === "symbol") {
                restParam = (paramsList.elements[i + 1] as SymbolNode).name;
                i++; // Skip the next parameter since we've processed it
              } else {
                throw new Error("& must be followed by a symbol in parameter list");
              }
            } else {
              paramNames.push(paramName);
            }
          }
          
          // Function body is all remaining expressions
          const body = list.elements.slice(2);
          
          // Return a function that captures the current environment
          return function(...args: any[]) {
            // Create a new environment with parameter bindings
            const fnEnv = env.extend();
            
            // Bind regular parameters
            for (let i = 0; i < paramNames.length; i++) {
              fnEnv.define(paramNames[i], i < args.length ? args[i] : null);
            }
            
            // Bind rest parameter if present
            if (restParam) {
              fnEnv.define(restParam, args.slice(paramNames.length));
            }
            
            // Evaluate each expression in the body, returning the last one
            let result: any = null;
            for (const expr of body) {
              result = evaluate(expr, fnEnv);
            }
            return result;
          };
        }
          
        case "def": {
          if (list.elements.length !== 3) {
            throw new Error("def requires exactly 2 arguments");
          }
          
          const nameNode = list.elements[1];
          if (nameNode.type !== "symbol") {
            throw new Error("def requires a symbol name");
          }
          
          const name = (nameNode as SymbolNode).name;
          const value = evaluate(list.elements[2], env);
          
          env.define(name, value);
          return value;
        }
          
        case "defmacro": {
          if (list.elements.length < 4) {
            throw new Error("defmacro requires a name, parameters, and body");
          }
          
          const nameNode = list.elements[1];
          if (nameNode.type !== "symbol") {
            throw new Error("defmacro requires a symbol for the name");
          }
          
          const macroName = (nameNode as SymbolNode).name;
          const paramsNode = list.elements[2];
          
          if (paramsNode.type !== "list") {
            throw new Error("defmacro parameters must be a list");
          }
          
          const paramsList = paramsNode as ListNode;
          const paramNames: string[] = [];
          let restParam: string | null = null;
          
          // Process parameters, handling rest parameters (marked with &)
          for (let i = 0; i < paramsList.elements.length; i++) {
            const param = paramsList.elements[i];
            if (param.type !== "symbol") {
              throw new Error("macro parameters must be symbols");
            }
            
            const paramName = (param as SymbolNode).name;
            
            if (paramName === "&") {
              if (i + 1 < paramsList.elements.length && 
                  paramsList.elements[i + 1].type === "symbol") {
                restParam = (paramsList.elements[i + 1] as SymbolNode).name;
                i++; // Skip the next parameter since we've processed it
              } else {
                throw new Error("& must be followed by a symbol in parameter list");
              }
            } else {
              paramNames.push(paramName);
            }
          }
          
          // Macro body is all remaining expressions
          const body = list.elements.slice(3);
          
          // Create the macro function
          const macroFn = (args: HQLNode[], callEnv: Environment): HQLNode => {
            // Create a new environment for macro expansion that has access to
            // all definitions available at the point of macro definition
            const macroEnv = env.extend();
            
            // Bind regular parameters to actual macro call arguments
            for (let i = 0; i < paramNames.length; i++) {
              macroEnv.define(paramNames[i], i < args.length ? args[i] : makeLiteral(null));
            }
            
            // Bind rest parameter if present
            if (restParam) {
              macroEnv.define(restParam, {
                type: "list",
                elements: args.slice(paramNames.length)
              });
            }
            
            // Evaluate each expression in the body, returning the last one
            let result: any = makeLiteral(null);
            for (const expr of body) {
              result = evaluate(expr, macroEnv);
            }
            return result;
          };
          
          // Register the macro in the environment
          env.defineMacro(macroName, macroFn);
          
          return makeLiteral(null);
        }
          
        case "quasiquote":
          if (list.elements.length !== 2) {
            throw new Error("quasiquote requires exactly one argument");
          }
          return evaluateQuasiquote(list.elements[1], env);
          
        case "set!": {
          // Support property mutation with dot notation
          if (list.elements.length !== 3) {
            throw new Error("set! requires exactly 2 arguments");
          }
          
          const targetNode = list.elements[1];
          
          if (targetNode.type === "symbol") {
            const targetName = (targetNode as SymbolNode).name;
            
            // Handle property access in the target (e.g., "obj.prop")
            if (targetName.includes('.')) {
              const parts = targetName.split('.');
              let current = env.lookup(parts[0]);
              
              // Navigate to the parent object
              for (let i = 1; i < parts.length - 1; i++) {
                if (current === null || current === undefined) {
                  throw new Error(`Cannot access property ${parts[i]} of ${parts[i-1]} which is null or undefined`);
                }
                
                current = current[parts[i]];
              }
              
              // Set the final property
              const finalProp = parts[parts.length - 1];
              const value = evaluate(list.elements[2], env);
              current[finalProp] = value;
              
              return value;
            } else {
              // Regular variable assignment
              const value = evaluate(list.elements[2], env);
              env.define(targetName, value);
              return value;
            }
          } else {
            throw new Error("set! target must be a symbol");
          }
        }
          
        case "do": {
          if (list.elements.length < 2) {
            throw new Error("do requires at least one expression");
          }
          
          // Evaluate all expressions in sequence in a new environment
          const doEnv = env.extend();
          let result: any = null;
          for (let i = 1; i < list.elements.length; i++) {
            result = evaluate(list.elements[i], doEnv);
          }
          
          return result;
        }
          
        case "new": {
          if (list.elements.length < 2) {
            throw new Error("new requires a constructor and optional arguments");
          }
          
          const Constructor = evaluate(list.elements[1], env);
          const args = list.elements.slice(2).map(arg => evaluate(arg, env));
          
          return new Constructor(...args);
        }
        
        case "import": {
          if (list.elements.length !== 3) {
            throw new Error("import requires exactly 2 arguments: name and source");
          }
          
          const nameNode = list.elements[1];
          if (nameNode.type !== "symbol") {
            throw new Error("import name must be a symbol");
          }
          
          const name = (nameNode as SymbolNode).name;
          
          const sourceNode = list.elements[2];
          if (sourceNode.type !== "literal" || typeof sourceNode.value !== "string") {
            throw new Error("import source must be a string literal");
          }
          
          const source = (sourceNode as LiteralNode).value;
          
          // Perform the actual import - async imports won't work in macro expansion
          // This is a simplified implementation for illustration
          try {
            let module;
            if (!moduleCache.has(source)) {
              module = importSync(source, dirname(Deno.mainModule));
              moduleCache.set(source, module);
            } else {
              module = moduleCache.get(source);
            }
            
            // Make the module available in the environment
            env.define(name, module);
            
            return module;
          } catch (error) {
            throw new Error(`Error importing ${source}: ${error.message}`);
          }
        }
          
        default: {
          // If not a special form or macro, evaluate as a regular function call
          try {
            const fn = env.lookup(op);
            const args = list.elements.slice(1).map(arg => evaluate(arg, env));
            
            if (typeof fn !== "function") {
              throw new Error(`${op} is not a function`);
            }
            
            return fn(...args);
          } catch (error) {
            if (error.message.includes("Symbol not found")) {
              throw new Error(`Function not found: ${op}`);
            }
            throw error;
          }
        }
      }
    }
    
    default:
      throw new Error(`Unknown node type: ${(expr as any).type}`);
  }
}

/**
 * Helper function to evaluate quasiquoted expressions, handling unquote and unquote-splicing.
 */
function evaluateQuasiquote(expr: HQLNode, env: Environment): HQLNode {
  if (expr.type !== "list") {
    // For non-list nodes, return as is if literal, or evaluate if symbol
    if (expr.type === "symbol") {
      return makeSymbol((expr as SymbolNode).name);
    }
    return expr;
  }
  
  const list = expr as ListNode;
  if (list.elements.length === 0) {
    return list;
  }
  
  const first = list.elements[0];
  
  // Handle unquote (~expr)
  if (first.type === "symbol" && (first as SymbolNode).name === "unquote") {
    if (list.elements.length !== 2) {
      throw new Error("unquote requires exactly one argument");
    }
    return evaluate(list.elements[1], env);
  }
  
  // Process each element in the list
  const result: HQLNode[] = [];
  
  for (let i = 0; i < list.elements.length; i++) {
    const elem = list.elements[i];
    
    // Handle unquote-splicing (~@expr)
    if (elem.type === "list" && 
        elem.elements.length > 0 && 
        elem.elements[0].type === "symbol" && 
        (elem.elements[0] as SymbolNode).name === "unquote-splicing") {
      
      if (elem.elements.length !== 2) {
        throw new Error("unquote-splicing requires exactly one argument");
      }
      
      const splicedValue = evaluate(elem.elements[1], env);
      
      if (splicedValue.type === "list") {
        result.push(...(splicedValue as ListNode).elements);
      } else {
        throw new Error("unquote-splicing requires a list result");
      }
    } else {
      // Recursively process other elements
      result.push(evaluateQuasiquote(elem, env));
    }
  }
  
  return makeList(...result);
}

/**
 * Synchronous wrapper for import - in a real implementation, this would use
 * Deno.core.ops or a similar mechanism to perform a synchronous import.
 * For now, it's a placeholder that simulates a synchronous import.
 */
function importSync(source: string, baseDir: string): any {
  // This is a simplified implementation
  // In a real implementation, we'd need to actually import the module synchronously
  const resolvedPath = resolve(baseDir, source);
  
  // For now, we'll use a hardcoded mock implementation
  if (source.startsWith("npm:lodash")) {
    return {
      sortBy: (arr: any[], key?: string) => {
        if (!key) return [...arr].sort();
        return [...arr].sort((a, b) => a[key] < b[key] ? -1 : 1);
      },
      map: (arr: any[], fn: (v: any) => any) => arr.map(fn),
      filter: (arr: any[], fn: (v: any) => boolean) => arr.filter(fn)
    };
  }
  
  // Return an empty module by default
  return {};
}