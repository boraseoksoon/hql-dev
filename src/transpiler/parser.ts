// src/transpiler/parser.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { ParseError } from "./errors.ts";

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let inString = false;
  
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    
    if (inString) {
      token += ch;
      if (ch === '"' && input[i - 1] !== '\\') {
        tokens.push(token);
        token = "";
        inString = false;
      }
    } else if (ch === '"') {
      if (token !== "") { tokens.push(token); token = ""; }
      token += ch;
      inString = true;
    } else if (ch === '`') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push("`");
    } else if (ch === '~') {
      if (token !== "") { tokens.push(token); token = ""; }
      // Check for ~@
      if (i + 1 < input.length && input[i + 1] === '@') {
        tokens.push("~@");
        i++; // Skip the @
      } else {
        tokens.push("~");
      }
    } else if (ch === "'") {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push("'");
    } else if (ch === '(' || ch === ')') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push(ch);
    } else if (ch === '[') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push('[');
    } else if (ch === ']') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push(']');
    } else if (ch === '{') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push('{');
    } else if (ch === '}') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push('}');
    } else if (ch === ':') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push(':');
    } else if (ch === ',') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push(',');
    } else if (ch === '#' && i + 1 < input.length && input[i + 1] === '[') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push('#[');
      i++; // Skip the '[' character
    } else if (/\s/.test(ch)) {
      if (token !== "") { tokens.push(token); token = ""; }
    } else if (ch === ';') {
      // Skip comments
      if (token !== "") { tokens.push(token); token = ""; }
      while (i < input.length && input[i] !== '\n') i++;
    } else {
      token += ch;
    }
  }
  
  if (token !== "") tokens.push(token);
  return tokens;
}

let currentTokens: string[] = [];
let currentPos = 0;

function parseTokens(tokens: string[]): HQLNode[] {
  currentTokens = tokens;
  currentPos = 0;
  
  const nodes: HQLNode[] = [];
  while (currentPos < currentTokens.length) {
    nodes.push(parseExpression());
  }
  return nodes;
}

function parseExpression(): HQLNode {
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unexpected end of input", { line: 0, column: 0, offset: 0 });
  }
  
  const token = currentTokens[currentPos++];
  
  // Handle quote shorthand (')
  if (token === "'") {
    // Parse the next expression and wrap it in a quote
    const quoted = parseExpression();
    return { 
      type: "list", 
      elements: [
        { type: "symbol", name: "quote" },
        quoted
      ] 
    } as ListNode;
  }
  
  // Handle quasiquote (`)
  if (token === "`") {
    // Parse the next expression and wrap it in a quasiquote
    const quasiquoted = parseExpression();
    return { 
      type: "list", 
      elements: [
        { type: "symbol", name: "quasiquote" },
        quasiquoted
      ] 
    } as ListNode;
  }
  
  // Handle unquote (~)
  if (token === "~") {
    // Parse the next expression and wrap it in an unquote
    const unquoted = parseExpression();
    return { 
      type: "list", 
      elements: [
        { type: "symbol", name: "unquote" },
        unquoted
      ] 
    } as ListNode;
  }
  
  // Handle unquote-splicing (~@)
  if (token === "~@") {
    // Parse the next expression and wrap it in an unquote-splicing
    const unquoteSpliced = parseExpression();
    return { 
      type: "list", 
      elements: [
        { type: "symbol", name: "unquote-splicing" },
        unquoteSpliced
      ] 
    } as ListNode;
  }
  
  if (token === '(') {
    return parseList();
  } else if (token === ')') {
    throw new ParseError("Unexpected ')'", { line: 0, column: 0, offset: 0 });
  } else if (token === '[') {
    return parseVector();
  } else if (token === ']') {
    throw new ParseError("Unexpected ']'", { line: 0, column: 0, offset: 0 });
  } else if (token === '{') {
    return parseMap();
  } else if (token === '}') {
    throw new ParseError("Unexpected '}'", { line: 0, column: 0, offset: 0 });
  } else if (token === '#[') {
    return parseSet();
  } else if (token === ':' || token === ',') {
    throw new ParseError(`Unexpected '${token}'`, { line: 0, column: 0, offset: 0 });
  } else if (token.startsWith('"')) {
    const str = processStringLiteral(token);
    return { type: "literal", value: str } as LiteralNode;
  } else if (!isNaN(Number(token))) {
    return { type: "literal", value: Number(token) } as LiteralNode;
  } else if (token === "true") {
    return { type: "literal", value: true } as LiteralNode;
  } else if (token === "false") {
    return { type: "literal", value: false } as LiteralNode;
  } else if (token === "nil") {
    return { type: "literal", value: null } as LiteralNode;
  } else if (token.includes('.') && !token.startsWith('.') && !token.endsWith('.')) {
    // For bare dot-notation, throw an error instead of transforming it
    throw new ParseError(`Dot notation "${token}" must be wrapped in parentheses`, 
      { line: 0, column: 0, offset: 0 });
  } else {
    return { type: "symbol", name: token } as SymbolNode;
  }
}

function parseList(): ListNode {
  const elements: HQLNode[] = [];
  
  // Process the first token to see if it's a dot notation
  if (currentPos < currentTokens.length && 
      currentTokens[currentPos] !== ')' &&
      currentTokens[currentPos].includes('.') &&
      !currentTokens[currentPos].startsWith('.') &&
      !currentTokens[currentPos].endsWith('.')) {
    
    // This is a dot notation expression - handle it explicitly
    const dotToken = currentTokens[currentPos++];
    
    // Split by dots to handle multi-part property paths
    const parts = dotToken.split('.');
    
    if (parts.length > 2) {
      // Multi-part property path like "obj.prop1.prop2"
      const objectName = parts[0];
      const propPath = parts.slice(1);
      
      // Create a nested chain of js-get-invoke expressions
      let currentExpr: ListNode = {
        type: "list",
        elements: [
          { type: "symbol", name: "js-get-invoke" },
          { type: "symbol", name: objectName },
          { type: "literal", value: propPath[0] }
        ]
      };
      
      // Chain the remaining properties
      for (let i = 1; i < propPath.length; i++) {
        currentExpr = {
          type: "list",
          elements: [
            { type: "symbol", name: "js-get-invoke" },
            currentExpr,
            { type: "literal", value: propPath[i] }
          ]
        };
      }
      
      // If there are arguments, convert the last js-get-invoke to js-call
      if (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
        const args: HQLNode[] = [];
        while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
          args.push(parseExpression());
        }
        
        // Replace the outermost expression's js-get-invoke with js-call
        currentExpr.elements[0] = { type: "symbol", name: "js-call" };
        // Add the arguments
        currentExpr.elements.push(...args);
      }
      
      elements.push(currentExpr);
    } else {
      // Simple property path like "obj.prop"
      const objectName = parts[0];
      const property = parts[1];
      
      // If there are no additional arguments, treat it as a property access
      if (currentPos < currentTokens.length && currentTokens[currentPos] === ')') {
        // Create a property access node (using js-get-invoke)
        elements.push({ type: "symbol", name: "js-get-invoke" });
        elements.push({ type: "symbol", name: objectName });
        elements.push({ type: "literal", value: property });
      } else {
        // Otherwise, it's a method call - create a method call node (using js-call)
        elements.push({ type: "symbol", name: "js-call" });
        elements.push({ type: "symbol", name: objectName });
        elements.push({ type: "literal", value: property });
        
        // Parse arguments for the method call
        while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
          elements.push(parseExpression());
        }
      }
    }
  } else {
    // Standard list parsing
    while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
      elements.push(parseExpression());
    }
  }
  
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unclosed list", { line: 0, column: 0, offset: 0 });
  }
  
  currentPos++; // Skip the closing parenthesis
  
  return { type: "list", elements } as ListNode;
}

function parseVector(): ListNode {
  const elements: HQLNode[] = [];
  
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== ']') {
    elements.push(parseExpression());
    
    // Skip comma if present
    if (currentPos < currentTokens.length && currentTokens[currentPos] === ',') {
      currentPos++;
    }
  }
  
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unclosed vector", { line: 0, column: 0, offset: 0 });
  }
  
  currentPos++; // Skip the closing bracket
  
  // Transform to a call to the vector function
  return { 
    type: "list", 
    elements: [
      { type: "symbol", name: "vector" },
      ...elements
    ] 
  } as ListNode;
}

function parseMap(): ListNode {
  const entries: HQLNode[] = [];
  
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== '}') {
    // Parse key
    const key = parseExpression();
    
    // Expect colon
    if (currentPos >= currentTokens.length || currentTokens[currentPos] !== ':') {
      throw new ParseError("Expected ':' in map literal", { line: 0, column: 0, offset: 0 });
    }
    currentPos++; // Skip colon
    
    // Parse value
    const value = parseExpression();
    
    // Add key-value pair
    entries.push(key);
    entries.push(value);
    
    // Skip comma if present
    if (currentPos < currentTokens.length && currentTokens[currentPos] === ',') {
      currentPos++;
    }
  }
  
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unclosed map", { line: 0, column: 0, offset: 0 });
  }
  
  currentPos++; // Skip the closing brace
  
  // Transform to a call to the hash-map function
  return { 
    type: "list", 
    elements: [
      { type: "symbol", name: "hash-map" },
      ...entries
    ] 
  } as ListNode;
}

function parseSet(): ListNode {
  const elements: HQLNode[] = [];
  
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== ']') {
    elements.push(parseExpression());
    
    // Skip comma if present
    if (currentPos < currentTokens.length && currentTokens[currentPos] === ',') {
      currentPos++;
    }
  }
  
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unclosed set", { line: 0, column: 0, offset: 0 });
  }
  
  currentPos++; // Skip the closing bracket
  
  // Transform to a call to the hash-set function
  return { 
    type: "list", 
    elements: [
      { type: "symbol", name: "hash-set" },
      ...elements
    ] 
  } as ListNode;
}

function processStringLiteral(token: string): string {
  if (token[0] !== '"' || token[token.length - 1] !== '"') {
    throw new ParseError("Malformed string literal", { line: 0, column: 0, offset: 0 });
  }
  let content = token.slice(1, -1);
  content = content.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return content;
}

export function parse(input: string): HQLNode[] {
  const tokens = tokenize(input);
  return parseTokens(tokens);
}