import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { ParseError } from "./errors.ts";

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let inString = false;
  let inMultilineComment = false;
  
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    
    // Handle multiline comments
    if (inMultilineComment) {
      if (ch === '*' && i + 1 < input.length && input[i + 1] === '/') {
        inMultilineComment = false;
        i++; // Skip the '/' character
      }
      continue;
    }
    
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
      tokens.push("`"); // Quasiquote
    } else if (ch === '~') {
      if (token !== "") { tokens.push(token); token = ""; }
      // Check for ~@
      if (i + 1 < input.length && input[i + 1] === '@') {
        tokens.push("~@"); // Unquote-splicing
        i++; // Skip the @
      } else {
        tokens.push("~"); // Unquote
      }
    } else if (ch === "'") {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push("'"); // Quote
    } else if (ch === '/' && i + 1 < input.length) {
      // Handle comments
      const nextCh = input[i + 1];
      if (nextCh === '/') {
        // Single-line comment
        if (token !== "") { tokens.push(token); token = ""; }
        i++; // Skip the second '/'
        while (i < input.length && input[i] !== '\n') i++;
      } else if (nextCh === '*') {
        // Multi-line comment
        if (token !== "") { tokens.push(token); token = ""; }
        inMultilineComment = true;
        i++; // Skip the '*' character
      } else {
        token += ch; // Regular division operator
      }
    } else if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || 
               ch === '{' || ch === '}' || ch === ':' || ch === ',') {
      if (token !== "") { tokens.push(token); token = ""; }
      tokens.push(ch);
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
  
  if (inMultilineComment) {
    throw new ParseError("Unclosed multiline comment", { line: 0, column: 0, offset: 0 });
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
  
  // Handle quote, quasiquote, unquote and unquote-splicing
  if (token === "'") {
    const quoted = parseExpression();
    return { 
      type: "list", 
      elements: [{ type: "symbol", name: "quote" }, quoted]
    } as ListNode;
  }
  
  if (token === "`") {
    const quasiquoted = parseExpression();
    return { 
      type: "list", 
      elements: [{ type: "symbol", name: "quasiquote" }, quasiquoted]
    } as ListNode;
  }
  
  if (token === "~") {
    const unquoted = parseExpression();
    return { 
      type: "list", 
      elements: [{ type: "symbol", name: "unquote" }, unquoted]
    } as ListNode;
  }
  
  if (token === "~@") {
    const unquoteSpliced = parseExpression();
    return { 
      type: "list", 
      elements: [{ type: "symbol", name: "unquote-splicing" }, unquoteSpliced]
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
  } else if (token.startsWith('"')) {
    return { type: "literal", value: processStringLiteral(token) } as LiteralNode;
  } else if (!isNaN(Number(token))) {
    return { type: "literal", value: Number(token) } as LiteralNode;
  } else if (token === "true") {
    return { type: "literal", value: true } as LiteralNode;
  } else if (token === "false") {
    return { type: "literal", value: false } as LiteralNode;
  } else if (token === "nil") {
    return { type: "literal", value: null } as LiteralNode;
  } else {
    return { type: "symbol", name: token } as SymbolNode;
  }
}

function parseList(): ListNode {
  const elements: HQLNode[] = [];
  
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
    elements.push(parseExpression());
  }
  
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unclosed list", { line: 0, column: 0, offset: 0 });
  }
  
  currentPos++; // Skip the closing parenthesis
  return { type: "list", elements };
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
  
  // For empty vector, return a special empty array literal
  if (elements.length === 0) {
    return { 
      type: "list", 
      elements: [
        { type: "symbol", name: "empty-array" }
      ] 
    };
  }
  
  // For non-empty vector, proceed with vector function
  return { 
    type: "list", 
    elements: [
      { type: "symbol", name: "vector" },
      ...elements
    ] 
  };
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
  
  // For empty map, return a special empty map literal
  if (entries.length === 0) {
    return { 
      type: "list", 
      elements: [
        { type: "symbol", name: "empty-map" }
      ] 
    };
  }
  
  // For non-empty map, proceed with hash-map function
  return { 
    type: "list", 
    elements: [
      { type: "symbol", name: "hash-map" },
      ...entries
    ] 
  };
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
  
  // For empty set, return a special empty set literal
  if (elements.length === 0) {
    return { 
      type: "list", 
      elements: [
        { type: "symbol", name: "empty-set" }
      ] 
    };
  }
  
  // For non-empty set, proceed with hash-set function
  return { 
    type: "list", 
    elements: [
      { type: "symbol", name: "hash-set" },
      ...elements
    ] 
  };
}

function processStringLiteral(token: string): string {
  if (token[0] !== '"' || token[token.length - 1] !== '"') {
    throw new ParseError("Malformed string literal", { line: 0, column: 0, offset: 0 });
  }
  let content = token.slice(1, -1);
  content = content.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return content;
}

// Handle dot notation for method calls
function processDotNotation(expr: HQLNode, dotPath: string[]): HQLNode {
  if (dotPath.length === 0) {
    return expr;
  }
  
  // For a single property access, use js-get-invoke
  if (dotPath.length === 1) {
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "js-get-invoke" },
        expr,
        { type: "literal", value: dotPath[0] }
      ]
    };
  }
  
  // For nested property access, chain js-get-invoke calls
  let result: HQLNode = {
    type: "list",
    elements: [
      { type: "symbol", name: "js-get-invoke" },
      expr,
      { type: "literal", value: dotPath[0] }
    ]
  };
  
  // Continue for the rest of the dot path
  for (let i = 1; i < dotPath.length; i++) {
    result = {
      type: "list",
      elements: [
        { type: "symbol", name: "js-get-invoke" },
        result,
        { type: "literal", value: dotPath[i] }
      ]
    };
  }
  
  return result;
}

export function parse(input: string): HQLNode[] {
  const tokens = tokenize(input);
  return parseTokens(tokens);
}