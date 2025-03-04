// src/transpiler/parser.ts - Refactored to preserve raw syntax
import { HQLNode, LiteralNode, SymbolNode, ListNode, JsonObjectLiteralNode, JsonArrayLiteralNode, ExtendedDefnNode, ExtendedParam } from "./hql_ast.ts";
import { ParseError } from "./errors.ts";

// Constants for character handling
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', ',']);

// Track parsing state
let tokens: string[] = [];
let positions: { line: number; column: number; offset: number; }[] = [];
let pos = 0;

/**
 * Check if a character is whitespace
 */
function isWhitespace(ch: string): boolean {
  return WHITESPACE_CHARS.has(ch);
}

/**
 * Process string literals, handling escape sequences properly.
 */
function processStringLiteral(
  str: string,
  position: { line: number; column: number; offset: number; }
): string {
  if (!str.startsWith('"') || !str.endsWith('"') || str.length < 2) {
    throw new ParseError(
      "Malformed string literal - missing quotes", 
      position
    );
  }
  
  // Remove the surrounding quotes
  const content = str.slice(1, -1);
  let result = "";
  
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\\' && i + 1 < content.length) {
      const next = content[i + 1];
      switch (next) {
        case 'n': result += '\n'; break;
        case 't': result += '\t'; break;
        case 'r': result += '\r'; break;
        case '\\': result += '\\'; break;
        case '"': result += '"'; break;
        case '(': result += '('; break; // For string interpolation
        case ')': result += ')'; break; // For string interpolation
        default:
          throw new ParseError(
            `Invalid escape sequence \\${next} in string`, 
            {
              line: position.line,
              column: position.column + i,
              offset: position.offset + i
            }
          );
      }
      i++; // Skip the escaped character
    } else {
      result += content[i];
    }
  }
  
  return result;
}

/**
 * Remove inline comments from a line
 */
function removeInlineComments(line: string): string {
  let inString = false;
  let commentStart = -1;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    
    if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inString = !inString;
    } else if (!inString && ch === ";") {
      // Once a semicolon is found outside a string, stop and return the prefix
      commentStart = i;
      break;
    }
  }
  
  // If no comment found, return the original line
  if (commentStart === -1) return line;
  
  // Otherwise, return everything up to the comment
  return line.substring(0, commentStart);
}

/**
 * Tokenize the input string into tokens
 */
function tokenize(input: string): { tokens: string[], positions: { line: number; column: number; offset: number; }[] } {
  // Pre-split lines and pre-filter comment-only lines for efficiency
  const rawLines = input.split("\n");
  const lines: string[] = [];
  
  // We need to keep track of original line numbers for error reporting
  const lineMap: number[] = [];
  
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (line.length > 0 && !line.startsWith(";")) {
      lines.push(line);
      lineMap.push(i);
    }
  }
  
  const tokens: string[] = [];
  const positions: { line: number; column: number; offset: number; }[] = [];
  
  let current = "";
  let inString = false;
  let stringStartLine = 0;
  let stringStartColumn = 0;
  let totalOffset = 0;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const actualLineIndex = lineMap[lineIndex];
    const line = inString ? lines[lineIndex] : removeInlineComments(lines[lineIndex]);
    const lineOffset = totalOffset;
    
    for (let colIndex = 0; colIndex < line.length; colIndex++) {
      const ch = line[colIndex];
      totalOffset++; // Track absolute position in the input
      
      // Check for the set literal marker #[
      if (!inString && ch === '#' && colIndex + 1 < line.length && line[colIndex + 1] === '[') {
        if (current.length > 0) {
          tokens.push(current);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex - current.length + 1,
            offset: lineOffset + colIndex - current.length
          });
          current = "";
        }
        
        tokens.push("#[");
        positions.push({
          line: actualLineIndex + 1,
          column: colIndex + 1,
          offset: lineOffset + colIndex
        });
        colIndex++; // Skip the next character as we've processed it
        totalOffset++; // Skip this character in the offset count
        continue;
      }
      
      if (inString) {
        current += ch;
        if (ch === '"' && colIndex > 0 && line[colIndex - 1] !== "\\") {
          tokens.push(current);
          positions.push({
            line: stringStartLine + 1,
            column: stringStartColumn + 1,
            offset: lineOffset + stringStartColumn
          });
          current = "";
          inString = false;
        }
      } else {
        if (ch === '"') {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
          current += ch;
          inString = true;
          stringStartLine = actualLineIndex;
          stringStartColumn = colIndex;
        } else if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '{' || ch === '}') {
          // Handle all bracket and brace tokens
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
          tokens.push(ch);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex + 1,
            offset: lineOffset + colIndex
          });
        } else if (ch === ':') {
          // Special case: For JSON literals, handle colon as a separator
          // For named parameters, keep the colon as part of the token
          
          // Named parameter case - symbol ending with colon
          if (current.length > 0) {
            // Named parameter syntax - if we're in a context like (fn name:)
            // We collect the colon as part of the symbol
            current += ":";
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 2, // +2 to include the colon
              offset: lineOffset + colIndex - current.length + 1
            });
            current = "";
          } else {
            // JSON colon separator - standalone token for use in JSON objects
            tokens.push(":");
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex + 1,
              offset: lineOffset + colIndex
            });
          }
        } else if (isWhitespace(ch)) {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
        } else {
          current += ch;
        }
      }
    }
    
    if (inString) {
      current += "\n";
      totalOffset++; // Count the newline as a character
    } else if (current.length > 0) {
      tokens.push(current);
      positions.push({
        line: actualLineIndex + 1,
        column: line.length - current.length + 1,
        offset: lineOffset + line.length - current.length
      });
      current = "";
    }
    
    totalOffset++; // Count the newline at the end of each line
  }
  
  if (current.length > 0) {
    tokens.push(current);
    positions.push({
      line: lines.length,
      column: lines[lines.length - 1].length - current.length + 1,
      offset: totalOffset - current.length
    });
  }
  
  if (inString) {
    throw new ParseError("Unclosed string literal", {
      line: stringStartLine + 1,
      column: stringStartColumn + 1,
      offset: positions[positions.length - 1].offset - current.length
    });
  }
  
  return { tokens, positions };
}

/**
 * Parse a JSON object into a JsonObjectLiteralNode
 */
function parseJsonObject(): JsonObjectLiteralNode {
  const properties: { [key: string]: HQLNode } = {};
  
  const startPos = pos - 1; // Position of the opening brace
  
  while (pos < tokens.length && tokens[pos] !== "}") {
    // Parse the key (must be a string literal for JSON objects)
    if (pos >= tokens.length) {
      throw new ParseError(
        `Unexpected end of input in object literal starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
        positions[startPos]
      );
    }
    
    // Get key
    const keyToken = tokens[pos];
    if (!keyToken.startsWith('"')) {
      throw new ParseError(
        "Object literal keys must be string literals",
        positions[pos]
      );
    }
    pos++;
    
    // Process key string
    const keyStr = processStringLiteral(keyToken, positions[pos-1]);
    
    // Expect colon separator
    if (pos >= tokens.length || tokens[pos] !== ":") {
      throw new ParseError(
        "Missing colon after property name in object literal", 
        pos > 0 ? positions[pos - 1] : positions[0]
      );
    }
    pos++; // Skip the colon token
    
    // Parse the value
    if (pos >= tokens.length) {
      throw new ParseError(
        `Unexpected end of input in object literal value starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
        positions[startPos]
      );
    }
    const value = parseExpression();
    
    // Add key-value pair to the properties
    properties[keyStr] = value;
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed curly brace starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
      positions[startPos]
    );
  }
  
  pos++; // skip the closing brace
  
  return { type: "jsonObjectLiteral", properties };
}

/**
 * Parse a JSON array into a JsonArrayLiteralNode
 */
function parseJsonArray(): JsonArrayLiteralNode {
  const elements: HQLNode[] = [];
  const startPos = pos - 1; // Position of the opening bracket
  
  while (pos < tokens.length && tokens[pos] !== "]") {
    elements.push(parseExpression());
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed square bracket starting at line ${positions[startPos].line}, column ${positions[startPos].column}`,
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing bracket
  
  return { type: "jsonArrayLiteral", elements };
}

/**
 * Parse a standard list with a given closing delimiter
 */
function parseList(): ListNode {
  const elements: HQLNode[] = [];
  const startPos = pos - 1; // Position of the opening delimiter
  
  // Check for fx special form
  if (pos < tokens.length && tokens[pos] === "fx") {
    pos++; // Skip over "fx"
    const fxNode = parseFxExpression();
    
    // Skip the closing parenthesis
    if (pos >= tokens.length || tokens[pos] !== ")") {
      throw new ParseError(
        `Unclosed parenthesis for fx form starting at line ${positions[startPos].line}, column ${positions[startPos].column}`,
        positions[startPos]
      );
    }
    pos++; // Skip closing parenthesis
    
    return {
      type: "list",
      elements: [
        { type: "symbol", name: "fx" } as SymbolNode,
        { type: "symbol", name: fxNode.name } as SymbolNode,
        fxNode.params.length > 0 ? { 
          type: "list", 
          elements: fxNode.params.map(p => {
            if (p.type) {
              // With type annotation: (name: Type)
              if (p.defaultValue) {
                // With default value: (name: Type = defaultValue)
                return {
                  type: "list",
                  elements: [
                    { type: "symbol", name: p.name } as SymbolNode,
                    { type: "symbol", name: ":" } as SymbolNode,
                    { type: "symbol", name: p.type } as SymbolNode,
                    { type: "symbol", name: "=" } as SymbolNode,
                    p.defaultValue
                  ]
                } as ListNode;
              } else {
                // Without default: (name: Type)
                return {
                  type: "list",
                  elements: [
                    { type: "symbol", name: p.name } as SymbolNode,
                    { type: "symbol", name: ":" } as SymbolNode,
                    { type: "symbol", name: p.type } as SymbolNode
                  ]
                } as ListNode;
              }
            } else {
              // Without type annotation
              if (p.defaultValue) {
                // With default value: (name = defaultValue)
                return {
                  type: "list",
                  elements: [
                    { type: "symbol", name: p.name } as SymbolNode,
                    { type: "symbol", name: "=" } as SymbolNode,
                    p.defaultValue
                  ]
                } as ListNode;
              } else {
                // Plain parameter: name
                return { type: "symbol", name: p.name } as SymbolNode;
              }
            }
          })
        } as ListNode : { type: "list", elements: [] } as ListNode,
        // Return type if present
        ...(fxNode.returnType ? [
          { type: "symbol", name: "->" } as SymbolNode,
          fxNode.returnType
        ] : []),
        // Body
        ...fxNode.body
      ]
    };
  }
  
  // Process the elements of the list
  while (pos < tokens.length && tokens[pos] !== ")") {
    elements.push(parseExpression());
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed parenthesis starting at line ${positions[startPos].line}, column ${positions[startPos].column}`,
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing delimiter
  
  return { type: "list", elements };
}

/**
 * Parse a set literal (#[...]) into a list node with the js-set macro call
 */
function parseSetLiteral(): ListNode {
  // Parse the inner elements
  const elements: HQLNode[] = [];
  const startPos = pos - 1; // Position of the opening #[
  
  while (pos < tokens.length && tokens[pos] !== "]") {
    elements.push(parseExpression());
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed set literal starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing bracket
  
  // Return (js-set element1 element2 ...)
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "js-set" } as SymbolNode,
      ...elements
    ]
  };
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
      
      return { name: paramName, type, defaultValue, isNamed: hasNamed };
    }
  }
  
  // Fallback if the parameter is not recognized
  return { name: "param" };
}

// Updated parseFxExpression function in src/transpiler/parser.ts
function parseFxExpression(): ExtendedDefnNode {
  // Parse function name
  if (pos >= tokens.length) {
    throw new ParseError("Unexpected end of input after 'fx'", positions[pos - 1]);
  }
  const nameToken = tokens[pos];
  pos++; // Consume the function name

  if (!nameToken || nameToken === "(" || nameToken === ")" ||
      nameToken === "[" || nameToken === "]" ||
      nameToken === "{" || nameToken === "}") {
    throw new ParseError("Unexpected token: " + nameToken, positions[pos - 1]);
  }

  // Expect and parse the parameter list
  if (pos >= tokens.length || tokens[pos] !== "(") {
    throw new ParseError("Expected parameter list after function name", positions[pos > 0 ? pos - 1 : 0]);
  }
  pos++; // Skip opening parenthesis

  // Parse parameters
  const params: ExtendedParam[] = [];
  while (pos < tokens.length && tokens[pos] !== ")") {
    // Case 1: Named parameter with colon at the end (name:)
    if (tokens[pos].endsWith(":")) {
      const paramName = tokens[pos].slice(0, -1);
      pos++; // Consume parameter name
      
      // Check for type annotation
      let type: string | undefined;
      if (pos < tokens.length && tokens[pos] !== ")" && !tokens[pos].endsWith(":") && tokens[pos] !== "=") {
        type = tokens[pos];
        pos++; // Consume type
      }
      
      // Check for default value
      let defaultValue: HQLNode | undefined;
      if (pos < tokens.length && tokens[pos] === "=") {
        pos++; // Skip '='
        if (pos < tokens.length && tokens[pos] !== ")") {
          defaultValue = parseExpression();
        }
      }
      
      params.push({ name: paramName, type, defaultValue, isNamed: true });
    } 
    // Case 2: Regular parameter or complex parameter form
    else {
      const paramNode = parseExpression();
      
      if (paramNode.type === "symbol") {
        // Simple parameter (just a name)
        params.push({ name: (paramNode as SymbolNode).name });
      } 
      else if (paramNode.type === "list") {
        // Complex parameter form (x: Type = default) or (x = default)
        const elements = (paramNode as ListNode).elements;
        if (elements.length === 0) {
          throw new ParseError("Empty parameter list", positions[pos - 1]);
        }
        
        if (elements[0].type !== "symbol") {
          throw new ParseError("Parameter name must be a symbol", positions[pos - 1]);
        }
        
        const name = (elements[0] as SymbolNode).name;
        let type: string | undefined;
        let defaultValue: HQLNode | undefined;
        
        // Check for type annotation
        let typeIndex = -1;
        for (let i = 1; i < elements.length; i++) {
          if (elements[i].type === "symbol" && (elements[i] as SymbolNode).name === ":") {
            typeIndex = i;
            break;
          }
        }
        
        if (typeIndex !== -1 && typeIndex + 1 < elements.length && elements[typeIndex + 1].type === "symbol") {
          type = (elements[typeIndex + 1] as SymbolNode).name;
        }
        
        // Check for default value
        let eqIndex = -1;
        for (let i = 1; i < elements.length; i++) {
          if (elements[i].type === "symbol" && (elements[i] as SymbolNode).name === "=") {
            eqIndex = i;
            break;
          }
        }
        
        if (eqIndex !== -1 && eqIndex + 1 < elements.length) {
          defaultValue = elements[eqIndex + 1];
        }
        
        params.push({ name, type, defaultValue });
      } 
      else {
        throw new ParseError("Invalid parameter", positions[pos - 1]);
      }
    }
  }
  
  if (pos >= tokens.length || tokens[pos] !== ")") {
    throw new ParseError("Unclosed parameter list", positions[pos > 0 ? pos - 1 : 0]);
  }
  pos++; // Skip closing parenthesis

  // Check for return type annotation
  let returnType: HQLNode | undefined;
  if (pos < tokens.length && tokens[pos] === "->") {
    pos++; // Skip '->'
    if (pos >= tokens.length) {
      throw new ParseError("Expected return type after '->'", positions[pos - 1]);
    }
    returnType = parseExpression();
  }

  // Parse the body (all expressions until a closing delimiter, if any)
  const body: HQLNode[] = [];
  while (pos < tokens.length && tokens[pos] !== ")") {
    body.push(parseExpression());
  }
  
  return {
    type: "extendedDefn",
    name: nameToken,
    params,
    returnType,
    body
  };
}

/**
 * Parse an expression from the token stream
 */
function parseExpression(): HQLNode {
  if (pos >= tokens.length) {
    throw new ParseError(
      "Unexpected end of input", 
      pos > 0 ? positions[pos - 1] : { line: 1, column: 1, offset: 0 }
    );
  }
  
  const token = tokens[pos];
  const position = positions[pos];
  pos++;
  
  // Handle special data structure literals
  if (token === "(") {
    // Parse as a list
    return parseList();
  } else if (token === "[") {
    // Parse as a JSON array literal
    return parseJsonArray();
  } else if (token === "{") {
    // Parse as a JSON object literal
    return parseJsonObject();
  } else if (token === "#[") {
    // Set literal - parse as (js-set ...) form
    return parseSetLiteral();
  } else if (token === ")" || token === "]" || token === "}" || token === "#]") {
    throw new ParseError(
      `Unexpected '${token}'`, 
      position
    );
  } else if (token === ":") {
    // Standalone colon token - used in JSON object parsing
    return { type: "symbol", name: ":" } as SymbolNode;
  } else if (token.startsWith('"')) {
    try {
      const processedString = processStringLiteral(token, position);
      return { type: "literal", value: processedString } as LiteralNode;
    } catch (error) {
      if (error instanceof ParseError) throw error;
      throw new ParseError(
        `Error processing string: ${error instanceof Error ? error.message : String(error)}`, 
        position
      );
    }
  } else if (token === "true") {
    return { type: "literal", value: true } as LiteralNode;
  } else if (token === "false") {
    return { type: "literal", value: false } as LiteralNode;
  } else if (token === "null" || token === "nil") {
    return { type: "literal", value: null } as LiteralNode;
  } else if (!isNaN(Number(token))) {
    return { type: "literal", value: Number(token) } as LiteralNode;
  } else {
    return { type: "symbol", name: token } as SymbolNode;
  }
}

/**
 * The main parse function, which tokenizes and parses HQL code into an AST
 */
export function parse(input: string): HQLNode[] {
  const result = tokenize(input);
  tokens = result.tokens;
  positions = result.positions;
  pos = 0;
  
  // Parse the input
  const expressions: HQLNode[] = [];
  while (pos < tokens.length) {
    expressions.push(parseExpression());
  }
  
  // Reset global variables to avoid memory leaks
  tokens = [];
  positions = [];
  pos = 0;
  
  return expressions;
}