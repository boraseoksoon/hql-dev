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
    } else {
      // Add special handling for quote (')
      if (ch === "'") {
        if (token !== "") { tokens.push(token); token = ""; }
        tokens.push("'");
      } else if (ch === '"') {
        if (token !== "") { tokens.push(token); token = ""; }
        token += ch;
        inString = true;
      } else if (ch === '(' || ch === ')') {
        if (token !== "") { tokens.push(token); token = ""; }
        tokens.push(ch);
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
  
  if (token === '(') {
    return parseList();
  } else if (token === ')') {
    throw new ParseError("Unexpected ')'", { line: 0, column: 0, offset: 0 });
  } else if (token.startsWith('"')) {
    const str = processStringLiteral(token);
    return { type: "literal", value: str } as LiteralNode;
  } else if (!isNaN(Number(token))) {
    return { type: "literal", value: Number(token) } as LiteralNode;
  } else {
    // Check if the token contains a dot - for property access
    if (token.includes('.') && !token.startsWith('.') && !token.endsWith('.')) {
      const parts = token.split('.');
      const object = parts[0];
      const property = parts.slice(1).join('.');
      
      // Create a canonical list form for js-get-invoke
      return { 
        type: "list", 
        elements: [
          { type: "symbol", name: "js-get-invoke" },
          { type: "symbol", name: object },
          { type: "literal", value: property }
        ] 
      } as ListNode;
    }
    
    // Regular symbol
    return { type: "symbol", name: token } as SymbolNode;
  }
}

function parseList(): ListNode {
  const elements: HQLNode[] = [];
  
  // Check if this might be a method call with arguments
  // by examining the first token
  if (currentPos < currentTokens.length && 
      currentTokens[currentPos] !== ')' &&
      currentTokens[currentPos].includes('.') &&
      !currentTokens[currentPos].startsWith('.') &&
      !currentTokens[currentPos].endsWith('.')) {
        
    // This is a potential method call (obj.method args...)
    const methodToken = currentTokens[currentPos++];
    const parts = methodToken.split('.');
    const object = parts[0];
    const method = parts.slice(1).join('.');
    
    // Start building the canonical form with proper type annotations
    const jsCallElements: HQLNode[] = [
      { type: "symbol", name: "js-call" } as SymbolNode,
      { type: "symbol", name: object } as SymbolNode,
      { type: "literal", value: method } as LiteralNode
    ];
    
    // Parse the arguments
    while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
      jsCallElements.push(parseExpression());
    }
    
    // Skip closing paren
    if (currentPos >= currentTokens.length) {
      throw new ParseError("Unclosed list", { line: 0, column: 0, offset: 0 });
    }
    currentPos++; // skip ')'
    
    return { 
      type: "list", 
      elements: jsCallElements
    } as ListNode;
  }
  
  // Normal list parsing for regular lists
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
    elements.push(parseExpression());
  }
  
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unclosed list", { line: 0, column: 0, offset: 0 });
  }
  
  currentPos++; // Skip the closing parenthesis
  
  return { 
    type: "list", 
    elements 
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