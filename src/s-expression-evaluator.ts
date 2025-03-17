import { HQLNode, LiteralNode, SymbolNode, ListNode, isDotNotationReference, isExportReference } from "./transpiler/hql_ast.ts";
import { dirname, resolve } from "./platform/platform.ts";
import { Logger } from "./logger.ts";
import { Env } from "./environment.ts";

// Evaluate an S-expression for macro expansion
// in src/s-expression-evaluator.ts
export function evaluateSExp(expr: HQLNode, env: Env, logger: Logger = new Logger(false)): any {
    try {
      logger.debug(`Evaluating S-Expression: ${JSON.stringify(expr)}`);
      
      // Check if expr is valid
      if (!expr || !('type' in expr)) {
        logger.error(`Invalid expression: ${JSON.stringify(expr)}`);
        return { type: "literal", value: null };
      }
      
      // Rest of the function...
    } catch (error) {
      logger.error(`Error in evaluateSExp: ${error instanceof Error ? error.message : String(error)}`);
      return { type: "literal", value: null };
    }
  }

// Handle quote special form
function handleQuote(list: ListNode, env: Env, logger: Logger): any {
  if (list.elements.length !== 2) {
    throw new Error("quote requires exactly one argument");
  }
  
  return list.elements[1];
}

// Handle quasiquote special form (with unquote and unquote-splicing)
function handleQuasiquote(list: ListNode, env: Env, logger: Logger): any {
  if (list.elements.length !== 2) {
    throw new Error("quasiquote requires exactly one argument");
  }
  
  return expandQuasiquote(list.elements[1], env, logger);
}

// Expand a quasiquoted expression
function expandQuasiquote(expr: HQLNode, env: Env, logger: Logger, depth: number = 1): any {
  if (expr.type === "list") {
    const list = expr as ListNode;
    
    // Empty list
    if (list.elements.length === 0) {
      return list;
    }
    
    const first = list.elements[0];
    
    // Handle unquote
    if (first.type === "symbol" && (first as SymbolNode).name === "unquote") {
      if (list.elements.length !== 2) {
        throw new Error("unquote requires exactly one argument");
      }
      
      if (depth === 1) {
        return evaluateSExp(list.elements[1], env, logger);
      } else {
        return {
          type: "list",
          elements: [
            { type: "symbol", name: "unquote" },
            expandQuasiquote(list.elements[1], env, logger, depth - 1)
          ]
        };
      }
    }
    
    // Handle unquote-splicing
    if (first.type === "symbol" && (first as SymbolNode).name === "unquote-splicing") {
      if (list.elements.length !== 2) {
        throw new Error("unquote-splicing requires exactly one argument");
      }
      
      if (depth === 1) {
        const result = evaluateSExp(list.elements[1], env, logger);
        
        if (!Array.isArray(result) && 
            !(result && typeof result === 'object' && 'type' in result && result.type === 'list')) {
          throw new Error("unquote-splicing requires a list result");
        }
        
        return result.type === 'list' ? result.elements : result;
      } else {
        return {
          type: "list",
          elements: [
            { type: "symbol", name: "unquote-splicing" },
            expandQuasiquote(list.elements[1], env, logger, depth - 1)
          ]
        };
      }
    }
    
    // Handle nested quasiquote
    if (first.type === "symbol" && (first as SymbolNode).name === "quasiquote") {
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "quasiquote" },
          expandQuasiquote(list.elements[1], env, logger, depth + 1)
        ]
      };
    }
    
    // Process each element
    const expandedElements: HQLNode[] = [];
    
    for (let i = 0; i < list.elements.length; i++) {
      const current = list.elements[i];
      
      if (current.type === "list" && 
          current.elements.length > 0 && 
          current.elements[0].type === "symbol" && 
          (current.elements[0] as SymbolNode).name === "unquote-splicing" &&
          depth === 1) {
        
        const spliced = evaluateSExp(current.elements[1], env, logger);
        
        if (Array.isArray(spliced)) {
          expandedElements.push(...spliced);
        } else if (spliced && typeof spliced === 'object' && 'type' in spliced && spliced.type === 'list') {
          expandedElements.push(...spliced.elements);
        } else {
          throw new Error("unquote-splicing requires a list result");
        }
      } else {
        expandedElements.push(expandQuasiquote(current, env, logger, depth));
      }
    }
    
    return {
      type: "list",
      elements: expandedElements
    };
  }
  
  // For other node types, return as is
  return expr;
}

// Handle if special form
function handleIf(list: ListNode, env: Env, logger: Logger): any {
  if (list.elements.length < 3 || list.elements.length > 4) {
    throw new Error("if requires 2 or 3 arguments");
  }
  
  const test = evaluateSExp(list.elements[1], env, logger);
  
  if (test) {
    return evaluateSExp(list.elements[2], env, logger);
  } else if (list.elements.length === 4) {
    return evaluateSExp(list.elements[3], env, logger);
  }
  
  return null;
}

// Handle fn special form
// Handle fn special form
function handleFn(list: ListNode, env: Env, logger: Logger): any {
    if (list.elements.length < 3) {
      throw new Error("fn requires parameters and body");
    }
    
    const paramsNode = list.elements[1];
    if (paramsNode.type !== "list") {
      throw new Error("fn parameters must be a list");
    }
    
    const params = (paramsNode as ListNode).elements.map(param => {
      if (param.type !== "symbol") {
        throw new Error("fn parameters must be symbols");
      }
      return (param as SymbolNode).name;
    });
    
    // Check for rest parameter
    let hasRestParam = false;
    let restParamIndex = -1;
    let restParam: string | null = null;
    
    for (let i = 0; i < params.length; i++) {
      if (params[i] === "&") {
        if (i + 1 < params.length) {
          hasRestParam = true;
          restParamIndex = i;
          restParam = params[i + 1];
          break;
        } else {
          throw new Error("& must be followed by a parameter name");
        }
      }
    }
    
    // Extract regular and rest parameters
    const regularParams = hasRestParam ? params.slice(0, restParamIndex) : params;
    
    // Create the function
    return function(...args: any[]) {
      // Create a new environment with the parent
      const fnEnv = new Env(env, logger);
      
      // CRITICAL: Ensure list function is available in function environment
      fnEnv.define("list", function(...listArgs: any[]) {
        return { type: "list", elements: listArgs };
      });
      
      // Bind regular parameters
      for (let i = 0; i < regularParams.length; i++) {
        fnEnv.define(regularParams[i], i < args.length ? args[i] : null);
      }
      
      // Bind rest parameter if present
      if (hasRestParam && restParam !== null) {
        fnEnv.define(restParam, args.slice(regularParams.length));
      }
      
      // Evaluate the body
      let result = null;
      for (let i = 2; i < list.elements.length; i++) {
        result = evaluateSExp(list.elements[i], fnEnv, logger);
      }
      
      return result;
    };
  }

// Handle def special form
function handleDef(list: ListNode, env: Env, logger: Logger): any {
  if (list.elements.length !== 3) {
    throw new Error("def requires exactly 2 arguments");
  }
  
  const nameNode = list.elements[1];
  if (nameNode.type !== "symbol") {
    throw new Error("def requires a symbol as its first argument");
  }
  
  const name = (nameNode as SymbolNode).name;
  const value = evaluateSExp(list.elements[2], env, logger);
  
  env.define(name, value);
  return value;
}

// Handle defmacro special form
function handleDefmacro(list: ListNode, env: Env, logger: Logger): any {
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
  
  // Process parameters including & for rest params
  const params = (paramsNode as ListNode).elements;
  const paramNames: string[] = [];
  let hasRestParam = false;
  let restParamName = "";
  
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (param.type !== "symbol") {
      throw new Error("Macro parameters must be symbols");
    }
    
    const paramName = (param as SymbolNode).name;
    
    if (paramName === "&") {
      if (i + 1 < params.length && params[i + 1].type === "symbol") {
        hasRestParam = true;
        restParamName = (params[i + 1] as SymbolNode).name;
        i++;
      } else {
        throw new Error("& must be followed by a symbol in parameter list");
      }
    } else {
      paramNames.push(paramName);
    }
  }
  
  // Extract body expressions
  const body = list.elements.slice(3);
  
  // Create the macro function
  const macroFn = (args: HQLNode[], callEnv: Env): HQLNode => {
    // Create a new environment for macro expansion
    const macroEnv = new Env(callEnv, logger);
    
    // CRITICAL: Make sure list function is available in macro environment
    macroEnv.define("list", function(...listArgs: any[]) {
      // Special handling for module.method notation in the first argument
      if (listArgs.length > 0 && 
          typeof listArgs[0] === 'string' && 
          listArgs[0].includes('.') && 
          !listArgs[0].startsWith('.')) {
        // Convert 'module.method' to a js-call form
        const [moduleName, methodName] = listArgs[0].split('.');
        return {
          type: "list",
          elements: [
            { type: "symbol", name: "js-call" },
            { type: "symbol", name: moduleName },
            { type: "literal", value: methodName },
            ...listArgs.slice(1)
          ]
        };
      }
      return { type: "list", elements: listArgs };
    });
    
    // Bind positional parameters
    for (let i = 0; i < paramNames.length; i++) {
      macroEnv.define(paramNames[i], i < args.length ? args[i] : { type: "literal", value: null });
    }
    
    // Bind rest parameter if present
    if (hasRestParam) {
      const restArgs = args.slice(paramNames.length);
      macroEnv.define(restParamName, {
        type: "list",
        elements: restArgs
      });
    }
    
    // Evaluate body expressions
    let result: HQLNode = { type: "literal", value: null };
    
    for (const expr of body) {
      result = evaluateSExp(expr, macroEnv, logger);
    }
    
    return result;
  };
  
  // Register the macro
  env.defineMacro(macroName, macroFn);
  
  // Return null
  return { type: "literal", value: null };
}

// Handle import special form
function handleImport(list: ListNode, env: Env, logger: Logger): any {
  if (list.elements.length !== 3) {
    throw new Error("import requires exactly 2 arguments");
  }
  
  const nameNode = list.elements[1];
  const pathNode = list.elements[2];
  
  if (nameNode.type !== "symbol") {
    throw new Error("import name must be a symbol");
  }
  
  if (pathNode.type !== "literal") {
    throw new Error("import path must be a string literal");
  }
  
  const importName = (nameNode as SymbolNode).name;
  const importPath = String((pathNode as LiteralNode).value);
  
  // We return a reference to be processed by macro expansion logic
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "js-import" },
      { type: "symbol", name: importName },
      { type: "literal", value: importPath }
    ]
  };
}

// Handle js-import special form
function handleJsImport(list: ListNode, env: Env, logger: Logger): any {
  if (list.elements.length !== 3) {
    throw new Error("js-import requires exactly 2 arguments");
  }
  
  const nameNode = list.elements[1];
  const pathNode = list.elements[2];
  
  if (nameNode.type !== "symbol") {
    throw new Error("js-import name must be a symbol");
  }
  
  if (pathNode.type !== "literal") {
    throw new Error("js-import path must be a string literal");
  }
  
  const importName = (nameNode as SymbolNode).name;
  const importPath = String((pathNode as LiteralNode).value);
  
  // We return a reference to be processed by macro expansion logic
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "js-import" },
      { type: "symbol", name: importName },
      { type: "literal", value: importPath }
    ]
  };
}

// Handle js-export special form
function handleJsExport(list: ListNode, env: Env, logger: Logger): any {
  if (list.elements.length !== 3) {
    throw new Error("js-export requires exactly 2 arguments");
  }
  
  const nameNode = list.elements[1];
  const valueNode = list.elements[2];
  
  let exportName: string;
  
  if (nameNode.type === "literal") {
    exportName = String((nameNode as LiteralNode).value);
  } else if (nameNode.type === "symbol") {
    exportName = (nameNode as SymbolNode).name;
  } else {
    throw new Error("js-export name must be a string literal or symbol");
  }
  
  const value = evaluateSExp(valueNode, env, logger);
  
  // Return a special node that will be properly handled during code generation
  return {
    type: "export-reference",
    name: exportName,
    value: value
  };
}

// Handle dot notation (module.method)
function handleDotNotation(op: string, list: ListNode, env: Env, logger: Logger): any {
  const [moduleName, methodName] = op.split('.');
  
  try {
    const module = env.lookup(moduleName);
    
    if (module && typeof module === 'object' && methodName in module) {
      const method = module[methodName];
      
      if (typeof method === 'function') {
        // Evaluate arguments
        const args = list.elements.slice(1).map(arg => evaluateSExp(arg, env, logger));
        
        // Call the method
        return method.apply(module, args);
      } else {
        // Just return the property value
        return method;
      }
    }
  } catch (error) {
    logger.debug(`Error in dot notation handling: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // If we couldn't resolve it, return a special reference
  return {
    type: "dot-notation-reference",
    module: moduleName,
    property: methodName,
    args: list.elements.slice(1)
  };
}

// Expand a macro
function expandMacro(name: string, list: ListNode, env: Env, logger: Logger): any {
  const macroFn = env.getMacro(name);
  
  if (!macroFn) {
    throw new Error(`Macro not found: ${name}`);
  }
  
  const args = list.elements.slice(1);
  
  try {
    // Call the macro function
    const expanded = macroFn(args, env);
    
    // Re-evaluate the expansion
    return evaluateSExp(expanded, env, logger);
  } catch (error) {
    logger.error(`Error expanding macro ${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Handle function call
function handleFunctionCall(list: ListNode, env: Env, logger: Logger): any {
  const func = evaluateSExp(list.elements[0], env, logger);
  const args = list.elements.slice(1).map(arg => evaluateSExp(arg, env, logger));
  
  if (typeof func !== 'function') {
    throw new Error(`${JSON.stringify(list.elements[0])} is not a function`);
  }
  
  return func(...args);
}